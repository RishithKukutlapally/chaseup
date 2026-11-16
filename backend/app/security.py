"""Password hashing (PBKDF2), signed session cookies, login throttling, MCP tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.models import AppSecret, McpToken, User, UserSession


# --------------------------------------------------------------------------- passwords
def hash_password(password: str, iterations: int | None = None) -> str:
    iterations = iterations or config.PBKDF2_ITERATIONS
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_b64, dk_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(iters))
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except Exception:
        return False


def demo_password_for(display_name: str) -> str:
    first = display_name.split()[0]
    return config.demo_password_template().replace("{Name}", first).replace("{name}", first.lower())


# --------------------------------------------------------------------------- session signing
_SECRET_CACHE: dict[str, bytes] = {}


async def session_secret(session: AsyncSession) -> bytes:
    if "session" in _SECRET_CACHE:
        return _SECRET_CACHE["session"]
    env_secret = config.env("SESSION_SECRET")
    if env_secret:
        _SECRET_CACHE["session"] = env_secret.encode()
        return _SECRET_CACHE["session"]
    row = await session.get(AppSecret, "session_signing_key")
    if row is None:
        row = AppSecret(name="session_signing_key", value=secrets.token_hex(32))
        session.add(row)
        await session.commit()
    _SECRET_CACHE["session"] = row.value.encode()
    return _SECRET_CACHE["session"]


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _sign(secret: bytes, token: str) -> str:
    return hmac.new(secret, token.encode(), hashlib.sha256).hexdigest()[:32]


async def create_session(session: AsyncSession, user: User) -> str:
    token = secrets.token_urlsafe(32)
    session.add(
        UserSession(
            user_id=user.id,
            token_hash=_sha(token),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=config.SESSION_TTL_HOURS),
        )
    )
    await session.commit()
    return f"{token}.{_sign(await session_secret(session), token)}"


async def user_from_cookie(session: AsyncSession, cookie: str | None) -> User | None:
    if not cookie or "." not in cookie:
        return None
    token, sig = cookie.rsplit(".", 1)
    if not hmac.compare_digest(sig, _sign(await session_secret(session), token)):
        return None
    row = (await session.execute(select(UserSession).where(UserSession.token_hash == _sha(token)))).scalar_one_or_none()
    if row is None or row.revoked:
        return None
    exp = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        return None
    user = await session.get(User, row.user_id)
    return user if user and user.active else None


async def revoke_session(session: AsyncSession, cookie: str | None) -> None:
    if not cookie or "." not in cookie:
        return
    token = cookie.rsplit(".", 1)[0]
    row = (await session.execute(select(UserSession).where(UserSession.token_hash == _sha(token)))).scalar_one_or_none()
    if row:
        row.revoked = True
        await session.commit()


# --------------------------------------------------------------------------- login throttling
@dataclass
class _Attempts:
    failures: list[float]
    locked_until: float = 0.0


_ATTEMPTS: dict[str, _Attempts] = {}


def throttle_key(username: str, ip: str) -> str:
    return f"{username.lower()}|{ip}"


def is_locked(key: str) -> float:
    """Seconds remaining on a lock (0 if not locked)."""
    a = _ATTEMPTS.get(key)
    if a and a.locked_until > time.time():
        return a.locked_until - time.time()
    return 0.0


def record_failure(key: str) -> None:
    now = time.time()
    a = _ATTEMPTS.setdefault(key, _Attempts(failures=[]))
    window = config.LOGIN_LOCK_MINUTES * 60
    a.failures = [t for t in a.failures if now - t < window] + [now]
    if len(a.failures) >= config.LOGIN_MAX_FAILURES:
        a.locked_until = now + window
        a.failures = []


def record_success(key: str) -> None:
    _ATTEMPTS.pop(key, None)


def reset_throttle() -> None:
    _ATTEMPTS.clear()


# --------------------------------------------------------------------------- MCP tokens
MCP_TOKEN_PREFIX = "ngmcp_"


async def create_mcp_token(session: AsyncSession, user: User, name: str) -> tuple[McpToken, str]:
    raw = MCP_TOKEN_PREFIX + secrets.token_urlsafe(32)
    row = McpToken(user_id=user.id, name=name[:128] or "MCP client", token_hash=_sha(raw), prefix=raw[:12])
    session.add(row)
    await session.flush()
    return row, raw


async def user_from_mcp_token(session: AsyncSession, raw: str | None) -> User | None:
    if not raw or not raw.startswith(MCP_TOKEN_PREFIX):
        return None
    row = (await session.execute(select(McpToken).where(McpToken.token_hash == _sha(raw)))).scalar_one_or_none()
    if row is None or row.revoked:
        return None
    row.last_used_at = datetime.now(timezone.utc)
    await session.commit()
    user = await session.get(User, row.user_id)
    return user if user and user.active else None
