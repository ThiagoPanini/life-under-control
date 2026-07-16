"""Historical analysis suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-analise-historica.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.historical_analysis import (
    HISTORICAL_WINDOW_MONTHS,
    MonthTotalPoint,
    derive_historical_analysis,
)
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import FixedClock

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


def points_of(series: list[MonthTotalPoint] | None) -> list[MonthTotalPoint]:
    """Unwraps the points, failing the test if the series came back empty."""
    if series is None:
        raise AssertionError("expected a non-None series, got None")
    return series


def point_of(series: list[MonthTotalPoint] | None, reference_period: str) -> MonthTotalPoint:
    for point in points_of(series):
        if point.reference_period == reference_period:
            return point
    raise AssertionError(f"point {reference_period} missing")


def test_window_of_twelve_reference_periods_ending_on_current():
    series = derive_historical_analysis(
        FixedClock(date(2026, 6, 15)), [payment(reference_period="2026-06")]
    )

    assert [point.reference_period for point in points_of(series)] == [
        "2025-07",
        "2025-08",
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
        "2026-03",
        "2026-04",
        "2026-05",
        "2026-06",
    ]
    assert HISTORICAL_WINDOW_MONTHS == 12


def test_sum_includes_payments_of_a_closed_bill():
    # A Payment of a Bill closed today is still a real fact of the reference
    # period — the series sums per reference period without filtering by Bill state.
    series = derive_historical_analysis(
        FixedClock(date(2026, 6, 15)),
        [
            payment(
                id="ativa", bill_id="bill-ativa", reference_period="2026-04", amount_cents=4000
            ),
            payment(
                id="encerrada",
                bill_id="bill-encerrada",
                reference_period="2026-04",
                amount_cents=5000,
            ),
        ],
    )

    assert point_of(series, "2026-04") == MonthTotalPoint(
        reference_period="2026-04", amount_cents=9000, state="fechado"
    )


def test_sum_aggregates_splits_of_the_same_reference_period():
    # Split payment: two Payments on the same Bill + reference period sum up.
    series = derive_historical_analysis(
        FixedClock(date(2026, 6, 15)),
        [
            payment(id="parte-1", reference_period="2026-03", amount_cents=3000),
            payment(id="parte-2", reference_period="2026-03", amount_cents=2500),
        ],
    )

    assert point_of(series, "2026-03") == MonthTotalPoint(
        reference_period="2026-03", amount_cents=5500, state="fechado"
    )


def test_current_month_marked_em_curso_even_with_amount():
    series = derive_historical_analysis(
        FixedClock(date(2026, 6, 15)), [payment(reference_period="2026-06", amount_cents=7000)]
    )

    assert point_of(series, "2026-06") == MonthTotalPoint(
        reference_period="2026-06", amount_cents=7000, state="em-curso"
    )


def test_series_alive_when_there_are_facts_in_the_window():
    # No notion of an active Bill at all: a single fact in the window is enough for the series to exist.
    series = derive_historical_analysis(
        FixedClock(date(2026, 6, 15)), [payment(reference_period="2026-02", amount_cents=1200)]
    )

    assert series is not None


def test_month_without_fact_does_not_become_a_silent_zero():
    # 2026-05 has no Payment — it is "sem-dado", not a disguised zero spend.
    series = derive_historical_analysis(
        FixedClock(date(2026, 6, 15)), [payment(reference_period="2026-04", amount_cents=4000)]
    )

    assert point_of(series, "2026-05") == MonthTotalPoint(
        reference_period="2026-05", amount_cents=0, state="sem-dado"
    )


def test_insufficient_history_keeps_window_with_explicit_sem_dado():
    # Only one recent fact: the earlier months become "sem-dado" (short history,
    # honest), and the series stays com-dados — the whole section never disappears.
    series = derive_historical_analysis(
        FixedClock(date(2026, 6, 15)), [payment(reference_period="2026-06", amount_cents=9000)]
    )
    points = points_of(series)

    assert len(points) == 12
    assert len([point for point in points if point.state == "sem-dado"]) == 11
    assert points[-1] == MonthTotalPoint(
        reference_period="2026-06", amount_cents=9000, state="em-curso"
    )


def test_no_fact_in_the_window_becomes_none():
    assert derive_historical_analysis(FixedClock(date(2026, 6, 15)), []) is None


def test_facts_outside_the_window_are_ignored():
    # The only Payment predates the 12-month window -> series without facts.
    series = derive_historical_analysis(
        FixedClock(date(2026, 6, 15)), [payment(reference_period="2024-01", amount_cents=9999)]
    )

    assert series is None
