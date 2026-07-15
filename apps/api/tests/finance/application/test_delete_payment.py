"""deletePayment: suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/delete-payment.test.ts.
"""

from datetime import date

import pytest

from luc_api.finance.application.delete_payment import delete_payment
from luc_api.finance.application.edit_payment import PaymentNotFoundError
from luc_api.finance.application.payment_repo import FakePaymentRepo
from luc_api.finance.domain.payment import Payment

_EXISTING = Payment(
    id="pay-1",
    household_id="h-1",
    bill_id="bill-1",
    amount_cents=10000,
    paid_on=date(2026, 5, 10),
    reference_period="2026-05",
    paid_by="p-1",
)


# --- deletePayment (Seam 1) ---


async def test_delete_removes_from_the_household():
    # given an existing payment
    repo = FakePaymentRepo([_EXISTING])

    # when deleted
    await delete_payment(repo, "h-1", "pay-1")

    # then it is gone from the household
    assert len(await repo.list_payments("h-1", "bill-1")) == 0


async def test_deleting_missing_payment_raises():
    repo = FakePaymentRepo([_EXISTING])

    with pytest.raises(PaymentNotFoundError):
        await delete_payment(repo, "h-1", "pay-404")


async def test_deleting_another_household_raises():
    repo = FakePaymentRepo([_EXISTING])

    with pytest.raises(PaymentNotFoundError):
        await delete_payment(repo, "h-outro", "pay-1")
