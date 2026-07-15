"""Household (Lar) domain — pure core, ADR-0003.

A Household has exactly 2 Users (Pessoas) with symmetric access to the same
data (CONTEXT.md #1, #2). Only facts and pure derivations live here; no
Drizzle-era store, HTTP or framework.
"""

from dataclasses import dataclass
from typing import NamedTuple

from luc_api.shared.domain.errors import NotFoundError

__all__ = [
    "Household",
    "User",
    "UserColors",
    "UserNotInHouseholdError",
    "avatar_key",
    "user_colors",
]


@dataclass(frozen=True)
class User:
    """User (Pessoa) of the Household — identity and authorship, never authorization."""

    id: str
    name: str
    email: str
    """Nominal Household email (seed). NOT the authentication key — see `google_email`."""
    google_email: str | None
    """Linked Google email (issue #94), the authentication/authorship key.

    `None` while the auditable link (ADR-0004: allowlisted email) has not been
    applied. Kept apart from `email` on purpose: the seed is fictional; only the
    `google_email` matches the real session. Never infer the User by position in
    the allowlist (ADR-0002).
    """
    hue: int
    """HSL hue (0-359) identifying the User in the UI. Persisted."""
    initial: str
    """Display letter (e.g. "T", "J")."""
    avatar_key: str | None
    """Avatar key in the R2 bucket (Google photo mirrored on login); `None` without photo."""
    whatsapp_phone: str | None = None
    """Linked WhatsApp number (E.164, issue #152) — the ingestion-edge allowlist (ADR-0012)."""
    household_id: str | None = None
    """The Household the User belongs to (scope of every datum, CONTEXT.md #1)."""


@dataclass(frozen=True)
class Household:
    """Household (Lar): the unit that owns all data, with symmetric access (ADR-0002)."""

    id: str
    name: str
    users: tuple[User, ...]


class UserNotInHouseholdError(NotFoundError):
    """The target User does not belong to the given Household — invariant shared by every link (Google, WhatsApp)."""

    def __init__(self, user_id: str) -> None:
        """Record which User failed the Household membership check."""
        super().__init__(f"User {user_id} does not belong to the Household")


class UserColors(NamedTuple):
    """Color pair (text/background) of a User, derived from the hue in the design-system pattern."""

    fg: str
    bg: str


def user_colors(hue: int) -> UserColors:
    """Derive the User colors from the hue (fact -> interpretation)."""
    return UserColors(
        fg=f"hsl({hue} 76% 74%)",
        bg=f"hsl({hue} 44% 23%)",
    )


def avatar_key(user_id: str) -> str:
    """Derive the avatar key of a User in the R2 bucket: `identity/users/{id}/avatar`.

    Namespace `identity` (not an Area, ADR-0006): the User is cross-Area identity.
    One fixed key per User — re-uploading overwrites (idempotent, same pattern as
    the receipt key).
    """
    return f"identity/users/{user_id}/avatar"
