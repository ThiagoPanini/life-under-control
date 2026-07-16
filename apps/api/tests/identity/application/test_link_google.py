"""Seam 1: the Google link operation (issue #94) against the `UserRepo` fake."""

import pytest

from luc_api.identity.application.link_google import (
    EmailNotInAllowlistError,
    LinkConflictError,
    link_google,
)
from luc_api.identity.application.user_repo import InMemoryUserRepo
from luc_api.identity.domain.household import User, UserNotInHouseholdError


def make_user(google_email: str | None = None) -> User:
    """Thiago fixture, unlinked by default."""
    return User(
        id="u-thiago",
        name="Thiago",
        email="thiago@casapanini.lar",
        google_email=google_email,
        hue=211,
        initial="T",
        avatar_key=None,
    )


JAKELINE = User(
    id="u-jakeline",
    name="Jakeline",
    email="jakeline@casapanini.lar",
    google_email=None,
    hue=14,
    initial="J",
    avatar_key=None,
)

ALLOWLIST = "thiago@gmail.com, jakeline@gmail.com"


async def test_links_allowlisted_email_to_household_user():
    repo = InMemoryUserRepo([make_user(), JAKELINE])

    await link_google(repo, [make_user(), JAKELINE], "u-thiago", "thiago@gmail.com", ALLOWLIST)

    linked = await repo.get_by_google_email("thiago@gmail.com")
    assert linked is not None
    assert linked.id == "u-thiago"


async def test_email_is_normalized_to_lowercase():
    repo = InMemoryUserRepo([make_user(), JAKELINE])

    await link_google(repo, [make_user(), JAKELINE], "u-thiago", "Thiago@GMAIL.com", ALLOWLIST)

    linked = await repo.get_by_google_email("thiago@gmail.com")
    assert linked is not None
    assert linked.id == "u-thiago"
    assert linked.google_email == "thiago@gmail.com"


async def test_email_not_in_allowlist_raises_and_does_not_write():
    repo = InMemoryUserRepo([make_user(), JAKELINE])

    with pytest.raises(EmailNotInAllowlistError):
        await link_google(repo, [make_user(), JAKELINE], "u-thiago", "intruso@gmail.com", ALLOWLIST)

    assert await repo.get_by_google_email("intruso@gmail.com") is None
    thiago = await repo.get_by_email("thiago@casapanini.lar")
    assert thiago is not None
    assert thiago.google_email is None


async def test_user_not_in_household_raises():
    repo = InMemoryUserRepo([make_user(), JAKELINE])

    with pytest.raises(UserNotInHouseholdError):
        await link_google(repo, [make_user(), JAKELINE], "u-intrusa", "thiago@gmail.com", ALLOWLIST)


async def test_email_already_linked_to_another_user_raises_conflict():
    linked_thiago = make_user(google_email="thiago@gmail.com")
    repo = InMemoryUserRepo([linked_thiago, JAKELINE])

    with pytest.raises(LinkConflictError):
        await link_google(
            repo, [linked_thiago, JAKELINE], "u-jakeline", "thiago@gmail.com", ALLOWLIST
        )


async def test_relinking_same_email_to_same_user_is_idempotent():
    linked_thiago = make_user(google_email="thiago@gmail.com")
    repo = InMemoryUserRepo([linked_thiago, JAKELINE])

    await link_google(repo, [linked_thiago, JAKELINE], "u-thiago", "THIAGO@gmail.com", ALLOWLIST)

    linked = await repo.get_by_google_email("thiago@gmail.com")
    assert linked is not None
    assert linked.id == "u-thiago"
