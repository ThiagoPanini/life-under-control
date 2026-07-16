"""Truncates the Household-bearing tables before each test in this directory.

`SqlHouseholdRepo.load_household` does `LIMIT 1` (ADR-0002: exactly one
Household ever) — deterministic only when the table holds exactly what a
given test put there. Safe against the shared session-scoped `pg_engine`:
every other Seam-2 suite (finance) creates its own Household/User rows per
test and never depends on rows surviving from elsewhere, so wiping the table
here never breaks a test that runs before or after this directory's.

Gated on `CI` (not just `DATABASE_URL`): `DATABASE_URL` is known to leak into
local shells pointed at a real, shared Postgres (see the project's own
"dev-local-500-por-database-url-de-prod" history) — a plain `requires_postgres`
skip-if-unset guard would still truncate that database. `CI` is set by
GitHub Actions and essentially never present in a developer's shell, so it is
the safe discriminator: skip rather than truncate when it's absent.
"""

import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

__all__: list[str] = []


@pytest.fixture(autouse=True)
async def isolated_household(pg_engine: AsyncEngine) -> None:
    """Wipes the Household-bearing tables so `LIMIT 1` sees only this test's rows."""
    if not os.environ.get("CI"):
        pytest.skip("destructive truncate only runs in CI (see module docstring)")
    async with pg_engine.begin() as conn:
        await conn.execute(text("truncate households cascade"))
