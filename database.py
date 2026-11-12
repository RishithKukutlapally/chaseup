import sqlite3
from pathlib import Path

from config import DATABASE_PATH


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    client_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    rm_name TEXT NOT NULL,
    stage TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    stage_started_at TEXT NOT NULL,
    next_follow_up TEXT,
    blocked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    category TEXT NOT NULL,
    owner TEXT NOT NULL CHECK (owner IN ('client', 'internal')),
    requested_at TEXT NOT NULL,
    due_at TEXT NOT NULL,
    chase_round INTEGER NOT NULL DEFAULT 1 CHECK (chase_round BETWEEN 1 AND 3),
    state TEXT NOT NULL DEFAULT 'requested'
        CHECK (state IN ('requested', 'received', 'waived')),
    waiver_reason TEXT
);

CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved', 'scheduled', 'sent')),
    approved_by TEXT,
    scheduled_for TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handoffs (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    document_ids TEXT NOT NULL,
    guidance TEXT NOT NULL,
    rm_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_key TEXT UNIQUE,
    case_id TEXT NOT NULL REFERENCES cases(id),
    document_id TEXT REFERENCES documents(id),
    draft_id TEXT REFERENCES drafts(id),
    handoff_id TEXT REFERENCES handoffs(id),
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_stage ON cases(stage);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_events_case_created ON events(case_id, created_at);

CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON events
BEGIN
    SELECT RAISE(ABORT, 'events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON events
BEGIN
    SELECT RAISE(ABORT, 'events are immutable');
END;
"""


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    db_path = Path(path) if path is not None else DATABASE_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(path: str | Path | None = None) -> None:
    with connect(path) as connection:
        connection.executescript(SCHEMA)
