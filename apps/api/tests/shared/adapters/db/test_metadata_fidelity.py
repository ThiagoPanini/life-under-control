"""Seam-2: our `MetaData` mirrors the schema the 13 raw SQL migrations produce.

An `alembic revision --autogenerate` right after adopting a legacy-migrated
database must draft an EMPTY migration — any operation it proposes means the
`MetaData` was mirrored wrong (ADR-0014's F2 acceptance criterion).
"""

import os

from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Connection
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.shared.adapters.db.metadata import metadata
from tests.support.postgres import DATABASE_URL, requires_postgres

__all__: list[str] = []


def test_database_url_present_in_ci() -> None:
    """Guards against the env var silently disappearing from the CI job."""
    if os.environ.get("CI"):
        assert DATABASE_URL


def _diff_against_metadata(sync_conn: Connection) -> list[object]:
    context = MigrationContext.configure(sync_conn)
    return compare_metadata(context, metadata)


@requires_postgres
async def test_metadata_diff_against_legacy_schema_is_empty(pg_engine: AsyncEngine) -> None:
    async with pg_engine.connect() as conn:
        diff = await conn.run_sync(_diff_against_metadata)

    assert diff == []
