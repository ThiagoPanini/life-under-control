"""Payment (Lançamento): a payment fact of a Bill — photographed, never mirrored (invariant #4).

Dates arrive parsed as `datetime.date` (ADR-0015): validation of the textual
shape lives at the edge; unparseable money arrives as `None`.
"""

from dataclasses import dataclass
from datetime import date

from luc_api.finance.domain.validation import FieldError, Invalid, Valid
from luc_api.shared.domain import is_valid_reference_period

__all__ = ["Payment", "PaymentData", "PaymentRaw", "PaymentValidation", "validate_payment_data"]


@dataclass(frozen=True)
class PaymentData:
    """The data of a Payment, already validated and normalized."""

    amount_cents: int
    """Amount paid, integer BRL cents (invariant #6). Always positive."""
    paid_on: date | None
    """Civil date it was paid on. `None` reserved for backfill without receipt."""
    reference_period: str
    """The reference period (Competência) the payment refers to, `YYYY-MM`."""
    paid_by: str
    """The Pessoa who paid (id) — authorship, not authorization (#1)."""


@dataclass(frozen=True)
class Payment(PaymentData):
    """A persisted Payment: the data + identity, owner Household and source Bill."""

    id: str
    household_id: str
    bill_id: str


@dataclass(frozen=True, kw_only=True)
class PaymentRaw:
    """Raw input of a record/edit (edge-parsed; `None` amount when the text was not money)."""

    amount_cents: int | None
    paid_on: date | None = None
    """Absent assumes today (via `Clock`, in the record use-case only)."""
    reference_period: str
    paid_by: str


type PaymentValidation = Valid[PaymentData] | Invalid


def validate_payment_data(raw: PaymentRaw) -> PaymentValidation:
    """Validate and normalize a Payment record/edit.

    Amount must be a positive integer in cents (#6); reference period year-month;
    who paid, required. An absent date stays `None` ("paid without date") — the
    "today" default belongs to `record_payment` (via `Clock`), not here.
    """
    errors: list[FieldError] = []

    amount_cents = raw.amount_cents
    if amount_cents is None or amount_cents <= 0:
        errors.append(FieldError(field="valor", message="Informe um valor maior que zero."))

    reference_period = (raw.reference_period or "").strip()
    if not is_valid_reference_period(reference_period):
        errors.append(FieldError(field="competencia", message="Competência inválida (ano-mês)."))

    paid_by = (raw.paid_by or "").strip()
    if not paid_by:
        errors.append(FieldError(field="paidBy", message="Escolha quem pagou."))

    if errors or amount_cents is None:
        return Invalid(errors=errors)

    return Valid(
        value=PaymentData(
            amount_cents=amount_cents,
            paid_on=raw.paid_on,
            reference_period=reference_period,
            paid_by=paid_by,
        )
    )
