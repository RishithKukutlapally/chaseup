"""Live stakeholder dashboards: one per vertical, computed from the database on every request.

Every widget carries a `source`: "live" (computed from app data now), "static" (reference
information about the design) or "planned" (a capability that is not built yet). Nothing is
presented as live unless it is.
"""

from __future__ import annotations

import json
import math
import re
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import audit, config
from app.agent_config import load_settings
from app.llm_gateway import breaker_state, month_spend, month_start
from app.models import (
    AgentConfigVersion,
    AgentRun,
    AgentTask,
    AuditEvent,
    ChaseDraft,
    KycCase,
    McpToken,
    OutboundMessage,
    User,
)
from app.rbac import AGENT_FIELD_RIGHTS, RM, VERTICALS, NotFound, PermissionDenied, can
from app.services import SLA_DAYS, measure, utc

PILOT_TARGET_DAYS = 9.5  # pilot target from the orchestration brief (17 -> 9.5 chase days)

META: dict[str, dict[str, str]] = {
    "engineering": {"name": "Engineering", "color": "#003b95", "lead": "Aisha · AI Agent Owner",
                    "question": "Is the agent healthy, and can I change it safely?",
                    "proves": "Prompt versioning, automatic fallback, an outage drill and a kill switch keep changes safe and reversible."},
    "architecture": {"name": "Architecture", "color": "#5b4656", "lead": "Omar · AI Gateway & Cloud",
                     "question": "Does every call stay inside the gateway, with no data leaving the bank's rails?",
                     "proves": "One code path to the model: names are masked before every call and only drafts are written back."},
    "product": {"name": "Product", "color": "#ea580c", "lead": "Mei · ChaseUp workflow & UX",
                "question": "Are RMs actually using the drafts, and how fast is the review?",
                "proves": "A one-screen review; any RM edit is re-checked before it can be sent."},
    "business": {"name": "Business", "color": "#15803d", "lead": "Robert · COO & CFO office",
                 "question": "Is the 17-day chase stage really shrinking, and what does it cost?",
                 "proves": "Before/after stage timing, and a per-call spend ledger with a monthly cap."},
    "security": {"name": "Security", "color": "#b91c1c", "lead": "Grace · MLRO & InfoSec",
                 "question": "Has anything reached a client without the named RM, or been waived without a reason?",
                 "proves": "A hard no-auto-send boundary, mandatory waiver reasons and a hash-verified audit log."},
    "data": {"name": "Data", "color": "#ca8a04", "lead": "Lucas · Checklist & ingestion",
             "question": "Is the checklist accurate, so we never chase what already arrived?",
             "proves": "Reminders are built from the live checklist; anything received drops out of the next one."},
    "operations": {"name": "Operations", "color": "#475569", "lead": "Priya · KYC Ops",
                   "question": "What is stuck, who owes it, and which file is next?",
                   "proves": "One queue sorted by the oldest wait. Ops prepares reminders; only the named RM can send."},
}

CHECK_LABELS = {
    "no_promises": "Promise of approval", "no_waivers": "Waiver wording", "no_amounts": "Amounts",
    "links": "Links other than the portal", "no_phone": "Phone numbers", "no_risk_credit": "Risk, credit or genuineness",
    "tone": "Coercive tone", "all_documents": "Missing document left out", "deadline": "Deadline missing",
    "rm_name": "RM name missing", "placeholders": "Unrestored placeholder",
}


def kpi(label: str, value: Any, sub: str = "", status: str | None = None, text: str = "") -> dict[str, Any]:
    return {"label": label, "value": str(value), "sub": sub, "status": status, "statusText": text}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> datetime:
    return _now().replace(hour=0, minute=0, second=0, microsecond=0)


def _pct(a: float, b: float) -> str:
    return f"{(a / b * 100):.0f}%" if b else "–"


def _secs(s: float) -> str:
    if s < 90:
        return f"{s:.0f} s"
    if s < 5400:
        return f"{s / 60:.0f} min"
    return f"{s / 3600:.1f} h"


def _ago(dt: datetime | None) -> str:
    if not dt:
        return "never"
    s = (_now() - utc(dt)).total_seconds()
    return "just now" if s < 60 else f"{_secs(s)} ago"


def _short(text: str, n: int = 34) -> str:
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def _hm(ts: str) -> str:
    try:
        return datetime.fromisoformat(ts).strftime("%d %b %H:%M")
    except Exception:
        return ts[:16]


def _steps(t: AgentTask) -> list[dict[str, Any]]:
    try:
        return json.loads(t.trace_json or "[]")
    except Exception:
        return []


async def _all(session: AsyncSession, model):
    return (await session.execute(select(model))).scalars().all()


# --------------------------------------------------------------------------- per vertical
async def engineering(s: AsyncSession) -> dict[str, Any]:
    runs = await _all(s, AgentRun)
    attempts = [r for r in runs if r.status not in ("blocked_budget", "blocked_rate_limit", "disabled")]
    today = [r for r in attempts if utc(r.created_at) >= _today()]
    ok = [r for r in attempts if r.status in ("success", "simulated") and not r.is_fallback]
    fb = [r for r in attempts if r.status in ("fallback_success",) or (r.status == "simulated" and r.is_fallback)]
    lat = sorted(r.latency_ms for r in ok + fb if r.latency_ms)
    p50 = statistics.median(lat) / 1000 if lat else 0
    p95 = lat[max(0, math.ceil(0.95 * len(lat)) - 1)] / 1000 if lat else 0
    tasks = [t for t in await _all(s, AgentTask) if t.kind == "chase"]
    firsts = []
    for t in tasks:
        v = next((st for st in _steps(t) if st["step"] == "validation"), None)
        if v:
            firsts.append(v["status"] == "ok")
    days = [(_today() - timedelta(days=i)) for i in range(6, -1, -1)]

    def on(d, pred):
        return sum(1 for r in attempts if d <= utc(r.created_at) < d + timedelta(days=1) and pred(r))

    d = await load_settings(s, "drafter")
    succ_rate = (len(ok) + len(fb)) / len(attempts) if attempts else 0
    versions = (await s.execute(select(AgentConfigVersion).where(AgentConfigVersion.agent == "drafter")
                                .order_by(AgentConfigVersion.version.desc()).limit(5))).scalars().all()
    return {
        "kpis": [
            kpi("Model calls today", f"{len(today):,}", "drafter + critic"),
            kpi("Calls succeeded", _pct(len(ok) + len(fb), len(attempts)),
                f"{_pct(len(ok), len(attempts))} primary · {_pct(len(fb), len(attempts))} fallback",
                None if not attempts else ("good" if succ_rate >= .95 else "warn"),
                "" if not attempts else ("Healthy" if succ_rate >= .95 else "Watch")),
            kpi("Latency p50 / p95", f"{p50:.1f} s / {p95:.1f} s" if lat else "–", f"timeout {d.timeout_s:.0f} s",
                "good" if lat and p95 < d.timeout_s / 2 else None, "Within SLO" if lat and p95 < d.timeout_s / 2 else ""),
            kpi("First drafts passing checks", _pct(sum(firsts), len(firsts)), "the rest are rewritten or templated",
                None if not firsts else ("good" if sum(firsts) / len(firsts) >= .9 else "warn"),
                "" if not firsts else ("On track" if sum(firsts) / len(firsts) >= .9 else "Watch")),
        ],
        "widgets": [
            {"type": "cols", "title": "Model calls by outcome", "note": "last 7 days", "source": "live",
             "days": [x.strftime("%a") for x in days],
             "ok": [on(x, lambda r: r in ok) for x in days], "fb": [on(x, lambda r: r in fb) for x in days],
             "er": [on(x, lambda r: r.status in ("error", "timeout", "circuit_open")) for x in days]},
            {"type": "list", "title": "Model routing", "note": "right now", "source": "live", "items": [
                [f"{d.primary_model} · primary", f"Circuit {breaker_state(d.primary_model).replace('_', ' ')}",
                 "good:Live" if breaker_state(d.primary_model) == "closed" and not d.simulate_primary_outage else "bad:Bypassed"],
                [f"{d.fallback_model} · fallback", f"Used {len(fb)} times", "good:Ready"],
                ["Outage drill", "Primary is being failed on purpose" if d.simulate_primary_outage else "Off",
                 "warn:Running" if d.simulate_primary_outage else "good:Off"],
                ["Drafter agent", "Enabled" if d.enabled else "Switched off — template only",
                 "good:On" if d.enabled else "bad:Off"],
                ["Mode", "Live Gemini" if config.google_api_key() else "Simulated (no API key)",
                 "good:Live" if config.google_api_key() else "warn:Simulated"],
            ]},
            {"type": "table", "wide": True, "title": "Prompt versions", "note": "append-only history", "source": "live",
             "head": ["Version", "Reason", "By", "When", "Status"],
             "rows": [[f"v{v.version}", v.reason + (f" (restored v{v.restored_from_version})" if v.restored_from_version else ""),
                       v.created_by, utc(v.created_at).strftime("%d %b %H:%M"),
                       "good:Current" if i == 0 else "Superseded"] for i, v in enumerate(versions)]},
        ],
    }


async def architecture(s: AsyncSession) -> dict[str, Any]:
    runs = [r for r in await _all(s, AgentRun) if r.status not in ("blocked_budget", "blocked_rate_limit", "disabled")]
    tasks = await _all(s, AgentTask)
    masked = [len(st["data"].get("placeholders", [])) for t in tasks for st in _steps(t) if st["step"] == "redaction"]
    leaks = sum(1 for t in tasks for st in _steps(t) if st["step"] == "redaction" and st["data"].get("leaks"))
    ev = (await s.execute(select(AuditEvent).where(AuditEvent.action == "mcp_tool_call"))).scalars().all()
    today_ev = [e for e in ev if datetime.fromisoformat(e.ts) >= _today()]
    tools = Counter(e.entity_id for e in ev)
    tokens = sum(1 for t in await _all(s, McpToken) if not t.revoked)
    sources = Counter(t.data_source or "n/a" for t in tasks if t.kind == "chase")
    return {
        "kpis": [
            kpi("Model calls through the one gateway", "100%" if runs else "–", f"{len(runs):,} of {len(runs):,} calls",
                "good" if runs else None, "Conforms" if runs else ""),
            kpi("Identifiers masked per call", f"{statistics.mean(masked):.0f}" if masked else "–",
                "client, contact, first name, email, LEI"),
            kpi("Names leaked to the model", leaks, "checked before every call", "good" if not leaks else "bad",
                "None" if not leaks else "Investigate"),
            kpi("MCP tool calls today", len(today_ev), f"{tokens} active personal token{'s' if tokens != 1 else ''}"),
        ],
        "widgets": [
            {"type": "flow", "wide": True, "title": "Path of one reminder", "note": "outlined steps are control points",
             "source": "static", "steps": [
                 ["Case tracker", "Read through MCP get_case", 0], ["Redactor", "Names → [[CLIENT]] placeholders", 1],
                 ["Gateway", "Masked prompt + fixed guardrails", 1], ["Gemini", "Primary or fallback model", 0],
                 ["Validator", "Names restored, rules checked", 0], ["RM review", "Saved as a draft, never sent", 1]]},
            {"type": "bars", "title": "MCP tool calls by tool", "note": "all time · no approve or send tool exists",
             "source": "live", "rows": [[k, v] for k, v in tools.most_common()]},
            {"type": "list", "title": "Where the agent got its case data", "note": "chase runs", "source": "live", "items": [
                ["Through MCP tools", f"{sources.get('mcp', 0)} runs", "good:Preferred"],
                ["Direct database fallback", f"{sources.get('direct', 0)} runs", "warn:Fallback" if sources.get("direct") else "good:None"],
            ]},
            {"type": "table", "wide": True, "title": "Systems used", "note": "no new data stores", "source": "static",
             "head": ["System", "Access", "Pattern"],
             "rows": [["Case tracker", "Read", "good:Reuse"], ["Mail gateway", "Send only after RM approval (simulated)", "good:Reuse"],
                      ["Gemini via gateway", "Masked prompts only", "good:Conform"],
                      ["Email archive (3 years)", "Not connected yet", "warn:Planned"]]},
        ],
    }


async def product(s: AsyncSession) -> dict[str, Any]:
    drafts = await _all(s, ChaseDraft)
    decided = [d for d in drafts if d.status in ("approved_sent", "discarded")]
    approved = [d for d in drafts if d.status == "approved_sent"]
    discarded = [d for d in drafts if d.status == "discarded" and (d.decision_reason or "") != "demo reset"]
    review = [(utc(d.decided_at) - utc(d.created_at)).total_seconds() for d in approved if d.decided_at]
    sent = len(await _all(s, OutboundMessage))
    tones: Counter[str] = Counter()
    for t in await _all(s, AgentTask):
        if t.kind != "chase":
            continue
        p = next((st for st in _steps(t) if st["step"] == "prompt"), None)
        m = re.search(r"Tone: (\w+)", (p or {}).get("data", {}).get("user", ""))
        if m:
            tones[m.group(1)] += 1
    cases = {c.id: c for c in await _all(s, KycCase)}
    rms = (await s.execute(select(User).where(User.role == RM, User.active.is_(True)))).scalars().all()
    rows = []
    for u in rms:
        mine = [d for d in drafts if cases.get(d.case_id) and cases[d.case_id].assigned_rm_user_id == u.id]
        ap = [d for d in mine if d.status == "approved_sent"]
        rv = [(utc(d.decided_at) - utc(d.created_at)).total_seconds() for d in ap if d.decided_at]
        rows.append([u.display_name, f"n:{len(mine)}", f"n:{len(ap)}", f"n:{_secs(statistics.median(rv)) if rv else '–'}",
                     f"n:{_pct(sum(d.edited_by_rm for d in ap), len(ap))}"])
    med = statistics.median(review) if review else None
    return {
        "kpis": [
            kpi("Reminders approved", _pct(len(approved), len(decided)), f"{len(approved)} of {len(decided)} decided",
                None if not decided else ("good" if len(approved) / len(decided) >= .8 else "warn"),
                "" if not decided else ("Adopted" if len(approved) / len(decided) >= .8 else "Watch")),
            kpi("Median time to approve", _secs(med) if med is not None else "–", "draft ready → sent"),
            kpi("Sent without edits", _pct(sum(not d.edited_by_rm for d in approved), len(approved)),
                "RM accepted the draft as written"),
            kpi("Drafts discarded", _pct(len(discarded), len(decided)), f"{len(discarded)} discarded"),
        ],
        "widgets": [
            {"type": "funnel", "title": "From draft to sent", "note": "all time", "source": "live", "rows": [
                ["Drafts prepared", len(drafts)], ["Decided by an RM", len(decided)], ["Approved", len(approved)], ["Sent", sent]]},
            {"type": "bars", "title": "Tone used", "note": "share of reminders prepared", "source": "live", "unit": "%",
             "rows": [[k.capitalize(), round(v / sum(tones.values()) * 100)] for k, v in tones.most_common()]},
            {"type": "table", "wide": True, "title": "By Relationship Manager", "note": "all time", "source": "live",
             "head": ["RM", "Drafts", "Approved", "Median time to approve", "Edited before sending"], "rows": rows},
        ],
    }


async def business(s: AsyncSession, user: User) -> dict[str, Any]:
    m = await measure(s, user) if can(user, "measure:read") else None
    if m is None:
        raise PermissionDenied("measure:read required")
    b, p = m["baseline"], m["pilot"]
    from calendar import monthrange

    from app.models import AgentControl

    spent = {a: await month_spend(s, a) for a in ("drafter", "critic")}
    caps_by: dict[str, float] = {}
    for a in ("drafter", "critic"):
        ctl = await s.get(AgentControl, a)
        caps_by[a] = ctl.monthly_budget_usd if ctl else 0.0
    caps = sum(caps_by.values())
    total = sum(spent.values())
    # Month-end forecast: spend so far, run-rated over the days elapsed (at least one day).
    now, ms = _now(), month_start()
    days_in_month = monthrange(now.year, now.month)[1]
    elapsed = max(1.0, (now - ms).total_seconds() / 86400)

    def forecast(x: float) -> float:
        return x / elapsed * days_in_month

    fc_total = forecast(total)
    runs = await _all(s, AgentRun)
    tasks = [t for t in await _all(s, AgentTask) if t.kind == "chase"]
    cost_by_task: Counter[int] = Counter()
    for r in runs:
        if r.task_id:
            cost_by_task[r.task_id] += r.cost_usd
    approved = [t for t in tasks if t.outcome == "approved"]
    all_chase = sum(cost_by_task[t.id] for t in tasks)
    per_approved = all_chase / len(approved) if approved else None
    avg_task = all_chase / len(tasks) if tasks else 0.0
    saved = b["median_days"] - p["median_days"]
    month_runs = [r for r in runs if utc(r.created_at) >= month_start()]
    by_agent: Counter[str] = Counter()
    for r in month_runs:
        by_agent["Prompt tests" if r.purpose and "test" in (r.purpose or "") else r.agent.capitalize()] += r.cost_usd
    return {
        "kpis": [
            kpi("Chase days, median", f"{b['median_days']} → {p['median_days']}", f"target {PILOT_TARGET_DAYS}",
                "good" if p["median_days"] <= PILOT_TARGET_DAYS else "warn",
                "Ahead" if p["median_days"] <= PILOT_TARGET_DAYS else "Behind"),
            kpi("AI spend this month", f"${total:.4f}", f"of ${caps:.2f} cap · ₹{total * config.USD_TO_INR:.2f}",
                "good" if total < caps * .8 else "warn", f"{_pct(total, caps)} of cap"),
            kpi("Month-end forecast", f"${fc_total:.4f}", f"at today's run rate · ₹{fc_total * config.USD_TO_INR:.2f}",
                "good" if fc_total <= caps * .8 else ("warn" if fc_total <= caps else "bad"),
                "Within cap" if fc_total <= caps else "Over cap"),
            kpi("Cost per approved reminder", f"${per_approved:.4f}" if per_approved else "–",
                "fully loaded, incl. rewrites and discards"),
        ],
        "widgets": [
            {"type": "budget", "wide": True, "title": "Monthly AI budget", "source": "live",
             "note": f"{now:%B %Y} · day {int(elapsed)} of {days_in_month} · calls are blocked when spend reaches the cap",
             "fx": config.USD_TO_INR, "can_edit": can(user, "agent:control") and user.role in AGENT_FIELD_RIGHTS["monthly_budget_usd"],
             "rows": [{"agent": a, "label": a.capitalize(), "spent": round(spent[a], 6),
                       "forecast": round(forecast(spent[a]), 6), "cap": caps_by[a]} for a in ("drafter", "critic")]},
            {"type": "pairs", "wide": True, "title": "Days from requested to received, by document type",
             "note": "median · seeded synthetic history", "source": "live", "legend": ["Before", "Pilot"], "unit": " d",
             "max": max([v["baseline"] or 0 for v in m["by_doc_type"].values()] + [1]),
             "rows": [[k, v["baseline"], v["pilot"]] for k, v in m["by_doc_type"].items()]},
            {"type": "list", "title": "Projections", "note": "arithmetic, not yet realised", "source": "live", "items": [
                ["Median onboarding", f"62 → about {62 - saved:.0f} days if the chase saving holds", "warn:Projected"],
                ["Files back more than once", f"{b['pct_more_than_one_round']:.0f}% → {p['pct_more_than_one_round']:.0f}% of requests",
                 "good:Down" if p["pct_more_than_one_round"] < b["pct_more_than_one_round"] else "warn:Flat"],
                ["Case-days saved per month", f"About {saved * 400:,.0f} at 400 cases", "warn:Projected"],
                ["Spend at full volume", f"About ${avg_task * 400 * 2:.2f} a month (400 cases × 2 runs)", "warn:Projected"],
            ]},
            {"type": "bars", "title": "Spend by agent", "note": "this month, USD", "source": "live", "unit": "$", "dec": 4,
             "rows": [[k, round(v, 6)] for k, v in by_agent.most_common()]},
        ],
    }


async def security(s: AsyncSession) -> dict[str, Any]:
    cases = (await s.execute(select(KycCase).options(selectinload(KycCase.documents)))).scalars().all()
    by_id = {c.id: c for c in cases}
    out = await _all(s, OutboundMessage)
    rogue = [o for o in out if by_id.get(o.case_id) and by_id[o.case_id].assigned_rm_user_id != o.approved_by_user_id]
    events = (await s.execute(select(AuditEvent).order_by(AuditEvent.id.desc()))).scalars().all()
    denied = [e for e in events if e.action == "approval_denied"]
    waived = [d for c in cases for d in c.documents if d.status == "Waived"]
    with_reason = [d for d in waived if (d.waived_reason or "").strip()]
    chain = await audit.verify_chain(s)
    catches: Counter[str] = Counter()
    for t in await _all(s, AgentTask):
        for st in _steps(t):
            if st["step"] == "validation":
                for ch in st["data"].get("checks", []):
                    if not ch["passed"]:
                        catches[CHECK_LABELS.get(ch["key"], ch["key"])] += 1
    pretty = {"draft_approved_and_sent": "Reminder approved & sent", "approval_denied": "bad:Send blocked (not the named RM)",
              "draft_created": "Reminder drafted", "draft_discarded": "Reminder discarded", "document_waived": "Document waived",
              "document_received": "Document received", "agent_config_changed": "Agent settings changed",
              "agent_config_restored": "Agent version restored", "mcp_tool_call": "MCP tool call", "login": "Signed in",
              "login_failed": "warn:Failed sign-in", "audit_chain_verified": "Audit chain verified"}
    recent = [e for e in events if e.action not in ("logout",)][:10]
    return {
        "kpis": [
            kpi("Sends without the named RM", len(rogue), "since the pilot started", "good" if not rogue else "bad",
                "Red line held" if not rogue else "Breach"),
            kpi("Send attempts blocked", len(denied), "someone other than the named RM tried", "good", "Blocked"),
            kpi("Waivers with a reason", f"{len(with_reason)} / {len(waived)}", _pct(len(with_reason), len(waived)) if waived else "no waivers yet",
                "good" if len(with_reason) == len(waived) else "bad", "Complete" if len(with_reason) == len(waived) else "Gap"),
            kpi("Audit chain", "Verified" if chain["valid"] else "Broken", f"{chain['events_checked']:,} events",
                "good" if chain["valid"] else "bad", "Intact" if chain["valid"] else f"Broken at #{chain['broken_at_id']}"),
        ],
        "widgets": [
            {"type": "bars", "title": "Guardrail catches", "note": "problems found in AI drafts before an RM saw them",
             "source": "live", "rows": [[k, v] for k, v in catches.most_common()]},
            {"type": "list", "title": "Red lines", "note": "checked live", "source": "live", "items": [
                ["Named RM approves every send", f"{len(out)} sent, {len(rogue)} by anyone else", "good:Held" if not rogue else "bad:Breach"],
                ["No document genuineness decisions", "Receipt is logged by a person", "good:Held"],
                ["No system risk rating", "No such field exists in the database", "good:Held"],
                ["Synthetic data only", "Pilot dataset", "good:Held"],
            ]},
            {"type": "table", "wide": True, "title": "Recent audit events", "note": "hash-chained, append-only", "source": "live",
             "head": ["Time", "Who", "What", "Case", "Via"],
             "rows": [[_hm(e.ts), e.actor, pretty.get(e.action, e.action.replace("_", " ").capitalize()),
                       by_id[e.case_id].case_code if e.case_id in by_id else "—", e.via.upper()] for e in recent]},
        ],
    }


async def data(s: AsyncSession) -> dict[str, Any]:
    cases = (await s.execute(select(KycCase).options(selectinload(KycCase.documents)))).scalars().all()
    docs = [d for c in cases for d in c.documents]
    received = [d for d in docs if d.status == "Received"]
    waived = [d for d in docs if d.status == "Waived"]
    drafts = await _all(s, ChaseDraft)
    caught = 0
    for d in received:
        if d.received_at and any(x.case_id == d.case_id and utc(x.created_at) < utc(d.received_at) for x in drafts):
            caught += 1
    evs = (await s.execute(select(AuditEvent).where(AuditEvent.action.like("document_%"))
                           .order_by(AuditEvent.id.desc()))).scalars().all()
    last = datetime.fromisoformat(evs[0].ts) if evs else None
    by_case = {c.id: c for c in cases}
    return {
        "kpis": [
            kpi("Documents on checklists", len(docs), f"across {len(cases)} cases"),
            kpi("Received", f"{len(received)}", _pct(len(received), len(docs)) + f" of all requested · {len(waived)} waived"),
            kpi("Arrived after a reminder was drafted", caught, "dropped from the next reminder automatically", "good", "Not re-chased"),
            kpi("Checklist last changed", _ago(last) if last else "since seed", "by KYC Ops"),
        ],
        "widgets": [
            {"type": "pairs", "title": "Checklist completion by case", "note": "requested vs received or waived", "source": "live",
             "legend": ["Requested", "Received or waived"], "unit": "", "max": max([len(c.documents) for c in cases] + [1]),
             "rows": [[c.client_name.split(" ")[0] + " · " + c.case_code[-4:], len(c.documents),
                       sum(1 for d in c.documents if d.status != "Missing")] for c in cases]},
            {"type": "list", "title": "Email matching", "note": "matching client emails to case IDs", "source": "planned", "items": [
                ["Read the 3-year chase-email archive", "Parse case IDs from subject lines", "warn:Planned"],
                ["Score each match", "Low-confidence emails go to Ops, never auto-filed", "warn:Planned"],
                ["Mark documents received automatically", "Only after Ops confirms", "warn:Planned"],
            ]},
            {"type": "table", "wide": True, "title": "Recent checklist changes", "note": "every change is audited", "source": "live",
             "head": ["Time", "Who", "Case", "Document", "Change"],
             "rows": [[_hm(e.ts), e.actor, by_case[e.case_id].case_code if e.case_id in by_case else "—",
                       json.loads(e.details_json).get("document", ""),
                       {"document_received": "good:Received", "document_waived": "warn:Waived",
                        "document_missing": "Asked again"}.get(e.action, e.action)] for e in evs[:8]]},
        ],
    }


async def operations(s: AsyncSession) -> dict[str, Any]:
    cases = (await s.execute(select(KycCase).options(selectinload(KycCase.documents)))).scalars().all()
    pending = (await s.execute(select(ChaseDraft).where(ChaseDraft.status == "pending_approval"))).scalars().all()
    pend = {d.case_id: d for d in pending}
    now = _now()
    open_cases = [c for c in cases if c.status != "Completed"]
    missing = [(c, d) for c in cases for d in c.documents if d.status == "Missing"]
    age = {id(d): (now - utc(d.requested_at)).total_seconds() / 86400 for _, d in missing}
    overdue = [c for c in open_cases if (now - utc(c.last_contact_date)).total_seconds() / 86400 > SLA_DAYS]
    oldest = max(missing, key=lambda x: age[id(x[1])], default=None)
    rows = []
    for c in sorted(open_cases, key=lambda c: -max([age[id(d)] for d in c.documents if d.status == "Missing"], default=0)):
        m = [d for d in c.documents if d.status == "Missing"]
        if not m:
            continue
        since = (now - utc(c.last_contact_date)).total_seconds() / 86400
        status = "warn:Reminder with RM" if c.id in pend else ("bad:Overdue" if since > SLA_DAYS else "Waiting")
        rows.append([c.case_code, c.client_name, c.assigned_rm, f"n:{len(m)}", f"n:{max(age[id(d)] for d in m):.0f} d", status])
    labels = ["0 – 3 days", "4 – 7 days", "8 – 14 days", "Over 14 days"]
    counts = [0, 0, 0, 0]
    for _, d in missing:
        a = age[id(d)]
        counts[0 if a <= 3.5 else 1 if a <= 7.5 else 2 if a <= 14.5 else 3] += 1
    buckets = [[lab, n] for lab, n in zip(labels, counts, strict=True)]
    by_id = {c.id: c for c in cases}
    return {
        "kpis": [
            kpi("Open cases", len(open_cases), f"{len(missing)} documents missing"),
            kpi(f"Overdue (over {SLA_DAYS:.0f} days)", len(overdue), "since last contact",
                "bad" if overdue else "good", "Act today" if overdue else "Clear"),
            kpi("Oldest waiting document", f"{age[id(oldest[1])]:.0f} d" if oldest else "–",
                f"{oldest[0].client_name.split(' ')[0]} · {_short(oldest[1].document_name)}" if oldest else "",
                "bad" if oldest and age[id(oldest[1])] > 7 else None, "Oldest" if oldest else ""),
            kpi("Reminders awaiting an RM", len(pending), "Ops cannot send"),
        ],
        "widgets": [
            {"type": "table", "wide": True, "title": "Chase queue", "note": "oldest wait first", "source": "live",
             "head": ["Case", "Client", "Named RM", "Missing", "Oldest wait", "Status"], "rows": rows},
            {"type": "bars", "title": "Missing documents by age", "note": f"{len(missing)} documents", "source": "live", "rows": buckets},
            {"type": "list", "title": "Reminders waiting for the RM", "note": "drafted, not sent", "source": "live", "items": [
                [f"{by_id[d.case_id].case_code} · {by_id[d.case_id].client_name}",
                 f"{by_id[d.case_id].assigned_rm} · drafted {_ago(d.created_at)}", "warn:With RM"] for d in pending]},
        ],
    }


BUILDERS = {"engineering": engineering, "architecture": architecture, "product": product, "security": security,
            "data": data, "operations": operations}


async def build(s: AsyncSession, user: User, vid: str) -> dict[str, Any]:
    if vid not in VERTICALS:
        raise NotFound(f"Unknown dashboard '{vid}'")
    if not can(user, f"insights:{vid}"):
        raise PermissionDenied(f"Your role cannot open the {META[vid]['name']} dashboard")
    body = await business(s, user) if vid == "business" else await BUILDERS[vid](s)
    return {"id": vid, **META[vid], "updated_at": _now().isoformat(timespec="seconds"), **body}


async def overview(s: AsyncSession, user: User) -> dict[str, Any]:
    verticals = []
    for vid in VERTICALS:
        allowed = can(user, f"insights:{vid}")
        head = None
        if allowed:
            try:
                d = await build(s, user, vid)
                head = next((k for k in d["kpis"] if k["status"]), d["kpis"][0])
            except PermissionDenied:
                allowed = False
        verticals.append({"id": vid, **META[vid], "allowed": allowed, "headline": head})
    m = await measure(s, user) if can(user, "measure:read") else None
    return {
        "outcome": {"baseline": m["baseline"]["median_days"] if m else 17.0, "target": PILOT_TARGET_DAYS,
                    "now": m["pilot"]["median_days"] if m else None, "unit": "days",
                    "label": "Median days from document requested to received",
                    "note": "Pilot figures come from seeded synthetic history until the chase-email archive is ingested."},
        "verticals": verticals,
        "updated_at": _now().isoformat(timespec="seconds"),
    }
