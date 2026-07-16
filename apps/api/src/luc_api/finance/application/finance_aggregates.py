"""Finance Cockpit aggregates (issue #22): the month's aggregates atop `/areas/financas`, summing all active Bills.

Nothing here is a column — everything derives from Bills + Payments + `Clock` +
`Calendar` (invariant #3: persist facts, derive interpretations), reusing the
Bill card's derivations (issue #21): `beacon_of_month` and `recent_occurrences`.

Honest consequence of "no value on an unpaid Bill" (CONTEXT.md): there is no
exact "total to pay", so only the **paid** figure is exact (the sum of the
reference period's Payments); the rest of the month is a labeled **estimate**
derived from each Bill's history — and only for Bills that have history.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from luc_api.finance.application.bill_card import (
    OCCURRENCES_IN_WINDOW,
    beacon_of_month,
    recent_occurrences,
    reference_period_of,
)
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.domain.bill import Bill, Recurrence
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = [
    "SPEND_WINDOW_MONTHS",
    "ComparisonState",
    "FinanceAggregates",
    "MonthComparison",
    "MonthlySeriesPoint",
    "average_monthly_spend",
    "compare_closed_month",
    "count_open_bills",
    "derive_finance_aggregates",
    "derive_total_paid_series",
    "estimate_remaining_to_pay",
    "points_of",
    "total_paid_in_month",
]

SPEND_WINDOW_MONTHS = 12
"""Window of the average monthly spend: the last 12 **complete** months (excludes the current one)."""

_MONTHLY = Recurrence(interval_months=1, anchor_month=None)
"""Pure monthly recurrence — used only to enumerate the average-spend window's months."""

_OPEN_BEACONS = ("amarelo", "vermelho")
"""The two beacon states counted as "open" for `count_open_bills`/`estimate_remaining_to_pay`."""


@dataclass(frozen=True)
class MonthlySeriesPoint:
    """One point of a monthly series; `current` marks the current month (CONTEXT.md, "current month vs closed month")."""

    reference_period: str
    amount_cents: int
    current: bool


def derive_total_paid_series(
    bills: list[Bill], payments: list[Payment], today: date, size: int = 6
) -> list[MonthlySeriesPoint] | None:
    """Exact monthly series of the total paid, with gaps represented as zero.

    `None` when the Household has zero active Bills — an explicit empty shape:
    it is not six months of zero disguising the absence of any Bill. Unlike
    `historical_analysis`'s series, a month without a payment here is an exact
    zero, never a gap: this series sums only over Bills known to be active, so
    "no payment this month" is itself a fact, not an absence of data.
    """
    active = _active_bills(bills)
    if not active:
        return None

    active_ids = {bill.id for bill in active}
    current_reference_period = reference_period_of(today)
    reference_periods = recent_occurrences(_MONTHLY, current_reference_period, size)

    return [
        MonthlySeriesPoint(
            reference_period=reference_period,
            amount_cents=sum(
                payment.amount_cents
                for payment in payments
                if payment.bill_id in active_ids and payment.reference_period == reference_period
            ),
            current=reference_period == current_reference_period,
        )
        for reference_period in reference_periods
    ]


def points_of(series: list[MonthlySeriesPoint] | None) -> list[MonthlySeriesPoint]:
    """The series' points, or an empty list when the Household has no active Bill — the common unwrap for consumers."""
    return series or []


ComparisonState = Literal["em-curso", "sem-base-anterior", "fechado"]
"""State of the closed-month comparison. Values stay pt-BR (persisted/edge contract precedent, like `BeaconState`)."""


@dataclass(frozen=True)
class MonthComparison:
    """The honest month-over-month comparison (issue #48).

    The current month never compares — it is always `em-curso` (CONTEXT.md,
    "current month vs closed month") — and the variation only ever compares the
    last **closed** month against the one before it.
    """

    state: ComparisonState
    delta_percent: float | None = None
    """The percentage variation; set only when `state == "fechado"`.

    A genuine ratio (not money-in-cents): the sole exception to the
    "money is always int cents" rule. Not rounded here — display rounds it.
    """


_MIN_CLOSED_MONTHS_TO_COMPARE = 2
"""The comparison needs a closed month and the one right before it."""


def compare_closed_month(series: list[MonthlySeriesPoint] | None) -> MonthComparison:
    """Compares the last two closed months of a total-paid series.

    Fewer than two closed points (including an empty/`None` series) yields
    `em-curso`: there is no closed month to compare yet. A zero-valued previous
    month yields `sem-base-anterior` — dividing by zero would produce a
    meaningless spike, not an honest percentage.
    """
    if series is None:
        return MonthComparison(state="em-curso")

    closed = [point for point in series if not point.current]
    if len(closed) < _MIN_CLOSED_MONTHS_TO_COMPARE:
        return MonthComparison(state="em-curso")

    previous, current = closed[-2:]
    if previous.amount_cents == 0:
        return MonthComparison(state="sem-base-anterior")

    delta_percent = ((current.amount_cents - previous.amount_cents) / previous.amount_cents) * 100
    return MonthComparison(state="fechado", delta_percent=delta_percent)


@dataclass(frozen=True)
class FinanceAggregates:
    """The four month aggregates shown atop the cockpit. Money in cents (invariant #6)."""

    total_paid_month_cents: int
    """Total **paid** in the current month (exact): sum of the current reference period's Payments."""
    open_bills: int
    """Number of active Bills **open** this month — yellow beacon (close to due) or red (due/overdue)."""
    average_monthly_spend_cents: int | None
    """**Average** monthly spend (cents) over the 12 complete months; `None` without history in the window."""
    remaining_estimate_cents: int | None
    """**Estimate** of what is still left to pay (cents), only open Bills with history; `None` when none qualify."""


def _active_bills(bills: list[Bill]) -> list[Bill]:
    """The Bills in the `ativa` life state — the only ones any aggregate here considers."""
    return [bill for bill in bills if bill.state == "ativa"]


def total_paid_in_month(bills: list[Bill], payments: list[Payment], today: date) -> int:
    """Total paid in the current month: exact sum of active Bills' Payments whose reference period is `today`'s.

    A pure fact, no derivation — the cockpit's only "exact" number.
    """
    active_ids = {bill.id for bill in _active_bills(bills)}
    current_reference_period = reference_period_of(today)
    return sum(
        payment.amount_cents
        for payment in payments
        if payment.bill_id in active_ids and payment.reference_period == current_reference_period
    )


def count_open_bills(
    bills: list[Bill], payments: list[Payment], today: date, calendar: Calendar
) -> int:
    """Number of active Bills open this month: yellow beacon (close to due) or red (due today / overdue), unpaid.

    Green (paid) and gray (far from due) do not count. Reuses `beacon_of_month`.
    """
    count = 0
    for bill in _active_bills(bills):
        bill_payments = [payment for payment in payments if payment.bill_id == bill.id]
        beacon = beacon_of_month(bill, bill_payments, today, calendar)
        if beacon in _OPEN_BEACONS:
            count += 1
    return count


def average_monthly_spend(bills: list[Bill], payments: list[Payment], today: date) -> int | None:
    """Average monthly spend over the 12 **complete** months preceding the current one.

    Sums every Payment of active Bills in the window and divides by the full
    **12 months** — not by however many months actually had spend. Dividing by
    the whole window **amortizes** infrequent Bills (an annual R$1,200 one
    lands as ~R$100/month, not as a single R$1,200 spike); dividing only by the
    months with spend would inflate the headline. The current month stays out
    because it is still in progress. `None` when the window has no spend at
    all. Rounds to the cent.
    """
    active_ids = {bill.id for bill in _active_bills(bills)}
    # 13 months up to the current one, minus the current one: the window's 12 complete months.
    window = set(
        recent_occurrences(_MONTHLY, reference_period_of(today), SPEND_WINDOW_MONTHS + 1)[
            :SPEND_WINDOW_MONTHS
        ]
    )

    total = 0
    had_spend = False
    for payment in payments:
        if payment.bill_id in active_ids and payment.reference_period in window:
            total += payment.amount_cents
            had_spend = True

    if not had_spend:
        return None
    return _round_half_up(total, SPEND_WINDOW_MONTHS)


def _average_paid(bill: Bill, bill_payments: list[Payment], today: date) -> int | None:
    """Average (cents) of the amounts paid in the Bill's 12-occurrence window — the same average as the card (#21).

    Matches, per occurrence, the first Payment found for that reference period
    (no grid, no split-payment sum) and skips gaps. `None` without any payment
    in the window.
    """
    reference_periods = recent_occurrences(
        bill.recurrence, reference_period_of(today), OCCURRENCES_IN_WINDOW
    )
    amounts: list[int] = []
    for reference_period in reference_periods:
        found = next(
            (payment for payment in bill_payments if payment.reference_period == reference_period),
            None,
        )
        if found is not None:
            amounts.append(found.amount_cents)

    if not amounts:
        return None
    return _round_half_up(sum(amounts), len(amounts))


def estimate_remaining_to_pay(
    bills: list[Bill], payments: list[Payment], today: date, calendar: Calendar
) -> int | None:
    """Estimate of what is still left to pay this month.

    For every active Bill that is **open** (yellow or red beacon — the same set
    as `count_open_bills`) **and has history**, sums the average of its
    Payments. A Bill without history is not estimated (there is nothing to
    invent); a gray Bill (far from due) or green (paid) never enters. `None`
    when no Bill qualifies — there is nothing to estimate.
    """
    total: int | None = None
    for bill in _active_bills(bills):
        bill_payments = [payment for payment in payments if payment.bill_id == bill.id]
        beacon = beacon_of_month(bill, bill_payments, today, calendar)
        if beacon not in _OPEN_BEACONS:
            continue  # only open Bills
        average = _average_paid(bill, bill_payments, today)
        if average is None:
            continue  # no history: not estimated
        total = (total or 0) + average
    return total


def _round_half_up(total: int, count: int) -> int:
    """Rounds `total / count` to the nearest integer, ties rounding up (mirrors JS `Math.round`).

    Both operands are non-negative money sums here, so this integer formula
    avoids Python's `round()` (banker's rounding) without ever going through a
    float.
    """
    return (2 * total + count) // (2 * count)


def derive_finance_aggregates(
    clock: Clock, calendar: Calendar, bills: list[Bill], payments: list[Payment]
) -> FinanceAggregates:
    """Composes the four month aggregates from `Clock`/`Calendar` (the ports) and the facts (Bills + Payments).

    The edge injects the real adapters; Seam 1 injects the fakes.
    """
    today = clock.today()
    return FinanceAggregates(
        total_paid_month_cents=total_paid_in_month(bills, payments, today),
        open_bills=count_open_bills(bills, payments, today, calendar),
        average_monthly_spend_cents=average_monthly_spend(bills, payments, today),
        remaining_estimate_cents=estimate_remaining_to_pay(bills, payments, today, calendar),
    )
