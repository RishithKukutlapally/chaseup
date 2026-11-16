"""Async SQLAlchemy engine, session factory, and append-only triggers."""

from collections.abc import AsyncGenerator

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.paths import DB_PATH

DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine.sync_engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record) -> None:  # pragma: no cover - trivial
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=30000")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


# Append-only enforcement at the database level: any UPDATE or DELETE aborts.
APPEND_ONLY_TABLES = ("audit_events", "agent_config_versions", "agent_runs")
_TRIGGERS = []
for _t in APPEND_ONLY_TABLES:
    _TRIGGERS.append(
        f"CREATE TRIGGER IF NOT EXISTS {_t}_no_update BEFORE UPDATE ON {_t} "
        f"BEGIN SELECT RAISE(ABORT, '{_t} is append-only'); END;"
    )
    _TRIGGERS.append(
        f"CREATE TRIGGER IF NOT EXISTS {_t}_no_delete BEFORE DELETE ON {_t} "
        f"BEGIN SELECT RAISE(ABORT, '{_t} is append-only'); END;"
    )


async def init_db() -> None:
    from app import models  # noqa: F401  (register tables)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _TRIGGERS:
            await conn.execute(text(stmt))
