"""RBAC: full role x endpoint matrix, own-case scope, RM-only approval, auth hygiene."""

import pytest
from fastapi.routing import APIRoute

from app.main import PUBLIC_ROUTES, RequirePerm, app
from app.rbac import MATRIX
from tests.conftest import USERS, H, case_id, run_sql

ROLE_OF = {"rm": "rm", "rm2": "rm", "ops": "ops", "agent_owner": "agent_owner", "architect": "architect",
           "product": "product", "business": "business", "mlro": "mlro", "data": "data"}

# (method, path, permission). Mutating calls get an empty JSON body: denied -> 403 (auth runs
# before body validation); allowed -> 422/200/404, i.e. anything except 401/403.
ENDPOINTS = [
    ("GET", "/api/auth/me", "self:read"),
    ("GET", "/api/auth/access-matrix", "self:read"),
    ("GET", "/api/auth/mcp-tokens", "mcp:manage_own_tokens"),
    ("GET", "/api/cases", "case:read"),
    ("GET", "/api/cases/{own}", "case:read"),
    ("GET", "/api/cases/{own}/missing", "case:read"),
    ("POST", "/api/cases/{own}/documents/1/status", "document:update_status"),
    ("PATCH", "/api/cases/{own}/note", "case:note_edit"),
    ("POST", "/api/cases/{own}/reset", "case:demo_reset"),
    ("GET", "/api/cases/{own}/drafts", "draft:read"),
    ("POST", "/api/cases/{own}/draft/recheck", "draft:read"),
    ("POST", "/api/cases/{own}/workflow/run", "draft:create"),
    ("POST", "/api/cases/{own}/approve", "draft:approve_send"),
    ("POST", "/api/drafts/999999/approve", "draft:approve_send"),
    ("POST", "/api/drafts/999999/discard", "draft:discard"),
    ("GET", "/api/actions", "case:read"),
    ("GET", "/api/tasks", "trace:read"),
    ("GET", "/api/tasks/999999/trace", "trace:read"),
    ("GET", "/api/costs/summary", "cost:read"),
    ("GET", "/api/agents", "agent:read_config"),
    ("GET", "/api/agents/drafter/versions", "agent:read_config"),
    ("POST", "/api/agents/drafter/config", "agent:edit_config"),
    ("POST", "/api/agents/drafter/restore", "agent:restore_version"),
    ("POST", "/api/agents/drafter/test", "agent:test_run"),
    ("PATCH", "/api/agents/drafter/controls", "agent:control"),
    ("PATCH", "/api/feature-flags/ai_drafting", "agent:control"),
    ("POST", "/api/settings/reload-env", "system:reload_env"),
    ("GET", "/api/audit", "audit:read"),
    ("POST", "/api/audit/verify", "audit:verify"),
    ("GET", "/api/dashboard/metrics", "analytics:read"),
    ("GET", "/api/measure", "measure:read"),
    ("GET", "/api/insights", "self:read"),
] + [("GET", f"/api/insights/{v}", f"insights:{v}") for v in
     ("engineering", "architecture", "product", "business", "security", "data", "operations")]

# Body payloads that are VALID but harmless, so allowed roles don't trigger side effects we
# don't want (workflow runs etc. get an invalid body instead -> 422).
SAFE_BODY = {"POST /api/cases/{own}/workflow/run": {"tone": 123}}


def test_every_api_route_is_permission_gated():
    """Default deny: every /api route is either explicitly public or carries a RequirePerm gate."""
    ungated = []
    for r in app.routes:
        if not isinstance(r, APIRoute) or not r.path.startswith("/api/"):
            continue
        for m in r.methods:
            if (m, r.path) in PUBLIC_ROUTES:
                continue
            gates = [d.call for d in r.dependant.dependencies if isinstance(d.call, RequirePerm)]
            if not gates:
                ungated.append(f"{m} {r.path}")
    assert ungated == []


EXTRA_COVERED = {  # covered by dedicated tests elsewhere (side effects / streaming)
    ("GET", "/api/cases/{case_id}/workflow/stream"),
    ("POST", "/api/auth/mcp-tokens"),
    ("DELETE", "/api/auth/mcp-tokens/{token_id}"),
}


def test_endpoint_list_covers_every_gated_route():
    concrete = [(m, p.replace("{own}", "1")) for m, p, _ in ENDPOINTS]
    missing = []
    for r in app.routes:
        if not isinstance(r, APIRoute) or not r.path.startswith("/api/"):
            continue
        for m in r.methods:
            if (m, r.path) in PUBLIC_ROUTES or (m, r.path) in EXTRA_COVERED:
                continue
            if not any(cm == m and r.path_regex.match(url) for cm, url in concrete):
                missing.append(f"{m} {r.path}")
    assert missing == []


@pytest.mark.parametrize("persona", list(USERS))
def test_rbac_matrix_every_role_every_endpoint(client, as_user, persona):
    c = as_user(persona)
    role = ROLE_OF[persona]
    own_code = "NCZ-2024-8841" if persona != "rm2" else "NCZ-2024-8862"  # each RM's own case
    own = case_id(client, own_code)
    failures = []
    for method, path, perm in ENDPOINTS:
        url = path.replace("{own}", str(own))
        body = SAFE_BODY.get(f"{method} {path}", {})
        r = c.request(method, url, json=body if method != "GET" else None, headers=H)
        allowed = role in MATRIX[perm]
        if allowed and r.status_code in (401, 403):
            failures.append(f"{persona} {method} {url} expected allowed, got {r.status_code} {r.text[:80]}")
        if not allowed and r.status_code != 403:
            failures.append(f"{persona} {method} {url} expected 403, got {r.status_code}")
    assert failures == []


def test_unauthenticated_is_401(client):
    client.cookies.clear()
    assert client.get("/api/cases").status_code == 401
    assert client.get("/api/health").status_code == 200


def test_rm_sees_only_own_cases(client, as_user):
    c = as_user("rm")
    data = c.get("/api/cases").json()
    assert data["scope"] == "own"
    assert data["cases"] and all(x["assigned_rm"] == "Sarah Jenkins" for x in data["cases"])
    other = case_id(client, "NCZ-2024-8862")  # Daniel's case
    assert c.get(f"/api/cases/{other}").status_code == 403
    ops = as_user("ops").get("/api/cases").json()
    assert ops["scope"] == "all" and len(ops["cases"]) > len(data["cases"])


def test_only_named_rm_can_approve_even_via_direct_api(client, as_user):
    cid = case_id(client, "NCZ-2024-8854")  # Sarah's
    run = as_user("ops").post(f"/api/cases/{cid}/workflow/run", json={}, headers=H)
    assert run.status_code == 200, run.text
    draft = run.json()
    payload = {"subject": draft["subject"], "body": draft["body"]}
    outbox_before = run_sql("SELECT COUNT(*) FROM outbound_messages")[0][0]
    for persona in ("ops", "mlro", "business", "agent_owner", "architect", "product", "data", "rm2"):
        r = as_user(persona).post(f"/api/drafts/{draft['draft_id']}/approve", json=payload, headers=H)
        assert r.status_code == 403, (persona, r.status_code)
        r = client.post(f"/api/cases/{cid}/approve", json=payload, headers=H)
        assert r.status_code == 403, (persona, "case route", r.status_code)
    assert run_sql("SELECT COUNT(*) FROM outbound_messages")[0][0] == outbox_before
    denied = run_sql("SELECT COUNT(*) FROM audit_events WHERE action='approval_denied'")[0][0]
    assert denied >= 1  # the other RM's attempt is audited

    rm = as_user("rm")
    # free-text actor is no longer accepted
    assert rm.post(f"/api/drafts/{draft['draft_id']}/approve", json={**payload, "actor": "Someone"}, headers=H).status_code == 422
    # CSRF header is required for state changes
    assert rm.post(f"/api/drafts/{draft['draft_id']}/approve", json=payload).status_code == 403
    ok = rm.post(f"/api/drafts/{draft['draft_id']}/approve", json=payload, headers=H)
    assert ok.status_code == 200, ok.text
    row = run_sql("SELECT approved_by_user_id FROM outbound_messages ORDER BY id DESC LIMIT 1")[0][0]
    sarah = run_sql("SELECT id FROM users WHERE username='sarah'")[0][0]
    assert row == sarah
    # a second approval of the same draft is refused
    assert rm.post(f"/api/drafts/{draft['draft_id']}/approve", json=payload, headers=H).status_code == 422


def test_rm_edit_that_breaks_guardrails_is_refused(client, as_user):
    cid = case_id(client, "NCZ-2024-8870")
    d = as_user("rm").post(f"/api/cases/{cid}/workflow/run", json={}, headers=H).json()
    bad = d["body"] + "\nWe guarantee approval within 2 days. Call me on +44 20 7946 0000."
    r = client.post(f"/api/drafts/{d['draft_id']}/approve", json={"subject": d["subject"], "body": bad}, headers=H)
    assert r.status_code == 422 and "validation" in r.text


def test_login_throttling_and_logout(client):
    from app import security

    security.reset_throttle()
    client.cookies.clear()
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "grace", "password": "wrong"}, headers=H).status_code == 401
    r = client.post("/api/auth/login", json={"username": "grace", "password": "Grace@pytest-only"}, headers=H)
    assert r.status_code == 429  # locked even with the right password
    security.reset_throttle()
    r = client.post("/api/auth/login", json={"username": "grace", "password": "Grace@pytest-only"}, headers=H)
    assert r.status_code == 200
    cookie = r.cookies.get("ng_session") or client.cookies.get("ng_session")
    assert cookie and "." in cookie
    set_cookie = r.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=strict" in set_cookie
    assert client.get("/api/auth/me").status_code == 200
    client.post("/api/auth/logout", headers=H)
    client.cookies.set("ng_session", cookie)
    assert client.get("/api/auth/me").status_code == 401  # revoked server-side


def test_tampered_cookie_rejected(client, as_user):
    as_user("mlro")
    good = client.cookies.get("ng_session")
    client.cookies.clear()
    client.cookies.set("ng_session", good[:-2] + ("00" if not good.endswith("00") else "11"))
    assert client.get("/api/auth/me").status_code == 401


def test_passwords_are_hashed_and_never_returned(client, as_user):
    rows = run_sql("SELECT password_hash FROM users")
    assert rows and all(r[0].startswith("pbkdf2_sha256$") for r in rows)
    me = as_user("rm").get("/api/auth/me").json()
    assert "password" not in str(me).lower()


def test_business_dashboard_has_no_document_content(client, as_user):
    d = as_user("business").get("/api/dashboard/metrics").json()
    text = str(d)
    assert "Trust Deed" not in text and "Apex" not in text and d["recent_actions"] == []
    assert as_user("business").get("/api/cases").status_code == 403


def test_no_risk_rating_anywhere(client, as_user):
    """MLRO red line: the system has no risk-rating field to assign or change."""
    cols = run_sql("SELECT name FROM pragma_table_info('kyc_cases')")
    assert not any("risk" in c[0] for c in cols)
    body = str(as_user("mlro").get("/api/cases").json()).lower()
    assert "risk_rating" not in body and "risk_score" not in body
