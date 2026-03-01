"""Async SQLAlchemy database session and engine configuration."""

import logging
import subprocess

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.config import get_settings

logger = logging.getLogger(__name__)

_db_available = False


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for all ORM models."""

    pass


settings = get_settings()

# Swap postgresql:// for postgresql+asyncpg:// for async driver
_db_url = settings.database_url.replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(
    _db_url,
    echo=settings.debug,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Check DB connectivity and optionally run migrations."""
    global _db_available
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

        if settings.auto_migrate_on_startup:
            subprocess.run(
                ["alembic", "upgrade", "head"],
                check=True,
                capture_output=True,
                text=True,
            )
        _db_available = True
        logger.info("Database connected.")
    except Exception as exc:
        _db_available = False
        logger.warning(
            "Database unavailable — running in API-only mode. "
            "Project/circuit CRUD will not work. Error: %s",
            exc,
        )


async def close_db() -> None:
    """Dispose engine. Called during app shutdown."""
    try:
        await engine.dispose()
    except Exception:
        pass


def is_db_available() -> bool:
    """Check if the database connection was established."""
    return _db_available
