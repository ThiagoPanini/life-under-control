"""User write/point-read port (ADR-0003), with its in-memory test double.

Distinct from `HouseholdRepo` (which only loads the whole Household): serves
avatar mirroring and the resolution/persistence of the Google link (issue #94)
— the flows that need to find a User by identity and write point updates.
"""

from dataclasses import replace
from typing import Protocol

from luc_api.identity.domain.household import User
from luc_api.shared.domain.errors import ConflictError

__all__ = [
    "GoogleEmailAlreadyLinkedError",
    "InMemoryUserRepo",
    "UserRepo",
    "WhatsappPhoneAlreadyLinkedError",
]


class GoogleEmailAlreadyLinkedError(ConflictError):
    """Another User already has this Google email linked (unique-index race).

    The use-case's own pre-write check (`get_by_google_email`) already covers
    the common case; this is the port's guarantee for the race it can't see —
    two concurrent links losing to the same database constraint.
    """

    def __init__(self, google_email: str) -> None:
        """Record which email lost the race."""
        super().__init__(f"Google email {google_email} is already linked to another User")


class WhatsappPhoneAlreadyLinkedError(ConflictError):
    """Another User already has this WhatsApp phone linked (unique-index race)."""

    def __init__(self, whatsapp_phone: str) -> None:
        """Record which phone lost the race."""
        super().__init__(f"WhatsApp phone {whatsapp_phone} is already linked to another User")


class UserRepo(Protocol):
    """Port for point reads and writes over the Household Users."""

    async def get_by_email(self, email: str) -> User | None:
        """Find a User by the nominal (seeded) email, case-insensitive, or `None`."""
        ...

    async def get_by_google_email(self, google_email: str) -> User | None:
        """Find a User by the linked Google email, case-insensitive, or `None`."""
        ...

    async def set_avatar_key(self, user_id: str, avatar_key: str) -> None:
        """Persist the key of the already-mirrored avatar of a User."""
        ...

    async def link_google_email(self, user_id: str, google_email: str) -> None:
        """Persist the Google email link of a User (already normalized to lowercase).

        Raises:
            GoogleEmailAlreadyLinkedError: Another User won the race for this email.
        """
        ...

    async def get_by_whatsapp_phone(self, whatsapp_phone: str) -> User | None:
        """Find a User by the linked WhatsApp phone (E.164), or `None`."""
        ...

    async def link_whatsapp_phone(self, user_id: str, whatsapp_phone: str) -> None:
        """Persist the WhatsApp phone (E.164) link of a User.

        Raises:
            WhatsappPhoneAlreadyLinkedError: Another User won the race for this phone.
        """
        ...

    async def unlink_whatsapp_phone(self, user_id: str) -> None:
        """Remove the WhatsApp phone link of a User (back to `None`)."""
        ...


class InMemoryUserRepo:
    """Deterministic `UserRepo` double for tests: a dict keyed by User id."""

    def __init__(self, seed: list[User] | None = None) -> None:
        """Seed the store with the given Users."""
        self._store: dict[str, User] = {user.id: user for user in (seed or [])}

    async def get_by_email(self, email: str) -> User | None:
        """Find a User by the nominal (seeded) email, case-insensitive, or `None`."""
        target = email.lower()
        return next(
            (user for user in self._store.values() if user.email.lower() == target),
            None,
        )

    async def get_by_google_email(self, google_email: str) -> User | None:
        """Find a User by the linked Google email, case-insensitive, or `None`."""
        # The None-guard mirrors the oracle fake's optional chaining: an
        # unlinked User must never match, not even an empty-string lookup.
        target = google_email.lower()
        return next(
            (
                user
                for user in self._store.values()
                if user.google_email is not None and user.google_email.lower() == target
            ),
            None,
        )

    async def set_avatar_key(self, user_id: str, avatar_key: str) -> None:
        """Persist the key of the already-mirrored avatar of a User."""
        user = self._store.get(user_id)
        if user is None:
            return
        self._store[user_id] = replace(user, avatar_key=avatar_key)

    async def link_google_email(self, user_id: str, google_email: str) -> None:
        """Persist the Google email link of a User (already normalized to lowercase)."""
        user = self._store.get(user_id)
        if user is None:
            return
        self._store[user_id] = replace(user, google_email=google_email.lower())

    async def get_by_whatsapp_phone(self, whatsapp_phone: str) -> User | None:
        """Find a User by the linked WhatsApp phone (E.164), or `None`."""
        return next(
            (user for user in self._store.values() if user.whatsapp_phone == whatsapp_phone),
            None,
        )

    async def link_whatsapp_phone(self, user_id: str, whatsapp_phone: str) -> None:
        """Persist the WhatsApp phone (E.164) link of a User."""
        user = self._store.get(user_id)
        if user is None:
            return
        self._store[user_id] = replace(user, whatsapp_phone=whatsapp_phone)

    async def unlink_whatsapp_phone(self, user_id: str) -> None:
        """Remove the WhatsApp phone link of a User (back to `None`)."""
        user = self._store.get(user_id)
        if user is None:
            return
        self._store[user_id] = replace(user, whatsapp_phone=None)
