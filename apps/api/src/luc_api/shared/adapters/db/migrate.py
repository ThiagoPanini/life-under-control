"""Boot-time migration: advisory-lock-guarded `alembic upgrade head`.

Never issues `CREATE TABLE` — the 7 tables are `apps/web`'s to create (its
Drizzle migrations remain their DDL owner). This only adopts/advances the
Alembic-tracked schema on top of them. Safe under N replicas booting
together (the advisory lock serializes them; the loser waits and finds the
work already done) and safe to run twice in a row: `alembic upgrade head`
against an already-current database is a no-op — including the very first
run, which stamps and applies the empty `baseline` revision in one step.
"""

import asyncio

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.shared.adapters.db.engine import to_sqlalchemy_url

__all__ = ["load_config", "migrate_on_boot"]

_ADVISORY_LOCK_KEY = 7_411_001  # arbitrary, stable — unique to this app, no other meaning


def load_config(database_url: str) -> Config:
    """Builds the Alembic config, wiring the app's `DATABASE_URL` as the migration URL.

    Reads `alembic.ini` relative to the process's working directory — every documented
    `apps/api` command already runs from `apps/api` (see CLAUDE.md), so this holds for
    the boot process, `uv run alembic ...` and the pytest suite alike.

    Args:
        database_url: The connection string as set in the environment.

    Returns:
        The Alembic config, ready for `command.upgrade`/`command.stamp`.
    """
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", to_sqlalchemy_url(database_url))
    return config


async def migrate_on_boot(engine: AsyncEngine, database_url: str) -> None:
    """Runs `alembic upgrade head`, serialized across replicas by a Postgres advisory lock.

    Args:
        engine: The app's async engine — lends the connection that holds the lock.
        database_url: The connection string Alembic itself migrates with.
    """
    config = load_config(database_url)
    async with engine.connect() as conn:
        await conn.execute(text("select pg_advisory_lock(:key)"), {"key": _ADVISORY_LOCK_KEY})
        try:
            await asyncio.to_thread(command.upgrade, config, "head")
        finally:
            await conn.execute(text("select pg_advisory_unlock(:key)"), {"key": _ADVISORY_LOCK_KEY})
