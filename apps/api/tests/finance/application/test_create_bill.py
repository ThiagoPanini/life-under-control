"""Bill (Conta) use-cases against a fake of the port — no database (Seam 1).

Oracle: apps/web/src/core/use-cases/create-bill.test.ts, suite ported 1:1.
"""

from dataclasses import fields, replace
from datetime import date

import pytest

from luc_api.finance.application.bill_repo import BillDependents, BillRepo, NewBill
from luc_api.finance.application.create_bill import InvalidBillError, create_bill
from luc_api.finance.application.list_bills import list_bills
from luc_api.finance.domain.bill import Bill, BillData, BillRaw, FixedDayRule


class FakeBillRepo(BillRepo):
    """In-memory BillRepo recording what was persisted (`recorded` inspector)."""

    def __init__(self) -> None:
        self.recorded: list[NewBill] = []

    def _persisted(self, new_bill: NewBill, bill_id: str) -> Bill:
        data = {f.name: getattr(new_bill, f.name) for f in fields(BillData)}
        return Bill(
            **data,
            id=bill_id,
            household_id=new_bill.household_id,
            state="ativa",
            closed_on=None,
            logo_key=None,
        )

    async def create_bill(self, new_bill: NewBill) -> Bill:
        self.recorded.append(new_bill)
        return self._persisted(new_bill, f"bill-{len(self.recorded)}")

    async def list_bills(self, household_id: str) -> list[Bill]:
        return [
            self._persisted(new_bill, f"bill-{i + 1}")
            for i, new_bill in enumerate(self.recorded)
            if new_bill.household_id == household_id
        ]

    # Lifecycle is not exercised here — covered in test_bill_lifecycle.py.
    async def get_bill(self, household_id: str, bill_id: str) -> Bill | None:
        raise NotImplementedError("not used")

    async def edit_bill(self, household_id: str, bill_id: str, data: BillData) -> Bill | None:
        raise NotImplementedError("not used")

    async def close_bill(self, household_id: str, bill_id: str, closed_on: date) -> Bill | None:
        raise NotImplementedError("not used")

    async def reactivate_bill(self, household_id: str, bill_id: str) -> Bill | None:
        raise NotImplementedError("not used")

    async def count_dependents(self, household_id: str, bill_id: str) -> BillDependents:
        raise NotImplementedError("not used")

    async def delete_bill(self, household_id: str, bill_id: str) -> BillDependents | None:
        raise NotImplementedError("not used")

    async def set_logo(self, household_id: str, bill_id: str, logo_key: str | None) -> Bill | None:
        raise NotImplementedError("not used")


_VALID_RAW = BillRaw(
    name="Internet",
    description=None,
    icon="wifi",
    interval_months=1,
    anchor_month=None,
    due_rule_kind="dia-fixo",
    due_rule_day=15,
    due_rule_nth=None,
    due_month_offset=0,
    first_reference_period="2026-06",
)


def valid_raw(**over: object) -> BillRaw:
    return replace(_VALID_RAW, **over)  # type: ignore[arg-type]


# --- createBill (Seam 1) ---


async def test_valid_registration_persists_with_household_and_active_state():
    # given a valid registration
    repo = FakeBillRepo()

    # when created
    bill = await create_bill(repo, "h-1", valid_raw())

    # then it persists bound to the household, born active
    assert bill.id
    assert bill.household_id == "h-1"
    assert bill.state == "ativa"
    assert bill.due_rule == FixedDayRule(day=15)
    assert len(repo.recorded) == 1


async def test_household_comes_from_the_edge_not_the_form():
    # The household_id is a use-case argument, never a raw field — the edge
    # injects the logged-in Household. Checks it is what reaches the port.
    repo = FakeBillRepo()

    await create_bill(repo, "h-99", valid_raw())

    assert repo.recorded[0].household_id == "h-99"


async def test_invalid_registration_raises_and_does_not_persist():
    repo = FakeBillRepo()

    with pytest.raises(InvalidBillError):
        await create_bill(repo, "h-1", valid_raw(name=""))

    assert len(repo.recorded) == 0


async def test_error_carries_invalid_fields():
    repo = FakeBillRepo()

    with pytest.raises(InvalidBillError) as err:
        await create_bill(repo, "h-1", valid_raw(interval_months=2, anchor_month=None))

    assert "anchorMonth" in [e.field for e in err.value.errors]


# --- listBills (Seam 1) ---


async def test_lists_only_the_household_bills():
    repo = FakeBillRepo()
    await create_bill(repo, "h-1", valid_raw(name="Luz", icon="zap"))
    await create_bill(repo, "h-1", valid_raw(name="Água", icon="droplet"))
    await create_bill(repo, "h-2", valid_raw(name="Gás", icon="flame"))

    household_bills = await list_bills(repo, "h-1")

    assert [b.name for b in household_bills] == ["Luz", "Água"]
