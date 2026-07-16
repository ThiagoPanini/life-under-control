"""Seam-2 support: real Postgres, gated by `DATABASE_URL` (CI-only).

Mirrors `apps/web`'s own Seam-2 convention (`*.drizzle.test.ts` against a real
Postgres in CI): the suite skips locally without `DATABASE_URL` and only runs
where CI's `postgres:16-alpine` service is up. The 13 raw SQL migrations that
predate `apps/api` are replayed once per session to stand up the legacy
schema — applying them twice would collide (`relation already exists`), so
the replay is itself idempotent (skipped when `households` already exists),
same lesson the Drizzle Seam-2 suite learned about fixed test identity: every
test here must mint fresh ids, never reuse a literal UUID across runs.
"""

import os
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import insert, text
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.shared.adapters.db.engine import make_async_engine
from luc_api.shared.adapters.db.metadata import households, users

__all__ = ["DATABASE_URL", "create_household", "create_user", "pg_engine", "requires_postgres"]

DATABASE_URL = os.environ.get("DATABASE_URL")

requires_postgres = pytest.mark.skipif(
    not DATABASE_URL, reason="DATABASE_URL not set; Seam-2 runs against Postgres real only in CI"
)


def _legacy_sql_statements() -> list[str]:
    """Splits the 13 raw SQL migrations `apps/web/drizzle` already applied in prod."""
    drizzle_dir = Path(__file__).resolve().parents[3] / "web" / "drizzle"
    files = sorted(p for p in drizzle_dir.glob("*.sql") if p.stem != "seed")
    statements: list[str] = []
    for sql_file in files:
        for chunk in sql_file.read_text().split("--> statement-breakpoint"):
            stripped = chunk.strip()
            if stripped:
                statements.append(stripped)
    return statements


async def _ensure_legacy_schema(engine: AsyncEngine) -> None:
    """Applies the 13 raw SQL migrations once; a no-op if they already ran."""
    async with engine.begin() as conn:
        already_present = await conn.scalar(text("select to_regclass('public.households')"))
        if already_present is not None:
            return
        for statement in _legacy_sql_statements():
            await conn.execute(text(statement))


@pytest.fixture(scope="session")
async def pg_engine() -> AsyncIterator[AsyncEngine]:
    """The shared async engine, with the legacy 7-table schema already in place."""
    assert DATABASE_URL is not None
    engine = make_async_engine(DATABASE_URL)
    await _ensure_legacy_schema(engine)
    yield engine
    await engine.dispose()


async def create_household(engine: AsyncEngine, **overrides: object) -> str:
    """Inserts a fresh Household (random id) for a test to scope its rows under."""
    values: dict[str, object] = {"nome": f"Lar de teste {uuid4()}"} | overrides
    async with engine.begin() as conn:
        row = (
            await conn.execute(insert(households).values(**values).returning(households.c.id))
        ).one()
    return row.id


async def create_user(engine: AsyncEngine, household_id: str, **overrides: object) -> str:
    """Inserts a fresh User (random id) under the given Household."""
    values: dict[str, object] = {
        "household_id": household_id,
        "email": f"{uuid4()}@example.com",
        "nome": "Pessoa de teste",
        "hue": 180,
        "inicial": "T",
    } | overrides
    async with engine.begin() as conn:
        row = (await conn.execute(insert(users).values(**values).returning(users.c.id))).one()
    return row.id
