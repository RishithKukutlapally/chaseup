"""Append-only, SHA-256 hash-chained audit log.

hash_n = sha256(prev_hash || canonical_json(event_n)). Appends are serialised by a process
lock and committed together with the state change they describe (same transaction).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentAction, AuditEvent, User

GENESIS = "0" * 64
_LOCK = asyncio.Lock()


def _canonical(ev: dict[str, Any]) -> str:
    return json.dumps(ev, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_hash(prev_hash: str, fields: dict[str, Any]) -> str:
    return hashlib.sha256((prev_hash + _canonical(fields)).encode()).hexdigest()


def _fields(ev: AuditEvent) -> dict[str, Any]:
    return {
        "ts": ev.ts,
        "actor_user_id": ev.actor_user_id,
        "actor": ev.actor,
        "actor_role": ev.actor_role,
        "action": ev.action,
        "entity_type": ev.entity_type,
        "entity_id": ev.entity_id,
        "case_id": ev.case_id,
        "reason": ev.reason,
        "details_json": ev.details_json,
        "via": ev.via,
    }


async def record(
    session: AsyncSession,
    *,
    actor: User | None,
    action: str,
    entity_type: str = "",
    entity_id: Any = "",
    case_id: int | None = None,
    reason: str = "",
    details: dict[str, Any] | None = None,
    via: str = "ui",
    timeline: str | None = None,
    commit: bool = True,
) -> AuditEvent:
    """Append an audit event (and optional case-timeline row) and COMMIT the session."""
    async with _LOCK:
        last = (await session.execute(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(1))).scalar_one_or_none()
        prev = last.hash if last else GENESIS
        ev = AuditEvent(
            ts=datetime.now(timezone.utc).isoformat(timespec="microseconds"),
            actor_user_id=actor.id if actor else None,
            actor=actor.display_name if actor else "ChaseUp System",
            actor_role=actor.role if actor else "system",
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            case_id=case_id,
            reason=reason or "",
            details_json=_canonical(details or {}),
            via=via,
            prev_hash=prev,
            hash="",
        )
        ev.hash = compute_hash(prev, _fields(ev))
        session.add(ev)
        if timeline and case_id:
            session.add(
                AgentAction(
                    case_id=case_id,
                    action_type=action,
                    actor=f"{ev.actor} ({ev.actor_role})",
                    details=timeline,
                )
            )
        if commit:
            await session.commit()
        else:
            await session.flush()
        return ev


async def verify_chain(session: AsyncSession) -> dict[str, Any]:
    rows = (await session.execute(select(AuditEvent).order_by(AuditEvent.id.asc()))).scalars().all()
    prev = GENESIS
    for ev in rows:
        if ev.prev_hash != prev:
            return {"valid": False, "events_checked": len(rows), "broken_at_id": ev.id, "reason": "prev_hash mismatch"}
        expected = compute_hash(prev, _fields(ev))
        if expected != ev.hash:
            return {"valid": False, "events_checked": len(rows), "broken_at_id": ev.id, "reason": "hash mismatch"}
        prev = ev.hash
    return {"valid": True, "events_checked": len(rows), "head_hash": prev, "broken_at_id": None, "reason": ""}


def serialize(ev: AuditEvent) -> dict[str, Any]:
    return {
        "id": ev.id,
        "ts": ev.ts,
        "actor": ev.actor,
        "actor_role": ev.actor_role,
        "action": ev.action,
        "entity_type": ev.entity_type,
        "entity_id": ev.entity_id,
        "case_id": ev.case_id,
        "reason": ev.reason,
        "details": json.loads(ev.details_json or "{}"),
        "via": ev.via,
        "prev_hash": ev.prev_hash,
        "hash": ev.hash,
    }
