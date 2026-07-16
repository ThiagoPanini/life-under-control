"""Seam-2: SqlHouseholdRepo against a real Postgres — single-Household load (F2)."""

from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.identity.adapters.household_repo import SqlHouseholdRepo
from tests.support.postgres import create_household, create_user, requires_postgres

__all__: list[str] = []

pytestmark = requires_postgres


async def test_load_household_with_no_household_yet_is_none(pg_engine: AsyncEngine) -> None:
    repo = SqlHouseholdRepo(pg_engine)

    assert await repo.load_household() is None


async def test_load_household_returns_household_with_its_users(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine, nome="Lar dos Panini")
    user_id = await create_user(
        pg_engine,
        household_id,
        email="thiago@example.com",
        nome="Thiago",
        hue=200,
        inicial="T",
    )
    repo = SqlHouseholdRepo(pg_engine)

    household = await repo.load_household()

    assert household is not None
    assert household.id == household_id
    assert household.name == "Lar dos Panini"
    assert [u.id for u in household.users] == [user_id]
    assert household.users[0].name == "Thiago"
    assert household.users[0].household_id == household_id


async def test_load_household_maps_every_user_field(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    await create_user(
        pg_engine,
        household_id,
        email="jakeline@example.com",
        google_email="jakeline@gmail.com",
        nome="Jakeline",
        hue=90,
        inicial="J",
        avatar_key="identity/users/x/avatar",
        whatsapp_phone="+5511999999999",
    )
    repo = SqlHouseholdRepo(pg_engine)

    household = await repo.load_household()

    assert household is not None
    user = household.users[0]
    assert user.email == "jakeline@example.com"
    assert user.google_email == "jakeline@gmail.com"
    assert user.hue == 90
    assert user.initial == "J"
    assert user.avatar_key == "identity/users/x/avatar"
    assert user.whatsapp_phone == "+5511999999999"
