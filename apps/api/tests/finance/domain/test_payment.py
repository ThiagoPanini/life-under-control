"""Payment (Lançamento) validation rule: suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/domain/payment.test.ts. The `ehCompetenciaValida`
describe is kernel-owned (`shared.domain.is_valid_reference_period`, covered
there); `descreverCompetencia` is ported below (#189, the derive-* slice).
The oracle's `test_data_invalida_falha` dropped: an invalid date string can no
longer reach the domain — dates arrive parsed as `datetime.date` (ADR-0015).
The oracle's NaN/1.5 amount sentinels arrive as `None` (unparseable money).
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.domain.bill import Recurrence
from luc_api.finance.domain.payment import (
    PaymentRaw,
    describe_reference_period_pt,
    validate_payment_data,
)
from luc_api.finance.domain.validation import Valid

_VALID_RAW = PaymentRaw(
    amount_cents=12990,
    paid_on=date(2026, 6, 10),
    reference_period="2026-06",
    paid_by="p-1",
)


def valid_raw(**over: object) -> PaymentRaw:
    return replace(_VALID_RAW, **over)  # type: ignore[arg-type]


def error_fields(raw: PaymentRaw) -> list[str]:
    res = validate_payment_data(raw)
    return [] if isinstance(res, Valid) else [e.field for e in res.errors]


# --- validarDadosPayment (Seam 1) ---


def test_valid_payment_normalizes():
    res = validate_payment_data(valid_raw())

    assert res.ok is True
    assert res.value.amount_cents == 12990
    assert res.value.paid_on == date(2026, 6, 10)
    assert res.value.reference_period == "2026-06"
    assert res.value.paid_by == "p-1"


def test_missing_date_stays_none():
    # The "today" default belongs to the record use-case (via Clock), not to
    # validation: absent here is None ("paid without date"), so editing never
    # rewrites the past.
    res = validate_payment_data(valid_raw(paid_on=None))

    assert res.ok is True
    assert res.value.paid_on is None


def test_non_positive_or_broken_amount_fails():
    assert "valor" in error_fields(valid_raw(amount_cents=0))
    assert "valor" in error_fields(valid_raw(amount_cents=-5))
    assert "valor" in error_fields(valid_raw(amount_cents=None))


def test_invalid_reference_period_fails():
    assert "competencia" in error_fields(valid_raw(reference_period="2026-13"))


def test_paid_by_required():
    assert "paidBy" in error_fields(valid_raw(paid_by=""))


# --- describe_reference_period_pt (Seam 1) ---


def test_monthly_shows_month_and_year():
    result = describe_reference_period_pt(
        "2026-07", Recurrence(interval_months=1, anchor_month=None)
    )

    assert result == "Julho/2026"


def test_yearly_shows_only_the_year():
    result = describe_reference_period_pt("2026-03", Recurrence(interval_months=12, anchor_month=3))

    assert result == "2026"


def test_other_cadences_show_month_and_year():
    result = describe_reference_period_pt("2026-07", Recurrence(interval_months=2, anchor_month=7))

    assert result == "Julho/2026"
