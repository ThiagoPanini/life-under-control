"""SqlUserRepo: Postgres/Core adapter for UserRepo — Row<->User mapping (Seam-2, F2).

`get_by_google_email` relies on SQL's own `lower(NULL) = :x` -> `NULL` (never
true): an unlinked User (`google_email is null`) never matches, the same
guarantee the in-memory fake gives via its `is not None` guard.
"""

from typing import Any

from sqlalchemy import Row, Select, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.identity.application.user_repo import (
    GoogleEmailAlreadyLinkedError,
    WhatsappPhoneAlreadyLinkedError,
)
from luc_api.identity.domain.household import User
from luc_api.shared.adapters.db.metadata import users

__all__ = ["SqlUserRepo"]


class SqlUserRepo:
    """`UserRepo` over SQLAlchemy Core (async, psycopg3) — the anti-corruption layer."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Wraps the shared async engine."""
        self._engine = engine

    async def get_by_email(self, email: str) -> User | None:
        """Point-read by nominal email, case-insensitive."""
        stmt = select(users).where(func.lower(users.c.email) == email.lower())
        return await self._one_or_none(stmt)

    async def get_by_google_email(self, google_email: str) -> User | None:
        """Point-read by the linked Google email, case-insensitive."""
        stmt = select(users).where(func.lower(users.c.google_email) == google_email.lower())
        return await self._one_or_none(stmt)

    async def set_avatar_key(self, user_id: str, avatar_key: str) -> None:
        """Point-write the R2 avatar key mirrored from the Google photo."""
        stmt = update(users).where(users.c.id == user_id).values(avatar_key=avatar_key)
        async with self._engine.begin() as conn:
            await conn.execute(stmt)

    async def link_google_email(self, user_id: str, google_email: str) -> None:
        """Point-write the Google email link, normalized to lowercase.

        Raises:
            GoogleEmailAlreadyLinkedError: Another User won the race for this email.
        """
        normalized = google_email.lower()
        stmt = update(users).where(users.c.id == user_id).values(google_email=normalized)
        try:
            async with self._engine.begin() as conn:
                await conn.execute(stmt)
        except IntegrityError as exc:
            if "users_google_email_lower_unique" in str(exc.orig):
                raise GoogleEmailAlreadyLinkedError(normalized) from exc
            raise

    async def get_by_whatsapp_phone(self, whatsapp_phone: str) -> User | None:
        """Point-read by the linked WhatsApp phone (already E.164-normalized)."""
        stmt = select(users).where(users.c.whatsapp_phone == whatsapp_phone)
        return await self._one_or_none(stmt)

    async def link_whatsapp_phone(self, user_id: str, whatsapp_phone: str) -> None:
        """Point-write the WhatsApp phone link.

        Raises:
            WhatsappPhoneAlreadyLinkedError: Another User won the race for this phone.
        """
        stmt = update(users).where(users.c.id == user_id).values(whatsapp_phone=whatsapp_phone)
        try:
            async with self._engine.begin() as conn:
                await conn.execute(stmt)
        except IntegrityError as exc:
            if "users_whatsapp_phone_unique" in str(exc.orig):
                raise WhatsappPhoneAlreadyLinkedError(whatsapp_phone) from exc
            raise

    async def unlink_whatsapp_phone(self, user_id: str) -> None:
        """Point-write clears the WhatsApp phone link."""
        stmt = update(users).where(users.c.id == user_id).values(whatsapp_phone=None)
        async with self._engine.begin() as conn:
            await conn.execute(stmt)

    async def _one_or_none(self, stmt: Select[Any]) -> User | None:
        async with self._engine.connect() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_user(row) if row is not None else None


def _row_to_user(row: Row[Any]) -> User:
    """Translates a `users` row into a `User` — the read half of the mapping."""
    return User(
        id=row.id,
        name=row.nome,
        email=row.email,
        google_email=row.google_email,
        hue=row.hue,
        initial=row.inicial,
        avatar_key=row.avatar_key,
        whatsapp_phone=row.whatsapp_phone,
        household_id=row.household_id,
    )
