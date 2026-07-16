"""Authenticated-user resolution (issue #94): degrade, never raise.

A real session without a link resolves to `None` — never the first User —
so authorship is chosen explicitly instead of guessed (ADR-0002).
"""

from luc_api.identity.application.resolve_authenticated_user import (
    resolve_authenticated_user,
)
from luc_api.identity.domain.household import User


def make_user(user_id: str, name: str, google_email: str | None) -> User:
    """Minimal User fixture for resolution cases."""
    return User(
        id=user_id,
        name=name,
        email=f"{user_id}@casapanini.lar",
        google_email=google_email,
        hue=211,
        initial=name[0],
        avatar_key=None,
    )


THIAGO = make_user("u-thiago", "Thiago", "thiago@gmail.com")
JAKELINE = make_user("u-jakeline", "Jakeline", "jakeline@gmail.com")
UNLINKED = make_user("u-orfa", "Orphan", None)


def test_linked_session_resolves_the_right_user():
    resolved = resolve_authenticated_user([THIAGO, JAKELINE], "jakeline@gmail.com", False)

    assert resolved is JAKELINE


def test_google_email_match_is_case_insensitive():
    resolved = resolve_authenticated_user([THIAGO, JAKELINE], "JAKELINE@Gmail.com", False)

    assert resolved is JAKELINE


def test_user_without_google_email_never_matches():
    assert resolve_authenticated_user([UNLINKED], "orfa@gmail.com", False) is None


def test_real_session_without_link_does_not_resolve_and_never_falls_back_to_first():
    # Bypass off (production): a valid session without a link -> None, NEVER the first User.
    resolved = resolve_authenticated_user([THIAGO, JAKELINE], "estranho@gmail.com", False)

    assert resolved is None


def test_no_session_with_local_bypass_uses_first_user():
    resolved = resolve_authenticated_user([THIAGO, JAKELINE], None, True)

    assert resolved is THIAGO


def test_no_session_without_bypass_does_not_resolve():
    assert resolve_authenticated_user([THIAGO, JAKELINE], None, False) is None


def test_session_without_link_with_bypass_tolerates_and_falls_back_to_first():
    # In dev, a session email that does not match may still operate against the local seed.
    resolved = resolve_authenticated_user([THIAGO, JAKELINE], "estranho@gmail.com", True)

    assert resolved is THIAGO


def test_household_without_users_returns_none():
    assert resolve_authenticated_user([], "thiago@gmail.com", True) is None
    assert resolve_authenticated_user(None, None, True) is None
