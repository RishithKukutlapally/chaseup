"""Single source of runtime configuration: model IDs, prices, FX, budgets, limits, secrets.

Every model ID and price used anywhere in ChaseUp is defined here (and nowhere else).
Values can be overridden from the root .env file; secrets are read from the environment
and are never returned by any API endpoint.
"""

from __future__ import annotations

import os
import secrets as _secrets
from dataclasses import dataclass

from dotenv import dotenv_values

from app.paths import APP_DIR, ENV_CANDIDATES


def load_env_files() -> str:
    """Load non-empty keys from .env files (APP_DIR/.env wins). Returns the winning path."""
    winning = ""
    for candidate in reversed(ENV_CANDIDATES):
        if candidate.exists():
            winning = str(candidate)
            for key, val in dotenv_values(candidate).items():
                if val is not None and val.strip() != "" and key not in _PINNED_KEYS:
                    os.environ[key] = val.strip().strip('"').strip("'")
    return winning or str(APP_DIR.parent / ".env")


# Variables already set in the real process environment (shell, Docker, tests) win over .env.
_PINNED_KEYS = set(os.environ)
ACTIVE_ENV_FILE = load_env_files()


def env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def google_api_key() -> str:
    """GOOGLE_API_KEY is canonical; GEMINI_API_KEY accepted as an alias."""
    if env("CHASEZERO_SIMULATE_ONLY") == "1":
        return ""
    return env("GOOGLE_API_KEY") or env("GEMINI_API_KEY")


def anthropic_api_key() -> str:
    if env("CHASEZERO_SIMULATE_ONLY") == "1":
        return ""
    return env("ANTHROPIC_API_KEY")


# ---------------------------------------------------------------------------------------
# Models — the ONE place model IDs live. Verified against the Gemini models.list endpoint
# on 2026-11-16 (gemini-2.5-flash-lite now returns 404 for new users, so it is not used).
# ---------------------------------------------------------------------------------------
GEMINI_PRIMARY_MODEL = env("GEMINI_MODEL", "gemini-3.1-flash-lite")
GEMINI_FALLBACK_MODEL = env("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite")
ANTHROPIC_FALLBACK_MODEL = env("ANTHROPIC_MODEL", "claude-haiku-5-5")


@dataclass(frozen=True)
class ModelPrice:
    provider: str
    input_per_m_usd: float
    output_per_m_usd: float
    source: str
    verified: bool  # False = could not be verified; Finance must confirm before use


# List prices per 1M tokens (standard tier, text). PLACEHOLDERS: confirm with Finance against
# the bank's negotiated contract before any budget decision is made on these numbers.
MODEL_PRICES: dict[str, ModelPrice] = {
    "gemini-3.1-flash-lite": ModelPrice(
        "google", 0.25, 1.50, "ai.google.dev/gemini-api/docs/pricing (checked 2026-11-16)", True
    ),
    "gemini-3.5-flash-lite": ModelPrice(
        "google", 0.30, 2.50, "ai.google.dev/gemini-api/docs/pricing (checked 2026-11-16)", True
    ),
    "claude-haiku-5-5": ModelPrice(
        "anthropic", 1.00, 5.00, "UNVERIFIED placeholder — confirm with Finance", False
    ),
}

# Placeholder FX rate for INR reporting. Finance to replace with the treasury month-end rate.
USD_TO_INR = float(env("USD_TO_INR", "88.0"))


def price_for(model: str) -> ModelPrice:
    return MODEL_PRICES.get(model) or ModelPrice("unknown", 0.0, 0.0, "no price on file", False)


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    p = price_for(model)
    return round(input_tokens / 1e6 * p.input_per_m_usd + output_tokens / 1e6 * p.output_per_m_usd, 8)


def fallback_model_for_primary() -> str:
    """Different provider if a second key exists, else a second Gemini model."""
    return ANTHROPIC_FALLBACK_MODEL if anthropic_api_key() else GEMINI_FALLBACK_MODEL


def provider_for(model: str) -> str:
    if model.startswith("claude"):
        return "anthropic"
    return "google"


def provider_key_present(provider: str) -> bool:
    return bool(anthropic_api_key() if provider == "anthropic" else google_api_key())


# ---------------------------------------------------------------------------------------
# Governance defaults (runtime-editable copies live in the DB: agent_controls).
# ---------------------------------------------------------------------------------------
DEFAULT_MONTHLY_BUDGET_USD = float(env("DEFAULT_MONTHLY_BUDGET_USD", "25.0"))
USER_HOURLY_LLM_CALL_LIMIT = int(env("USER_HOURLY_LLM_CALL_LIMIT", "60"))
DEFAULT_LLM_TIMEOUT_S = float(env("LLM_TIMEOUT_S", "20"))
CIRCUIT_BREAKER_FAILURES = int(env("CIRCUIT_BREAKER_FAILURES", "3"))
CIRCUIT_BREAKER_COOLDOWN_S = float(env("CIRCUIT_BREAKER_COOLDOWN_S", "60"))
AI_FEATURE_FLAG_DEFAULT = env("AI_FEATURE_ENABLED", "1") != "0"

# ---------------------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------------------
SESSION_COOKIE = "ng_session"
SESSION_TTL_HOURS = int(env("SESSION_TTL_HOURS", "10"))
COOKIE_SECURE = env("COOKIE_SECURE", "0") == "1"
LOGIN_MAX_FAILURES = int(env("LOGIN_MAX_FAILURES", "5"))
LOGIN_LOCK_MINUTES = int(env("LOGIN_LOCK_MINUTES", "15"))
PBKDF2_ITERATIONS = int(env("PBKDF2_ITERATIONS", "310000"))
CSRF_HEADER = "X-ChaseUp-Request"


def demo_password_template() -> str:
    """e.g. '{Name}@Suffix'. If missing, a random suffix is generated and persisted to .env."""
    tpl = env("DEMO_PASSWORD_TEMPLATE")
    if tpl and "{Name}" in tpl and "change-me" not in tpl.lower():
        return tpl
    tpl = "{Name}@" + _secrets.token_urlsafe(6)
    target = APP_DIR.parent / ".env"
    try:
        lines = target.read_text(encoding="utf-8").splitlines() if target.exists() else []
        lines = [ln for ln in lines if not ln.strip().startswith("DEMO_PASSWORD_TEMPLATE=")]
        target.write_text("\n".join([*lines, f"DEMO_PASSWORD_TEMPLATE={tpl}"]) + "\n", encoding="utf-8")
        print(f"[ChaseUp] DEMO_PASSWORD_TEMPLATE was not set; generated one and saved it to {target}")
    except OSError:
        print("[ChaseUp] DEMO_PASSWORD_TEMPLATE was not set and .env is not writable; using a session-only template")
    os.environ["DEMO_PASSWORD_TEMPLATE"] = tpl
    return tpl


SECURE_PORTAL_BASE = "https://portal.northgatebank.example/secure-upload/"
