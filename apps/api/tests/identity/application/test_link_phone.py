"""Seam 1: the WhatsApp phone link operations (issue #152) against the `UserRepo` fake."""

import pytest

from luc_api.identity.application.link_phone import (
    InvalidPhoneError,
    PhoneLinkConflictError,
    link_phone,
    unlink_phone,
)
from luc_api.identity.application.user_repo import InMemoryUserRepo
from luc_api.identity.domain.household import User, UserNotInHouseholdError


def make_user(user_id: str = "u-thiago", name: str = "Thiago") -> User:
    """Household User fixture without any link."""
    return User(
        id=user_id,
        name=name,
        email=f"{user_id}@casapanini.lar",
        google_email=None,
        hue=211,
        initial=name[0],
        avatar_key=None,
    )


JAKELINE = make_user("u-jakeline", "Jakeline")


async def test_links_normalized_phone_to_household_user():
    thiago = make_user()
    repo = InMemoryUserRepo([thiago, JAKELINE])

    await link_phone(repo, [thiago, JAKELINE], thiago.id, "(11) 98765-4321")

    linked = await repo.get_by_whatsapp_phone("+5511987654321")
    assert linked is not None
    assert linked.id == thiago.id


async def test_invalid_phone_raises_and_does_not_write():
    thiago = make_user()
    repo = InMemoryUserRepo([thiago, JAKELINE])

    with pytest.raises(InvalidPhoneError):
        await link_phone(repo, [thiago, JAKELINE], thiago.id, "123")

    stored = await repo.get_by_email(thiago.email)
    assert stored is not None
    assert stored.whatsapp_phone is None


async def test_user_not_in_household_raises():
    thiago = make_user()
    repo = InMemoryUserRepo([thiago])

    with pytest.raises(UserNotInHouseholdError):
        await link_phone(repo, [thiago], "u-intruso", "11987654321")


async def test_phone_already_linked_to_another_user_raises_conflict():
    thiago = make_user()
    repo = InMemoryUserRepo([thiago, JAKELINE])
    await link_phone(repo, [thiago, JAKELINE], thiago.id, "11987654321")

    with pytest.raises(PhoneLinkConflictError):
        await link_phone(repo, [thiago, JAKELINE], JAKELINE.id, "11987654321")


async def test_relinking_same_phone_to_same_user_is_idempotent():
    thiago = make_user()
    repo = InMemoryUserRepo([thiago, JAKELINE])
    await link_phone(repo, [thiago, JAKELINE], thiago.id, "11987654321")

    await link_phone(repo, [thiago, JAKELINE], thiago.id, "(11) 98765-4321")

    linked = await repo.get_by_whatsapp_phone("+5511987654321")
    assert linked is not None
    assert linked.id == thiago.id


async def test_unlink_removes_phone():
    thiago = make_user()
    repo = InMemoryUserRepo([thiago, JAKELINE])
    await link_phone(repo, [thiago, JAKELINE], thiago.id, "11987654321")

    await unlink_phone(repo, [thiago, JAKELINE], thiago.id)

    assert await repo.get_by_whatsapp_phone("+5511987654321") is None


async def test_unlink_user_not_in_household_raises():
    thiago = make_user()
    repo = InMemoryUserRepo([thiago])

    with pytest.raises(UserNotInHouseholdError):
        await unlink_phone(repo, [thiago], "u-intruso")
