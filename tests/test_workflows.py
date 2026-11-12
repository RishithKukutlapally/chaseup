import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import database
import domain
from app import app
from seed import seed_data


@pytest.fixture
def db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "northgate-test.sqlite3"
    monkeypatch.setattr(database, "DATABASE_PATH", path)
    seed_data(path)
    return path


def test_due_threshold_is_derived_and_receipt_is_terminal(db_path: Path) -> None:
    with database.connect(db_path) as connection:
        document = connection.execute(
            "SELECT id, case_id, due_at FROM documents ORDER BY id LIMIT 1"
        ).fetchone()
    due = date.fromisoformat(document["due_at"])
    row = {"state": "requested", "due_at": due.isoformat()}

    assert domain.document_status(row, due) == "requested"
    assert domain.document_status(row, due + timedelta(days=2)) == "requested"
    assert domain.document_status(row, due + timedelta(days=3)) == "overdue"
    assert domain.document_status(
        {"state": "received", "due_at": due.isoformat()}, due + timedelta(days=20)
    ) == "received"


def test_document_events_enforce_transitions_and_waiver_reason(db_path: Path) -> None:
    with database.connect(db_path) as connection:
        docs = connection.execute(
            "SELECT id, case_id FROM documents WHERE state = 'requested' ORDER BY id LIMIT 2"
        ).fetchall()
    case_id = docs[0]["case_id"]
    received = domain.record_document_event(
        case_id, docs[0]["id"], "received", "Ops Analyst", path=str(db_path)
    )
    assert received["state"] == "received"

    with pytest.raises(ValueError, match="waiver reason"):
        domain.record_document_event(
            case_id, docs[1]["id"], "waived", "Ops Analyst", path=str(db_path)
        )
    waived = domain.record_document_event(
        case_id, docs[1]["id"], "waived", "Ops Analyst", "Duplicate evidence on file", path=str(db_path)
    )
    assert waived["state"] == "waived"
    assert waived["waiver_reason"] == "Duplicate evidence on file"

    with pytest.raises(domain.ConflictError):
        domain.record_document_event(
            case_id, docs[0]["id"], "waived", "Ops Analyst", "No longer needed", path=str(db_path)
        )

    with database.connect(db_path) as connection:
        events = connection.execute(
            "SELECT event_type FROM events WHERE document_id = ? ORDER BY id",
            (docs[1]["id"],),
        ).fetchall()
    assert [event["event_type"] for event in events][-1] == "waived"


def test_unapproved_draft_cannot_be_sent_through_api(db_path: Path) -> None:
    with TestClient(app) as client:
        case_id = "NG-2026-8812"
        created = client.post(
            f"/api/cases/{case_id}/drafts",
            json={"actor": "Alistair Vance", "body": "Please provide the requested documents."},
        )
        assert created.status_code == 201
        draft_id = created.json()["id"]

        rejected = client.post(
            f"/api/drafts/{draft_id}/send", json={"approved_by": "Alistair Vance"}
        )
        assert rejected.status_code == 409
        assert "approved" in rejected.json()["detail"].lower()

        approved = client.post(
            f"/api/drafts/{draft_id}/approve", json={"approved_by": "Alistair Vance"}
        )
        assert approved.status_code == 200
        sent = client.post(
            f"/api/drafts/{draft_id}/send", json={"approved_by": "Alistair Vance"}
        )
        assert sent.status_code == 200
        assert sent.json()["status"] == "sent"

        detail = client.get(f"/api/cases/{case_id}").json()
        event_types = [event["event_type"] for event in detail["timeline"]]
        assert "approved" in event_types
        assert "sent" in event_types


def test_approve_and_send_is_one_server_side_gated_action(db_path: Path) -> None:
    with TestClient(app) as client:
        created = client.post(
            "/api/cases/NG-2026-1002/drafts",
            json={"actor": "Sarah Jenkins", "body": "Synthetic reminder"},
        )
        draft_id = created.json()["id"]
        result = client.post(
            f"/api/drafts/{draft_id}/approve-and-send",
            json={"approved_by": "Sarah Jenkins"},
        )
        assert result.status_code == 200
        assert result.json()["status"] == "sent"


def test_scheduled_send_is_approved_and_dispatched_by_server(db_path: Path) -> None:
    draft = domain.create_draft(
        "NG-2026-8812", "Alistair Vance", "Synthetic scheduled reminder", path=str(db_path)
    )
    scheduled_for = datetime.now(timezone.utc) + timedelta(hours=1)
    scheduled = domain.schedule_draft(
        draft["id"], "Alistair Vance", scheduled_for, path=str(db_path)
    )
    assert scheduled["status"] == "scheduled"
    assert scheduled["approved_by"] == "Alistair Vance"

    sent_count = domain.send_due_drafts(
        path=str(db_path), now=scheduled_for + timedelta(minutes=1)
    )
    assert sent_count == 1
    with database.connect(db_path) as connection:
        final_status = connection.execute(
            "SELECT status FROM drafts WHERE id = ?", (draft["id"],)
        ).fetchone()["status"]
        event = connection.execute(
            "SELECT event_type FROM events WHERE draft_id = ? ORDER BY id DESC LIMIT 1",
            (draft["id"],),
        ).fetchone()
    assert final_status == "sent"
    assert event["event_type"] == "sent"


def test_seed_script_is_idempotent(db_path: Path) -> None:
    seed_data(db_path)
    with database.connect(db_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM cases").fetchone()[0] == 12
        assert connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0] == 36


@pytest.mark.parametrize(
    ("screen", "hook"),
    [
        ("chase-queue", 'id="queue-body"'),
        ("case-detail", 'id="case-checklist"'),
        ("reminder-composer", 'id="approve-send"'),
        ("stage-analytics", 'id="chase-rounds-body"'),
        ("analyst-handoff", 'id="submitHandoffBtn"'),
    ],
)
def test_screen_routes_serve_hooked_pages(db_path: Path, screen: str, hook: str) -> None:
    with TestClient(app) as client:
        response = client.get(f"/screens/{screen}")
    assert response.status_code == 200
    assert hook in response.text
    assert "/static/app.js" in response.text
    assert "/static/app.css" in response.text


def test_handoff_is_linked_and_logged(db_path: Path) -> None:
    with database.connect(db_path) as connection:
        document = connection.execute(
            "SELECT id FROM documents WHERE case_id = ? ORDER BY id LIMIT 1",
            ("NG-2026-8812",),
        ).fetchone()
    with TestClient(app) as client:
        response = client.post(
            "/api/cases/NG-2026-8812/handoffs",
            json={
                "actor": "Dev Patel",
                "guidance": "Please request a current certified copy.",
                "document_ids": [document["id"]],
            },
        )
    assert response.status_code == 201
    handoff = response.json()
    assert handoff["case_id"] == "NG-2026-8812"
    assert handoff["document_ids"] == [document["id"]]
    with database.connect(db_path) as connection:
        event = connection.execute(
            "SELECT event_type, handoff_id FROM events WHERE handoff_id = ?",
            (handoff["id"],),
        ).fetchone()
    assert event["event_type"] == "handoff_raised"


def test_analytics_uses_allowed_stages_and_never_queries_credit_data(
    db_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    executed: list[str] = []
    original_connect = domain.connect

    def traced_connect(path=None):
        connection = original_connect(path)
        connection.set_trace_callback(executed.append)
        return connection

    monkeypatch.setattr(domain, "connect", traced_connect)
    with TestClient(app) as client:
        response = client.get("/api/analytics")

    assert response.status_code == 200
    result = response.json()
    assert [(stage["name"], stage["days"]) for stage in result["stages"]] == [
        ("Document intake and checks", 9),
        ("Chasing missing documents", 17),
        ("UBO extraction", 11),
        ("Sanctions and PEP alerts", 6),
        ("Risk & Committee Review", 12),
        ("Core-banking account opening", 7),
    ]
    assert "credit" not in str(result).casefold()
    assert all("credit" not in statement.casefold() for statement in executed)


def test_waiver_reason_is_written_to_immutable_event_log(db_path: Path) -> None:
    with database.connect(db_path) as connection:
        document = connection.execute(
            "SELECT id, case_id FROM documents ORDER BY id LIMIT 1"
        ).fetchone()
    domain.record_document_event(
        document["case_id"],
        document["id"],
        "waived",
        "Ops Analyst",
        "Policy exception documented",
        path=str(db_path),
    )
    with database.connect(db_path) as connection:
        event = connection.execute(
            "SELECT reason FROM events WHERE document_id = ? AND event_type = 'waived'",
            (document["id"],),
        ).fetchone()
        with pytest.raises(sqlite3.IntegrityError, match="immutable"):
            connection.execute(
                "UPDATE events SET reason = 'changed' WHERE document_id = ?",
                (document["id"],),
            )
    assert event["reason"] == "Policy exception documented"
