"""SqlHouseholdRepo: Postgres/Core adapter for HouseholdRepo — Row<->Household mapping (Seam-2, F2)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.identity.domain.household import Household, User
from luc_api.shared.adapters.db.metadata import households, users

__all__ = ["SqlHouseholdRepo"]


class SqlHouseholdRepo:
    """`HouseholdRepo` over SQLAlchemy Core (async, psycopg3) — single-Household app (ADR-0002)."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Wraps the shared async engine."""
        self._engine = engine

    async def load_household(self) -> Household | None:
        """The Household with its Users, or `None` if there is no Household yet.

        One round-trip: an outer join against the (at most one) Household row,
        so a Household with zero Users still comes back instead of vanishing.
        """
        target_id = select(households.c.id).limit(1).scalar_subquery()
        stmt = (
            select(
                households.c.id.label("household_id"),
                households.c.nome.label("household_nome"),
                users.c.id.label("user_id"),
                users.c.nome.label("user_nome"),
                users.c.email,
                users.c.google_email,
                users.c.hue,
                users.c.inicial,
                users.c.avatar_key,
                users.c.whatsapp_phone,
            )
            .select_from(households.outerjoin(users, users.c.household_id == households.c.id))
            .where(households.c.id == target_id)
        )
        async with self._engine.connect() as conn:
            rows = (await conn.execute(stmt)).all()
        if not rows:
            return None
        first = rows[0]
        household_users = tuple(
            User(
                id=row.user_id,
                name=row.user_nome,
                email=row.email,
                google_email=row.google_email,
                hue=row.hue,
                initial=row.inicial,
                avatar_key=row.avatar_key,
                whatsapp_phone=row.whatsapp_phone,
                household_id=first.household_id,
            )
            for row in rows
            if row.user_id is not None
        )
        return Household(id=first.household_id, name=first.household_nome, users=household_users)
