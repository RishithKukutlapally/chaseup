"""AI cost governance: cost rows for every call, budget cap, rate limit, kill switch, fallback,
circuit breaker, live config changes, field-level rights, version restore, test runs."""

import asyncio
import sqlite3

import pytest

from app import config, llm_gateway
from tests.conftest import H, case_id, run_sql


def runs_count() -> int:
    return run_sql("SELECT COUNT(*) FROM agent_runs")[0][0]


def chase(client, as_user, code="NCZ-2024-8841", persona="ops", **body):
    r = as_user(persona).post(f"/api/cases/{case_id(client, code)}/workflow/run", json=body, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def set_controls(as_user, persona="agent_owner", agent="drafter", **kw):
    r = as_user(persona).patch(f"/api/agents/{agent}/controls", json={**kw, "reason": "pytest drill"}, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def test_every_llm_call_is_recorded_with_cost(client, as_user):
    before = runs_count()
    out = chase(client, as_user)
    rows = run_sql("SELECT agent, provider, model, input_tokens, output_tokens, latency_ms, cost_usd, cost_inr, status,"
                   " trace_id, user_id FROM agent_runs WHERE task_id = ?", (out["task_id"],))
    assert runs_count() - before == len(rows) == 2  # drafter + critic
    for _agent, provider, model, tin, tout, _lat, usd, inr, status, trace_id, uid in rows:
        assert provider == "google" and model == config.GEMINI_PRIMARY_MODEL
        assert tin > 0 and tout > 0 and usd > 0 and status == "simulated"
        assert abs(inr - usd * config.USD_TO_INR) < 1e-6 and trace_id == out["trace_id"] and uid
        assert abs(usd - config.cost_usd(model, tin, tout)) < 1e-9


def test_per_task_and_outcome_costs(client, as_user):
    out = chase(client, as_user, code="NCZ-2024-8833")
    as_user("rm").post(f"/api/drafts/{out['draft_id']}/approve",
                       json={"subject": out["subject"], "body": out["body"]}, headers=H)
    out2 = chase(client, as_user, code="NCZ-2024-8875", persona="rm2")
    as_user("rm2").post(f"/api/drafts/{out2['draft_id']}/discard", json={"reason": "client called instead"}, headers=H)
    s = as_user("finance").get("/api/costs/summary").json()
    assert s["outcomes"]["approved"]["drafts"] >= 1 and s["outcomes"]["approved"]["per_draft_usd"] > 0
    assert s["outcomes"]["discarded"]["drafts"] >= 1
    task = next(t for t in s["ledger"] if t["id"] == out["task_id"])
    assert task["outcome"] == "approved" and task["llm_calls"] == 2 and task["cost_usd"] > 0
    assert s["this_month"]["usd"] > 0 and "drafter" in s["by_agent"] and s["real_vs_simulated"]["simulated"]["calls"] > 0
    assert all(not p["verified"] or "checked" in p["source"] for p in s["price_table"].values())


def test_budget_cap_blocks_calls(client, as_user):
    # field-level: the Agent Owner may not set budgets, the COO may
    r = as_user("agent_owner").patch("/api/agents/drafter/controls",
                                     json={"monthly_budget_usd": 0, "reason": "trying to set budget"}, headers=H)
    assert r.status_code == 403
    set_controls(as_user, persona="coo", monthly_budget_usd=0.0)
    try:
        out = chase(client, as_user)
        assert out["engine"] == "template"
        st = run_sql("SELECT status FROM agent_runs WHERE task_id=? AND agent='drafter'", (out["task_id"],))
        assert ("blocked_budget",) in st
        assert any(s["step"] == "control" and s["status"] == "fail" for s in out["trace"])
        assert out["draft_id"]  # the RM still gets a (template) draft to approve
    finally:
        set_controls(as_user, persona="coo", monthly_budget_usd=25.0)


def test_kill_switch_and_feature_flag(client, as_user):
    set_controls(as_user, enabled=False)
    try:
        out = chase(client, as_user)
        assert out["engine"] == "template"
        assert ("disabled",) in run_sql("SELECT status FROM agent_runs WHERE task_id=?", (out["task_id"],))
    finally:
        set_controls(as_user, enabled=True)
    r = as_user("agent_owner").patch("/api/feature-flags/ai_drafting", json={"enabled": False, "reason": "pytest"}, headers=H)
    assert r.status_code == 200
    try:
        assert chase(client, as_user)["engine"] == "template"
    finally:
        as_user("agent_owner").patch("/api/feature-flags/ai_drafting", json={"enabled": True, "reason": "pytest"}, headers=H)


def test_rate_limit_per_user(client, as_user, monkeypatch):
    monkeypatch.setattr(config, "USER_HOURLY_LLM_CALL_LIMIT", 0)
    out = chase(client, as_user)
    assert out["engine"] == "template"
    assert ("blocked_rate_limit",) in run_sql("SELECT status FROM agent_runs WHERE task_id=?", (out["task_id"],))


def test_outage_drill_fails_over_to_fallback(client, as_user):
    set_controls(as_user, simulate_primary_outage=True)
    try:
        out = chase(client, as_user)
        rows = run_sql("SELECT model, status, is_fallback FROM agent_runs WHERE task_id=? AND agent='drafter' ORDER BY id",
                       (out["task_id"],))
        assert rows[0][1] == "error" and rows[0][0] == config.GEMINI_PRIMARY_MODEL
        assert rows[1][0] == config.GEMINI_FALLBACK_MODEL and rows[1][2] == 1
        assert out["engine"] == "simulated" and out["draft_id"]
    finally:
        set_controls(as_user, simulate_primary_outage=False)


def test_circuit_breaker_opens_and_falls_back(monkeypatch):
    """Real-provider path with a failing primary: 3 failures open the breaker, fallback serves."""
    from app.agent_config import AgentSettings
    from app.database import AsyncSessionLocal
    from app.trace import Trace

    llm_gateway.reset_breakers()
    monkeypatch.setattr(config, "provider_key_present", lambda p: True)
    calls = []

    async def fake_call(model, system, prompt, temperature, timeout_s, json_mode):
        calls.append(model)
        if model == "primary-x":
            raise TimeoutError("primary down")
        return '{"subject":"s","body":"b"}', 10, 5

    monkeypatch.setattr(llm_gateway, "_provider_call", fake_call)
    s = AgentSettings("critic", 1, "p", "n/a", "primary-x", config.GEMINI_FALLBACK_MODEL, 0.0, 1.0, True, 1000.0, False)

    async def go():
        async with AsyncSessionLocal() as session:
            results = []
            for _ in range(4):
                results.append(await llm_gateway.call_llm(session, settings=s, purpose="t", system_prompt="x",
                                                          user_prompt="y", trace=Trace("t"), user=None,
                                                          simulate=lambda a, b: "{}"))
            return results

    results = asyncio.run(go())
    assert all(r.is_fallback and r.status == "fallback_success" for r in results)
    assert calls.count("primary-x") == 3  # 4th call skipped the primary: breaker open
    assert llm_gateway.breaker_state("primary-x") == "open"
    llm_gateway.reset_breakers()


def test_config_change_applies_on_next_call_and_restore(client, as_user):
    ao = as_user("agent_owner")
    v1 = ao.get("/api/agents/drafter/versions").json()[-1]
    marker = "PYTEST-MARKER: keep it to five sentences."
    assert as_user("coo").post("/api/agents/drafter/config",
                               json={"changes": {"system_prompt": marker}, "reason": "nope"}, headers=H).status_code == 403
    ao = as_user("agent_owner")
    r = ao.post("/api/agents/drafter/config",
                json={"changes": {"system_prompt": v1["system_prompt"] + " " + marker, "tone": "casual"},
                      "reason": "pytest live change"}, headers=H)
    assert r.status_code == 200, r.text
    new_v = r.json()["version"]
    out = chase(client, as_user)  # no restart
    prompt_step = next(s for s in out["trace"] if s["step"] == "prompt")
    assert marker in prompt_step["data"]["system"]
    assert "FIXED GUARDRAILS" in prompt_step["data"]["system"]  # cannot be edited away
    assert "Tone: casual" in prompt_step["data"]["user"]
    ao = as_user("agent_owner")
    r = ao.post("/api/agents/drafter/restore", json={"version": v1["version"], "reason": "pytest restore"}, headers=H)
    assert r.status_code == 200 and r.json()["version"] == new_v + 1 and r.json()["restored_from_version"] == v1["version"]
    cur = ao.get("/api/agents").json()["agents"][0]["settings"]
    assert cur["system_prompt"] == v1["system_prompt"] and cur["tone"] == v1["tone"]
    # history is append-only
    with pytest.raises(sqlite3.DatabaseError, match="append-only"):
        run_sql("UPDATE agent_config_versions SET system_prompt='x' WHERE version=1")
    with pytest.raises(sqlite3.DatabaseError, match="append-only"):
        run_sql("DELETE FROM agent_runs")


def test_invalid_model_rejected(client, as_user):
    r = as_user("agent_owner").post("/api/agents/drafter/config",
                                    json={"changes": {"primary_model": "gpt-unknown"}, "reason": "pytest"}, headers=H)
    assert r.status_code == 422


def test_prompt_test_run_on_synthetic_case_saves_nothing(client, as_user):
    drafts_before = run_sql("SELECT COUNT(*) FROM chase_drafts")[0][0]
    r = as_user("agent_owner").post("/api/agents/drafter/test",
                                    json={"changes": {"system_prompt": "Draft a short polite reminder email as JSON."}},
                                    headers=H)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["draft_id"] is None and "Register of Members" in out["body"]
    assert run_sql("SELECT COUNT(*) FROM chase_drafts")[0][0] == drafts_before
    assert run_sql("SELECT kind FROM agent_tasks WHERE id=?", (out["task_id"],))[0][0] == "test_run"
    # the saved config was NOT changed by the test
    cur = as_user("agent_owner").get("/api/agents").json()["agents"][0]["settings"]
    assert cur["system_prompt"] != "Draft a short polite reminder email as JSON."


def test_trace_is_visible_and_scoped(client, as_user):
    out = chase(client, as_user, code="NCZ-2024-8854")
    t = as_user("rm").get(f"/api/tasks/{out['task_id']}/trace").json()
    steps = [s["step"] for s in t["steps"]]
    for expected in ("plan", "data_source", "redaction", "control", "prompt", "model_call", "validation",
                     "critic_verdict", "handoff"):
        assert expected in steps
    assert t["task"]["data_source"] == "mcp"
    assert as_user("rm2").get(f"/api/tasks/{out['task_id']}/trace").status_code == 403
