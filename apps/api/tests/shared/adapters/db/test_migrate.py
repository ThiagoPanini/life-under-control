"""Seam-2: `migrate_on_boot` stamps the legacy schema once, then is a no-op."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.shared.adapters.db.migrate import migrate_on_boot
from tests.support.postgres import DATABASE_URL, requires_postgres

__all__: list[str] = []


async def _current_revision(engine: AsyncEngine) -> str:
    async with engine.connect() as conn:
        result = await conn.execute(text("select version_num from alembic_version"))
        return result.scalar_one()


@requires_postgres
async def test_migrate_on_boot_twice_is_idempotent(pg_engine: AsyncEngine) -> None:
    assert DATABASE_URL is not None

    await migrate_on_boot(pg_engine, DATABASE_URL)
    first_revision = await _current_revision(pg_engine)

    await migrate_on_boot(pg_engine, DATABASE_URL)
    second_revision = await _current_revision(pg_engine)

    assert first_revision == "baseline"
    assert second_revision == first_revision
