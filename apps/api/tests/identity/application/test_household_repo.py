"""InMemoryHouseholdRepo: the deterministic double of the `HouseholdRepo` port."""

from luc_api.identity.application.household_repo import InMemoryHouseholdRepo
from luc_api.identity.domain.household import Household


async def test_returns_the_seeded_household():
    household = Household(id="h-panini", name="Casa Panini", users=())

    assert await InMemoryHouseholdRepo(household).load_household() == household


async def test_returns_none_when_there_is_no_household_yet():
    assert await InMemoryHouseholdRepo().load_household() is None
