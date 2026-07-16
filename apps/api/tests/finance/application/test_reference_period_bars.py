"""Reference period bars suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-barras-competencia.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.finance_aggregates import derive_total_paid_series
from luc_api.finance.application.reference_period_bars import (
    BarPoint,
    closed_values,
    reference_period_bar_points,
)
from luc_api.finance.domain.bill import Bill, FixedDayRule, Recurrence
from luc_api.finance.domain.payment import Payment

_BILL_BASE = Bill(
    id="bill-1",
    household_id="h-1",
    name="Luz",
    description=None,
    icon="zap",
    recurrence=Recurrence(interval_months=1, anchor_month=None),
    due_rule=FixedDayRule(day=10),
    due_month_offset=0,
    first_reference_period="2020-01",
    state="ativa",
    closed_on=None,
    logo_key=None,
)


def bill_base(**over: object) -> Bill:
    return replace(_BILL_BASE, **over)  # type: ignore[arg-type]


_PAYMENT_BASE = Payment(
    id="pay-1",
    household_id="h-1",
    bill_id="bill-1",
    amount_cents=10000,
    paid_on=date(2026, 6, 8),
    reference_period="2026-06",
    paid_by="p-1",
)


def payment(**over: object) -> Payment:
    return replace(_PAYMENT_BASE, **over)  # type: ignore[arg-type]


# --- reference_period_bar_points (Seam 1) ---


def test_closed_month_with_payment_becomes_fechado():
    bills = [bill_base()]
    payments = [payment(reference_period="2026-04", amount_cents=5000)]
    series = derive_total_paid_series(bills, payments, date(2026, 6, 15), 3)

    points = reference_period_bar_points(series, bills, date(2026, 6, 15))

    assert points == [
        BarPoint(reference_period="2026-04", amount_cents=5000, state="fechado"),
        BarPoint(reference_period="2026-05", amount_cents=0, state="fechado"),
        BarPoint(reference_period="2026-06", amount_cents=0, state="em-curso"),
    ]


def test_current_month_becomes_em_curso_even_with_paid_amount():
    bills = [bill_base()]
    payments = [payment(reference_period="2026-06", amount_cents=3000)]
    series = derive_total_paid_series(bills, payments, date(2026, 6, 15), 1)

    points = reference_period_bar_points(series, bills, date(2026, 6, 15))

    assert points == [BarPoint(reference_period="2026-06", amount_cents=3000, state="em-curso")]


def test_closed_month_without_expected_occurrence_becomes_lacuna_not_zero():
    # Quarterly Bill (anchor June): only expects an occurrence every 3 months.
    bills = [bill_base(recurrence=Recurrence(interval_months=3, anchor_month=6))]
    payments = [payment(reference_period="2026-06", amount_cents=9000)]
    series = derive_total_paid_series(bills, payments, date(2026, 8, 15), 3)

    points = reference_period_bar_points(series, bills, date(2026, 8, 15))

    assert points == [
        BarPoint(reference_period="2026-06", amount_cents=9000, state="fechado"),
        BarPoint(reference_period="2026-07", amount_cents=0, state="lacuna"),
        BarPoint(reference_period="2026-08", amount_cents=0, state="em-curso"),
    ]


def test_closed_month_with_expected_occurrence_but_unpaid_stays_fechado_zero_not_lacuna():
    # Monthly Bill: May was expected (monthly covers every month) but nobody paid — a real fact, not a gap.
    bills = [bill_base()]
    series = derive_total_paid_series(bills, [], date(2026, 6, 15), 2)

    points = reference_period_bar_points(series, bills, date(2026, 6, 15))

    assert points == [
        BarPoint(reference_period="2026-05", amount_cents=0, state="fechado"),
        BarPoint(reference_period="2026-06", amount_cents=0, state="em-curso"),
    ]


def test_empty_series_becomes_empty_list():
    series = derive_total_paid_series([], [], date(2026, 6, 15))
    assert reference_period_bar_points(series, [], date(2026, 6, 15)) == []


def test_closed_bill_with_expected_reference_period_before_closing_stays_fechado_not_lacuna():
    # The active quarterly Bill (anchor June) stays active but expects nothing in Apr/May — only the
    # closed one (monthly) expected it before closing on 4/20. April must stay "fechado" (a real fact:
    # expected it and didn't pay), never "lacuna" (which would say nothing expected it there).
    active_bill = bill_base(
        id="bill-ativa", recurrence=Recurrence(interval_months=3, anchor_month=6)
    )
    closed_bill = bill_base(id="bill-encerrada", state="encerrada", closed_on=date(2026, 4, 20))
    bills = [active_bill, closed_bill]
    series = derive_total_paid_series(bills, [], date(2026, 6, 15), 3)

    points = reference_period_bar_points(series, bills, date(2026, 6, 15))

    april = next(point for point in points if point.reference_period == "2026-04")
    assert april == BarPoint(reference_period="2026-04", amount_cents=0, state="fechado")


def test_closed_bill_does_not_generate_expectation_after_its_own_closing():
    # May is already after the closed Bill's closing (4/20) — it cannot "expect" anything there.
    active_bill = bill_base(
        id="bill-ativa", recurrence=Recurrence(interval_months=3, anchor_month=6)
    )
    closed_bill = bill_base(id="bill-encerrada", state="encerrada", closed_on=date(2026, 4, 20))
    bills = [active_bill, closed_bill]
    series = derive_total_paid_series(bills, [], date(2026, 6, 15), 3)

    points = reference_period_bar_points(series, bills, date(2026, 6, 15))

    may = next(point for point in points if point.reference_period == "2026-05")
    assert may == BarPoint(reference_period="2026-05", amount_cents=0, state="lacuna")


def test_bill_does_not_generate_expectation_before_its_own_first_reference_period():
    # A brand-new Bill (first_reference_period is the current month) cannot have expected
    # anything in the months before it existed — those must be "lacuna", never a fabricated
    # "fechado" (which would say the household missed a payment it never owed).
    new_bill = bill_base(first_reference_period="2026-06")
    series = derive_total_paid_series([new_bill], [], date(2026, 6, 15), 3)

    points = reference_period_bar_points(series, [new_bill], date(2026, 6, 15))

    assert points == [
        BarPoint(reference_period="2026-04", amount_cents=0, state="lacuna"),
        BarPoint(reference_period="2026-05", amount_cents=0, state="lacuna"),
        BarPoint(reference_period="2026-06", amount_cents=0, state="em-curso"),
    ]


# --- closed_values (Seam 1) ---


def test_excludes_em_curso_and_lacuna_keeps_only_fechado():
    points = [
        BarPoint(reference_period="2026-04", amount_cents=5000, state="fechado"),
        BarPoint(reference_period="2026-05", amount_cents=0, state="lacuna"),
        BarPoint(reference_period="2026-06", amount_cents=3000, state="em-curso"),
    ]
    assert closed_values(points) == [5000]


def test_fechado_with_zero_paid_enters_as_real_zero():
    points = [BarPoint(reference_period="2026-05", amount_cents=0, state="fechado")]
    assert closed_values(points) == [0]
