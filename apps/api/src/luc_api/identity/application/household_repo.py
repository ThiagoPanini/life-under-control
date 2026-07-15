"""Household read port (ADR-0003), with its in-memory test double.

The core depends on this interface, never on a concrete store. A concrete
adapter implements it; tests use the in-memory double.
"""

from typing import Protocol

from luc_api.identity.domain.household import Household

__all__ = ["HouseholdRepo", "InMemoryHouseholdRepo"]


class HouseholdRepo(Protocol):
    """Port that loads the (single) Household with its Users."""

    async def load_household(self) -> Household | None:
        """The Household with its Users, or `None` if there is no Household yet."""
        ...


class InMemoryHouseholdRepo:
    """Deterministic `HouseholdRepo` double for tests: yields the seeded Household."""

    def __init__(self, household: Household | None = None) -> None:
        """Seed the double with the Household to yield (or none)."""
        self._household = household

    async def load_household(self) -> Household | None:
        """The seeded Household, or `None`."""
        return self._household
