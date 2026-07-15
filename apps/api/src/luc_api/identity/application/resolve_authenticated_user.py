"""Pure decision (issue #94): which Household User is the authenticated one.

Lets the shell show name/avatar and the domain assign authorship. Matches by
the linked `google_email` (case-insensitive) — never by the nominal seeded
email, which is fictional. The allowlist (ADR-0004) was already checked at
sign-in; here we only translate the session into the right User.

Rules (ADR-0002: identity/authorship never inferred by position):

- Session whose email matches a linked `google_email` -> that User.
- No session + local bypass (dev) -> the first User (operates against the seed).
- Real session without a link (production) -> `None`: does NOT resolve. Never
  falls back silently to the first User (the default authorship would come out
  wrong). The edge degrades explicitly — the shell shows the fallback and the
  settle modal leaves "who paid" blank, forcing a manual choice over a guess.

Returns `None` on purpose (instead of raising): the real link is applied by a
later operational step (#96), so there is a post-deploy window in which nobody
is linked. Raising here would take down every authenticated route with a 500
for both Users in that window (and leak the session email into logs); `None`
keeps the portal up and degrades honestly.
"""

from collections.abc import Sequence

from luc_api.identity.domain.household import User

__all__ = ["resolve_authenticated_user"]


def resolve_authenticated_user(
    users: Sequence[User] | None,
    logged_email: str | None,
    local_bypass: bool,
) -> User | None:
    """Resolve the session email to the linked User, degrading to `None`."""
    household = list(users or [])

    if logged_email:
        email = logged_email.lower()
        linked = next(
            (user for user in household if (user.google_email or "").lower() == email),
            None,
        )
        if linked:
            return linked
        # Dev-only tolerance: a session email that does not match still operates against the seed.
        if local_bypass:
            return household[0] if household else None
        # Real session without a link (production): do not resolve — never the first User.
        return None

    if local_bypass:
        return household[0] if household else None
    return None
