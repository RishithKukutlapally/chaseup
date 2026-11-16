"""LangGraph chase workflow. Produces a DRAFT only — never sends.

    START -> plan (case data via MCP tools, direct DB fallback)
          -> draft (drafter agent, redacted prompt, restore, validate)
          -> critic (deterministic checks + critic agent)
          -> revise (once, with critic feedback) -> critic
          -> template fallback (if still failing)
          -> handoff (pending_approval draft for the named RM) -> END
"""

from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import audit
from app.agent_config import load_settings
from app.database import AsyncSessionLocal
from app.guardrails import (
    Check,
    Redactor,
    all_passed,
    portal_url_for,
    template_email,
    validate_chase_email,
)
from app.llm_gateway import LlmBlocked, call_llm, parse_json_loose
from app.models import AgentTask, ChaseDraft, KycCase, User
from app.trace import Trace

Emit = Callable[[dict[str, Any]], Awaitable[None]]
MAX_LLM_DRAFTS = 2  # first draft + one revision


class ChaseState(TypedDict, total=False):
    case_id: int
    tone: str
    simulate_critic_rejection: bool
    ctx: dict[str, Any]
    missing_docs: list[dict[str, Any]]
    received_docs: list[dict[str, Any]]
    subject: str
    body: str
    engine: str
    attempt: int
    checks: list[dict[str, Any]]
    critic_passed: bool
    critic_feedback: str
    draft_id: int | None


# --------------------------------------------------------------------------- data access
def case_context(c: KycCase) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    ctx = {
        "case_id": c.id,
        "case_code": c.case_code,
        "client_name": c.client_name,
        "contact_name": c.contact_name,
        "contact_role": c.contact_role,
        "contact_email": c.contact_email,
        "lei": c.lei,
        "assigned_rm": c.assigned_rm,
        "target_deadline_label": c.target_deadline_label,
        "portal_url": portal_url_for(c.case_code),
    }
    missing = [{"id": d.id, "document_name": d.document_name, "description": d.description}
               for d in c.documents if d.status == "Missing"]
    received = [{"id": d.id, "document_name": d.document_name} for d in c.documents if d.status in ("Received", "Waived")]
    return ctx, missing, received


async def _direct_fetch(session: AsyncSession, case_id: int):
    c = (await session.execute(
        select(KycCase).options(selectinload(KycCase.documents)).where(KycCase.id == case_id)
    )).scalar_one()
    return case_context(c)


# --------------------------------------------------------------------------- simulated outputs
def _sim_drafter(ctx_redacted: dict[str, Any], missing: list[dict[str, Any]], tone: str, flawed: bool) -> Callable[[str, str], str]:
    def fn(_system: str, _prompt: str) -> str:
        subject, body = template_email(ctx_redacted, missing, tone)
        if flawed:
            body = body.replace(
                "Please upload all of them",
                "Once these arrive we guarantee approval of the facility and can waive the remaining checks. "
                "Please upload all of them",
            )
        return json.dumps({"subject": subject, "body": body})
    return fn


def _sim_critic(checks: list[Check]) -> Callable[[str, str], str]:
    def fn(_system: str, _prompt: str) -> str:
        issues = [f"{c.title}: {c.detail}" for c in checks if not c.passed]
        return json.dumps({"approve": not issues, "issues": issues})
    return fn


def _ui_checks(checks: list[Check], critic_ok: bool | None, critic_issues: list[str]) -> list[dict[str, Any]]:
    out = [{
        "key": c.key, "title": c.title, "badge": ("PASSED" if c.passed else "FAILED") + f": {c.title}",
        "passed": c.passed, "summary": c.detail, "meta_left": "Deterministic validator", "meta_right": "",
    } for c in checks]
    if critic_ok is not None:
        out.append({
            "key": "critic_agent", "title": "Critic agent review", "badge": "PASSED" if critic_ok else "FAILED",
            "passed": critic_ok, "summary": "; ".join(critic_issues) or "No issues raised",
            "meta_left": "LLM second opinion", "meta_right": "",
        })
    return out


# --------------------------------------------------------------------------- the graph
def build_graph(session: AsyncSession, *, user: User | None, trace: Trace, task: AgentTask, emit: Emit | None,
                via: str, overrides: dict[str, Any] | None = None, synthetic: dict[str, Any] | None = None):
    async def _emit(ev: dict[str, Any]) -> None:
        if emit:
            await emit(ev)

    async def plan(state: ChaseState) -> ChaseState:
        await _emit({"type": "node_start", "node": "orchestrator", "label": "Planning: fetching case data via MCP"})
        await trace.step("plan", "Plan: fetch case + missing docs -> draft -> critic -> (revise) -> RM approval", "info",
                         steps=["fetch", "redact", "draft", "validate", "critic", "handoff"])
        if synthetic is not None:
            ctx, missing, received = synthetic["ctx"], synthetic["missing"], []
            source = "synthetic"
            await trace.step("data_source", "Synthetic test case (prompt test run; nothing is saved to any case)", "info")
        else:
            source = "direct"
            try:
                from app.mcp_server import fetch_case_via_mcp

                ctx, missing, received = await fetch_case_via_mcp(user, state["case_id"])
                source = "mcp"
                await trace.step("data_source", "Case data fetched through MCP tools get_case + list_missing_documents",
                                 "ok", transport="mcp-in-process", tools=["get_case", "list_missing_documents"])
            except Exception as exc:
                ctx, missing, received = await _direct_fetch(session, state["case_id"])
                await trace.step("data_source", f"MCP unavailable ({type(exc).__name__}); used direct DB access", "warn",
                                 error=str(exc)[:200])
        task.data_source = source
        await session.commit()
        await _emit({"type": "orchestrator_result", "node": "orchestrator", "missing_docs_count": len(missing),
                     "verified_docs_count": len(received), "client_name": ctx["client_name"], "data_source": source})
        return {"ctx": ctx, "missing_docs": missing, "received_docs": received, "attempt": 0}

    async def draft(state: ChaseState) -> ChaseState:
        attempt = state.get("attempt", 0) + 1
        s = await load_settings(session, "drafter", overrides)
        tone = state.get("tone") or s.tone
        ctx, missing = state["ctx"], state["missing_docs"]
        await _emit({"type": "node_start", "node": "drafter", "attempt": attempt, "is_retry": attempt > 1,
                     "llm_model": s.primary_model, "label": f"Drafter v{attempt} ({s.primary_model}, config v{s.version})"})
        red = Redactor.for_case(ctx)
        rctx = {**ctx, "client_name": "[[CLIENT]]", "contact_name": "[[CONTACT_FIRST]]", "contact_email": "[[CONTACT_EMAIL]]",
                "lei": "[[LEI]]"}
        doc_lines = "\n".join(f"- {d['document_name']}: {red.redact(d.get('description', ''))}" for d in missing)
        prompt = (
            f"Case reference: {ctx['case_code']}\nClient: [[CLIENT]]\nRecipient: [[CONTACT]] ([[CONTACT_FIRST]])\n"
            f"Relationship Manager (sign as): {ctx['assigned_rm']}\nDeadline: {ctx['target_deadline_label']}\n"
            f"Tone: {tone}\nSecure portal link (the only link allowed): {ctx['portal_url']}\n"
            f"Missing documents (list every one, exactly as named):\n{doc_lines}\n"
        )
        if state.get("critic_feedback") and attempt > 1:
            prompt += f"\nThe previous draft was rejected. Fix these issues:\n{state['critic_feedback']}\n"
        leaks = red.leaks(prompt)
        await trace.step("redaction", f"Redacted {len(red.mapping)} client/contact identifiers before the model call",
                         "ok" if not leaks else "fail", placeholders=sorted(red.mapping.keys()), leaks=leaks)
        flawed = bool(state.get("simulate_critic_rejection")) and attempt == 1
        subject, body, engine = "", "", "template"
        try:
            res = await call_llm(session, settings=s, purpose="draft" if attempt == 1 else "revise",
                                 system_prompt=s.system_prompt, user_prompt=prompt, trace=trace, user=user,
                                 simulate=_sim_drafter(rctx, missing, tone, flawed), task_id=task.id, via=via)
            text = res.text
            if flawed and not res.simulated:
                text = _sim_drafter(rctx, missing, tone, True)("", "")
                await trace.step("drill", "Critic-rejection drill: injected a non-compliant sentence into draft v1", "warn")
            data = parse_json_loose(text)
            subject = red.restore(str(data.get("subject") or ""))
            body = red.restore(str(data.get("body") or ""))
            engine = "simulated" if res.simulated else f"llm:{res.model}"
            await trace.step("restore", "Restored placeholders to real names (after the model call)", "ok")
        except LlmBlocked as exc:
            await trace.step("draft", f"No model call allowed ({exc.status}); template will be used", "warn")
        except Exception as exc:
            await trace.step("draft", f"Model output unusable ({type(exc).__name__}); template will be used", "warn")
        if not body:
            subject, body = template_email(ctx, missing, tone)
            engine = "template"
        for i in range(0, len(body), 48):
            await _emit({"type": "draft_token", "node": "drafter", "attempt": attempt, "chunk": body[i:i + 48],
                         "progress": min(100, int((i + 48) / max(1, len(body)) * 100))})
        await _emit({"type": "draft_complete", "node": "drafter", "attempt": attempt, "subject": subject, "body": body,
                     "engine": engine, "word_count": len(body.split())})
        return {"subject": subject, "body": body, "engine": engine, "attempt": attempt, "tone": tone}

    async def critic(state: ChaseState) -> ChaseState:
        ctx, missing, body = state["ctx"], state["missing_docs"], state["body"]
        await _emit({"type": "node_start", "node": "critic", "attempt": state["attempt"], "label": "Validating draft"})
        checks = validate_chase_email(body, ctx, missing)
        det_ok = all_passed(checks)
        await trace.step("validation", f"Deterministic validation: {sum(c.passed for c in checks)}/{len(checks)} passed",
                         "ok" if det_ok else "fail", checks=[c.as_dict() for c in checks])
        critic_ok: bool | None = None
        issues: list[str] = []
        if state["engine"] != "template":
            s = await load_settings(session, "critic", None)
            red = Redactor.for_case(ctx)
            prompt = (f"Required documents: {[d['document_name'] for d in missing]}\nDeadline: {ctx['target_deadline_label']}\n"
                      f"Named RM: {ctx['assigned_rm']}\nAllowed link: {ctx['portal_url']}\n\nDRAFT:\n{red.redact(body)}")
            try:
                res = await call_llm(session, settings=s, purpose="critic", system_prompt=s.system_prompt,
                                     user_prompt=prompt, trace=trace, user=user, simulate=_sim_critic(checks),
                                     task_id=task.id, via=via)
                verdict = parse_json_loose(res.text)
                critic_ok = bool(verdict.get("approve"))
                issues = [str(i) for i in verdict.get("issues") or []]
            except Exception as exc:
                await trace.step("critic", f"Critic agent unavailable ({type(exc).__name__}); deterministic checks decide", "warn")
        passed = det_ok and (critic_ok is not False)
        feedback = "\n".join([f"- {c.title}: {c.detail}" for c in checks if not c.passed] + [f"- {i}" for i in issues])
        await trace.step("critic_verdict", "Critic verdict: " + ("PASS" if passed else "REJECT"), "ok" if passed else "fail",
                         deterministic_pass=det_ok, critic_agent_pass=critic_ok, issues=issues)
        ui = _ui_checks(checks, critic_ok, issues)
        await _emit({"type": "critic_result", "node": "critic", "attempt": state["attempt"], "passed": passed,
                     "score": int(sum(c["passed"] for c in ui) / len(ui) * 100), "feedback": feedback or "All checks passed",
                     "checks": ui, "routing_to": "end" if passed else "drafter"})
        return {"checks": ui, "critic_passed": passed, "critic_feedback": feedback}

    async def template_fallback(state: ChaseState) -> ChaseState:
        subject, body = template_email(state["ctx"], state["missing_docs"], state.get("tone") or "institutional")
        checks = validate_chase_email(body, state["ctx"], state["missing_docs"])
        await trace.step("fallback", "LLM drafts failed validation twice — fell back to the approved template",
                         "warn" if all_passed(checks) else "fail", checks=[c.as_dict() for c in checks])
        return {"subject": subject, "body": body, "engine": "template", "critic_passed": all_passed(checks),
                "checks": _ui_checks(checks, None, [])}

    async def handoff(state: ChaseState) -> ChaseState:
        task.engine = state["engine"]
        if synthetic is not None:
            task.status, task.outcome = "completed", "n/a"
            task.trace_json = trace.to_json()
            await session.commit()
            await trace.step("handoff", "Test run complete — output shown to the Agent Owner only, nothing saved or sent", "ok")
            return {"draft_id": None}
        case = (await session.execute(select(KycCase).where(KycCase.id == state["case_id"]))).scalar_one()
        for old in (await session.execute(select(ChaseDraft).where(
                ChaseDraft.case_id == case.id, ChaseDraft.status == "pending_approval"))).scalars():
            old.status = "superseded"
        d = ChaseDraft(case_id=case.id, task_id=task.id, subject=state["subject"], body=state["body"],
                       engine=state["engine"], status="pending_approval", validation_json=json.dumps(state["checks"]),
                       created_by_user_id=user.id if user else None)
        session.add(d)
        await session.flush()
        case.current_draft_subject, case.current_draft_body = state["subject"], state["body"]
        case.critic_passed = bool(state.get("critic_passed"))
        case.critic_checks_json = json.dumps(state["checks"])
        case.critic_score = int(sum(c["passed"] for c in state["checks"]) / max(1, len(state["checks"])) * 100)
        case.critic_feedback = state.get("critic_feedback") or "All checks passed"
        case.workflow_iterations = state.get("attempt", 1)
        if case.status != "Completed":
            case.status = "Draft_Ready"
        await trace.step("handoff", f"Draft #{d.id} saved as PENDING APPROVAL. Not sent. Only {case.assigned_rm} "
                                    "(named RM) can approve and send it.", "ok", draft_id=d.id)
        task.status = "completed"
        task.trace_json = trace.to_json()
        await audit.record(session, actor=user, action="draft_created", entity_type="draft", entity_id=d.id,
                           case_id=case.id, via=via, details={"engine": d.engine, "task_id": task.id,
                                                              "trace_id": trace.trace_id},
                           timeline=f"Chase draft #{d.id} prepared ({d.engine}); awaiting RM approval — not sent")
        return {"draft_id": d.id}

    def after_critic(state: ChaseState) -> str:
        if state.get("critic_passed"):
            return "handoff"
        if state["engine"] == "template":
            return "handoff"
        if state.get("attempt", 1) < MAX_LLM_DRAFTS:
            return "draft"
        return "template_fallback"

    g = StateGraph(ChaseState)
    g.add_node("plan", plan)
    g.add_node("draft", draft)
    g.add_node("critic", critic)
    g.add_node("template_fallback", template_fallback)
    g.add_node("handoff", handoff)
    g.set_entry_point("plan")
    g.add_edge("plan", "draft")
    g.add_edge("draft", "critic")
    g.add_conditional_edges("critic", after_critic, {"handoff": "handoff", "draft": "draft",
                                                     "template_fallback": "template_fallback"})
    g.add_edge("template_fallback", "handoff")
    g.add_edge("handoff", END)
    return g.compile()


async def run_chase_workflow(
    case_id: int | None,
    user: User | None,
    *,
    tone: str | None = None,
    simulate_critic_rejection: bool = False,
    emit: Emit | None = None,
    via: str = "ui",
    overrides: dict[str, Any] | None = None,
    synthetic: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run one chase task. Caller must already have authorised the user (draft:create)."""
    trace = Trace("chase", emit)
    async with AsyncSessionLocal() as session:
        task = AgentTask(kind="test_run" if synthetic else "chase", trace_id=trace.trace_id, case_id=case_id,
                         user_id=user.id if user else None, via=via)
        session.add(task)
        await session.commit()
        graph = build_graph(session, user=user, trace=trace, task=task, emit=emit, via=via,
                            overrides=overrides, synthetic=synthetic)
        try:
            final = await graph.ainvoke({"case_id": case_id or 0, "tone": tone or "",
                                         "simulate_critic_rejection": simulate_critic_rejection})
        except Exception as exc:
            await trace.step("error", f"Workflow failed: {type(exc).__name__}", "fail", error=str(exc)[:300])
            task.status = "failed"
            task.trace_json = trace.to_json()
            await session.commit()
            raise
        task.trace_json = trace.to_json()
        await session.commit()
        return {
            "task_id": task.id, "trace_id": trace.trace_id, "draft_id": final.get("draft_id"),
            "subject": final.get("subject"), "body": final.get("body"), "engine": final.get("engine"),
            "critic_passed": final.get("critic_passed"), "checks": final.get("checks"),
            "attempts": final.get("attempt"), "data_source": task.data_source, "trace": trace.steps,
        }


SYNTHETIC_TEST_CASE = {
    "ctx": {
        "case_id": 0, "case_code": "TEST-0000-0001", "client_name": "Example Harbour Trading Ltd (synthetic)",
        "contact_name": "Jordan Example", "contact_role": "Finance Director", "contact_email": "jordan@example.test",
        "lei": "TEST00000000000000X1", "assigned_rm": "Test Relationship Manager", "target_deadline_label": "30 November",
        "portal_url": portal_url_for("TEST-0000-0001"),
    },
    "missing": [
        {"id": 1, "document_name": "Register of Members", "description": "Current, certified by the company secretary"},
        {"id": 2, "document_name": "Board Resolution authorising the account", "description": "Signed by two directors"},
        {"id": 3, "document_name": "Proof of Registered Address", "description": "Dated within 3 months"},
    ],
}


def strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text)
