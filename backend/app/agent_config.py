"""Versioned agent configuration (append-only) and runtime controls."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.models import AgentConfigVersion, AgentControl, FeatureFlag

AGENTS = {
    "drafter": "Chase drafter — writes the client reminder listing every missing document",
    "critic": "Critic — second-opinion review of the draft before it reaches the RM",
}

DEFAULT_PROMPTS = {
    "drafter": (
        "You are the Northgate Corporate Bank document-chase assistant. Write ONE short, polite email "
        "from the named Relationship Manager to the client contact. List EVERY missing document exactly "
        "as named, as a numbered list, ask for all of them in a single upload, state the deadline, and "
        "include the secure portal link. Sign off with the RM's name. Plain text only. "
        "Return JSON: {\"subject\": str, \"body\": str}."
    ),
    "critic": (
        "You review a draft client email for a corporate bank. Check that it lists every required document, "
        "states the deadline, is signed by the named RM, is polite, and makes no promises, waivers, amounts, "
        "risk or credit statements, phone numbers or extra links. Return JSON: "
        "{\"approve\": bool, \"issues\": [str]}."
    ),
}

DEFAULT_TONE = {"drafter": "institutional", "critic": "n/a"}
DEFAULT_TEMPERATURE = {"drafter": 0.3, "critic": 0.0}
TONES = ["institutional", "casual", "urgent"]
EDITABLE_FIELDS = ["system_prompt", "tone", "primary_model", "fallback_model", "temperature", "timeout_s"]


@dataclass
class AgentSettings:
    agent: str
    version: int
    system_prompt: str
    tone: str
    primary_model: str
    fallback_model: str
    temperature: float
    timeout_s: float
    enabled: bool
    monthly_budget_usd: float
    simulate_primary_outage: bool

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


async def ensure_defaults(session: AsyncSession) -> None:
    for agent in AGENTS:
        exists = await session.scalar(select(func.count()).where(AgentConfigVersion.agent == agent))
        if not exists:
            session.add(
                AgentConfigVersion(
                    agent=agent,
                    version=1,
                    system_prompt=DEFAULT_PROMPTS[agent],
                    tone=DEFAULT_TONE[agent],
                    primary_model=config.GEMINI_PRIMARY_MODEL,
                    fallback_model=config.fallback_model_for_primary(),
                    temperature=DEFAULT_TEMPERATURE[agent],
                    timeout_s=config.DEFAULT_LLM_TIMEOUT_S,
                    created_by="ChaseUp System (seed)",
                    reason="Initial configuration",
                )
            )
        if await session.get(AgentControl, agent) is None:
            session.add(AgentControl(agent=agent, enabled=True, monthly_budget_usd=config.DEFAULT_MONTHLY_BUDGET_USD))
    if await session.get(FeatureFlag, "ai_drafting") is None:
        session.add(FeatureFlag(name="ai_drafting", enabled=config.AI_FEATURE_FLAG_DEFAULT,
                                description="Global AI feature flag. Off = every agent uses deterministic templates."))
    await session.commit()


async def current_version(session: AsyncSession, agent: str) -> AgentConfigVersion:
    row = (
        await session.execute(
            select(AgentConfigVersion).where(AgentConfigVersion.agent == agent).order_by(AgentConfigVersion.version.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        await ensure_defaults(session)
        return await current_version(session, agent)
    return row


async def load_settings(session: AsyncSession, agent: str, override: dict[str, Any] | None = None) -> AgentSettings:
    """Read the latest version fresh from the DB on every call -> edits apply on the very next call."""
    v = await current_version(session, agent)
    ctl = await session.get(AgentControl, agent)
    s = AgentSettings(
        agent=agent,
        version=v.version,
        system_prompt=v.system_prompt,
        tone=v.tone,
        primary_model=v.primary_model,
        fallback_model=v.fallback_model,
        temperature=v.temperature,
        timeout_s=v.timeout_s,
        enabled=ctl.enabled if ctl else True,
        monthly_budget_usd=ctl.monthly_budget_usd if ctl else config.DEFAULT_MONTHLY_BUDGET_USD,
        simulate_primary_outage=ctl.simulate_primary_outage if ctl else False,
    )
    for k, val in (override or {}).items():
        if k in EDITABLE_FIELDS and val is not None:
            setattr(s, k, val)
    return s


async def ai_flag_enabled(session: AsyncSession) -> bool:
    flag = await session.get(FeatureFlag, "ai_drafting")
    return bool(flag.enabled) if flag else True


async def append_version(session: AsyncSession, agent: str, changes: dict[str, Any], actor_name: str, reason: str,
                         restored_from: int | None = None) -> AgentConfigVersion:
    cur = await current_version(session, agent)
    data = {f: getattr(cur, f) for f in EDITABLE_FIELDS}
    data.update({k: v for k, v in changes.items() if k in EDITABLE_FIELDS and v is not None})
    row = AgentConfigVersion(agent=agent, version=cur.version + 1, created_by=actor_name, reason=reason,
                             restored_from_version=restored_from, **data)
    session.add(row)
    await session.flush()
    return row


def serialize_version(v: AgentConfigVersion) -> dict[str, Any]:
    return {
        "id": v.id, "agent": v.agent, "version": v.version, "system_prompt": v.system_prompt, "tone": v.tone,
        "primary_model": v.primary_model, "fallback_model": v.fallback_model, "temperature": v.temperature,
        "timeout_s": v.timeout_s, "created_by": v.created_by, "created_at": v.created_at.isoformat() if v.created_at else None,
        "reason": v.reason, "restored_from_version": v.restored_from_version,
    }
