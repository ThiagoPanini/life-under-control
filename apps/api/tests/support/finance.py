"""Seam-2 finance fixtures: the Bill/Payment scaffolding every finance repo test builds on.

Kept in one place so a `BillData` shape change (it already grew once) only
needs updating here, not in every finance adapter test file independently.
"""

from dataclasses import fields
from datetime import date

from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.finance.adapters.bill_repo import SqlBillRepo
from luc_api.finance.adapters.payment_repo import SqlPaymentRepo
from luc_api.finance.application.bill_repo import NewBill
from luc_api.finance.application.payment_repo import NewPayment
from luc_api.finance.domain.bill import BillData, FixedDayRule, Recurrence
from tests.support.postgres import create_household, create_user

__all__ = ["BASE_BILL_DATA", "new_bill", "scaffold_bill", "scaffold_payment"]

BASE_BILL_DATA = BillData(
    name="Internet",
    description=None,
    icon="wifi",
    recurrence=Recurrence(interval_months=1, anchor_month=None),
    due_rule=FixedDayRule(day=15),
    due_month_offset=0,
    first_reference_period="2026-07",
)


def new_bill(household_id: str, **over: object) -> NewBill:
    """Builds a `NewBill` from `BASE_BILL_DATA`, with per-test field overrides."""
    values = {f.name: getattr(BASE_BILL_DATA, f.name) for f in fields(BillData)} | over
    return NewBill(household_id=household_id, **values)  # type: ignore[arg-type]


async def scaffold_bill(engine: AsyncEngine) -> tuple[str, str, str]:
    """A fresh Household, its User and one Bill — what Payment tests need."""
    household_id = await create_household(engine)
    user_id = await create_user(engine, household_id)
    bill = await SqlBillRepo(engine).create_bill(new_bill(household_id))
    return household_id, user_id, bill.id


async def scaffold_payment(engine: AsyncEngine) -> tuple[str, str, str]:
    """A fresh Household, its User and one Payment — what Attachment tests need."""
    household_id, user_id, bill_id = await scaffold_bill(engine)
    payment = await SqlPaymentRepo(engine).create_payment(
        NewPayment(
            amount_cents=1500,
            paid_on=date(2026, 7, 15),
            reference_period="2026-07",
            paid_by=user_id,
            household_id=household_id,
            bill_id=bill_id,
        )
    )
    return household_id, user_id, payment.id
