from datetime import datetime
from pathlib import Path
from typing import Literal

import asyncio
import os
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import config
from database import initialize_database
from domain import (
    ConflictError,
    NotFoundError,
    analytics,
    approve_and_send,
    approve_draft,
    create_draft,
    get_case,
    list_queue,
    raise_handoff,
    record_document_event,
    schedule_draft,
    send_due_drafts,
    send_draft,
    update_draft,
)
from screen_markup import prepare_screen


ROOT = Path(__file__).resolve().parent
DESIGN = ROOT / "design"
TEMPLATES = ROOT / "templates"


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    scheduler = asyncio.create_task(_run_scheduled_sends())
    try:
        yield
    finally:
        scheduler.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler


async def _run_scheduled_sends() -> None:
    while True:
        send_due_drafts()
        await asyncio.sleep(5)


app = FastAPI(title="Northgate Chase", version="1.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


class DocumentEventRequest(BaseModel):
    action: Literal["request", "received", "waived"]
    actor: str = Field(min_length=1, max_length=100)
    reason: str | None = Field(default=None, max_length=500)


class DraftCreateRequest(BaseModel):
    actor: str = Field(default="Alistair Vance", min_length=1, max_length=100)
    body: str | None = Field(default=None, max_length=10000)


class DraftUpdateRequest(BaseModel):
    actor: str = Field(default="Alistair Vance", min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=10000)


class ApprovalRequest(BaseModel):
    approved_by: str = Field(min_length=1, max_length=100)


class ScheduleRequest(ApprovalRequest):
    scheduled_for: datetime


class HandoffRequest(BaseModel):
    actor: str = Field(default="Dev Patel", min_length=1, max_length=100)
    guidance: str = Field(min_length=1, max_length=5000)
    document_ids: list[str] = Field(min_length=1, max_length=20)


def _http_error(error: Exception) -> HTTPException:
    if isinstance(error, NotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, ConflictError):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, ValueError):
        return HTTPException(status_code=422, detail=str(error))
    raise error


def _template_body(case_id: str) -> str:
    case = get_case(case_id)
    outstanding = [
        document
        for document in case["documents"]
        if document["status"] in {"requested", "overdue"}
    ]
    document_lines = "\n".join(f"- {document['category']} (due {document['due_at']})" for document in outstanding)
    return (
        f"Dear Client,\n\n"
        f"We are continuing the onboarding for {case['client_name']}. "
        "Please provide the following outstanding documents:\n"
        f"{document_lines}\n\n"
        f"Please send these items by {case['next_follow_up'] or 'the agreed follow-up date'}. "
        f"If you have questions, please contact {case['rm_name']}.\n\n"
        "Kind regards,\n"
        f"{case['rm_name']}"
    )


@app.get("/api/health")
def health() -> dict:
    key_available = bool(os.environ.get("GEMINI_API_KEY"))
    ai_available = config.GEMINI_ENABLED and key_available
    return {
        "status": "ok",
        "ai_drafting_enabled": ai_available,
        "ai_message": None
        if ai_available
        else "AI drafting is disabled; template drafts are available.",
    }


@app.get("/api/queue")
def queue(
    search: str = "",
    status: str = "all",
    rm: str = "all",
    stage: str = "all",
    aging: str = "all",
    sort: str = "oldest",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
) -> dict:
    return list_queue(
        search=search,
        status=status,
        rm=rm,
        stage=stage,
        aging=aging,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@app.get("/api/cases/{case_id}")
def case_detail(case_id: str) -> dict:
    try:
        return get_case(case_id)
    except (NotFoundError, ConflictError, ValueError) as error:
        raise _http_error(error) from error


@app.post("/api/cases/{case_id}/documents/{document_id}/events")
def document_event(case_id: str, document_id: str, request: DocumentEventRequest) -> dict:
    try:
        return record_document_event(
            case_id,
            document_id,
            request.action,
            request.actor,
            request.reason,
        )
    except (NotFoundError, ConflictError, ValueError) as error:
        raise _http_error(error) from error


@app.post("/api/cases/{case_id}/drafts", status_code=201)
def create_case_draft(case_id: str, request: DraftCreateRequest) -> dict:
    try:
        body = request.body if request.body is not None else _template_body(case_id)
        return create_draft(case_id, request.actor, body)
    except (NotFoundError, ConflictError, ValueError) as error:
        raise _http_error(error) from error


@app.get("/api/cases/{case_id}/drafts/latest")
def latest_case_draft(case_id: str) -> dict:
    from database import connect

    with connect() as connection:
        case = connection.execute("SELECT id FROM cases WHERE id = ?", (case_id,)).fetchone()
        if case is None:
            raise HTTPException(status_code=404, detail="Case not found")
        draft = connection.execute(
            "SELECT * FROM drafts WHERE case_id = ? ORDER BY created_at DESC LIMIT 1",
            (case_id,),
        ).fetchone()
        if draft is None:
            raise HTTPException(status_code=404, detail="No draft exists for this case")
        return dict(draft)


@app.get("/api/drafts/{draft_id}")
def get_draft(draft_id: str) -> dict:
    from database import connect

    with connect() as connection:
        draft = connection.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
        if draft is None:
            raise HTTPException(status_code=404, detail="Draft not found")
        return dict(draft)


@app.put("/api/drafts/{draft_id}")
def edit_draft(draft_id: str, request: DraftUpdateRequest) -> dict:
    try:
        return update_draft(draft_id, request.actor, request.body)
    except (NotFoundError, ConflictError, ValueError) as error:
        raise _http_error(error) from error


@app.post("/api/drafts/{draft_id}/approve")
def approve_existing_draft(draft_id: str, request: ApprovalRequest) -> dict:
    try:
        return approve_draft(draft_id, request.approved_by)
    except (NotFoundError, ConflictError, ValueError) as error:
        raise _http_error(error) from error


@app.post("/api/drafts/{draft_id}/send")
def send_approved_draft(draft_id: str, request: ApprovalRequest) -> dict:
    try:
        return send_draft(draft_id, request.approved_by)
    except (NotFoundError, ConflictError, ValueError) as error:
        raise _http_error(error) from error


@app.post("/api/drafts/{draft_id}/approve-and-send")
def approve_and_send_draft(draft_id: str, request: ApprovalRequest) -> dict:
    try:
        return approve_and_send(draft_id, request.approved_by)
    except (NotFoundError, ConflictError, ValueError) as error:
        raise _http_error(error) from error


@app.post("/api/drafts/{draft_id}/schedule")
def schedule_existing_draft(draft_id: str, request: ScheduleRequest) -> dict:
    try:
        return schedule_draft(draft_id, request.approved_by, request.scheduled_for)
    except (NotFoundError, ConflictError, ValueError) as error:
        raise _http_error(error) from error


@app.post("/api/cases/{case_id}/handoffs", status_code=201)
def create_handoff(case_id: str, request: HandoffRequest) -> dict:
    try:
        return raise_handoff(
            case_id,
            request.actor,
            request.guidance,
            request.document_ids,
        )
    except (NotFoundError, ConflictError, ValueError) as error:
        raise _http_error(error) from error


@app.get("/api/analytics")
def stage_analytics() -> dict:
    return analytics()


@app.get("/")
def home():
    return RedirectResponse("/screens/chase-queue")


@app.get("/screens/{screen_name}")
def screen(screen_name: str):
    screen_files = {
        "chase-queue": DESIGN / "chase_queue_corporate_kyc_ops" / "code.html",
        "case-detail": DESIGN / "case_detail_helios_marine_ng_2026_8812" / "code.html",
        "stage-analytics": DESIGN / "stage_analytics_coo_pipeline_oversight" / "code.html",
        "analyst-handoff": DESIGN / "analyst_handoff_ubo_blocker_resolution" / "code.html",
        "reminder-composer": TEMPLATES / "reminder_composer.html",
    }
    screen_path = screen_files.get(screen_name)
    if screen_path is None:
        raise HTTPException(status_code=404, detail="Screen not found")
    if not screen_path.is_file():
        raise HTTPException(status_code=404, detail="Screen markup is unavailable")
    return HTMLResponse(prepare_screen(screen_name, screen_path.read_text(encoding="utf-8")))
