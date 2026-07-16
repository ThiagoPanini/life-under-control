"""Use-case: correct a Payment (Lançamento) of the Household."""

from luc_api.finance.application.payment_repo import PaymentRepo
from luc_api.finance.application.record_payment import InvalidPaymentError
from luc_api.finance.domain.payment import Payment, PaymentRaw, validate_payment_data
from luc_api.finance.domain.validation import Invalid
from luc_api.shared.domain import NotFoundError

__all__ = ["PaymentNotFoundError", "edit_payment"]


class PaymentNotFoundError(NotFoundError):
    """The target Payment does not exist in the Household (missing or another Household's id)."""

    def __init__(self) -> None:
        """Fix the message; the missing id is edge context, not error state."""
        super().__init__("Payment (Lançamento) not found")


async def edit_payment(
    repo: PaymentRepo,
    household_id: str,
    payment_id: str,
    raw: PaymentRaw,
) -> Payment:
    """Correct amount, date, reference period or who paid.

    Invariant #4's immutability binds the *system* (re-adjusting the Bill never
    rewrites a Payment), it does not stop the Pessoa from correcting what they
    recorded — both edit everything (symmetric access, #1). Validates in the
    core and persists through the port. No `Clock`: clearing the date means
    `None` ("paid without date"), never today.
    """
    res = validate_payment_data(raw)
    if isinstance(res, Invalid):
        raise InvalidPaymentError(res.errors)
    updated = await repo.edit_payment(household_id, payment_id, res.value)
    if updated is None:
        raise PaymentNotFoundError
    return updated
