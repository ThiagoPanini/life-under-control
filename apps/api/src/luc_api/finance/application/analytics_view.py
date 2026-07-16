"""Per-Bill analytics view (issue #127): one row per Bill in the Recurring Payments cockpit.

Composes the historical beacon-grid (#21), Punctuality 12 (#58/#59), the
sparkline + Average 12 of the window and the current occurrence's
amount/state. Reuses the Panorama's state and rank (#93) — the state pill
is a single source — and the card's own derivations (#21); the edge only
presents (invariant #3; ADR-0003).
"""

from dataclasses import dataclass
from datetime import date

from luc_api.finance.application.bill_card import (
    GridCell,
    grid_occurrences,
    payments_summary,
    recent_occurrences,
    reference_period_of,
    resolve_due_date,
)
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.application.monthly_panorama import (
    CardAmount,
    MonthCardState,
    phrase_of_month_card,
    state_of_occurrence,
)
from luc_api.finance.application.punctuality import PunctualityDetail, detail_bill_punctuality
from luc_api.finance.application.year_map import ValueClassification, classify_value
from luc_api.finance.domain.bill import Bill
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = [
    "AnalyticsRow",
    "ValueDeviation",
    "derive_analytics_view",
]


@dataclass(frozen=True)
class ValueDeviation:
    """A paid amount's deviation (cents) vs the Bill's average, classified by the Year Map's rule."""

    amount_cents: int
    state: ValueClassification


@dataclass(frozen=True)
class AnalyticsRow:
    """One row of the Analytics View: a Bill's current occurrence plus its history."""

    bill_id: str
    closed: bool
    """`encerrada` — a closed Bill appears at the end, dimmed, without amount/registration (edge concern, only with the switch on)."""
    state: MonthCardState
    """State of the current occurrence — same source as the Panorama card."""
    current_reference_period: str
    """The current occurrence's reference period (Competência) — the settlement is born into it."""
    due_date: date
    """Expected due date of the current occurrence, native date — derived, never a column."""
    amount: CardAmount
    phrase: str
    """pt-BR product copy — same single source as the Panorama."""
    authorship: str | None
    """Who recorded the current occurrence's last settlement; `None` while open."""
    grid: list[GridCell]
    """The last 12 occurrences (occurrence-window, not civil month) — the beacon strip."""
    sparkline: list[int | None]
    """Same window's paid amounts; a gap (`None`) where unpaid, never zero."""
    average_cents: int | None
    """Average (cents) over that same window; `None` without history."""
    value_deviation: ValueDeviation | None
    """The current PAID amount's deviation vs the average, classified by the same rule as the Year Map; `None` when not both present."""
    punctuality: PunctualityDetail


_URGENCY_RANK: dict[MonthCardState, int] = {
    "vencida": 0,
    "vence-em-breve": 1,
    "a-vencer": 2,
    "pago": 3,
}
"""Urgency rank — mirrors the Panorama's own rank (#93), re-derived locally (a small private helper, not shared across modules)."""


def _days_until(today: date, target: date) -> int:
    """Civil days from `today` to `target` — negative once `target` has passed."""
    return (target - today).days


def _last_settlement(bill_payments: list[Payment]) -> Payment | None:
    """The reference period's last settlement (by paid date) — carries authorship and "pago em".

    An undated Payment sorts as the earliest possible date (`date.min`) — the
    same tie-break as the Panorama's own private `_last_settlement`,
    re-derived here (small private helpers are duplicated per-module in this
    codebase, not shared).
    """
    if not bill_payments:
        return None
    return sorted(bill_payments, key=lambda p: p.paid_on or date.min)[-1]


def _build_row(
    bill: Bill, bill_payments: list[Payment], today: date, calendar: Calendar
) -> AnalyticsRow:
    """Builds a Bill's row over its **current occurrence** (the most recent up to today).

    Recurrence-aware, via `recent_occurrences`, NOT the civil-month reference
    period like the Panorama — this row exists for every Bill (including a
    bimonthly/yearly one out of phase this civil month), unlike the Panorama
    which only lists Bills with an occurrence in the current civil month.
    """
    current_reference_period = recent_occurrences(bill.recurrence, reference_period_of(today), 1)[0]
    due_date = resolve_due_date(
        bill.due_rule, bill.due_month_offset, current_reference_period, calendar
    )

    # Paid amount = the **exact** sum of every settlement of the current occurrence,
    # including splits (CONTEXT.md #6). The grid/sparkline cell comes from
    # `grid_occurrences`, which also sums the reference period's settlements
    # (#131) — the Amount column and the sparkline point agree.
    settlements = [p for p in bill_payments if p.reference_period == current_reference_period]
    total = sum(p.amount_cents for p in settlements) if settlements else None
    settled = total is not None
    days = _days_until(today, due_date)
    state = state_of_occurrence(settled, days)
    last = _last_settlement(settlements)

    grid = grid_occurrences(bill, bill_payments, today, calendar)
    summary = payments_summary(grid)
    average = summary.average_cents
    value_deviation = (
        ValueDeviation(amount_cents=total - average, state=classify_value(total, average))
        if total is not None and average is not None
        else None
    )

    # Open: estimate from the grid window's average (the same as the Average 12
    # column — adjacent columns agree), never R$ 0,00 (CONTEXT.md #4/#5).
    if total is not None:
        amount = CardAmount(state="pago", amount_cents=total)
    elif average is not None:
        amount = CardAmount(state="estimativa", amount_cents=average)
    else:
        amount = CardAmount(state="ausente")

    return AnalyticsRow(
        bill_id=bill.id,
        closed=bill.state == "encerrada",
        state=state,
        current_reference_period=current_reference_period,
        due_date=due_date,
        amount=amount,
        phrase=phrase_of_month_card(state, days, last.paid_on if last is not None else None),
        authorship=last.paid_by if last is not None else None,
        grid=grid,
        sparkline=summary.sparkline,
        average_cents=average,
        value_deviation=value_deviation,
        punctuality=detail_bill_punctuality(grid),
    )


def derive_analytics_view(
    clock: Clock,
    calendar: Calendar,
    bills: list[Bill],
    payments: list[Payment],
    include_closed: bool = False,
) -> list[AnalyticsRow]:
    """Derives the Analytics View's rows from the `Clock`/`Calendar` ports and the facts.

    One row per active Bill, ordered by the **same** urgency as the Panorama
    (the state's rank, ties broken by proximity to the due date). With
    `include_closed`, closed Bills go to the end (most recent closing first),
    dimmed — the edge renders them without amount or registration. Without
    any Bill, returns empty (the section disappears).
    """
    today = clock.today()

    # Bill -> its Payments index: one pass, no per-Bill scan.
    by_bill: dict[str, list[Payment]] = {}
    for p in payments:
        by_bill.setdefault(p.bill_id, []).append(p)

    def build(bill: Bill) -> AnalyticsRow:
        return _build_row(bill, by_bill.get(bill.id, []), today, calendar)

    active_rows = sorted(
        (build(bill) for bill in bills if bill.state == "ativa"),
        key=lambda row: (_URGENCY_RANK[row.state], _days_until(today, row.due_date)),
    )

    if not include_closed:
        return active_rows

    # Most recent closing first; `closed_on` is always set when `encerrada`.
    closed_bills = sorted(
        (bill for bill in bills if bill.state == "encerrada"),
        key=lambda bill: bill.closed_on or date.min,
        reverse=True,
    )
    closed_rows = [build(bill) for bill in closed_bills]

    return [*active_rows, *closed_rows]
