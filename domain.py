import json
import math
import sqlite3
from datetime import date, datetime, timedelta, timezone
from statistics import median
from uuid import uuid4

from config import OVERDUE_AFTER_DAYS, STAGE_DURATIONS
from database import connect


class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


def _begin_write(connection: sqlite3.Connection) -> None:
    connection.execute("BEGIN IMMEDIATE")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _event(
    connection: sqlite3.Connection,
    case_id: str,
    event_type: str,
    actor: str,
    *,
    document_id: str | None = None,
    draft_id: str | None = None,
    handoff_id: str | None = None,
    reason: str | None = None,
    details: str = "",
    event_key: str | None = None,
) -> None:
    connection.execute(
        """
        INSERT OR IGNORE INTO events
            (event_key, case_id, document_id, draft_id, handoff_id,
             event_type, actor, reason, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_key,
            case_id,
            document_id,
            draft_id,
            handoff_id,
            event_type,
            actor,
            reason,
            details,
            now_iso(),
        ),
    )


def document_status(document: sqlite3.Row, today: date | None = None) -> str:
    if document["state"] in {"received", "waived"}:
        return document["state"]
    reference_date = today or date.today()
    due_date = date.fromisoformat(document["due_at"])
    days_past_due = (reference_date - due_date).days
    if days_past_due > OVERDUE_AFTER_DAYS:
        return "overdue"
    return "requested"


def _case_dict(case: sqlite3.Row, connection: sqlite3.Connection, today: date | None = None) -> dict:
    reference_date = today or date.today()
    documents = connection.execute(
        "SELECT * FROM documents WHERE case_id = ? ORDER BY requested_at, id",
        (case["id"],),
    ).fetchall()
    document_rows = []
    for document in documents:
        row = dict(document)
        row["status"] = document_status(document, today)
        row["days_open"] = max(
            0, (reference_date - date.fromisoformat(document["requested_at"])).days
        )
        document_rows.append(row)
    active_docs = [item for item in document_rows if item["status"] not in {"received", "waived"}]
    oldest_age = max((item["days_open"] for item in active_docs), default=0)
    return {
        **dict(case),
        "days_open": max(0, (reference_date - date.fromisoformat(case["opened_at"])).days),
        "stage_days": max(
            0,
            (reference_date - date.fromisoformat(case["stage_started_at"])).days,
        ),
        "documents": document_rows,
        "missing_docs": len(active_docs),
        "oldest_item_age": oldest_age,
        "status": "overdue"
        if any(item["status"] == "overdue" for item in active_docs)
        else "due_today"
        if any(item["due_at"] == date.today().isoformat() for item in active_docs)
        else "on_track",
    }


def list_queue(
    *,
    search: str = "",
    status: str = "all",
    rm: str = "all",
    stage: str = "all",
    aging: str = "all",
    sort: str = "oldest",
    page: int = 1,
    page_size: int = 25,
    today: date | None = None,
    path: str | None = None,
) -> dict:
    reference_date = today or date.today()
    with connect(path) as connection:
        cases = connection.execute("SELECT * FROM cases").fetchall()
        all_rows = [_case_dict(case, connection, reference_date) for case in cases]
        for item in all_rows:
            for doc in item["documents"]:
                doc_row = connection.execute(
                    "SELECT * FROM documents WHERE id = ?", (doc["id"],)
                ).fetchone()
                doc["status"] = document_status(doc_row, reference_date)
            active_docs = [
                doc for doc in item["documents"] if doc["status"] not in {"received", "waived"}
            ]
            item["status"] = (
                "overdue"
                if any(doc["status"] == "overdue" for doc in active_docs)
                else "due_today"
                if any(doc["due_at"] == reference_date.isoformat() for doc in active_docs)
                else "on_track"
            )
        open_rows = [item for item in all_rows if item["missing_docs"]]
        overdue_rows = [item for item in open_rows if item["status"] == "overdue"]
        days_in_chase = [
            item["stage_days"]
            for item in open_rows
            if item["stage"].lower() in {"chasing missing documents", "chasing missing docs"}
        ]
        summary = {
            "cases_open": len(open_rows),
            "cases_overdue": len(overdue_rows),
            "median_days_in_chase_stage": median(days_in_chase) if days_in_chase else 0,
        }

    needle = search.strip().casefold()
    rows = [
        item
        for item in open_rows
        if (not needle or needle in item["client_name"].casefold() or needle in item["id"].casefold())
        and (rm == "all" or item["rm_name"] == rm)
        and (stage == "all" or item["stage"] == stage)
        and (
            status == "all"
            or status == item["status"]
            or (status == "overdue" and item["status"] == "overdue")
            or (status == "due_today" and item["status"] == "due_today")
            or (status == "blocked" and bool(item["blocked"]))
        )
        and (
            aging == "all"
            or (aging == "gt21" and item["oldest_item_age"] > 21)
            or (aging == "14-21" and 14 <= item["oldest_item_age"] <= 21)
            or (aging == "7-14" and 7 <= item["oldest_item_age"] < 14)
            or (aging == "lt7" and item["oldest_item_age"] < 7)
        )
    ]
    reverse = sort not in {"oldest_asc", "newest"}
    rows.sort(key=lambda item: (item["oldest_item_age"], item["opened_at"]), reverse=reverse)
    total = len(rows)
    start = (page - 1) * page_size
    return {
        "summary": summary,
        "cases": rows[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if page_size else 0,
    }


def get_case(case_id: str, *, today: date | None = None, path: str | None = None) -> dict:
    with connect(path) as connection:
        case = connection.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        if case is None:
            raise NotFoundError("Case not found")
        result = _case_dict(case, connection, today)
        for document in result["documents"]:
            doc_row = connection.execute(
                "SELECT * FROM documents WHERE id = ?", (document["id"],)
            ).fetchone()
            document["status"] = document_status(doc_row, today)
        events = connection.execute(
            "SELECT * FROM events WHERE case_id = ? ORDER BY created_at DESC, id DESC",
            (case_id,),
        ).fetchall()
        result["timeline"] = [dict(event) for event in events]
        result["blocked_stages"] = (
            ["UBO extraction"] if result["blocked"] else []
        )
        return result


def record_document_event(
    case_id: str,
    document_id: str,
    action: str,
    actor: str,
    reason: str | None = None,
    *,
    path: str | None = None,
) -> dict:
    if action not in {"request", "received", "waived"}:
        raise ValueError("Unsupported document action")
    if action == "waived" and not (reason and reason.strip()):
        raise ValueError("A waiver reason is required")
    with connect(path) as connection:
        _begin_write(connection)
        document = connection.execute(
            "SELECT * FROM documents WHERE id = ? AND case_id = ?",
            (document_id, case_id),
        ).fetchone()
        if document is None:
            raise NotFoundError("Document not found")
        if action in {"received", "waived"} and document["state"] != "requested":
            raise ConflictError("Only a requested document can be received or waived")
        if action == "request" and document["state"] != "requested":
            raise ConflictError("A received or waived document cannot be requested again")
        new_state = "requested" if action == "request" else action
        connection.execute(
            "UPDATE documents SET state = ?, waiver_reason = ? WHERE id = ?",
            (new_state, reason.strip() if action == "waived" else None, document_id),
        )
        _event(
            connection,
            case_id,
            action,
            actor,
            document_id=document_id,
            reason=reason.strip() if reason else None,
        )
        connection.commit()
        updated = connection.execute(
            "SELECT * FROM documents WHERE id = ?", (document_id,)
        ).fetchone()
        return {**dict(updated), "status": document_status(updated)}


def create_draft(case_id: str, actor: str, body: str, *, path: str | None = None) -> dict:
    with connect(path) as connection:
        _begin_write(connection)
        case = connection.execute("SELECT id FROM cases WHERE id = ?", (case_id,)).fetchone()
        if case is None:
            raise NotFoundError("Case not found")
        draft_id = str(uuid4())
        timestamp = now_iso()
        connection.execute(
            """
            INSERT INTO drafts (id, case_id, body, status, created_at, updated_at)
            VALUES (?, ?, ?, 'draft', ?, ?)
            """,
            (draft_id, case_id, body, timestamp, timestamp),
        )
        _event(
            connection,
            case_id,
            "draft_created",
            actor,
            draft_id=draft_id,
            details="Draft for RM review",
        )
        connection.commit()
        return dict(connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone())


def update_draft(draft_id: str, actor: str, body: str, *, path: str | None = None) -> dict:
    with connect(path) as connection:
        _begin_write(connection)
        draft = connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        if draft is None:
            raise NotFoundError("Draft not found")
        if draft["status"] != "draft":
            raise ConflictError("Only an unapproved draft can be edited")
        connection.execute(
            "UPDATE drafts SET body = ?, updated_at = ? WHERE id = ?",
            (body, now_iso(), draft_id),
        )
        _event(
            connection,
            draft["case_id"],
            "draft_edited",
            actor,
            draft_id=draft_id,
            details="Draft body edited",
        )
        connection.commit()
        return dict(connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone())


def approve_and_send(
    draft_id: str, approved_by: str, *, path: str | None = None
) -> dict:
    with connect(path) as connection:
        _begin_write(connection)
        draft = connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        if draft is None:
            raise NotFoundError("Draft not found")
        if draft["status"] != "draft":
            raise ConflictError("Only a pending draft can be approved and sent")
        timestamp = now_iso()
        updated = connection.execute(
            """
            UPDATE drafts SET status = 'sent', approved_by = ?, updated_at = ?
            WHERE id = ? AND status = 'draft'
            """,
            (approved_by, timestamp, draft_id),
        )
        if updated.rowcount != 1:
            raise ConflictError("Draft must be pending before approval and send")
        _event(connection, draft["case_id"], "approved", approved_by, draft_id=draft_id)
        _event(
            connection,
            draft["case_id"],
            "sent",
            approved_by,
            draft_id=draft_id,
            details="Prototype send recorded; no external mail gateway configured",
        )
        connection.commit()
        return dict(connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone())


def approve_draft(
    draft_id: str, approved_by: str, *, path: str | None = None
) -> dict:
    with connect(path) as connection:
        _begin_write(connection)
        draft = connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        if draft is None:
            raise NotFoundError("Draft not found")
        if draft["status"] != "draft":
            raise ConflictError("Only a pending draft can be approved")
        updated = connection.execute(
            "UPDATE drafts SET status = 'approved', approved_by = ?, updated_at = ? WHERE id = ? AND status = 'draft'",
            (approved_by, now_iso(), draft_id),
        )
        if updated.rowcount != 1:
            raise ConflictError("Draft must be pending before approval")
        _event(connection, draft["case_id"], "approved", approved_by, draft_id=draft_id)
        connection.commit()
        return dict(connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone())


def send_draft(draft_id: str, actor: str, *, path: str | None = None) -> dict:
    with connect(path) as connection:
        _begin_write(connection)
        draft = connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        if draft is None:
            raise NotFoundError("Draft not found")
        if draft["status"] not in {"approved", "scheduled"} or not draft["approved_by"]:
            raise ConflictError("Draft must be explicitly approved before sending")
        updated = connection.execute(
            "UPDATE drafts SET status = 'sent', updated_at = ? WHERE id = ? AND status IN ('approved', 'scheduled') AND approved_by IS NOT NULL",
            (now_iso(), draft_id),
        )
        if updated.rowcount != 1:
            raise ConflictError("Draft must be explicitly approved before sending")
        _event(
            connection,
            draft["case_id"],
            "sent",
            actor,
            draft_id=draft_id,
            details="Prototype send recorded; no external mail gateway configured",
        )
        connection.commit()
        return dict(connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone())


def schedule_draft(
    draft_id: str,
    approved_by: str,
    scheduled_for: datetime,
    *,
    path: str | None = None,
) -> dict:
    if scheduled_for.tzinfo is None:
        raise ValueError("Scheduled time must include a timezone")
    if scheduled_for <= datetime.now(timezone.utc):
        raise ValueError("Scheduled time must be in the future")
    with connect(path) as connection:
        _begin_write(connection)
        draft = connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        if draft is None:
            raise NotFoundError("Draft not found")
        if draft["status"] != "draft":
            raise ConflictError("Only a pending draft can be scheduled")
        timestamp = now_iso()
        scheduled_value = scheduled_for.astimezone(timezone.utc).isoformat(timespec="seconds")
        updated = connection.execute(
            """
            UPDATE drafts SET status = 'scheduled', approved_by = ?, scheduled_for = ?,
                              updated_at = ?
            WHERE id = ? AND status = 'draft'
            """,
            (approved_by, scheduled_value, timestamp, draft_id),
        )
        if updated.rowcount != 1:
            raise ConflictError("Draft must be pending before scheduling")
        _event(
            connection,
            draft["case_id"],
            "approved",
            approved_by,
            draft_id=draft_id,
            details="Approved and scheduled",
        )
        _event(
            connection,
            draft["case_id"],
            "scheduled",
            approved_by,
            draft_id=draft_id,
            details=scheduled_value,
        )
        connection.commit()
        return dict(connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone())


def raise_handoff(
    case_id: str,
    actor: str,
    guidance: str,
    document_ids: list[str],
    *,
    path: str | None = None,
) -> dict:
    with connect(path) as connection:
        _begin_write(connection)
        case = connection.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        if case is None:
            raise NotFoundError("Case not found")
        if not document_ids:
            raise ValueError("At least one linked document is required")
        placeholders = ",".join("?" for _ in document_ids)
        linked_docs = connection.execute(
            f"SELECT id FROM documents WHERE case_id = ? AND id IN ({placeholders})",
            [case_id, *document_ids],
        ).fetchall()
        if len(linked_docs) != len(set(document_ids)):
            raise ValueError("Every linked document must belong to this case")
        handoff_id = str(uuid4())
        created_at = now_iso()
        connection.execute(
            """
            INSERT INTO handoffs (id, case_id, document_ids, guidance, rm_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                handoff_id,
                case_id,
                json.dumps(document_ids),
                guidance,
                case["rm_name"],
                created_at,
            ),
        )
        _event(
            connection,
            case_id,
            "handoff_raised",
            actor,
            handoff_id=handoff_id,
            details=f"Linked documents: {', '.join(document_ids)}",
        )
        connection.commit()
        return {
            "id": handoff_id,
            "case_id": case_id,
            "document_ids": document_ids,
            "guidance": guidance,
            "rm_name": case["rm_name"],
            "created_at": created_at,
        }


def analytics(*, path: str | None = None) -> dict:
    # Analytics consume stage constants and workflow events only; no credit
    # source or credit-related table exists in the prototype schema.
    rounds = {1: 0, 2: 0, 3: 0}
    with connect(path) as connection:
        documents = connection.execute(
            """
            SELECT chase_round, COUNT(*) AS count
            FROM (
                SELECT case_id, MAX(chase_round) AS chase_round
                FROM documents
                WHERE state = 'requested'
                GROUP BY case_id
            )
            GROUP BY chase_round
            """
        ).fetchall()
        for row in documents:
            rounds[row["chase_round"]] = row["count"]
        resolution_samples = {1: [], 2: [], 3: []}
        resolutions = connection.execute(
            """
            SELECT d.chase_round,
                   MAX(0, CAST(julianday(received.created_at) - julianday(d.requested_at) AS INTEGER))
                       AS elapsed_days
            FROM documents AS d
            JOIN events AS received
              ON received.document_id = d.id AND received.event_type = 'received'
            """
        ).fetchall()
        for row in resolutions:
            resolution_samples[row["chase_round"]].append(row["elapsed_days"])
        event_count = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    return {
        "stages": [{"name": name, "days": days} for name, days in STAGE_DURATIONS],
        "chase_rounds": [
            {
                "round": round_number,
                "cases": count,
                "median_days_to_resolution": median(resolution_samples[round_number])
                if resolution_samples[round_number]
                else None,
            }
            for round_number, count in sorted(rounds.items())
        ],
        "workflow_event_count": event_count,
    }


def send_due_drafts(*, path: str | None = None, now: datetime | None = None) -> int:
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        raise ValueError("Current time must include a timezone")
    cutoff = current_time.astimezone(timezone.utc).isoformat(timespec="seconds")
    sent_count = 0
    with connect(path) as connection:
        _begin_write(connection)
        due_drafts = connection.execute(
            """
            SELECT * FROM drafts
            WHERE status = 'scheduled' AND scheduled_for <= ?
            ORDER BY scheduled_for
            """,
            (cutoff,),
        ).fetchall()
        for draft in due_drafts:
            updated = connection.execute(
                """
                UPDATE drafts SET status = 'sent', updated_at = ?
                WHERE id = ? AND status = 'scheduled'
                """,
                (cutoff, draft["id"]),
            )
            if updated.rowcount:
                _event(
                    connection,
                    draft["case_id"],
                    "sent",
                    draft["approved_by"],
                    draft_id=draft["id"],
                    details="Scheduled prototype send recorded; no external mail gateway configured",
                )
                sent_count += 1
        connection.commit()
    return sent_count


def add_seed_event(
    connection: sqlite3.Connection,
    case_id: str,
    document_id: str,
    event_type: str,
    actor: str,
    event_key: str,
    details: str = "",
) -> None:
    _event(
        connection,
        case_id,
        event_type,
        actor,
        document_id=document_id,
        event_key=event_key,
        details=details,
    )
