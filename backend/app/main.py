"""FastAPI app: authenticated, RBAC-checked REST + SSE API, MCP at /mcp, and the React UI."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import audit, config, security, services
from app.agent_config import (
    AGENTS,
    EDITABLE_FIELDS,
    TONES,
    append_version,
    load_settings,
    serialize_version,
)
from app.database import AsyncSessionLocal, get_db, init_db
from app.mcp_server import TOOL_NAMES
from app.mcp_server import http_app as mcp_http_app
from app.mcp_server import mcp as mcp_server
from app.models import AgentConfigVersion, AgentControl, FeatureFlag, McpToken, User
from app.paths import ANALYST_ASSIST_CANDIDATES, FRONTEND_DIST_DIR
from app.rbac import (
    LANDING,
    MATRIX,
    ROLES,
    NotFound,
    PermissionDenied,
    authorize,
    authorize_fields,
    matrix_for_ui,
    scope_for,
)
from app.seed import seed_database

_mcp_asgi = mcp_http_app()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    async with AsyncSessionLocal() as session:
        await seed_database(session)
    async with mcp_server.session_manager.run():
        yield


app = FastAPI(title="Northgate ChaseUp API", version="2.0.0", lifespan=lifespan,
              description="RM-approved KYC document chasing. Synthetic data only.")


# --------------------------------------------------------------------------- errors & CSRF
@app.exception_handler(PermissionDenied)
async def _denied(_: Request, exc: PermissionDenied):
    return JSONResponse({"detail": exc.message}, status_code=403)


@app.exception_handler(NotFound)
async def _nf(_: Request, exc: NotFound):
    return JSONResponse({"detail": exc.message}, status_code=404)


@app.exception_handler(ValueError)
async def _bad(_: Request, exc: ValueError):
    return JSONResponse({"detail": str(exc)}, status_code=422)


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    """State-changing API calls must carry the custom header (blocks cross-site form posts)."""
    if (request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS")
            and request.headers.get(config.CSRF_HEADER) != "1"):
        return JSONResponse({"detail": f"Missing {config.CSRF_HEADER} header"}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


# --------------------------------------------------------------------------- auth dependencies
async def current_user(request: Request, session: AsyncSession = Depends(get_db)) -> User:
    user = await security.user_from_cookie(session, request.cookies.get(config.SESSION_COOKIE))
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user


class RequirePerm:
    """Route-level permission gate. Scope (own/all) is enforced again in the service layer."""

    def __init__(self, permission: str) -> None:
        if permission not in MATRIX:
            raise RuntimeError(f"Unknown permission {permission}")
        self.permission = permission

    async def __call__(self, user: User = Depends(current_user)) -> User:
        authorize(user, self.permission)
        return user


def require(permission: str):
    return Depends(RequirePerm(permission))


PUBLIC_ROUTES = {("GET", "/api/health"), ("POST", "/api/auth/login"), ("POST", "/api/auth/logout")}


# --------------------------------------------------------------------------- request models
class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginIn(Strict):
    username: str
    password: str


class DocStatusIn(Strict):
    status: str
    reason: str = ""


class NoteIn(Strict):
    relationship_notes: str


class AnalystRequestIn(Strict):
    document: str
    note: str = ""


class WorkflowIn(Strict):
    tone: str | None = None
    simulate_critic_rejection: bool = False


class ApproveIn(Strict):
    """No 'actor' field: the approver is always the signed-in session user."""

    subject: str
    body: str


class DiscardIn(Strict):
    reason: str = Field(min_length=3)


class RecheckIn(Strict):
    body: str


class TokenIn(Strict):
    name: str = "MCP client"


class ConfigChangeIn(Strict):
    changes: dict[str, Any]
    reason: str = Field(min_length=5)


class RestoreIn(Strict):
    version: int
    reason: str = Field(min_length=5)


class TestRunIn(Strict):
    changes: dict[str, Any] = Field(default_factory=dict)
    tone: str | None = None
    simulate_critic_rejection: bool = False


class ControlsIn(Strict):
    enabled: bool | None = None
    monthly_budget_usd: float | None = Field(default=None, ge=0)
    simulate_primary_outage: bool | None = None
    reason: str = Field(min_length=5)


class FlagIn(Strict):
    enabled: bool
    reason: str = Field(min_length=5)


# --------------------------------------------------------------------------- health & auth
@app.get("/api/health")
async def health() -> dict[str, Any]:
    live = bool(config.google_api_key())
    return {"status": "ok", "service": "chaseup", "llm_mode": "live" if live else "simulated",
            "llm_configured": live, "llm_provider": "google" if live else "simulated",
            "llm_model": config.GEMINI_PRIMARY_MODEL, "fallback_model": config.fallback_model_for_primary(),
            "env_file": "(.env at project root)"}


def _me(user: User) -> dict[str, Any]:
    return {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role,
            "role_label": ROLES[user.role], "title": user.title, "landing": LANDING[user.role],
            "permissions": {p: scope_for(user, p) for p in MATRIX if scope_for(user, p)}}


@app.post("/api/auth/login")
async def login(payload: LoginIn, request: Request, response: Response, session: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else "?"
    key = security.throttle_key(payload.username, ip)
    wait = security.is_locked(key)
    if wait:
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {int(wait // 60) + 1} min.")
    user = (await session.execute(select(User).where(User.username == payload.username.strip().lower()))).scalar_one_or_none()
    if user is None or not user.active or not security.verify_password(payload.password, user.password_hash):
        security.record_failure(key)
        await audit.record(session, actor=None, action="login_failed", entity_type="user",
                           entity_id=payload.username[:64], details={"ip": ip})
        raise HTTPException(status_code=401, detail="Invalid username or password")
    security.record_success(key)
    cookie = await security.create_session(session, user)
    response.set_cookie(config.SESSION_COOKIE, cookie, httponly=True, samesite="strict", secure=config.COOKIE_SECURE,
                        max_age=config.SESSION_TTL_HOURS * 3600, path="/")
    await audit.record(session, actor=user, action="login", entity_type="user", entity_id=user.id)
    return _me(user)


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response, session: AsyncSession = Depends(get_db)):
    user = await security.user_from_cookie(session, request.cookies.get(config.SESSION_COOKIE))
    await security.revoke_session(session, request.cookies.get(config.SESSION_COOKIE))
    response.delete_cookie(config.SESSION_COOKIE, path="/")
    if user:
        await audit.record(session, actor=user, action="logout", entity_type="user", entity_id=user.id)
    return {"ok": True}


@app.get("/api/auth/me")
async def me(user: User = require("self:read")):
    return _me(user)


@app.get("/api/auth/access-matrix")
async def access_matrix(user: User = require("self:read")):
    return {**matrix_for_ui(), "you": _me(user), "mcp_tools": TOOL_NAMES,
            "red_lines": [
                "Nothing is sent to a client without the named RM approving it (server-enforced).",
                "No auto-send; no MCP tool can send or approve.",
                "The system never decides whether a document is genuine.",
                "No system assigns or changes a risk rating — AI prepares, a person decides.",
                "Synthetic data only.",
            ]}


@app.get("/api/auth/mcp-tokens")
async def list_tokens(user: User = require("mcp:manage_own_tokens"), session: AsyncSession = Depends(get_db)):
    rows = (await session.execute(select(McpToken).where(McpToken.user_id == user.id).order_by(McpToken.id.desc()))).scalars()
    return [{"id": t.id, "name": t.name, "prefix": t.prefix, "created_at": services.iso(t.created_at),
             "last_used_at": services.iso(t.last_used_at), "revoked": t.revoked} for t in rows]


@app.post("/api/auth/mcp-tokens")
async def create_token(payload: TokenIn, user: User = require("mcp:manage_own_tokens"),
                       session: AsyncSession = Depends(get_db)):
    row, raw = await security.create_mcp_token(session, user, payload.name)
    await audit.record(session, actor=user, action="mcp_token_created", entity_type="mcp_token", entity_id=row.id,
                       details={"name": row.name, "prefix": row.prefix})
    return {"id": row.id, "name": row.name, "prefix": row.prefix, "token": raw,
            "note": "Shown once. Stored only as a SHA-256 hash. Tools run with your role."}


@app.delete("/api/auth/mcp-tokens/{token_id}")
async def revoke_token(token_id: int, user: User = require("mcp:manage_own_tokens"),
                       session: AsyncSession = Depends(get_db)):
    row = await session.get(McpToken, token_id)
    if row is None or row.user_id != user.id:
        raise NotFound("Token not found")
    row.revoked = True
    await audit.record(session, actor=user, action="mcp_token_revoked", entity_type="mcp_token", entity_id=row.id)
    return {"ok": True}


# --------------------------------------------------------------------------- cases & documents
@app.get("/api/cases")
async def list_cases(search: str = "", filter_tab: str = "all", user: User = require("case:read"),
                     session: AsyncSession = Depends(get_db)):
    return await services.list_cases(session, user, search, filter_tab)


@app.get("/api/cases/{case_id}")
async def get_case(case_id: int, user: User = require("case:read"), session: AsyncSession = Depends(get_db)):
    return await services.get_case(session, user, case_id)


@app.get("/api/cases/{case_id}/missing")
async def missing_docs(case_id: int, user: User = require("case:read"), session: AsyncSession = Depends(get_db)):
    return await services.list_missing_documents(session, user, case_id)


@app.post("/api/cases/{case_id}/documents/{doc_id}/status")
async def doc_status(case_id: int, doc_id: int, payload: DocStatusIn, user: User = require("document:update_status"),
                     session: AsyncSession = Depends(get_db)):
    return await services.update_document_status(session, user, case_id, doc_id, payload.status, payload.reason)


@app.patch("/api/cases/{case_id}/note")
async def note(case_id: int, payload: NoteIn, user: User = require("case:note_edit"), session: AsyncSession = Depends(get_db)):
    return await services.update_note(session, user, case_id, payload.relationship_notes)


@app.post("/api/cases/{case_id}/analyst-request")
async def analyst_request(case_id: int, payload: AnalystRequestIn, user: User = require("analyst:request_from_rm"),
                          session: AsyncSession = Depends(get_db)):
    return await services.analyst_request(session, user, case_id, payload.document, payload.note)


@app.post("/api/cases/{case_id}/reset")
async def reset(case_id: int, user: User = require("case:demo_reset"), session: AsyncSession = Depends(get_db)):
    return await services.demo_reset(session, user, case_id)


@app.get("/api/cases/{case_id}/drafts")
async def drafts(case_id: int, user: User = require("draft:read"), session: AsyncSession = Depends(get_db)):
    return await services.list_drafts(session, user, case_id)


@app.post("/api/cases/{case_id}/draft/recheck")
async def recheck(case_id: int, payload: RecheckIn, user: User = require("draft:read"),
                  session: AsyncSession = Depends(get_db)):
    return await services.recheck_draft(session, user, case_id, payload.body)


@app.post("/api/cases/{case_id}/workflow/run")
async def run_workflow(case_id: int, payload: WorkflowIn, user: User = require("draft:create"),
                       session: AsyncSession = Depends(get_db)):
    result = await services.create_draft(user, case_id, tone=payload.tone,
                                         simulate_critic_rejection=payload.simulate_critic_rejection)
    return {**result, "case": await services.get_case(session, user, case_id)}


@app.get("/api/cases/{case_id}/workflow/stream")
async def stream_workflow(case_id: int, tone: str | None = None, simulate_critic_rejection: bool = False,
                          user: User = require("draft:create"), session: AsyncSession = Depends(get_db)):
    await services.load_case(session, user, case_id, "draft:create")
    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def emit(ev: dict) -> None:
        await queue.put(ev)

    async def runner() -> None:
        try:
            result = await services.create_draft(user, case_id, tone=tone or None,
                                                 simulate_critic_rejection=simulate_critic_rejection, emit=emit)
            async with AsyncSessionLocal() as s:
                case = await services.get_case(s, user, case_id)
            await queue.put({"type": "workflow_complete", "case": case, "task_id": result["task_id"],
                             "trace_id": result["trace_id"], "draft_id": result["draft_id"],
                             "attempts": result["attempts"], "critic_passed": result["critic_passed"],
                             "engine": result["engine"], "data_source": result["data_source"]})
        except Exception as exc:  # surfaced to the UI, no secrets in messages
            await queue.put({"type": "error", "message": str(exc)[:300]})
        finally:
            await queue.put(None)

    async def gen() -> AsyncGenerator[str, None]:
        task = asyncio.create_task(runner())
        try:
            while (item := await queue.get()) is not None:
                yield f"data: {json.dumps(item, default=str)}\n\n"
        finally:
            if not task.done():
                await task

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/cases/{case_id}/approve")
async def approve_latest(case_id: int, payload: ApproveIn, user: User = require("draft:approve_send"),
                         session: AsyncSession = Depends(get_db)):
    case = await services.get_case(session, user, case_id)
    if not case["pending_draft_id"]:
        raise ValueError("No draft is pending approval on this case — run the chaser first")
    return await services.approve_and_send(session, user, case["pending_draft_id"], payload.subject, payload.body)


@app.post("/api/drafts/{draft_id}/approve")
async def approve(draft_id: int, payload: ApproveIn, user: User = require("draft:approve_send"),
                  session: AsyncSession = Depends(get_db)):
    return await services.approve_and_send(session, user, draft_id, payload.subject, payload.body)


@app.post("/api/drafts/{draft_id}/discard")
async def discard(draft_id: int, payload: DiscardIn, user: User = require("draft:discard"),
                  session: AsyncSession = Depends(get_db)):
    return await services.discard_draft(session, user, draft_id, payload.reason)


@app.get("/api/actions")
async def actions(limit: int = Query(default=50, le=200), user: User = require("case:read"),
                  session: AsyncSession = Depends(get_db)):
    data = await services.list_cases(session, user)
    out = []
    for c in data["cases"]:
        out.extend((await services.get_case(session, user, c["id"]))["actions"])
    return sorted(out, key=lambda a: a["timestamp"] or "", reverse=True)[:limit]


# --------------------------------------------------------------------------- traces & costs
@app.get("/api/tasks")
async def tasks(case_id: int | None = None, user: User = require("trace:read"), session: AsyncSession = Depends(get_db)):
    return await services.list_tasks(session, user, case_id)


@app.get("/api/tasks/{task_id}/trace")
async def trace(task_id: int, user: User = require("trace:read"), session: AsyncSession = Depends(get_db)):
    return await services.get_trace(session, user, task_id)


@app.get("/api/costs/summary")
async def costs(user: User = require("cost:read"), session: AsyncSession = Depends(get_db)):
    return await services.cost_summary(session, user)


# --------------------------------------------------------------------------- agent workbench
def _check_agent(agent: str) -> None:
    if agent not in AGENTS:
        raise NotFound(f"Unknown agent '{agent}'")


def _validate_changes(changes: dict[str, Any]) -> dict[str, Any]:
    unknown = [k for k in changes if k not in EDITABLE_FIELDS]
    if unknown:
        raise ValueError(f"Not editable: {', '.join(unknown)}")
    for k in ("primary_model", "fallback_model"):
        if k in changes and changes[k] not in config.MODEL_PRICES:
            raise ValueError(f"{k} must be one of {sorted(config.MODEL_PRICES)} (models with a price on file)")
    if "tone" in changes and changes["tone"] not in TONES + ["n/a"]:
        raise ValueError(f"tone must be one of {TONES}")
    if "temperature" in changes and not 0 <= float(changes["temperature"]) <= 1:
        raise ValueError("temperature must be between 0 and 1")
    if "timeout_s" in changes and not 2 <= float(changes["timeout_s"]) <= 120:
        raise ValueError("timeout_s must be between 2 and 120")
    if "system_prompt" in changes and len(str(changes["system_prompt"]).strip()) < 20:
        raise ValueError("system_prompt is too short")
    return changes


@app.get("/api/agents")
async def agents(user: User = require("agent:read_config"), session: AsyncSession = Depends(get_db)):
    flag = await session.get(FeatureFlag, "ai_drafting")
    out = []
    for a, desc in AGENTS.items():
        s = await load_settings(session, a)
        out.append({"agent": a, "description": desc, "settings": s.as_dict()})
    from app.guardrails import FIXED_GUARDRAILS
    from app.llm_gateway import breakers_snapshot

    return {"agents": out, "ai_feature_flag": flag.enabled if flag else True, "fixed_guardrails": FIXED_GUARDRAILS,
            "models": sorted(config.MODEL_PRICES), "tones": TONES, "editable_fields": EDITABLE_FIELDS,
            "circuit_breakers": breakers_snapshot(), "live_mode": bool(config.google_api_key()),
            "your_field_rights": [f for f, roles in __import__("app.rbac", fromlist=["x"]).AGENT_FIELD_RIGHTS.items()
                                  if user.role in roles]}


@app.get("/api/agents/{agent}/versions")
async def versions(agent: str, user: User = require("agent:read_config"), session: AsyncSession = Depends(get_db)):
    _check_agent(agent)
    rows = (await session.execute(select(AgentConfigVersion).where(AgentConfigVersion.agent == agent)
                                  .order_by(AgentConfigVersion.version.desc()))).scalars()
    return [serialize_version(v) for v in rows]


@app.post("/api/agents/{agent}/config")
async def change_config(agent: str, payload: ConfigChangeIn, user: User = require("agent:edit_config"),
                        session: AsyncSession = Depends(get_db)):
    _check_agent(agent)
    authorize_fields(user, list(payload.changes))
    changes = _validate_changes(payload.changes)
    v = await append_version(session, agent, changes, user.display_name, payload.reason)
    await audit.record(session, actor=user, action="agent_config_changed", entity_type="agent", entity_id=agent,
                       reason=payload.reason, details={"version": v.version, "fields": sorted(changes)})
    return serialize_version(v)


@app.post("/api/agents/{agent}/restore")
async def restore(agent: str, payload: RestoreIn, user: User = require("agent:restore_version"),
                  session: AsyncSession = Depends(get_db)):
    _check_agent(agent)
    old = (await session.execute(select(AgentConfigVersion).where(
        AgentConfigVersion.agent == agent, AgentConfigVersion.version == payload.version))).scalar_one_or_none()
    if old is None:
        raise NotFound(f"Version {payload.version} not found")
    v = await append_version(session, agent, {f: getattr(old, f) for f in EDITABLE_FIELDS}, user.display_name,
                             payload.reason, restored_from=old.version)
    await audit.record(session, actor=user, action="agent_config_restored", entity_type="agent", entity_id=agent,
                       reason=payload.reason, details={"restored_from": old.version, "new_version": v.version})
    return serialize_version(v)


@app.post("/api/agents/{agent}/test")
async def test_run(agent: str, payload: TestRunIn, user: User = require("agent:test_run"),
                   session: AsyncSession = Depends(get_db)):
    """Try a candidate config on a SYNTHETIC case before saving. Nothing is persisted to any case."""
    _check_agent(agent)
    if agent != "drafter":
        raise ValueError("Test runs are available for the drafter (the critic runs inside every drafter test)")
    changes = _validate_changes(payload.changes)
    from app.agent_graph import SYNTHETIC_TEST_CASE, run_chase_workflow

    result = await run_chase_workflow(None, user, tone=payload.tone, overrides=changes, synthetic=SYNTHETIC_TEST_CASE,
                                      simulate_critic_rejection=payload.simulate_critic_rejection)
    await audit.record(session, actor=user, action="agent_test_run", entity_type="agent", entity_id=agent,
                       details={"task_id": result["task_id"], "fields_overridden": sorted(changes)})
    return result


@app.patch("/api/agents/{agent}/controls")
async def controls(agent: str, payload: ControlsIn, user: User = require("agent:control"),
                   session: AsyncSession = Depends(get_db)):
    _check_agent(agent)
    changes = {k: v for k, v in payload.model_dump().items() if k != "reason" and v is not None}
    if not changes:
        raise ValueError("Nothing to change")
    authorize_fields(user, list(changes))
    ctl = await session.get(AgentControl, agent)
    before = {k: getattr(ctl, k) for k in changes}
    for k, v in changes.items():
        setattr(ctl, k, v)
    await audit.record(session, actor=user, action="agent_controls_changed", entity_type="agent", entity_id=agent,
                       reason=payload.reason, details={"before": before, "after": changes})
    return (await load_settings(session, agent)).as_dict()


@app.patch("/api/feature-flags/ai_drafting")
async def feature_flag(payload: FlagIn, user: User = require("agent:control"), session: AsyncSession = Depends(get_db)):
    authorize_fields(user, ["ai_feature_flag"])
    flag = await session.get(FeatureFlag, "ai_drafting")
    if flag is None:
        flag = FeatureFlag(name="ai_drafting")
        session.add(flag)
    flag.enabled = payload.enabled
    await audit.record(session, actor=user, action="feature_flag_changed", entity_type="feature_flag",
                       entity_id="ai_drafting", reason=payload.reason, details={"enabled": payload.enabled})
    return {"name": "ai_drafting", "enabled": flag.enabled}


@app.post("/api/settings/reload-env")
async def reload_env(user: User = require("system:reload_env")):
    config.load_env_files()
    return await health()


# --------------------------------------------------------------------------- oversight & analytics
@app.get("/api/audit")
async def audit_log(limit: int = 200, case_id: int | None = None, user: User = require("audit:read"),
                    session: AsyncSession = Depends(get_db)):
    return await services.audit_log(session, user, limit, case_id)


@app.post("/api/audit/verify")
async def audit_verify(user: User = require("audit:verify"), session: AsyncSession = Depends(get_db)):
    result = await audit.verify_chain(session)
    await audit.record(session, actor=user, action="audit_chain_verified", entity_type="audit",
                       details={"valid": result["valid"], "events_checked": result["events_checked"]})
    return result


@app.get("/api/dashboard/metrics")
async def dashboard(user: User = require("analytics:read"), session: AsyncSession = Depends(get_db)):
    return await services.dashboard_metrics(session, user)


@app.get("/api/measure")
async def measure(user: User = require("measure:read"), session: AsyncSession = Depends(get_db)):
    return await services.measure(session, user)


# --------------------------------------------------------------------------- MCP over streamable HTTP
async def mcp_endpoint(scope, receive, send):
    """Require a valid MCP bearer token before any MCP traffic reaches the server."""
    if scope["type"] == "http":
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        auth = headers.get("authorization", "")
        raw = auth[7:].strip() if auth.lower().startswith("bearer ") else None
        async with AsyncSessionLocal() as s:
            user = await security.user_from_mcp_token(s, raw)
        if user is None:
            resp = JSONResponse({"detail": "Valid MCP bearer token required"}, status_code=401,
                                headers={"WWW-Authenticate": "Bearer"})
            await resp(scope, receive, send)
            return
        if scope.get("path", "") in ("/mcp", ""):
            scope = {**scope, "path": "/mcp/"}
    await _mcp_asgi(scope, receive, send)


class _McpPathFix:
    """Serve both /mcp and /mcp/ without a redirect."""

    def __init__(self, app_):
        self.app = app_

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path") == "/mcp":
            scope = {**scope, "path": "/mcp/", "raw_path": b"/mcp/"}
        await self.app(scope, receive, send)


app.mount("/mcp", mcp_endpoint)
app.add_middleware(_McpPathFix)


# --------------------------------------------------------------------------- static UI
def _find_analyst_assist_html() -> Path | None:
    return next((c for c in ANALYST_ASSIST_CANDIDATES if c.exists() and c.is_file()), None)


@app.get("/analystassist", include_in_schema=False)
@app.get("/analystassist/", include_in_schema=False)
async def serve_analyst_assist():
    target = _find_analyst_assist_html()
    if target:
        return FileResponse(target)
    raise HTTPException(status_code=404, detail="Analyst Assist prototype not found")


if FRONTEND_DIST_DIR.exists():
    if (FRONTEND_DIST_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (FRONTEND_DIST_DIR / full_path).resolve()
        if full_path and candidate.is_file() and FRONTEND_DIST_DIR.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST_DIR / "index.html")
