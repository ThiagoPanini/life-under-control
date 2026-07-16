"""Sign-in gate (ADR-0004): decides whether a post-OAuth email may enter.

Raises when the allowlist does not have exactly 2 unique emails — the caller
(the sign-in callback at the edge) fails closed.
"""

from luc_api.identity.domain.access import email_in_allowlist, parse_allowlist
from luc_api.shared.domain.errors import ValidationError

__all__ = ["HOUSEHOLD_USER_COUNT", "InvalidAllowlistError", "can_sign_in"]

HOUSEHOLD_USER_COUNT = 2
"""A Household has exactly 2 Users (CONTEXT.md #2) — the allowlist must match."""


class InvalidAllowlistError(ValidationError):
    """The Household allowlist must have exactly 2 unique emails (invariant: 2 Users)."""

    def __init__(self, count: int) -> None:
        """Record how many unique emails the allowlist actually had."""
        super().__init__(f"The allowlist must have exactly 2 unique emails; found {count}")


def can_sign_in(email: str | None, raw_allowlist: str | None) -> bool:
    """Decide whether the email may sign in, failing closed on a bad allowlist."""
    allowlist = parse_allowlist(raw_allowlist)
    if len(allowlist) != HOUSEHOLD_USER_COUNT:
        raise InvalidAllowlistError(len(allowlist))
    return email_in_allowlist(email, allowlist)
