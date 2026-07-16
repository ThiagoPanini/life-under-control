"""recordPayment (dar baixa): suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/record-payment.test.ts.
"""

from dataclasses import replace
from datetime import date

import pytest

from luc_api.finance.application.payment_repo import FakePaymentRepo
from luc_api.finance.application.record_payment import InvalidPaymentError, record_payment
from luc_api.finance.domain.payment import PaymentRaw
from luc_api.shared.application import FixedClock

_VALID_RAW = PaymentRaw(
    amount_cents=12990,
    paid_on=date(2026, 6, 10),
    reference_period="2026-06",
    paid_by="p-1",
)


def valid_raw(**over: object) -> PaymentRaw:
    return replace(_VALID_RAW, **over)  # type: ignore[arg-type]


_CLOCK = FixedClock(date(2026, 6, 29))


# --- recordPayment (Seam 1) ---


async def test_payment_persists_bound_to_household_and_bill():
    # given an empty repo
    repo = FakePaymentRepo()

    # when a payment is recorded
    payment = await record_payment(repo, _CLOCK, "h-1", "bill-1", valid_raw())

    # then it persists bound to the household and the bill
    assert payment.id
    assert payment.household_id == "h-1"
    assert payment.bill_id == "bill-1"
    assert payment.amount_cents == 12990
    assert len(await repo.list_payments("h-1", "bill-1")) == 1


async def test_missing_date_uses_the_clock():
    repo = FakePaymentRepo()

    payment = await record_payment(repo, _CLOCK, "h-1", "bill-1", valid_raw(paid_on=None))

    assert payment.paid_on == date(2026, 6, 29)


async def test_given_date_wins_over_the_clock():
    repo = FakePaymentRepo()

    payment = await record_payment(
        repo, _CLOCK, "h-1", "bill-1", valid_raw(paid_on=date(2026, 5, 2))
    )

    assert payment.paid_on == date(2026, 5, 2)


async def test_household_and_bill_come_from_the_edge_not_the_form():
    repo = FakePaymentRepo()

    payment = await record_payment(repo, _CLOCK, "h-99", "bill-7", valid_raw())

    assert payment.household_id == "h-99"
    assert payment.bill_id == "bill-7"


async def test_invalid_payment_raises_and_does_not_persist():
    repo = FakePaymentRepo()

    with pytest.raises(InvalidPaymentError):
        await record_payment(repo, _CLOCK, "h-1", "bill-1", valid_raw(amount_cents=0))

    assert len(await repo.list_payments("h-1", "bill-1")) == 0
