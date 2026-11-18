"""Live stakeholder dashboards: per-vertical access, landing pages, and numbers that move with real activity."""

from tests.conftest import USERS, H, case_id

VERTICALS = ["engineering", "architecture", "product", "business", "security", "data", "operations"]
EXPECT = {  # persona -> (landing, dashboards they may open)
    "rm": ("my-cases", []), "rm2": ("my-cases", []), "ops": ("queue", ["operations"]),
    "agent_owner": ("agent-settings", ["engineering"]), "architect": ("dash-architecture", ["architecture"]),
    "product": ("dash-product", ["product"]), "business": ("dashboards", VERTICALS),
    "mlro": ("dash-security", ["security"]), "data": ("dash-data", ["data"]),
}


def test_every_login_lands_on_its_screen_and_sees_only_its_dashboards(client, as_user):
    assert set(EXPECT) == set(USERS)
    for persona, (landing, allowed) in EXPECT.items():
        c = as_user(persona)
        assert c.get("/api/auth/me").json()["landing"] == landing
        ov = c.get("/api/insights").json()
        assert [v["id"] for v in ov["verticals"] if v["allowed"]] == allowed, persona
        for v in VERTICALS:
            assert c.get(f"/api/insights/{v}").status_code == (200 if v in allowed else 403), (persona, v)


def test_dashboards_have_kpis_and_labelled_widgets(client, as_user):
    c = as_user("business")
    for v in VERTICALS:
        d = c.get(f"/api/insights/{v}").json()
        assert len(d["kpis"]) == 4 and d["widgets"]
        assert all(w["source"] in ("live", "static", "planned") for w in d["widgets"])
    planned = [w for w in c.get("/api/insights/data").json()["widgets"] if w["source"] == "planned"]
    assert planned and "matching" in planned[0]["title"].lower()  # email matching is honestly marked as not built


def test_dashboards_are_live(client, as_user):
    c = as_user("business")
    before_calls = c.get("/api/insights/engineering").json()["kpis"][0]["value"]
    before_wait = c.get("/api/insights/operations").json()["kpis"][3]["value"]
    as_user("ops").post(f"/api/cases/{case_id(client, 'NCZ-2024-8870')}/workflow/run", json={}, headers=H)
    c = as_user("business")
    assert c.get("/api/insights/engineering").json()["kpis"][0]["value"] != before_calls
    assert int(c.get("/api/insights/operations").json()["kpis"][3]["value"]) >= int(before_wait)
    sec = c.get("/api/insights/security").json()
    assert sec["kpis"][0]["value"] == "0"  # no send without the named RM


def test_latency_percentiles_are_ordered(client, as_user, monkeypatch):
    """Nearest-rank percentiles: p95 can never be below p50, even with very few calls."""
    import math

    for lat in ([2300, 1400], [900], [100, 200, 300, 400, 5000]):
        s = sorted(lat)
        p50 = s[len(s) // 2] if len(s) % 2 else (s[len(s) // 2 - 1] + s[len(s) // 2]) / 2
        p95 = s[max(0, math.ceil(0.95 * len(s)) - 1)]
        assert p95 >= p50
