"""Async engine factory: turns `DATABASE_URL` into the psycopg3 SQLAlchemy engine."""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

__all__ = ["make_async_engine", "to_sqlalchemy_url"]


def to_sqlalchemy_url(database_url: str) -> str:
    """Rewrites `DATABASE_URL` to the `postgresql+psycopg` dialect SQLAlchemy expects.

    Args:
        database_url: The connection string as set in the environment
            (e.g. `postgres://user:pass@host/db`).

    Returns:
        The equivalent `postgresql+psycopg://` URL. The same URL works for both the
        sync engine (Alembic) and the async engine (the app) — psycopg3's SQLAlchemy
        dialect picks sync or async by which factory function builds the engine, not
        by the URL scheme.
    """
    if database_url.startswith("postgresql+psycopg://"):
        return database_url
    _, _, rest = database_url.partition("://")
    return f"postgresql+psycopg://{rest}"


def make_async_engine(database_url: str) -> AsyncEngine:
    """Builds the async engine every Core repo shares.

    Args:
        database_url: The connection string as set in the environment.

    Returns:
        The async engine (psycopg3).
    """
    return create_async_engine(to_sqlalchemy_url(database_url))
