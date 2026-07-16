"""BillRepo port: persistence of Bills (Contas), always scoped by the Household."""

from dataclasses import dataclass
from datetime import date
from typing import Protocol

from luc_api.finance.domain.bill import (
    Bill,
    BillData,
    DueRule,
    FixedDayRule,
    LastBusinessDayRule,
    NthBusinessDayRule,
    Recurrence,
)

__all__ = [
    "Bill",
    "BillDependents",
    "BillRepo",
    "DueRule",
    "FixedDayRule",
    "LastBusinessDayRule",
    "NewBill",
    "NthBusinessDayRule",
    "Recurrence",
]


@dataclass(frozen=True)
class NewBill(BillData):
    """A Bill about to be persisted: the validated data plus its Household."""

    household_id: str


@dataclass(frozen=True)
class BillDependents:
    """How many facts hang off a Bill — what a deletion would take along."""

    payments: int
    attachments: int


class BillRepo(Protocol):
    """Persistence port for Bills; adapters implement it, use-cases depend on it."""

    async def create_bill(self, new_bill: NewBill) -> Bill:
        """Persist a new Bill and return it with identity and active state."""
        ...

    async def list_bills(self, household_id: str) -> list[Bill]:
        """List every Bill of the Household."""
        ...

    async def get_bill(self, household_id: str, bill_id: str) -> Bill | None:
        """Read one Bill of the Household; `None` when missing or another Lar's."""
        ...

    async def edit_bill(self, household_id: str, bill_id: str, data: BillData) -> Bill | None:
        """Replace the Bill's data; `None` when missing or another Lar's."""
        ...

    async def close_bill(self, household_id: str, bill_id: str, closed_on: date) -> Bill | None:
        """Close an **active** Bill on the civil date; `None` when no active target."""
        ...

    async def reactivate_bill(self, household_id: str, bill_id: str) -> Bill | None:
        """Reactivate a **closed** Bill, clearing the date; `None` when no closed target."""
        ...

    async def count_dependents(self, household_id: str, bill_id: str) -> BillDependents:
        """Count the Payments/Attachments hanging off the Bill."""
        ...

    async def delete_bill(self, household_id: str, bill_id: str) -> BillDependents | None:
        """Delete the Bill and its dependents, returning the count; `None` when missing."""
        ...

    async def set_logo(self, household_id: str, bill_id: str, logo_key: str | None) -> Bill | None:
        """Point the Bill at its R2 logo object (or clear it); `None` when missing."""
        ...
