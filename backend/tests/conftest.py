"""Test fixtures: isolated temp DB, simulated LLM mode, fast PBKDF2, fixed demo password template."""

import os
import tempfile
from pathlib import Path

_DB = Path(tempfile.gettempdir()) / f"chaseup_pytest_{os.getpid()}.db"
for suffix in ("", "-wal", "-shm"):
    Path(str(_DB) + suffix).unlink(missing_ok=True)
os.environ["CHASEZERO_DB_PATH"] = str(_DB)
os.environ["CHASEZERO_SIMULATE_ONLY"] = "1"  # never call a real model from unit tests
os.environ["PBKDF2_ITERATIONS"] = "1000"
os.environ["DEMO_PASSWORD_TEMPLATE"] = "{Name}@pytest-only"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

H = {"X-ChaseUp-Request": "1"}
USERS = {
    "rm": ("sarah", "Sarah"),
    "rm2": ("daniel", "Daniel"),
    "ops": ("priya", "Priya"),
    "mlro": ("grace", "Grace"),
    "architect": ("omar", "Omar"),
    "product": ("mei", "Mei"),
    "business": ("robert", "Robert"),
    "data": ("lucas", "Lucas"),
    "agent_owner": ("aisha", "Aisha"),
}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def as_user(client):
    """as_user('ops') -> client signed in as that persona (cookie jar replaced)."""
    from app import security

    def _login(key: str) -> TestClient:
        security.reset_throttle()
        username, first = USERS[key]
        client.cookies.clear()
        r = client.post("/api/auth/login", json={"username": username, "password": f"{first}@pytest-only"}, headers=H)
        assert r.status_code == 200, r.text
        return client

    return _login


def case_id(client, code: str) -> int:
    return run_sql("SELECT id FROM kyc_cases WHERE case_code = ?", (code,))[0][0]


def run_sql(sql: str, params: tuple = ()):
    import sqlite3

    con = sqlite3.connect(os.environ["CHASEZERO_DB_PATH"])
    try:
        cur = con.execute(sql, params)
        rows = cur.fetchall()
        con.commit()
        return rows
    finally:
        con.close()
