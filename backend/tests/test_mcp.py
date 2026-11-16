"""MCP server: lists tools, calls them as the token's user, same RBAC + audit, no send/approve tool."""

import asyncio
import json
import os
import sys

from mcp import Client

from app.mcp_server import TOOL_NAMES, mcp
from tests.conftest import H, case_id, run_sql


def make_token(as_user, persona: str) -> str:
    r = as_user(persona).post("/api/auth/mcp-tokens", json={"name": f"pytest-{persona}"}, headers=H)
    assert r.status_code == 200
    tok = r.json()["token"]
    stored = run_sql("SELECT token_hash FROM mcp_tokens WHERE prefix=?", (tok[:12],))[0][0]
    assert tok not in stored and len(stored) == 64  # stored hashed
    return tok


def call(token: str, tool: str, args: dict | None = None):
    async def go():
        os.environ["CHASEZERO_MCP_TOKEN"] = token
        try:
            async with Client(mcp) as c:
                tools = await c.list_tools()
                res = await c.call_tool(tool, args or {})
                return tools, res
        finally:
            os.environ.pop("CHASEZERO_MCP_TOKEN", None)
    return asyncio.run(go())


def text(res) -> str:
    return "".join(getattr(c, "text", "") for c in res.content)


def test_lists_tools_and_exposes_no_send_or_approve(client, as_user):
    tools, res = call(make_token(as_user, "ops"), "list_cases")
    names = sorted(t.name for t in tools.tools)
    assert names == sorted(TOOL_NAMES)
    assert not any(w in n for n in names for w in ("send", "approve", "dispatch", "email_client"))
    for t in tools.tools:
        assert "never sends or approves" in (t.description or "")
    assert not res.is_error and len(json.loads(text(res))["cases"]) == 8


def test_tools_respect_rbac(client, as_user):
    _, res = call(make_token(as_user, "rm"), "list_cases")
    data = json.loads(text(res))
    assert data["scope"] == "own" and all(c["assigned_rm"] == "Sarah Jenkins" for c in data["cases"])
    other = case_id(client, "NCZ-2024-8862")
    _, res = call(make_token(as_user, "rm"), "get_case", {"case_id": other})
    assert res.is_error and "Permission denied" in text(res)
    _, res = call(make_token(as_user, "rm"), "get_audit_log", {"limit": 5})
    assert res.is_error
    _, res = call(make_token(as_user, "mlro"), "get_audit_log", {"limit": 5})
    assert not res.is_error and len(json.loads(text(res))) == 5
    _, res = call(make_token(as_user, "coo"), "get_agent_costs")
    assert not res.is_error and "all_time" in json.loads(text(res))
    _, res = call(make_token(as_user, "finance"), "list_cases")
    assert res.is_error


def test_draft_tool_creates_draft_only_and_is_audited(client, as_user):
    cid = case_id(client, "NCZ-2024-8849")
    outbox = run_sql("SELECT COUNT(*) FROM outbound_messages")[0][0]
    calls = run_sql("SELECT COUNT(*) FROM agent_runs WHERE via='mcp'")[0][0]
    _, res = call(make_token(as_user, "ops"), "draft_chase_email", {"case_id": cid})
    assert not res.is_error, text(res)
    d = json.loads(text(res))
    assert d["sent"] is False and d["status"] == "pending_approval" and d["draft_id"]
    assert run_sql("SELECT status FROM chase_drafts WHERE id=?", (d["draft_id"],))[0][0] == "pending_approval"
    assert run_sql("SELECT COUNT(*) FROM outbound_messages")[0][0] == outbox
    assert run_sql("SELECT COUNT(*) FROM agent_runs WHERE via='mcp'")[0][0] > calls  # LLM calls attributed to MCP
    ev = run_sql("SELECT actor, via FROM audit_events WHERE action='mcp_tool_call' ORDER BY id DESC LIMIT 1")[0]
    assert ev == ("Priya Raman", "mcp")
    _, res = call(make_token(as_user, "analyst"), "draft_chase_email", {"case_id": cid})
    assert res.is_error  # analysts cannot create drafts


def test_bad_or_revoked_token_rejected(client, as_user):
    _, res = call("ngmcp_not-a-real-token", "list_cases")
    assert res.is_error and "Unauthenticated" in text(res)
    tok = make_token(as_user, "ops")
    tid = run_sql("SELECT id FROM mcp_tokens WHERE prefix=?", (tok[:12],))[0][0]
    assert client.delete(f"/api/auth/mcp-tokens/{tid}", headers=H).status_code == 200
    _, res = call(tok, "list_cases")
    assert res.is_error


def test_streamable_http_endpoint(client, as_user):
    hdr = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
    init = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                       "clientInfo": {"name": "pytest", "version": "1"}}}
    assert client.post("/mcp", json=init, headers=hdr).status_code == 401
    tok = make_token(as_user, "mlro")
    auth = {**hdr, "Authorization": f"Bearer {tok}"}
    r = client.post("/mcp", json=init, headers=auth)
    assert r.status_code == 200, r.text
    proto = r.json()["result"]["protocolVersion"]
    auth["MCP-Protocol-Version"] = proto
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, headers=auth)
    assert sorted(t["name"] for t in r.json()["result"]["tools"]) == sorted(TOOL_NAMES)
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                                  "params": {"name": "get_audit_log", "arguments": {"limit": 2}}}, headers=auth)
    body = r.json()["result"]
    assert not body.get("isError") and len(json.loads(body["content"][0]["text"])) == 2


def test_stdio_transport(client, as_user):
    from mcp import StdioServerParameters

    tok = make_token(as_user, "ops")
    env = {**os.environ, "CHASEZERO_MCP_TOKEN": tok}
    params = StdioServerParameters(command=sys.executable, args=["-W", "ignore", "-m", "app.mcp_server"], env=env,
                                   cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    async def go():
        async with Client(params) as c:
            tools = await c.list_tools()
            res = await c.call_tool("list_cases", {})
            return tools, res

    tools, res = asyncio.run(go())
    assert sorted(t.name for t in tools.tools) == sorted(TOOL_NAMES)
    assert not res.is_error and json.loads(text(res))["scope"] == "all"
