"""ChaseUp MCP server (official `mcp` Python SDK v2 — `MCPServer`, the renamed FastMCP).

Exposes the KYC chase tracker as tools. Every tool runs as the user who owns the MCP token and
goes through the SAME service layer, RBAC matrix and audit log as the REST API.

There is deliberately NO tool that approves or sends anything. Sending a client message is only
possible in the ChaseUp UI/API by the named Relationship Manager.

Transports:
  stdio:            CHASEZERO_MCP_TOKEN=ngmcp_...  uv run python -m app.mcp_server
  streamable HTTP:  mounted by FastAPI at /mcp  (Authorization: Bearer ngmcp_...)
"""

from __future__ import annotations

import contextvars
import json
import os
import sys
from typing import Any

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from app import audit, services
from app.database import AsyncSessionLocal
from app.models import User
from app.rbac import NotFound, PermissionDenied
from app.security import user_from_mcp_token

# Set by the in-process orchestrator client so the agent runs as the user who started it.
INPROC_USER: contextvars.ContextVar[int | None] = contextvars.ContextVar("chaseup_mcp_inproc_user", default=None)

NO_SEND = ("This tool never sends or approves anything; only the named Relationship Manager can approve "
           "and send a client message, in the ChaseUp UI.")

mcp = MCPServer(
    name="chaseup",
    title="Northgate ChaseUp KYC chase tracker",
    instructions=(
        "Synthetic-data KYC document-chase tracker. Tools respect the caller's role (RBAC). "
        "You can read cases, list missing documents, prepare a DRAFT reminder, and read AI cost "
        "and audit data if your role allows. " + NO_SEND
    ),
    version="1.0.0",
)


async def _resolve_user(ctx: Context | None) -> tuple[User, str]:
    async with AsyncSessionLocal() as s:
        uid = INPROC_USER.get()
        if uid is not None:
            u = await s.get(User, uid)
            if u:
                return u, "mcp-inproc"
        token = None
        headers = None
        if ctx is not None:
            try:
                headers = ctx.headers
            except Exception:
                headers = None
        if headers:
            auth = headers.get("authorization") or headers.get("Authorization") or ""
            if auth.lower().startswith("bearer "):
                token = auth[7:].strip()
        if token is None:
            token = os.getenv("CHASEZERO_MCP_TOKEN", "").strip() or None
        u = await user_from_mcp_token(s, token)
        if u is None:
            raise ToolError("Unauthenticated: create an MCP token in ChaseUp (Your access -> MCP tokens) and pass it "
                            "as 'Authorization: Bearer <token>' (HTTP) or CHASEZERO_MCP_TOKEN (stdio).")
        return u, "mcp"


async def _run(tool: str, ctx: Context | None, args: dict[str, Any], fn) -> str:
    resolved, via = await _resolve_user(ctx)
    async with AsyncSessionLocal() as s:
        user = await s.get(User, resolved.id)
        if user is None:
            raise ToolError("Unknown user")
        try:
            result = await fn(s, user)
            outcome = "ok"
        except PermissionDenied as exc:
            outcome = "denied"
            await audit.record(s, actor=user, action="mcp_tool_call", entity_type="mcp_tool", entity_id=tool,
                               case_id=args.get("case_id"), via="mcp", reason=exc.message,
                               details={"tool": tool, "args": args, "outcome": outcome, "transport": via})
            raise ToolError(f"Permission denied: {exc.message}") from None
        except NotFound as exc:
            outcome = "not_found"
            await audit.record(s, actor=user, action="mcp_tool_call", entity_type="mcp_tool", entity_id=tool,
                               via="mcp", details={"tool": tool, "args": args, "outcome": outcome, "transport": via})
            raise ToolError(exc.message) from None
        except ValueError as exc:
            raise ToolError(str(exc)) from None
        await audit.record(s, actor=user, action="mcp_tool_call", entity_type="mcp_tool", entity_id=tool,
                           case_id=args.get("case_id"), via="mcp",
                           details={"tool": tool, "args": args, "outcome": outcome, "transport": via})
    return json.dumps(result, default=str)


@mcp.tool(description="List KYC cases visible to you (RMs see only their own cases). Read-only. " + NO_SEND)
async def list_cases(ctx: Context, search: str = "", filter_tab: str = "all") -> str:
    async def fn(s, u):
        data = await services.list_cases(s, u, search, filter_tab)
        return {"scope": data["scope"], "cases": [
            {k: c[k] for k in ("id", "case_code", "client_name", "status", "assigned_rm", "missing_count",
                               "oldest_missing_days", "sla_breached", "target_deadline_label")}
            for c in data["cases"]]}
    return await _run("list_cases", ctx, {"search": search, "filter_tab": filter_tab}, fn)


@mcp.tool(description="Get one KYC case with its document checklist. Read-only. " + NO_SEND)
async def get_case(ctx: Context, case_id: int) -> str:
    async def fn(s, u):
        c = await services.get_case(s, u, case_id)
        c.pop("actions", None)
        return c
    return await _run("get_case", ctx, {"case_id": case_id}, fn)


@mcp.tool(description="List the documents still missing on a case (requested, not yet received or waived). Read-only. "
                      + NO_SEND)
async def list_missing_documents(ctx: Context, case_id: int) -> str:
    return await _run("list_missing_documents", ctx, {"case_id": case_id},
                      lambda s, u: services.list_missing_documents(s, u, case_id))


@mcp.tool(description="Prepare a DRAFT chase email for a case (runs the drafter + critic agents). The draft is saved as "
                      "PENDING APPROVAL for the named RM. It is NOT sent. " + NO_SEND)
async def draft_chase_email(ctx: Context, case_id: int, tone: str = "") -> str:
    async def fn(s, u):
        r = await services.create_draft(u, case_id, tone=tone or None, via="mcp")
        return {k: r[k] for k in ("draft_id", "task_id", "trace_id", "engine", "critic_passed", "subject", "body",
                                  "data_source")} | {"status": "pending_approval", "sent": False}
    return await _run("draft_chase_email", ctx, {"case_id": case_id, "tone": tone}, fn)


@mcp.tool(description="AI cost summary: every LLM call's cost, by agent and model, per task and per approved draft. "
                      "Read-only. " + NO_SEND)
async def get_agent_costs(ctx: Context) -> str:
    async def fn(s, u):
        d = await services.cost_summary(s, u)
        d["ledger"] = d["ledger"][:25]
        return d
    return await _run("get_agent_costs", ctx, {}, fn)


@mcp.tool(description="Read the hash-chained audit log (MLRO only). Read-only. " + NO_SEND)
async def get_audit_log(ctx: Context, limit: int = 50, case_id: int = 0) -> str:
    return await _run("get_audit_log", ctx, {"limit": limit, "case_id": case_id},
                      lambda s, u: services.audit_log(s, u, limit, case_id or None, via="mcp"))


TOOL_NAMES = ["list_cases", "get_case", "list_missing_documents", "draft_chase_email", "get_agent_costs", "get_audit_log"]


# --------------------------------------------------------------------------- in-process MCP client
async def fetch_case_via_mcp(user: User | None, case_id: int):
    """Used by the LangGraph orchestrator: get case data through real MCP tool calls."""
    from mcp import Client

    if user is None:
        raise RuntimeError("MCP needs a user")
    token = INPROC_USER.set(user.id)
    try:
        async with Client(mcp, mode="legacy") as client:
            r1 = await client.call_tool("get_case", {"case_id": case_id})
            r2 = await client.call_tool("list_missing_documents", {"case_id": case_id})
    finally:
        INPROC_USER.reset(token)
    if r1.is_error or r2.is_error:
        raise RuntimeError(_text(r1 if r1.is_error else r2))
    case = json.loads(_text(r1))
    missing = json.loads(_text(r2))
    from app.guardrails import portal_url_for

    ctx = {k: case[k] for k in ("case_code", "client_name", "contact_name", "contact_role", "contact_email", "lei",
                                "assigned_rm", "target_deadline_label")}
    ctx["case_id"] = case["id"]
    ctx["portal_url"] = portal_url_for(case["case_code"])
    received = [{"id": d["id"], "document_name": d["document_name"]} for d in case["documents"]
                if d["status"] in ("Received", "Waived")]
    return ctx, [{"id": d["id"], "document_name": d["document_name"], "description": d["description"]} for d in missing], received


def _text(result) -> str:
    return "".join(getattr(c, "text", "") for c in result.content)


def http_app():
    """Streamable-HTTP ASGI app for mounting at /mcp in FastAPI."""
    from mcp.server.transport_security import TransportSecuritySettings

    return mcp.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=["127.0.0.1:*", "localhost:*", "testserver", "127.0.0.1", "localhost"],
            allowed_origins=["http://127.0.0.1:*", "http://localhost:*"],
        ),
    )


def main() -> None:
    import asyncio

    from app.database import init_db
    from app.seed import seed_database

    async def _prep() -> None:
        await init_db()
        async with AsyncSessionLocal() as s:
            await seed_database(s)

    asyncio.run(_prep())
    if not os.getenv("CHASEZERO_MCP_TOKEN"):
        print("[chaseup-mcp] CHASEZERO_MCP_TOKEN not set — every tool call will be rejected.", file=sys.stderr)
    mcp.run("stdio")


if __name__ == "__main__":
    main()
