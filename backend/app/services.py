"""Business operations shared by the REST API and the MCP server (same RBAC, same audit)."""

from __future__ import annotations

import json
import statistics
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import audit, config
from app.guardrails import Check, all_passed, validate_chase_email
from app.llm_gateway import month_start
from app.models import (
    AgentAction,
    AgentRun,
    AgentTask,
    AuditEvent,
    ChaseDraft,
    DocRequestHistory,
    KycCase,
    MissingDocument,
    OutboundMessage,
    User,
)
from app.rbac import ALL, NotFound, PermissionDenied, authorize, can, scope_for

SLA_DAYS = 3.0  # overdue threshold: ASSUMPTION, to be confirmed with Ops


def as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    d = as_utc(dt)
    return d.isoformat() if d else None


# --------------------------------------------------------------------------- cases
async def _case(session: AsyncSession, case_id: int) -> KycCase:
    c = (await session.execute(
        select(KycCase).options(selectinload(KycCase.documents), selectinload(KycCase.actions)).where(KycCase.id == case_id)
    )).scalar_one_or_none()
    if c is None:
        raise NotFound(f"Case {case_id} not found")
    return c


async def load_case(session: AsyncSession, user: User, case_id: int, permission: str = "case:read") -> KycCase:
    c = await _case(session, case_id)
    authorize(user, permission, c)
    return c


def serialize_doc(d: MissingDocument) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    waited = (now - utc(d.requested_at)).total_seconds() / 86400 if d.requested_at else 0.0
    return {
        "id": d.id, "case_id": d.case_id, "document_name": d.document_name, "status": d.status,
        "description": d.description, "requirement_meta": d.requirement_meta,
        "assigned_to_or_verifier": d.assigned_to_or_verifier, "doc_code": d.doc_code, "category": d.category,
        "owner": d.owner, "chase_round": d.chase_round, "requested_at": iso(d.requested_at),
        "received_at": iso(d.received_at), "waived_reason": d.waived_reason, "status_changed_by": d.status_changed_by,
        "days_waiting": round(waited, 1), "overdue": d.status == "Missing" and waited > SLA_DAYS,
    }


def serialize_case(c: KycCase, user: User, detail: bool = False, pending_draft: ChaseDraft | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    since = round(max(0.0, (now - utc(c.last_contact_date)).total_seconds() / 86400), 1)
    breached = since > SLA_DAYS and c.status != "Completed"
    docs = [serialize_doc(d) for d in c.documents]
    try:
        checks = json.loads(c.critic_checks_json or "[]")
    except Exception:
        checks = []
    out: dict[str, Any] = {
        "id": c.id, "case_code": c.case_code, "client_name": c.client_name, "status": c.status,
        "days_open": c.days_open, "last_contact_date": iso(c.last_contact_date), "days_since_contact": since,
        "sla_breached": breached, "sla_delay_days": round(since - SLA_DAYS, 1) if breached else 0.0,
        "chase_round_count": c.chase_round_count, "lei": c.lei, "entity_type": c.entity_type,
        "jurisdiction": c.jurisdiction, "desk": c.desk, "region": c.region, "address": c.address,
        "contact_name": c.contact_name, "contact_role": c.contact_role, "contact_email": c.contact_email,
        "assigned_rm": c.assigned_rm, "assigned_rm_user_id": c.assigned_rm_user_id, "facility_value": c.facility_value,
        "relationship_notes": c.relationship_notes, "target_deadline_label": c.target_deadline_label, "stage": c.stage,
        "current_draft_subject": c.current_draft_subject, "current_draft_body": c.current_draft_body,
        "critic_passed": c.critic_passed, "critic_score": c.critic_score, "critic_feedback": c.critic_feedback,
        "critic_checks": checks, "workflow_iterations": c.workflow_iterations, "audit_hash": c.audit_hash,
        "documents": docs, "missing_count": sum(1 for d in docs if d["status"] == "Missing"),
        "verified_count": sum(1 for d in docs if d["status"] == "Received"),
        "received_count": sum(1 for d in docs if d["status"] == "Received"),
        "waived_count": sum(1 for d in docs if d["status"] == "Waived"),
        "oldest_missing_days": max([d["days_waiting"] for d in docs if d["status"] == "Missing"], default=0.0),
        "pending_draft_id": pending_draft.id if pending_draft else None,
        "can_approve": can(user, "draft:approve_send", c),
        "can_create_draft": can(user, "draft:create", c),
        "can_update_documents": can(user, "document:update_status", c),
    }
    if detail:
        out["actions"] = [
            {"id": a.id, "case_id": a.case_id, "case_code": c.case_code, "client_name": c.client_name,
             "action_type": a.action_type, "timestamp": iso(a.timestamp), "actor": a.actor, "details": a.details}
            for a in c.actions
        ]
    return out


async def _pending_drafts(session: AsyncSession, case_ids: list[int]) -> dict[int, ChaseDraft]:
    if not case_ids:
        return {}
    rows = (await session.execute(select(ChaseDraft).where(
        ChaseDraft.case_id.in_(case_ids), ChaseDraft.status == "pending_approval"))).scalars().all()
    return {d.case_id: d for d in rows}


async def list_cases(session: AsyncSession, user: User, search: str = "", filter_tab: str = "all") -> dict[str, Any]:
    grant = authorize(user, "case:read")
    q = select(KycCase).options(selectinload(KycCase.documents))
    if grant.scope != ALL:
        q = q.where(KycCase.assigned_rm_user_id == user.id)
    cases = (await session.execute(q)).scalars().all()
    pend = await _pending_drafts(session, [c.id for c in cases])
    items = [serialize_case(c, user, pending_draft=pend.get(c.id)) for c in cases]
    items.sort(key=lambda c: -c["oldest_missing_days"])  # queue sorts by the oldest waiting item
    breached = sum(1 for c in items if c["sla_breached"])
    filtered = items
    if filter_tab == "breached":
        filtered = [c for c in items if c["sla_breached"]]
    elif filter_tab == "draft_ready":
        filtered = [c for c in items if c["status"] == "Draft_Ready"]
    elif filter_tab == "awaiting":
        filtered = [c for c in items if c["status"] == "Missing_Docs"]
    elif filter_tab == "completed":
        filtered = [c for c in items if c["status"] == "Completed"]
    if search.strip():
        s = search.strip().lower()
        filtered = [c for c in filtered if s in c["client_name"].lower() or s in c["case_code"].lower()
                    or s in c["lei"].lower() or s in c["contact_name"].lower()]
    active = [c for c in items if c["status"] != "Completed"]
    return {
        "cases": filtered, "scope": grant.scope, "total_active_cases": len(items), "sla_breached_count": breached,
        "pending_rm_action_count": sum(1 for c in items if c["pending_draft_id"]),
        "completed_count": sum(1 for c in items if c["status"] == "Completed"),
        "avg_chase_latency_days": round(sum(c["days_since_contact"] for c in active) / len(active), 1) if active else 0.0,
        "sla_buffer_health_pct": round(100.0 * (1 - breached / max(1, len(items))), 1),
    }


async def get_case(session: AsyncSession, user: User, case_id: int) -> dict[str, Any]:
    c = await load_case(session, user, case_id)
    pend = await _pending_drafts(session, [c.id])
    return serialize_case(c, user, detail=True, pending_draft=pend.get(c.id))


async def list_missing_documents(session: AsyncSession, user: User, case_id: int) -> list[dict[str, Any]]:
    c = await load_case(session, user, case_id)
    return [serialize_doc(d) for d in c.documents if d.status == "Missing"]


async def update_document_status(session: AsyncSession, user: User, case_id: int, doc_id: int, status: str,
                                 reason: str, via: str = "ui") -> dict[str, Any]:
    c = await load_case(session, user, case_id, "document:update_status")
    d = next((x for x in c.documents if x.id == doc_id), None)
    if d is None:
        raise NotFound(f"Document {doc_id} not on case {case_id}")
    new_status = {"received": "Received", "waived": "Waived", "missing": "Missing"}.get(status.lower())
    if new_status is None:
        raise ValueError("status must be received | waived | missing")
    status = new_status
    if status == "Waived" and len(reason.strip()) < 5:
        raise ValueError("A waiver needs a reason (min 5 characters)")
    old = d.status
    d.status = status
    d.status_changed_by = user.display_name
    if status == "Received":
        d.received_at = datetime.now(timezone.utc)
        d.assigned_to_or_verifier = f"Receipt logged by {user.display_name} (genuineness not assessed by system)"
    elif status == "Waived":
        d.waived_reason = reason.strip()
        d.assigned_to_or_verifier = f"Waived by {user.display_name}: {reason.strip()}"
    else:
        d.received_at, d.waived_reason = None, None
        d.requested_at = datetime.now(timezone.utc)
        d.chase_round += 1
        d.assigned_to_or_verifier = f"Re-requested from {c.contact_name}"
    await audit.record(session, actor=user, action=f"document_{status.lower()}", entity_type="document", entity_id=d.id,
                       case_id=c.id, reason=reason, via=via, details={"from": old, "to": status, "document": d.document_name},
                       timeline=f"{d.document_name}: {old} -> {status}" + (f" ({reason})" if reason else ""))
    return await get_case(session, user, case_id)


async def update_note(session: AsyncSession, user: User, case_id: int, note: str) -> dict[str, Any]:
    c = await load_case(session, user, case_id, "case:note_edit")
    c.relationship_notes = note.strip()
    await audit.record(session, actor=user, action="note_updated", entity_type="case", entity_id=c.id, case_id=c.id)
    return await get_case(session, user, case_id)


async def analyst_request(session: AsyncSession, user: User, case_id: int, document: str, note: str) -> dict[str, Any]:
    c = await load_case(session, user, case_id, "analyst:request_from_rm")
    await audit.record(session, actor=user, action="analyst_request_to_rm", entity_type="case", entity_id=c.id,
                       case_id=c.id, reason=note, details={"document": document, "rm": c.assigned_rm},
                       timeline=f"Analyst {user.display_name} asked {c.assigned_rm} to obtain: {document}. {note}")
    return await get_case(session, user, case_id)


async def demo_reset(session: AsyncSession, user: User, case_id: int) -> dict[str, Any]:
    c = await load_case(session, user, case_id, "case:demo_reset")
    for d in (await session.execute(select(ChaseDraft).where(ChaseDraft.case_id == c.id,
                                                             ChaseDraft.status == "pending_approval"))).scalars():
        d.status = "discarded"
        d.decision_reason = "demo reset"
    c.status, c.current_draft_body, c.current_draft_subject, c.critic_checks_json = "Missing_Docs", None, None, None
    c.critic_passed, c.workflow_iterations = False, 0
    await audit.record(session, actor=user, action="case_demo_reset", entity_type="case", entity_id=c.id, case_id=c.id,
                       timeline="Demo reset by Ops")
    return await get_case(session, user, case_id)


# --------------------------------------------------------------------------- drafts
def serialize_draft(d: ChaseDraft) -> dict[str, Any]:
    return {
        "id": d.id, "case_id": d.case_id, "task_id": d.task_id, "subject": d.subject, "body": d.body,
        "engine": d.engine, "status": d.status, "validation": json.loads(d.validation_json or "[]"),
        "created_at": iso(d.created_at), "decided_at": iso(d.decided_at), "decision_reason": d.decision_reason,
        "edited_by_rm": d.edited_by_rm,
    }


async def list_drafts(session: AsyncSession, user: User, case_id: int) -> list[dict[str, Any]]:
    c = await load_case(session, user, case_id, "draft:read")
    rows = (await session.execute(select(ChaseDraft).where(ChaseDraft.case_id == c.id)
                                  .order_by(ChaseDraft.id.desc()))).scalars().all()
    return [serialize_draft(d) for d in rows]


async def _draft_and_case(session: AsyncSession, draft_id: int) -> tuple[ChaseDraft, KycCase]:
    d = await session.get(ChaseDraft, draft_id)
    if d is None:
        raise NotFound(f"Draft {draft_id} not found")
    return d, await _case(session, d.case_id)


async def approve_and_send(session: AsyncSession, user: User, draft_id: int, subject: str, body: str,
                           via: str = "ui") -> dict[str, Any]:
    """THE red line. Only the named RM of the case may approve; sending happens only here."""
    d, c = await _draft_and_case(session, draft_id)
    try:
        authorize(user, "draft:approve_send", c)
    except PermissionDenied:
        await audit.record(session, actor=user, action="approval_denied", entity_type="draft", entity_id=d.id,
                           case_id=c.id, via=via, reason="not the named RM",
                           details={"named_rm": c.assigned_rm, "attempted_by_role": user.role})
        raise
    if d.status != "pending_approval":
        raise ValueError(f"Draft {d.id} is '{d.status}', not pending approval")
    from app.agent_graph import case_context

    ctx, missing, _ = case_context(c)
    checks = validate_chase_email(body, ctx, missing)
    if not all_passed(checks):
        failed = [f"{x.title}: {x.detail}" for x in checks if not x.passed]
        raise ValueError("Edited draft fails validation — " + " | ".join(failed))
    now = datetime.now(timezone.utc)
    d.edited_by_rm = (subject != d.subject) or (body != d.body)
    d.subject, d.body, d.status = subject, body, "approved_sent"
    d.decided_by_user_id, d.decided_at = user.id, now
    msg = OutboundMessage(case_id=c.id, draft_id=d.id, to_address=c.contact_email, subject=subject, body=body,
                          approved_by_user_id=user.id)
    session.add(msg)
    c.current_draft_subject, c.current_draft_body = subject, body
    c.status, c.last_contact_date = "Completed", now
    c.chase_round_count += 1
    if d.task_id:
        t = await session.get(AgentTask, d.task_id)
        if t:
            t.outcome = "approved"
    await session.flush()
    ev = await audit.record(session, actor=user, action="draft_approved_and_sent", entity_type="draft", entity_id=d.id,
                            case_id=c.id, via=via, details={"outbound_id": msg.id, "to": c.contact_email,
                                                            "edited_by_rm": d.edited_by_rm, "gateway": msg.gateway},
                            timeline=f"{user.display_name} approved draft #{d.id} and sent chase round "
                                     f"#{c.chase_round_count} (simulated gateway)")
    c.audit_hash = ev.hash
    await session.commit()
    return {"case": await get_case(session, user, c.id), "tracking_id": f"OUT-{msg.id:06d}", "audit_hash": ev.hash,
            "message": f"Sent to {c.contact_email} via the simulated mail gateway after approval by {user.display_name}.",
            "draft": serialize_draft(d)}


async def discard_draft(session: AsyncSession, user: User, draft_id: int, reason: str, via: str = "ui") -> dict[str, Any]:
    d, c = await _draft_and_case(session, draft_id)
    authorize(user, "draft:discard", c)
    if d.status != "pending_approval":
        raise ValueError(f"Draft {d.id} is '{d.status}'")
    d.status, d.decided_by_user_id, d.decided_at, d.decision_reason = "discarded", user.id, datetime.now(timezone.utc), reason
    if d.task_id:
        t = await session.get(AgentTask, d.task_id)
        if t:
            t.outcome = "discarded"
    if c.status == "Draft_Ready":
        c.status = "Missing_Docs"
    await audit.record(session, actor=user, action="draft_discarded", entity_type="draft", entity_id=d.id, case_id=c.id,
                       reason=reason, via=via, timeline=f"Draft #{d.id} discarded: {reason}")
    return serialize_draft(d)


async def recheck_draft(session: AsyncSession, user: User, case_id: int, body: str) -> list[dict[str, Any]]:
    c = await load_case(session, user, case_id, "draft:read")
    from app.agent_graph import case_context

    ctx, missing, _ = case_context(c)
    return [x.as_dict() for x in validate_chase_email(body, ctx, missing)]


async def create_draft(user: User, case_id: int, *, tone: str | None = None, simulate_critic_rejection: bool = False,
                       emit=None, via: str = "ui") -> dict[str, Any]:
    from app.agent_graph import run_chase_workflow
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as s:
        c = await load_case(s, user, case_id, "draft:create")
        if not any(d.status == "Missing" for d in c.documents):
            raise ValueError("Nothing is missing on this case — no chase needed")
    return await run_chase_workflow(case_id, user, tone=tone, simulate_critic_rejection=simulate_critic_rejection,
                                    emit=emit, via=via)


# --------------------------------------------------------------------------- traces
async def get_trace(session: AsyncSession, user: User, task_id: int) -> dict[str, Any]:
    t = await session.get(AgentTask, task_id)
    if t is None:
        raise NotFound(f"Task {task_id} not found")
    if t.case_id:
        await load_case(session, user, t.case_id, "trace:read")
    else:
        authorize(user, "trace:read")
    runs = (await session.execute(select(AgentRun).where(AgentRun.task_id == t.id).order_by(AgentRun.id))).scalars().all()
    return {"task": serialize_task(t, runs), "steps": json.loads(t.trace_json or "[]"),
            "runs": [serialize_run(r) for r in runs]}


async def list_tasks(session: AsyncSession, user: User, case_id: int | None = None, limit: int = 50) -> list[dict[str, Any]]:
    grant = authorize(user, "trace:read")
    q = select(AgentTask).order_by(AgentTask.id.desc()).limit(limit)
    if case_id:
        await load_case(session, user, case_id, "trace:read")
        q = q.where(AgentTask.case_id == case_id)
    elif grant.scope != ALL:
        own = select(KycCase.id).where(KycCase.assigned_rm_user_id == user.id)
        q = q.where(AgentTask.case_id.in_(own))
    tasks = (await session.execute(q)).scalars().all()
    out = []
    for t in tasks:
        runs = (await session.execute(select(AgentRun).where(AgentRun.task_id == t.id))).scalars().all()
        out.append(serialize_task(t, runs))
    return out


def serialize_run(r: AgentRun) -> dict[str, Any]:
    return {
        "id": r.id, "task_id": r.task_id, "trace_id": r.trace_id, "agent": r.agent, "purpose": r.purpose,
        "provider": r.provider, "model": r.model, "config_version": r.config_version, "input_tokens": r.input_tokens,
        "output_tokens": r.output_tokens, "latency_ms": r.latency_ms, "cost_usd": r.cost_usd, "cost_inr": r.cost_inr,
        "status": r.status, "simulated": r.simulated, "is_fallback": r.is_fallback, "error": r.error,
        "user_id": r.user_id, "via": r.via, "created_at": iso(r.created_at),
    }


def serialize_task(t: AgentTask, runs: Sequence[AgentRun]) -> dict[str, Any]:
    return {
        "id": t.id, "kind": t.kind, "trace_id": t.trace_id, "case_id": t.case_id, "user_id": t.user_id, "via": t.via,
        "status": t.status, "outcome": t.outcome, "data_source": t.data_source, "engine": t.engine,
        "created_at": iso(t.created_at), "llm_calls": len(runs),
        "cost_usd": round(sum(r.cost_usd for r in runs), 6),
        "cost_inr": round(sum(r.cost_inr for r in runs), 4),
        "simulated": bool(runs) and all(r.simulated for r in runs if r.status not in ("error", "disabled")),
        "agents": sorted({r.agent for r in runs}),
    }


# --------------------------------------------------------------------------- costs
async def cost_summary(session: AsyncSession, user: User) -> dict[str, Any]:
    authorize(user, "cost:read")
    runs = (await session.execute(select(AgentRun))).scalars().all()
    ms = month_start()

    def agg(rows: Sequence[AgentRun]) -> dict[str, Any]:
        usd = sum(r.cost_usd for r in rows)
        return {"calls": len(rows), "usd": round(usd, 6), "inr": round(usd * config.USD_TO_INR, 4),
                "input_tokens": sum(r.input_tokens for r in rows), "output_tokens": sum(r.output_tokens for r in rows)}

    def group(rows: Sequence[AgentRun], key) -> dict[str, Any]:
        out: dict[str, list[AgentRun]] = {}
        for r in rows:
            out.setdefault(key(r), []).append(r)
        return {k: agg(v) for k, v in sorted(out.items())}

    month = [r for r in runs if utc(r.created_at) >= ms]
    tasks = (await session.execute(select(AgentTask).order_by(AgentTask.id.desc()))).scalars().all()
    by_task: dict[int, list[AgentRun]] = {}
    for r in runs:
        if r.task_id:
            by_task.setdefault(r.task_id, []).append(r)
    ledger = [serialize_task(t, by_task.get(t.id, [])) for t in tasks[:200]]
    chase = [serialize_task(t, by_task.get(t.id, [])) for t in tasks if t.kind == "chase"]

    def outcome_cost(outcome: str) -> dict[str, Any]:
        sel = [t for t in chase if t["outcome"] == outcome]
        total = sum(t["cost_usd"] for t in sel)
        return {"drafts": len(sel), "total_usd": round(total, 6),
                "per_draft_usd": round(total / len(sel), 6) if sel else 0.0,
                "per_draft_inr": round(total / len(sel) * config.USD_TO_INR, 4) if sel else 0.0}

    all_chase_total = sum(t["cost_usd"] for t in chase)
    approved = outcome_cost("approved")
    from app.agent_config import AGENTS
    from app.llm_gateway import breakers_snapshot, month_spend
    from app.models import AgentControl

    budgets = {}
    for a in AGENTS:
        ctl = await session.get(AgentControl, a)
        spent = await month_spend(session, a)
        budgets[a] = {"cap_usd": ctl.monthly_budget_usd if ctl else None, "spent_usd": round(spent, 6),
                      "enabled": ctl.enabled if ctl else True,
                      "simulate_primary_outage": ctl.simulate_primary_outage if ctl else False}
    return {
        "currency_note": f"INR at placeholder FX {config.USD_TO_INR} — Finance to confirm",
        "fx_usd_inr": config.USD_TO_INR,
        "all_time": agg(runs), "this_month": agg(month),
        "by_agent": group(runs, lambda r: r.agent), "by_model": group(runs, lambda r: r.model),
        "by_status": group(runs, lambda r: r.status),
        "real_vs_simulated": {"real": agg([r for r in runs if not r.simulated]),
                              "simulated": agg([r for r in runs if r.simulated])},
        "per_task_avg": {k: _avg_task(chase if k == "chase" else
                                      [serialize_task(t, by_task.get(t.id, [])) for t in tasks if t.kind == k])
                         for k in ("chase", "test_run")},
        "outcomes": {
            "approved": approved, "discarded": outcome_cost("discarded"), "pending": outcome_cost("pending"),
            "fully_loaded_cost_per_approved_draft_usd":
                round(all_chase_total / approved["drafts"], 6) if approved["drafts"] else 0.0,
        },
        "budgets": budgets,
        "circuit_breakers": breakers_snapshot(),
        "price_table": {m: {"provider": p.provider, "input_per_m_usd": p.input_per_m_usd,
                            "output_per_m_usd": p.output_per_m_usd, "source": p.source, "verified": p.verified}
                        for m, p in config.MODEL_PRICES.items()},
        "price_note": "List prices, placeholders until Finance confirms the contracted rate.",
        "ledger": ledger,
        "live_mode": bool(config.google_api_key()),
    }


def _avg_task(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"tasks": 0, "avg_usd": 0.0, "avg_calls": 0.0}
    return {"tasks": len(rows), "avg_usd": round(sum(r["cost_usd"] for r in rows) / len(rows), 6),
            "avg_calls": round(sum(r["llm_calls"] for r in rows) / len(rows), 2)}


# --------------------------------------------------------------------------- audit
async def audit_log(session: AsyncSession, user: User, limit: int = 200, case_id: int | None = None,
                    via: str = "ui") -> list[dict[str, Any]]:
    authorize(user, "audit:read")
    q = select(AuditEvent).order_by(AuditEvent.id.desc()).limit(min(max(limit, 1), 1000))
    if case_id:
        q = q.where(AuditEvent.case_id == case_id)
    return [audit.serialize(e) for e in (await session.execute(q)).scalars().all()]


# --------------------------------------------------------------------------- measure & analytics
def _days(a: datetime, b: datetime) -> float:
    return (utc(b) - utc(a)).total_seconds() / 86400


async def measure(session: AsyncSession, user: User) -> dict[str, Any]:
    authorize(user, "measure:read")
    rows = (await session.execute(select(DocRequestHistory))).scalars().all()
    live = (await session.execute(select(MissingDocument).where(MissingDocument.received_at.is_not(None)))).scalars().all()

    def stats(vals: list[float], rounds: list[int]) -> dict[str, Any]:
        if not vals:
            return {"n": 0}
        return {"n": len(vals), "median_days": round(statistics.median(vals), 1), "mean_days": round(statistics.mean(vals), 1),
                "p90_days": round(sorted(vals)[int(0.9 * (len(vals) - 1))], 1),
                "avg_rounds": round(statistics.mean(rounds), 2) if rounds else None,
                "pct_more_than_one_round": round(100 * sum(1 for r in rounds if r > 1) / len(rounds), 1) if rounds else None}

    base = [r for r in rows if r.period == "baseline"]
    pilot = [r for r in rows if r.period == "pilot"]
    live_vals = [_days(d.requested_at, d.received_at) for d in live if d.requested_at and d.received_at]
    by_type: dict[str, dict[str, list[float]]] = {}
    for r in rows:
        by_type.setdefault(r.doc_type, {"baseline": [], "pilot": []})[r.period].append(_days(r.requested_at, r.received_at))
    return {
        "metric": "Days from document requested to document received",
        "baseline": {**stats([_days(r.requested_at, r.received_at) for r in base], [r.chase_rounds for r in base]),
                     "label": "Before (seeded synthetic baseline, mirrors case facts: 3 rounds x ~5-6 days)"},
        "pilot": {**stats([_days(r.requested_at, r.received_at) for r in pilot], [r.chase_rounds for r in pilot]),
                  "label": "After (seeded synthetic pilot history)"},
        "live": {**stats(live_vals, [d.chase_round for d in live]), "label": "Live: receipts logged in this tracker"},
        "by_doc_type": {k: {p: (round(statistics.median(v), 1) if v else None) for p, v in d.items()}
                        for k, d in sorted(by_type.items())},
        "case_facts": {"median_onboarding_days": 62, "target_onboarding_days": 30, "chase_stage_days": 17,
                       "chase_rounds": 3, "days_per_round": "5-6", "pct_files_back_more_than_once": 41,
                       "ubo_extraction_days": 11},
        "caveat": "Baseline and pilot rows are synthetic and seeded for the demo; replace with the ingested "
                  "three-year chase-email history before drawing conclusions.",
    }


async def dashboard_metrics(session: AsyncSession, user: User) -> dict[str, Any]:
    """COO stage analytics. Aggregates only — no document content, no draft text, no client names."""
    authorize(user, "analytics:read")
    m = await measure(session, user)
    counts = dict((await session.execute(select(AgentAction.action_type, func.count(AgentAction.id))
                                          .group_by(AgentAction.action_type))).all())
    drafts = dict((await session.execute(select(ChaseDraft.status, func.count(ChaseDraft.id))
                                          .group_by(ChaseDraft.status))).all())
    cases = (await session.execute(select(KycCase))).scalars().all()
    base_med = m["baseline"].get("median_days", 17.0)
    pilot_med = m["pilot"].get("median_days", base_med)
    total_drafts = sum(drafts.values())
    approved = drafts.get("approved_sent", 0)
    stages = {"document_chase": base_med, "ubo_extraction": 11.0}
    return {
        "days_per_chase_round": round(pilot_med / max(1, m["pilot"].get("avg_rounds") or 1), 2),
        "baseline_days_per_round": round(base_med / max(1, m["baseline"].get("avg_rounds") or 3), 2),
        "target_days_per_round": 3.0,
        "velocity_delta_pct": round((pilot_med - base_med) / base_med * 100, 1) if base_med else 0.0,
        "case_days_saved_month": 0, "pilot_clients_count": len(cases), "rounds_per_client": 3,
        "days_saved_per_round": 0.0, "capital_enabled_gbp_m": 0.0,
        "rm_adoption_rate_pct": round(approved / total_drafts * 100, 1) if total_drafts else 0.0,
        "total_drafts_generated": total_drafts, "total_critic_rejections": counts.get("Critic_Rejected", 0),
        "total_rm_approved": approved, "critic_intercept_rate_pct": 0.0, "avg_rm_review_seconds": 0,
        "baseline_onboarding_days": 62.0, "pilot_onboarding_days": round(62.0 - (base_med - pilot_med), 1),
        "baseline_chasing_days": base_med, "pilot_chasing_days": pilot_med,
        "baseline_unresponsive_pct": m["baseline"].get("pct_more_than_one_round") or 41.0,
        "pilot_unresponsive_pct": m["pilot"].get("pct_more_than_one_round") or 0.0,
        "escalations_avoided": 0, "desks": [], "recent_actions": [],
        "extra": {"live_breached_cases": sum(1 for c in cases if c.status != "Completed"
                                             and _days(c.last_contact_date, datetime.now(timezone.utc)) > SLA_DAYS),
                  "total_db_cases": len(cases), "stage_median_days": stages,
                  "drafts_by_status": drafts,
                  "cases_by_stage_status": {s: sum(1 for c in cases if c.status == s)
                                            for s in ("Missing_Docs", "Draft_Ready", "Completed")}},
        "data_note": "Synthetic demo data. Aggregates only; no document content is exposed on this screen.",
    }


def checks_to_dicts(checks: list[Check]) -> list[dict[str, Any]]:
    return [c.as_dict() for c in checks]


__all__ = ["PermissionDenied", "NotFound", "scope_for"]
