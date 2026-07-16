"""Seam-2: SqlUserRepo against a real Postgres — point reads/writes (F2).

`get_by_google_email` on an unlinked User (`google_email is null`) must never
match — SQL's own `lower(NULL) = :x` -> `NULL` gives this for free.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.identity.adapters.user_repo import SqlUserRepo
from luc_api.identity.application.user_repo import (
    GoogleEmailAlreadyLinkedError,
    WhatsappPhoneAlreadyLinkedError,
)
from tests.support.postgres import create_household, create_user, requires_postgres

__all__: list[str] = []

pytestmark = requires_postgres


async def test_get_by_email_is_case_insensitive(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id, email="Thiago@Example.com")
    repo = SqlUserRepo(pg_engine)

    found = await repo.get_by_email("thiago@example.com")

    assert found is not None
    assert found.id == user_id


async def test_get_by_email_missing_is_none(pg_engine: AsyncEngine) -> None:
    repo = SqlUserRepo(pg_engine)

    assert await repo.get_by_email("nobody@example.com") is None


async def test_get_by_google_email_of_unlinked_user_is_none(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    await create_user(pg_engine, household_id, google_email=None)
    repo = SqlUserRepo(pg_engine)

    assert await repo.get_by_google_email("") is None
    assert await repo.get_by_google_email("anything@gmail.com") is None


async def test_link_google_email_normalizes_to_lowercase(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlUserRepo(pg_engine)

    await repo.link_google_email(user_id, "Thiago@Gmail.com")

    found = await repo.get_by_google_email("thiago@gmail.com")
    assert found is not None
    assert found.id == user_id
    assert found.google_email == "thiago@gmail.com"


async def test_set_avatar_key_updates_the_user(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id, email="avatar-test@example.com")
    repo = SqlUserRepo(pg_engine)

    await repo.set_avatar_key(user_id, "identity/users/x/avatar")

    reread = await repo.get_by_email("avatar-test@example.com")
    assert reread is not None
    assert reread.avatar_key == "identity/users/x/avatar"


async def test_link_google_email_conflict_raises_domain_error(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    first_user = await create_user(pg_engine, household_id)
    second_user = await create_user(pg_engine, household_id)
    repo = SqlUserRepo(pg_engine)
    await repo.link_google_email(first_user, "shared@gmail.com")

    with pytest.raises(GoogleEmailAlreadyLinkedError):
        await repo.link_google_email(second_user, "shared@gmail.com")


async def test_link_whatsapp_phone_conflict_raises_domain_error(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    first_user = await create_user(pg_engine, household_id)
    second_user = await create_user(pg_engine, household_id)
    repo = SqlUserRepo(pg_engine)
    await repo.link_whatsapp_phone(first_user, "+5511999999999")

    with pytest.raises(WhatsappPhoneAlreadyLinkedError):
        await repo.link_whatsapp_phone(second_user, "+5511999999999")


async def test_whatsapp_phone_link_and_unlink_round_trip(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    repo = SqlUserRepo(pg_engine)

    await repo.link_whatsapp_phone(user_id, "+5511999999999")
    linked = await repo.get_by_whatsapp_phone("+5511999999999")
    assert linked is not None
    assert linked.id == user_id

    await repo.unlink_whatsapp_phone(user_id)
    assert await repo.get_by_whatsapp_phone("+5511999999999") is None
