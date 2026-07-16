"""Finance aggregates suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-agregados-financas.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.application.finance_aggregates import (
    FinanceAggregates,
    MonthComparison,
    MonthlySeriesPoint,
    average_monthly_spend,
    compare_closed_month,
    count_open_bills,
    derive_finance_aggregates,
    derive_total_paid_series,
    estimate_remaining_to_pay,
    total_paid_in_month,
)
from luc_api.finance.domain.bill import Bill, FixedDayRule, Recurrence
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import FixedClock

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


# --- total_paid_in_month (Seam 1) ---


def test_sums_exactly_the_current_reference_periods_payments():
    bills = [bill_base(id="bill-1"), bill_base(id="bill-2", name="Água")]
    payments = [
        payment(id="a", bill_id="bill-1", reference_period="2026-06", amount_cents=10000),
        payment(id="b", bill_id="bill-2", reference_period="2026-06", amount_cents=7000),
        # previous month: outside the current reference period, does not sum
        payment(id="c", bill_id="bill-1", reference_period="2026-05", amount_cents=9999),
    ]

    assert total_paid_in_month(bills, payments, date(2026, 6, 15)) == 17000


def test_ignores_payments_of_a_closed_bill():
    bills = [
        bill_base(id="bill-1"),
        bill_base(id="bill-2", state="encerrada", closed_on=date(2026, 5, 1)),
    ]
    payments = [
        payment(id="a", bill_id="bill-1", reference_period="2026-06", amount_cents=10000),
        payment(id="b", bill_id="bill-2", reference_period="2026-06", amount_cents=5000),
    ]

    assert total_paid_in_month(bills, payments, date(2026, 6, 15)) == 10000


def test_no_payment_in_the_month_sums_zero():
    payments = [payment(reference_period="2026-05", amount_cents=5000)]

    assert total_paid_in_month([bill_base()], payments, date(2026, 6, 15)) == 0


# --- derive_total_paid_series (Seam 1) ---


def test_builds_six_reference_periods_in_order_with_explicit_zeros():
    bills = [
        bill_base(id="ativa"),
        bill_base(id="encerrada", state="encerrada", closed_on=date(2026, 1, 1)),
    ]
    payments = [
        payment(id="abr", bill_id="ativa", reference_period="2026-04", amount_cents=4000),
        payment(id="jun", bill_id="ativa", reference_period="2026-06", amount_cents=6000),
        payment(id="fora", bill_id="encerrada", reference_period="2026-05", amount_cents=99999),
    ]

    series = derive_total_paid_series(bills, payments, date(2026, 6, 15), 6)

    assert series == [
        MonthlySeriesPoint(reference_period="2026-01", amount_cents=0, current=False),
        MonthlySeriesPoint(reference_period="2026-02", amount_cents=0, current=False),
        MonthlySeriesPoint(reference_period="2026-03", amount_cents=0, current=False),
        MonthlySeriesPoint(reference_period="2026-04", amount_cents=4000, current=False),
        MonthlySeriesPoint(reference_period="2026-05", amount_cents=0, current=False),
        MonthlySeriesPoint(reference_period="2026-06", amount_cents=6000, current=True),
    ]


def test_series_marks_the_current_month_as_current():
    payments = [payment(reference_period="2026-06", amount_cents=6000)]

    series = derive_total_paid_series([bill_base()], payments, date(2026, 6, 15), 2)

    assert series == [
        MonthlySeriesPoint(reference_period="2026-05", amount_cents=0, current=False),
        MonthlySeriesPoint(reference_period="2026-06", amount_cents=6000, current=True),
    ]


def test_empty_series_has_an_explicit_shape():
    # Household without any active Bill: an explicit shape, not six months of
    # zero disguising "no Bill".
    assert derive_total_paid_series([], [], date(2026, 6, 15)) is None


# --- compare_closed_month (Seam 1) ---


def test_current_month_without_delta_is_in_progress():
    # only the current month has a point in the series — no closed month yet to compare
    payments = [payment(reference_period="2026-06", amount_cents=5000)]
    series = derive_total_paid_series([bill_base()], payments, date(2026, 6, 15), 1)

    assert compare_closed_month(series) == MonthComparison(state="em-curso")


def test_delta_only_between_closed_months():
    # June (current) has a discrepant amount; the delta ignores it and compares
    # only May against April
    payments = [
        payment(id="abr", reference_period="2026-04", amount_cents=4000),
        payment(id="mai", reference_period="2026-05", amount_cents=5000),
        payment(id="jun", reference_period="2026-06", amount_cents=999999),
    ]
    series = derive_total_paid_series([bill_base()], payments, date(2026, 6, 15), 3)

    assert compare_closed_month(series) == MonthComparison(state="fechado", delta_percent=25)


def test_empty_month_does_not_yield_minus_100():
    # July 1st: July (current) has no Payment at all yet — not a "100% drop"
    payments = [
        payment(id="mai", reference_period="2026-05", amount_cents=4000),
        payment(id="jun", reference_period="2026-06", amount_cents=5000),
    ]
    series = derive_total_paid_series([bill_base()], payments, date(2026, 7, 1), 3)

    assert compare_closed_month(series) == MonthComparison(state="fechado", delta_percent=25)


def test_closed_month_without_a_previous_base_yields_no_percentage():
    # the previous closed month has no Payment at all: no honest base to divide by
    payments = [payment(id="jun", reference_period="2026-06", amount_cents=5000)]
    series = derive_total_paid_series([bill_base()], payments, date(2026, 6, 15), 3)

    assert compare_closed_month(series) == MonthComparison(state="sem-base-anterior")


def test_empty_series_stays_in_progress():
    assert compare_closed_month(derive_total_paid_series([], [], date(2026, 6, 15))) == (
        MonthComparison(state="em-curso")
    )


# --- count_open_bills (Seam 1) ---

_CAL = FakeCalendar()


def test_counts_only_yellow_and_red_beacons():
    # today 15/06: due 10 -> red; due 18 (3 days) -> yellow; due 25 (10 days) -> gray
    bills = [
        bill_base(id="vermelho", due_rule=FixedDayRule(day=10)),
        bill_base(id="amarelo", due_rule=FixedDayRule(day=18)),
        bill_base(id="cinza", due_rule=FixedDayRule(day=25)),
        bill_base(id="verde", due_rule=FixedDayRule(day=10)),
    ]
    payments = [payment(id="p", bill_id="verde", reference_period="2026-06")]

    assert count_open_bills(bills, payments, date(2026, 6, 15), _CAL) == 2


def test_ignores_a_closed_bill():
    bills = [
        bill_base(id="viva", due_rule=FixedDayRule(day=10)),
        bill_base(
            id="morta",
            state="encerrada",
            closed_on=date(2026, 1, 1),
            due_rule=FixedDayRule(day=10),
        ),
    ]

    assert count_open_bills(bills, [], date(2026, 6, 15), _CAL) == 1


# --- average_monthly_spend (Seam 1) ---


def test_window_sum_divided_by_the_twelve_months():
    bills = [bill_base(id="bill-1"), bill_base(id="bill-2", name="Água")]
    payments = [
        # current month: outside the 12-complete-month window
        payment(id="jun", bill_id="bill-1", reference_period="2026-06", amount_cents=10000),
        # May: 14000 + 6000 = 20000
        payment(id="m1", bill_id="bill-1", reference_period="2026-05", amount_cents=14000),
        payment(id="m2", bill_id="bill-2", reference_period="2026-05", amount_cents=6000),
        # April: 4000 + 6000 = 10000
        payment(id="a1", bill_id="bill-1", reference_period="2026-04", amount_cents=4000),
        payment(id="a2", bill_id="bill-2", reference_period="2026-04", amount_cents=6000),
        # March: 6000
        payment(id="mar", bill_id="bill-2", reference_period="2026-03", amount_cents=6000),
    ]

    # (20000 + 10000 + 6000) / 12 months = 3000 (June is out; the divisor is the
    # window, not the months that had spend)
    assert average_monthly_spend(bills, payments, date(2026, 6, 15)) == 3000


def test_infrequent_bill_is_amortized_in_the_window():
    # an annual R$1,200 in a single month lands as ~R$100/month, not as R$1,200
    payments = [payment(reference_period="2026-01", amount_cents=120000)]

    assert average_monthly_spend([bill_base()], payments, date(2026, 6, 15)) == 10000


def test_no_history_in_the_window_is_null():
    # only the current month has a payment; the complete-months window is empty
    payments = [payment(reference_period="2026-06", amount_cents=10000)]

    assert average_monthly_spend([bill_base()], payments, date(2026, 6, 15)) is None


def test_average_spend_ignores_payments_of_a_closed_bill():
    bills = [
        bill_base(id="bill-1"),
        bill_base(id="bill-2", state="encerrada", closed_on=date(2026, 1, 1)),
    ]
    payments = [
        payment(id="v", bill_id="bill-1", reference_period="2026-05", amount_cents=12000),
        payment(id="m", bill_id="bill-2", reference_period="2026-05", amount_cents=99999),
    ]

    # 12000 / 12 = 1000 (the closed one does not enter)
    assert average_monthly_spend(bills, payments, date(2026, 6, 15)) == 1000


# --- estimate_remaining_to_pay (Seam 1) ---


def test_sums_the_average_of_unpaid_bills_with_history():
    bills = [
        bill_base(id="bill-1", name="Luz"),  # paid this month -> green, not estimated
        bill_base(id="bill-2", name="Água"),  # unpaid, with history -> estimates the average
        bill_base(id="bill-3", name="Internet"),  # unpaid, without history -> not estimated
    ]
    payments = [
        payment(id="luz-jun", bill_id="bill-1", reference_period="2026-06", amount_cents=10000),
        payment(id="agua-mai", bill_id="bill-2", reference_period="2026-05", amount_cents=6000),
        payment(id="agua-abr", bill_id="bill-2", reference_period="2026-04", amount_cents=6000),
        payment(id="agua-mar", bill_id="bill-2", reference_period="2026-03", amount_cents=6000),
    ]

    # only Água: average 6000
    assert estimate_remaining_to_pay(bills, payments, date(2026, 6, 15), _CAL) == 6000


def test_no_open_bills_the_estimate_is_null():
    payments = [payment(reference_period="2026-06")]  # paid -> green

    assert estimate_remaining_to_pay([bill_base()], payments, date(2026, 6, 15), _CAL) is None


def test_open_bill_without_history_does_not_enter_the_estimate():
    assert estimate_remaining_to_pay([bill_base()], [], date(2026, 6, 15), _CAL) is None


def test_gray_bill_far_from_due_does_not_enter_the_estimate():
    # fixed day 25, today 15/06 -> due in 10 days -> gray (far), even with history
    bill = bill_base(due_rule=FixedDayRule(day=25))
    payments = [
        payment(id="m1", reference_period="2026-05", amount_cents=8000),
        payment(id="m2", reference_period="2026-04", amount_cents=8000),
    ]

    # gray is not "open" -> excluded from the estimate (consistent with count_open_bills)
    assert estimate_remaining_to_pay([bill], payments, date(2026, 6, 15), _CAL) is None


# --- derive_finance_aggregates (Seam 1) ---


def test_composes_the_four_month_aggregates():
    bills = [
        bill_base(id="bill-1", name="Luz"),
        bill_base(id="bill-2", name="Água"),
        bill_base(id="bill-3", name="Internet"),
    ]
    payments = [
        # Luz: paid in June (green), history in May/April
        payment(id="luz-jun", bill_id="bill-1", reference_period="2026-06", amount_cents=10000),
        payment(id="luz-mai", bill_id="bill-1", reference_period="2026-05", amount_cents=14000),
        payment(id="luz-abr", bill_id="bill-1", reference_period="2026-04", amount_cents=4000),
        # Água: unpaid in June (red), history -> average 6000
        payment(id="agua-mai", bill_id="bill-2", reference_period="2026-05", amount_cents=6000),
        payment(id="agua-abr", bill_id="bill-2", reference_period="2026-04", amount_cents=6000),
        payment(id="agua-mar", bill_id="bill-2", reference_period="2026-03", amount_cents=6000),
        # Internet: nothing -> red without history
    ]

    aggregates = derive_finance_aggregates(
        FixedClock(date(2026, 6, 15)), FakeCalendar(), bills, payments
    )

    assert aggregates == FinanceAggregates(
        total_paid_month_cents=10000,  # only Luz paid in June
        open_bills=2,  # Água + Internet (red)
        average_monthly_spend_cents=3000,  # (20000 + 10000 + 6000) / 12 months
        remaining_estimate_cents=6000,  # only Água (open, with history)
    )


def test_ignores_closed_bills_in_every_aggregate():
    bills = [
        bill_base(id="ativa"),
        bill_base(id="morta", state="encerrada", closed_on=date(2026, 1, 1)),
    ]
    payments = [
        payment(id="a", bill_id="ativa", reference_period="2026-06", amount_cents=10000),
        payment(id="m", bill_id="morta", reference_period="2026-06", amount_cents=99999),
    ]

    aggregates = derive_finance_aggregates(
        FixedClock(date(2026, 6, 15)), FakeCalendar(), bills, payments
    )

    assert aggregates.total_paid_month_cents == 10000
