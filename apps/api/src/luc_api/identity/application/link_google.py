"""Google link operation (Vínculo, issue #94): User <-> Google email.

Transactional in intent: validates EVERYTHING before writing, so no
half-linked data is left behind. Rules, in order:

1. The email must be in the Household allowlist (ADR-0004).
2. The target User must belong to the Household.
3. The email must not be linked to another User (conflict).

Idempotent: relinking the same email to the same User succeeds. The email is
normalized to lowercase before every check and write. This operation RAISES
(unlike the resolution, which degrades): it is an explicit write, not a read
edge. The real email does NOT live in repo/fixtures/logs (ADR-0007): this is
the mechanism; the production application is the auditable runbook (#96).
"""

from collections.abc import Sequence

from luc_api.identity.application.user_repo import UserRepo
from luc_api.identity.domain.access import email_in_allowlist, parse_allowlist
from luc_api.identity.domain.household import User, UserNotInHouseholdError
from luc_api.shared.domain.errors import ConflictError, ValidationError

__all__ = ["EmailNotInAllowlistError", "LinkConflictError", "link_google"]


class EmailNotInAllowlistError(ValidationError):
    """The Google email is not in the Household allowlist."""

    def __init__(self, email: str) -> None:
        """Record which email failed the allowlist check."""
        super().__init__(f"Email {email} is not in the Household allowlist")


class LinkConflictError(ConflictError):
    """The Google email is already linked to another User."""

    def __init__(self, email: str) -> None:
        """Record which email is in conflict."""
        super().__init__(f"Email {email} is already linked to another User")


async def link_google(
    user_repo: UserRepo,
    users: Sequence[User],
    user_id: str,
    google_email: str,
    raw_allowlist: str | None,
) -> None:
    """Link the Google email to the Household User, validating before writing."""
    email = google_email.strip().lower()

    allowlist = parse_allowlist(raw_allowlist)
    if not email_in_allowlist(email, allowlist):
        raise EmailNotInAllowlistError(email)

    if not any(user.id == user_id for user in users):
        raise UserNotInHouseholdError(user_id)

    already_linked = await user_repo.get_by_google_email(email)
    if already_linked is not None and already_linked.id != user_id:
        raise LinkConflictError(email)

    await user_repo.link_google_email(user_id, email)
