"""SQLAlchemy 2.0 ORM models for ChaseUp (Northgate ChaseZero). Synthetic data only.

Note: there is deliberately NO risk-rating column anywhere in this schema (MLRO red line:
no system assigns or changes a risk rating).
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- people & auth
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class McpToken(Base):
    __tablename__ = "mcp_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class AppSecret(Base):
    __tablename__ = "app_secrets"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(256), nullable=False)


# --------------------------------------------------------------------------- cases
class KycCase(Base):
    __tablename__ = "kyc_cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Missing_Docs")
    days_open: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_contact_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    chase_round_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lei: Mapped[str] = mapped_column(String(64), default="")
    entity_type: Mapped[str] = mapped_column(String(128), default="")
    jurisdiction: Mapped[str] = mapped_column(String(128), default="")
    desk: Mapped[str] = mapped_column(String(128), default="")
    region: Mapped[str] = mapped_column(String(64), default="")
    address: Mapped[str] = mapped_column(String(255), default="")
    contact_name: Mapped[str] = mapped_column(String(128), default="")
    contact_role: Mapped[str] = mapped_column(String(128), default="")
    contact_email: Mapped[str] = mapped_column(String(255), default="")
    assigned_rm: Mapped[str] = mapped_column(String(128), default="")
    assigned_rm_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    facility_value: Mapped[str] = mapped_column(String(64), default="")
    relationship_notes: Mapped[str] = mapped_column(Text, default="")
    target_deadline_label: Mapped[str] = mapped_column(String(64), default="")
    stage: Mapped[str] = mapped_column(String(32), default="document_chase")

    # Latest draft cache (authoritative draft lifecycle lives in chase_drafts)
    current_draft_subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_draft_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    critic_passed: Mapped[bool] = mapped_column(Boolean, default=False)
    critic_score: Mapped[int] = mapped_column(Integer, default=0)
    critic_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    critic_checks_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    workflow_iterations: Mapped[int] = mapped_column(Integer, default=0)
    audit_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    documents: Mapped[list[MissingDocument]] = relationship(
        back_populates="kyc_case", cascade="all, delete-orphan", order_by="MissingDocument.id"
    )
    actions: Mapped[list[AgentAction]] = relationship(
        back_populates="kyc_case", cascade="all, delete-orphan", order_by="AgentAction.timestamp.desc()"
    )


class MissingDocument(Base):
    """A checklist item. States: Missing (requested) | Received | Waived. Overdue is derived.

    'Received' means a person in KYC Ops logged receipt. The system never decides whether a
    document is genuine.
    """

    __tablename__ = "missing_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("kyc_cases.id", ondelete="CASCADE"), nullable=False)
    document_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Missing")
    description: Mapped[str] = mapped_column(Text, default="")
    requirement_meta: Mapped[str] = mapped_column(String(128), default="")
    assigned_to_or_verifier: Mapped[str] = mapped_column(String(255), default="")
    doc_code: Mapped[str] = mapped_column(String(64), default="")
    category: Mapped[str] = mapped_column(String(64), default="")
    owner: Mapped[str] = mapped_column(String(16), default="client")  # client | internal
    chase_round: Mapped[int] = mapped_column(Integer, default=1)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    waived_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_changed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)

    kyc_case: Mapped[KycCase] = relationship(back_populates="documents")


class AgentAction(Base):
    """Human-readable case timeline (mirrors the hash-chained audit_events)."""

    __tablename__ = "agent_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("kyc_cases.id", ondelete="CASCADE"), nullable=False)
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    actor: Mapped[str] = mapped_column(String(128), default="")
    details: Mapped[str] = mapped_column(Text, default="")

    kyc_case: Mapped[KycCase] = relationship(back_populates="actions")


class ChaseDraft(Base):
    """Draft lifecycle: pending_approval -> approved_sent | discarded | superseded."""

    __tablename__ = "chase_drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("kyc_cases.id"), nullable=False)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("agent_tasks.id"), nullable=True)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    engine: Mapped[str] = mapped_column(String(64), default="template")  # llm | template | simulated
    status: Mapped[str] = mapped_column(String(32), default="pending_approval")
    validation_json: Mapped[str] = mapped_column(Text, default="[]")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    decided_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    edited_by_rm: Mapped[bool] = mapped_column(Boolean, default=False)


class OutboundMessage(Base):
    """Simulated mail-gateway outbox. Rows are only created by an RM approval."""

    __tablename__ = "outbound_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("kyc_cases.id"), nullable=False)
    draft_id: Mapped[int] = mapped_column(ForeignKey("chase_drafts.id"), nullable=False)
    to_address: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    approved_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    gateway: Mapped[str] = mapped_column(String(64), default="simulated-mail-gateway")


# --------------------------------------------------------------------------- audit
class AuditEvent(Base):
    """Append-only, SHA-256 hash-chained. UPDATE/DELETE blocked by SQLite triggers."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[str] = mapped_column(String(40), nullable=False)  # ISO-8601 UTC, part of the hash
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor: Mapped[str] = mapped_column(String(128), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), default="")
    entity_id: Mapped[str] = mapped_column(String(64), default="")
    case_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    via: Mapped[str] = mapped_column(String(16), default="ui")  # ui | api | mcp | system
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False)


# --------------------------------------------------------------------------- AI governance
class AgentConfigVersion(Base):
    """Append-only (trigger-enforced). Current config = highest version per agent."""

    __tablename__ = "agent_config_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent: Mapped[str] = mapped_column(String(32), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    tone: Mapped[str] = mapped_column(String(32), default="institutional")
    primary_model: Mapped[str] = mapped_column(String(64), nullable=False)
    fallback_model: Mapped[str] = mapped_column(String(64), nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.2)
    timeout_s: Mapped[float] = mapped_column(Float, default=20.0)
    created_by: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    restored_from_version: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AgentControl(Base):
    """Runtime switches per agent (kill switch, budget cap, outage drill). Changes audited."""

    __tablename__ = "agent_controls"

    agent: Mapped[str] = mapped_column(String(32), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    monthly_budget_usd: Mapped[float] = mapped_column(Float, default=25.0)
    simulate_primary_outage: Mapped[bool] = mapped_column(Boolean, default=False)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(Text, default="")


class AgentTask(Base):
    """One business task (a chase run, a UBO extraction, a prompt test) = many LLM calls."""

    __tablename__ = "agent_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)  # chase | ubo_extract | test_run
    trace_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    case_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    via: Mapped[str] = mapped_column(String(16), default="ui")
    status: Mapped[str] = mapped_column(String(32), default="running")
    outcome: Mapped[str] = mapped_column(String(32), default="pending")  # pending|approved|discarded|n/a
    data_source: Mapped[str] = mapped_column(String(16), default="")  # mcp | direct
    engine: Mapped[str] = mapped_column(String(32), default="")
    trace_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AgentRun(Base):
    """One row per LLM call attempt (including blocked / simulated / failed attempts)."""

    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("agent_tasks.id"), nullable=True)
    trace_id: Mapped[str] = mapped_column(String(40), nullable=False)
    agent: Mapped[str] = mapped_column(String(32), nullable=False)
    purpose: Mapped[str] = mapped_column(String(32), default="")
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    config_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    cost_inr: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    # success | fallback_success | error | timeout | circuit_open | blocked_budget |
    # blocked_rate_limit | disabled | simulated
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    is_fallback: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    via: Mapped[str] = mapped_column(String(16), default="ui")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


# --------------------------------------------------------------------------- measurement
class DocRequestHistory(Base):
    """Seeded synthetic history: days from document requested -> received (before vs after)."""

    __tablename__ = "doc_request_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period: Mapped[str] = mapped_column(String(16), nullable=False)  # baseline | pilot
    doc_type: Mapped[str] = mapped_column(String(64), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    chase_rounds: Mapped[int] = mapped_column(Integer, default=1)
