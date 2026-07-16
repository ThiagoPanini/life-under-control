"""Use-case: record a payment (dar baixa) on a Bill, registering a Payment."""

from luc_api.finance.application.payment_repo import NewPayment, PaymentRepo
from luc_api.finance.domain.payment import Payment, PaymentRaw, validate_payment_data
from luc_api.finance.domain.validation import FieldError, Invalid
from luc_api.shared.application import Clock
from luc_api.shared.domain import ValidationError

__all__ = ["InvalidPaymentError", "record_payment"]


class InvalidPaymentError(ValidationError):
    """The payment failed domain validation — carries the per-field errors."""

    def __init__(self, errors: list[FieldError]) -> None:
        """Keep the per-field errors for the edge to render."""
        super().__init__("Payment (Lançamento) failed domain validation")
        self.errors = errors


async def record_payment(
    repo: PaymentRepo,
    clock: Clock,
    household_id: str,
    bill_id: str,
    raw: PaymentRaw,
) -> Payment:
    """Validate the shape in the core and persist through the port.

    A missing date assumes today via `Clock`. `household_id` and `bill_id` come
    from the edge, never from the form. Any Pessoa records a payment (#1).
    """
    res = validate_payment_data(raw)
    if isinstance(res, Invalid):
        raise InvalidPaymentError(res.errors)
    paid_on = res.value.paid_on if res.value.paid_on is not None else clock.today()
    return await repo.create_payment(
        NewPayment(
            amount_cents=res.value.amount_cents,
            paid_on=paid_on,
            reference_period=res.value.reference_period,
            paid_by=res.value.paid_by,
            household_id=household_id,
            bill_id=bill_id,
        )
    )
