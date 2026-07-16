"""editPayment: suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/edit-payment.test.ts.
"""

from dataclasses import replace
from datetime import date

import pytest

from luc_api.finance.application.edit_payment import PaymentNotFoundError, edit_payment
from luc_api.finance.application.payment_repo import FakePaymentRepo
from luc_api.finance.application.record_payment import InvalidPaymentError
from luc_api.finance.domain.payment import Payment, PaymentRaw

_EXISTING = Payment(
    id="pay-1",
    household_id="h-1",
    bill_id="bill-1",
    amount_cents=10000,
    paid_on=date(2026, 5, 10),
    reference_period="2026-05",
    paid_by="p-1",
)

_RAW = PaymentRaw(
    amount_cents=13050,
    paid_on=date(2026, 6, 9),
    reference_period="2026-06",
    paid_by="p-2",
)


def raw(**over: object) -> PaymentRaw:
    return replace(_RAW, **over)  # type: ignore[arg-type]


# --- editPayment (Seam 1) ---


async def test_edit_persists_the_new_shape():
    # given an existing payment
    repo = FakePaymentRepo([_EXISTING])

    # when edited
    updated = await edit_payment(repo, "h-1", "pay-1", raw())

    # then the new shape persists under the same id
    assert updated.amount_cents == 13050
    assert updated.reference_period == "2026-06"
    assert updated.paid_by == "p-2"
    assert updated.id == "pay-1"


async def test_clearing_the_date_becomes_none_not_today():
    # Editing never rewrites the past: clearing the date marks "paid without
    # date" (None), never stamps today over what the Pessoa recorded (review #2).
    repo = FakePaymentRepo([_EXISTING])

    updated = await edit_payment(repo, "h-1", "pay-1", raw(paid_on=None))

    assert updated.paid_on is None


async def test_editing_missing_payment_raises():
    repo = FakePaymentRepo([_EXISTING])

    with pytest.raises(PaymentNotFoundError):
        await edit_payment(repo, "h-1", "pay-404", raw())


async def test_editing_another_household_raises():
    repo = FakePaymentRepo([_EXISTING])

    with pytest.raises(PaymentNotFoundError):
        await edit_payment(repo, "h-outro", "pay-1", raw())


async def test_invalid_edit_raises():
    repo = FakePaymentRepo([_EXISTING])

    with pytest.raises(InvalidPaymentError):
        await edit_payment(repo, "h-1", "pay-1", raw(amount_cents=-1))
