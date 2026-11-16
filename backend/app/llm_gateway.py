"""The ONLY path to an LLM. Every attempt (real, simulated, blocked, failed) becomes an agent_runs row.

Order of controls per call:
  feature flag -> agent kill switch -> monthly budget cap -> per-user hourly rate limit
  -> primary model (timeout, circuit breaker, outage drill) -> fallback model -> caller's template.
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.agent_config import AgentSettings, ai_flag_enabled
from app.models import AgentRun, User
from app.trace import Trace

SimulateFn = Callable[[str, str], str]


class LlmBlocked(Exception):
    def __init__(self, status: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass
class LlmResult:
    text: str
    model: str
    provider: str
    simulated: bool
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int
    status: str
    is_fallback: bool
    run_ids: list[int] = field(default_factory=list)

    def parsed_json(self) -> Any:
        return parse_json_loose(self.text)


def parse_json_loose(text: str) -> Any:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


# --------------------------------------------------------------------------- circuit breaker
@dataclass
class _Breaker:
    failures: int = 0
    opened_at: float = 0.0


_BREAKERS: dict[str, _Breaker] = {}


def breaker_state(model: str) -> str:
    b = _BREAKERS.get(model)
    if not b or b.failures < config.CIRCUIT_BREAKER_FAILURES:
        return "closed"
    if time.time() - b.opened_at > config.CIRCUIT_BREAKER_COOLDOWN_S:
        return "half_open"
    return "open"


def _breaker_fail(model: str) -> None:
    b = _BREAKERS.setdefault(model, _Breaker())
    b.failures += 1
    if b.failures >= config.CIRCUIT_BREAKER_FAILURES:
        b.opened_at = time.time()


def _breaker_ok(model: str) -> None:
    _BREAKERS.pop(model, None)


def reset_breakers() -> None:
    _BREAKERS.clear()


def breakers_snapshot() -> dict[str, Any]:
    return {m: {"failures": b.failures, "state": breaker_state(m)} for m, b in _BREAKERS.items()}


# --------------------------------------------------------------------------- spend & limits
def month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def month_spend(session: AsyncSession, agent: str) -> float:
    q = select(func.coalesce(func.sum(AgentRun.cost_usd), 0.0)).where(
        AgentRun.agent == agent, AgentRun.created_at >= month_start()
    )
    if config.env("BUDGET_COUNTS_SIMULATED", "1") != "1":
        q = q.where(AgentRun.simulated.is_(False))
    return float(await session.scalar(q) or 0.0)


async def user_calls_last_hour(session: AsyncSession, user_id: int) -> int:
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    return int(
        await session.scalar(
            select(func.count(AgentRun.id)).where(
                AgentRun.user_id == user_id,
                AgentRun.created_at >= since,
                AgentRun.status.notin_(["blocked_budget", "blocked_rate_limit", "disabled"]),
            )
        )
        or 0
    )


def estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


# --------------------------------------------------------------------------- providers
async def _call_google(model: str, system: str, prompt: str, temperature: float, timeout_s: float, json_mode: bool):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=config.google_api_key())
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        response_mime_type="application/json" if json_mode else "text/plain",
        http_options=types.HttpOptions(timeout=int(timeout_s * 1000)),
    )
    resp = await asyncio.wait_for(client.aio.models.generate_content(model=model, contents=prompt, config=cfg), timeout_s)
    u = resp.usage_metadata
    out_tokens = (u.candidates_token_count or 0) + (u.thoughts_token_count or 0) if u else 0
    return (resp.text or ""), (u.prompt_token_count or 0) if u else 0, out_tokens


async def _call_anthropic(model: str, system: str, prompt: str, temperature: float, timeout_s: float, json_mode: bool):
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=config.anthropic_api_key(), timeout=timeout_s)
    resp = await asyncio.wait_for(
        client.messages.create(model=model, max_tokens=2048, system=system,
                               messages=[{"role": "user", "content": prompt}]),
        timeout_s,
    )
    text = "".join(getattr(b, "text", "") for b in resp.content)
    return text, resp.usage.input_tokens, resp.usage.output_tokens


async def _provider_call(model: str, system: str, prompt: str, temperature: float, timeout_s: float, json_mode: bool):
    if config.provider_for(model) == "anthropic":
        return await _call_anthropic(model, system, prompt, temperature, timeout_s, json_mode)
    return await _call_google(model, system, prompt, temperature, timeout_s, json_mode)


# --------------------------------------------------------------------------- the gateway
async def _record(session: AsyncSession, *, trace: Trace, task_id: int | None, s: AgentSettings, purpose: str,
                  model: str, status: str, user: User | None, via: str, simulated: bool = False,
                  is_fallback: bool = False, tin: int = 0, tout: int = 0, latency_ms: int = 0,
                  error: str | None = None) -> AgentRun:
    cost = config.cost_usd(model, tin, tout)
    run = AgentRun(
        task_id=task_id, trace_id=trace.trace_id, agent=s.agent, purpose=purpose,
        provider=config.provider_for(model), model=model, config_version=s.version,
        input_tokens=tin, output_tokens=tout, latency_ms=latency_ms, cost_usd=cost,
        cost_inr=round(cost * config.USD_TO_INR, 6), status=status, simulated=simulated,
        is_fallback=is_fallback, error=(error or None) and error[:500], user_id=user.id if user else None, via=via,
    )
    session.add(run)
    await session.commit()
    return run


async def call_llm(
    session: AsyncSession,
    *,
    settings: AgentSettings,
    purpose: str,
    system_prompt: str,
    user_prompt: str,
    trace: Trace,
    user: User | None,
    simulate: SimulateFn,
    task_id: int | None = None,
    via: str = "ui",
    json_mode: bool = True,
) -> LlmResult:
    """Run one logical LLM call with all governance controls. Raises LlmBlocked if no model may run."""
    s = settings
    if not await ai_flag_enabled(session):
        await _record(session, trace=trace, task_id=task_id, s=s, purpose=purpose, model=s.primary_model,
                      status="disabled", user=user, via=via, error="Global AI feature flag is off")
        await trace.step("control", "Global AI feature flag is OFF — using template", "warn")
        raise LlmBlocked("disabled", "Global AI feature flag is off")
    if not s.enabled:
        await _record(session, trace=trace, task_id=task_id, s=s, purpose=purpose, model=s.primary_model,
                      status="disabled", user=user, via=via, error=f"Agent '{s.agent}' kill switch is off")
        await trace.step("control", f"Kill switch: agent '{s.agent}' is OFF — using template", "warn")
        raise LlmBlocked("disabled", f"Agent '{s.agent}' is switched off")
    spent = await month_spend(session, s.agent)
    if spent >= s.monthly_budget_usd:
        await _record(session, trace=trace, task_id=task_id, s=s, purpose=purpose, model=s.primary_model,
                      status="blocked_budget", user=user, via=via,
                      error=f"Monthly budget ${s.monthly_budget_usd:.2f} reached (spent ${spent:.4f})")
        await trace.step("control", f"Budget cap reached: ${spent:.4f} of ${s.monthly_budget_usd:.2f} this month", "fail")
        raise LlmBlocked("blocked_budget", "Monthly budget cap reached for this agent")
    if user is not None:
        used = await user_calls_last_hour(session, user.id)
        if used >= config.USER_HOURLY_LLM_CALL_LIMIT:
            await _record(session, trace=trace, task_id=task_id, s=s, purpose=purpose, model=s.primary_model,
                          status="blocked_rate_limit", user=user, via=via,
                          error=f"{used} calls in the last hour (limit {config.USER_HOURLY_LLM_CALL_LIMIT})")
            await trace.step("control", f"Rate limit: {used}/{config.USER_HOURLY_LLM_CALL_LIMIT} calls this hour", "fail")
            raise LlmBlocked("blocked_rate_limit", "Hourly per-user LLM call limit reached")
    await trace.step("control", "Controls passed", "ok", budget_spent_usd=round(spent, 6),
                     budget_cap_usd=s.monthly_budget_usd, version=s.version)

    system = f"{system_prompt}\n\n{_guardrails_for(s.agent)}"
    await trace.step("prompt", f"Exact prompt sent ({purpose})", "info", system=system, user=user_prompt)

    run_ids: list[int] = []
    attempts = [(s.primary_model, False), (s.fallback_model, True)]
    for model, is_fb in attempts:
        provider = config.provider_for(model)
        if not is_fb and s.simulate_primary_outage:
            r = await _record(session, trace=trace, task_id=task_id, s=s, purpose=purpose, model=model, status="error",
                              user=user, via=via, error="Simulated primary outage (drill)")
            run_ids.append(r.id)
            await trace.step("model_call", f"{model}: simulated outage drill — failing over", "warn")
            continue
        if not config.provider_key_present(provider):
            # Simulated mode: deterministic local output, notional cost at list price.
            t0 = time.perf_counter()
            text = simulate(system, user_prompt)
            tin, tout = estimate_tokens(system + user_prompt), estimate_tokens(text)
            lat = int((time.perf_counter() - t0) * 1000)
            r = await _record(session, trace=trace, task_id=task_id, s=s, purpose=purpose, model=model,
                              status="simulated", user=user, via=via, simulated=True, is_fallback=is_fb,
                              tin=tin, tout=tout, latency_ms=lat)
            run_ids.append(r.id)
            await trace.step("model_call", f"{model} SIMULATED (no {provider} key) — tokens estimated", "warn",
                             model=model, input_tokens=tin, output_tokens=tout, latency_ms=lat, cost_usd=r.cost_usd,
                             simulated=True)
            return LlmResult(text, model, provider, True, tin, tout, r.cost_usd, lat, "simulated", is_fb, run_ids)
        if breaker_state(model) == "open":
            r = await _record(session, trace=trace, task_id=task_id, s=s, purpose=purpose, model=model,
                              status="circuit_open", user=user, via=via, error="Circuit breaker open")
            run_ids.append(r.id)
            await trace.step("model_call", f"{model}: circuit breaker OPEN — skipping", "warn")
            continue
        t0 = time.perf_counter()
        try:
            text, tin, tout = await _provider_call(model, system, user_prompt, s.temperature, s.timeout_s, json_mode)
            lat = int((time.perf_counter() - t0) * 1000)
            _breaker_ok(model)
            status = "fallback_success" if is_fb else "success"
            r = await _record(session, trace=trace, task_id=task_id, s=s, purpose=purpose, model=model, status=status,
                              user=user, via=via, is_fallback=is_fb, tin=tin, tout=tout, latency_ms=lat)
            run_ids.append(r.id)
            await trace.step("model_call", f"{model} ({'fallback' if is_fb else 'primary'}) responded", "ok",
                             model=model, input_tokens=tin, output_tokens=tout, latency_ms=lat, cost_usd=r.cost_usd)
            return LlmResult(text, model, provider, False, tin, tout, r.cost_usd, lat, status, is_fb, run_ids)
        except Exception as exc:  # timeout, HTTP error, quota ...
            lat = int((time.perf_counter() - t0) * 1000)
            _breaker_fail(model)
            status = "timeout" if isinstance(exc, (asyncio.TimeoutError, TimeoutError)) else "error"
            r = await _record(session, trace=trace, task_id=task_id, s=s, purpose=purpose, model=model, status=status,
                              user=user, via=via, is_fallback=is_fb, latency_ms=lat, error=_safe_err(exc))
            run_ids.append(r.id)
            await trace.step("model_call", f"{model} failed ({status}) after {lat} ms", "fail", error=_safe_err(exc))
    raise LlmBlocked("all_models_failed", "Primary and fallback models both failed")


def _guardrails_for(agent: str) -> str:
    from app.guardrails import FIXED_GUARDRAILS

    return FIXED_GUARDRAILS


def _safe_err(exc: Exception) -> str:
    """Error text with any API key scrubbed (never log or return keys)."""
    msg = f"{type(exc).__name__}: {exc}"
    for k in (config.google_api_key(), config.anthropic_api_key()):
        if k:
            msg = msg.replace(k, "***")
    return re.sub(r"(key=)[A-Za-z0-9_\-]+", r"\1***", msg)[:400]
