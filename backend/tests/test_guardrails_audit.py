"""Redaction, output validation, template fallback, hash-chained append-only audit log."""

import sqlite3

import pytest

from app import agent_graph
from app.guardrails import Redactor, all_passed, portal_url_for, template_email, validate_chase_email
from tests.conftest import H, case_id, run_sql

CTX = {
    "case_code": "NCZ-2024-0001", "client_name": "Example Harbour Trading Ltd", "contact_name": "Jordan Example",
    "contact_email": "jordan@example.test", "lei": "TESTLEI0001", "assigned_rm": "Sarah Jenkins",
    "target_deadline_label": "1 December", "portal_url": portal_url_for("NCZ-2024-0001"),
}
DOCS = [{"document_name": "Register of Members"}, {"document_name": "Certified Trust Deed (2023 Addendum)"}]


def test_redaction_roundtrip_and_leak_detection():
    r = Redactor.for_case(CTX)
    text = "Dear Jordan, Jordan Example of Example Harbour Trading Ltd (jordan@example.test, TESTLEI0001)"
    red = r.redact(text)
    assert "Jordan" not in red and "Example Harbour" not in red and "jordan@example.test" not in red
    assert "[[CLIENT]]" in red and "[[CONTACT]]" in red and "[[CONTACT_FIRST]]" in red
    assert r.restore(red) == text
    assert r.leaks(red) == [] and r.leaks(text)


def test_template_always_passes_validation():
    for tone in ("institutional", "casual", "urgent"):
        _, body = template_email(CTX, DOCS, tone)
        checks = validate_chase_email(body, CTX, DOCS)
        assert all_passed(checks), [c for c in checks if not c.passed]


@pytest.mark.parametrize("bad,key", [
    ("We guarantee approval once received.", "no_promises"),
    ("We can waive the remaining checks.", "no_waivers"),
    ("Your facility of £45,000,000 is ready.", "no_amounts"),
    ("Your risk rating is low.", "no_risk_credit"),
    ("We confirm these documents are genuine.", "no_risk_credit"),
    ("Call me on +44 20 7946 0958.", "no_phone"),
    ("See https://evil.example/upload for details.", "links"),
    ("Failure to reply will lead to legal action.", "tone"),
])
def test_validation_rejects_forbidden_content(bad, key):
    _, body = template_email(CTX, DOCS)
    checks = {c.key: c for c in validate_chase_email(body + "\n" + bad, CTX, DOCS)}
    assert not checks[key].passed


def test_validation_requires_every_doc_deadline_and_rm():
    _, body = template_email(CTX, DOCS)
    checks = {c.key: c.passed for c in validate_chase_email(body.replace("Register of Members", "a register"), CTX, DOCS)}
    assert checks["all_documents"] is False
    checks = {c.key: c.passed for c in validate_chase_email(body.replace("1 December", "soon"), CTX, DOCS)}
    assert checks["deadline"] is False
    checks = {c.key: c.passed for c in validate_chase_email(body.replace("Sarah Jenkins", "The team"), CTX, DOCS)}
    assert checks["rm_name"] is False


def test_prompt_sent_to_model_contains_no_client_names(client, as_user):
    cid = case_id(client, "NCZ-2024-8841")
    out = as_user("ops").post(f"/api/cases/{cid}/workflow/run", json={}, headers=H).json()
    for step in out["trace"]:
        if step["step"] == "prompt":
            sent = step["data"]["system"] + step["data"]["user"]
            assert "Apex Global" not in sent and "Alistair" not in sent and "apex-commodities" not in sent
            assert "[[CLIENT]]" in sent
    assert "Apex Global Commodities Ltd" in out["body"] and "Alistair" in out["body"]  # restored after


def test_falls_back_to_template_when_llm_output_keeps_failing(client, as_user, monkeypatch):
    real = agent_graph._sim_drafter
    monkeypatch.setattr(agent_graph, "_sim_drafter", lambda c, m, t, f: real(c, m, t, True))  # always flawed
    cid = case_id(client, "NCZ-2024-8841")
    out = as_user("ops").post(f"/api/cases/{cid}/workflow/run", json={}, headers=H).json()
    assert out["engine"] == "template" and out["attempts"] == 2
    assert any(s["step"] == "fallback" for s in out["trace"])
    assert "guarantee" not in out["body"].lower()


def test_critic_rejection_drill_triggers_revision(client, as_user):
    cid = case_id(client, "NCZ-2024-8841")
    out = as_user("ops").post(f"/api/cases/{cid}/workflow/run", json={"simulate_critic_rejection": True}, headers=H).json()
    verdicts = [s["status"] for s in out["trace"] if s["step"] == "critic_verdict"]
    assert verdicts == ["fail", "ok"] and out["attempts"] == 2 and out["critic_passed"]


def test_document_waiver_needs_reason_and_is_audited(client, as_user):
    cid = case_id(client, "NCZ-2024-8862")
    case = as_user("ops").get(f"/api/cases/{cid}").json()
    doc = next(d for d in case["documents"] if d["status"] == "Missing")
    url = f"/api/cases/{cid}/documents/{doc['id']}/status"
    assert client.post(url, json={"status": "waived", "reason": ""}, headers=H).status_code == 422
    assert client.post(url, json={"status": "waived", "reason": "Held on file from 2023 onboarding"}, headers=H).status_code == 200
    ev = run_sql("SELECT actor, reason FROM audit_events WHERE action='document_waived' ORDER BY id DESC LIMIT 1")[0]
    assert ev == ("Priya Raman", "Held on file from 2023 onboarding")
    assert client.post(url, json={"status": "missing", "reason": "re-request"}, headers=H).status_code == 200


def test_audit_chain_verifies_and_is_append_only(client, as_user):
    c = as_user("mlro")
    r = c.post("/api/audit/verify", headers=H).json()
    assert r["valid"] and r["events_checked"] > 5
    with pytest.raises(sqlite3.DatabaseError, match="append-only"):
        run_sql("UPDATE audit_events SET reason='edited' WHERE id=1")
    with pytest.raises(sqlite3.DatabaseError, match="append-only"):
        run_sql("DELETE FROM audit_events WHERE id=1")
    events = c.get("/api/audit?limit=5").json()
    assert all(len(e["hash"]) == 64 for e in events)
    assert events[1]["hash"] == events[0]["prev_hash"]


def test_audit_detects_tampering(client, as_user):
    """Bypass the trigger (as a DB admin could), tamper, and confirm verify catches it; then restore."""
    target = run_sql("SELECT id, reason FROM audit_events ORDER BY id LIMIT 1 OFFSET 3")[0]
    run_sql("DROP TRIGGER audit_events_no_update")
    try:
        run_sql("UPDATE audit_events SET reason='tampered' WHERE id=?", (target[0],))
        r = as_user("mlro").post("/api/audit/verify", headers=H).json()
        assert r["valid"] is False and r["broken_at_id"] == target[0]
    finally:
        run_sql("UPDATE audit_events SET reason=? WHERE id=?", (target[1], target[0]))
        run_sql("CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events "
                "BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;")
    assert as_user("mlro").post("/api/audit/verify", headers=H).json()["valid"] is True


def test_measure_before_vs_after(client, as_user):
    m = as_user("business").get("/api/measure").json()
    assert 14 <= m["baseline"]["median_days"] <= 20  # mirrors the 17-day chase stage
    assert m["pilot"]["median_days"] < m["baseline"]["median_days"]
    assert 35 <= m["baseline"]["pct_more_than_one_round"] <= 47  # ~41% go back more than once
    assert "synthetic" in m["caveat"].lower()
