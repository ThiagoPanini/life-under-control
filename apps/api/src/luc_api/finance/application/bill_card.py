"""Bill card derivations (issue #21) — the core of the panel and the agenda.

Nothing here is a column — everything is computed from the Bill + its Payments +
`Clock` + `Calendar` (invariant #3: persist facts, derive interpretations). The
Bill projects the "when" (expected due date); the Payments carry the "how much"
and "when paid".

The card is four lenses over the same window of occurrences: the current month's
**beacon**, the **grid** of the last 12 occurrences, and the **average 12 +
sparkline** of the amounts paid. Exact colors/layout are the Mirante's; this
module fixes the *semantics* of each state.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal, NamedTuple

from luc_api.finance.application.calendar import Calendar
from luc_api.finance.domain.bill import Bill, DueRule, FixedDayRule, LastBusinessDayRule, Recurrence
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = [
    "OCCURRENCES_IN_WINDOW",
    "PROXIMITY_THRESHOLD_DAYS",
    "TOLERANCE_THRESHOLD_DAYS",
    "BeaconState",
    "BillCard",
    "GridCell",
    "GridState",
    "PaymentsSummary",
    "add_months",
    "beacon_of_month",
    "default_payment_reference_period",
    "default_payment_reference_period_from_grid",
    "derive_bill_card",
    "grid_occurrences",
    "is_recurrence_occurrence",
    "payments_summary",
    "recent_occurrences",
    "reference_period_of",
    "resolve_due_date",
]

OCCURRENCES_IN_WINDOW = 12
"""Size of the grid/sparkline window: the last 12 occurrences."""

PROXIMITY_THRESHOLD_DAYS = 3
"""Beacon **proximity** threshold (days): at most N days to the due date, the beacon turns yellow.

Distinct from the grid's tolerance threshold below — the same number today (3),
but a different meaning, free to diverge later.
"""

TOLERANCE_THRESHOLD_DAYS = 3
"""Grid **tolerance** threshold (days): paid up to N days after the due date counts as a light delay."""

BeaconState = Literal["verde", "cinza", "amarelo", "vermelho"]
"""Beacon of the current month: paid (green), far (gray), close (yellow) or overdue/today (red).

Values are a persisted/edge contract and stay as in the TS oracle (mirrors `BillState`).
"""

GridState = Literal[
    "em-dia", "atraso-leve", "atraso", "em-aberto", "aguardando", "pago-sem-data", "fora-vigencia"
]
"""State of one grid cell.

`em-aberto` (due, never paid) is the "hole" — distinct from the beacon's solid red;
`aguardando` has not come due yet; `pago-sem-data` is neutral history (backfill
without a receipt); `fora-vigencia` predates the Bill's first reference period
(outside its effective period, ADR-0011) — never a hole: an erased, empty cell,
outside punctuality. Values stay as in the TS oracle.
"""


@dataclass(frozen=True)
class GridCell:
    """One cell of the grid: the occurrence, its expected due date, state and amount paid."""

    reference_period: str
    due_date: date
    state: GridState
    amount_cents: int | None
    """Amount paid in cents, or `None` when the occurrence has no Payment (a gap)."""


@dataclass(frozen=True)
class BillCard:
    """The card derived whole: current due date, beacon, grid and the paid-amounts summary."""

    current_due_date: date
    beacon: BeaconState
    grid: list[GridCell]
    """The 12 occurrences, oldest to most recent."""
    average_cents: int | None
    """Average (cents) of the amounts paid in the window; `None` without history."""
    sparkline: list[int | None]
    """The 12 paid amounts in grid order; `None` where there was no payment (a gap, never zero)."""


class PaymentsSummary(NamedTuple):
    """Average and sparkline derived from a grid."""

    average_cents: int | None
    sparkline: list[int | None]


def _month_index(reference_period: str) -> int:
    """Absolute month index of a reference period `YYYY-MM` (`year*12 + month-1`)."""
    year, month = (int(part) for part in reference_period.split("-"))
    return year * 12 + (month - 1)


def _reference_period_of_index(idx: int) -> str:
    year = idx // 12
    month = (idx % 12) + 1
    return f"{year}-{month:02d}"


def add_months(reference_period: str, n: int) -> str:
    """Adds `n` months to a reference period `YYYY-MM` (negative steps back), rolling the year."""
    return _reference_period_of_index(_month_index(reference_period) + n)


def reference_period_of(day: date) -> str:
    """The reference period (`YYYY-MM`) of a civil date."""
    return f"{day.year:04d}-{day.month:02d}"


def _last_day_of_month(year: int, month: int) -> int:
    """The last civil day of the month (1-based) — handles a leap February."""
    first_of_next_month = date(year + month // 12, month % 12 + 1, 1)
    return (first_of_next_month - timedelta(days=1)).day


def resolve_due_date(
    due_rule: DueRule, due_month_offset: int, reference_period: str, calendar: Calendar
) -> date:
    """Resolves the expected due date of a reference period.

    The reference period shifts by `due_month_offset` months and the rule resolves
    the day: `dia-fixo` lands on the civil day (clamped to month-end when past it);
    `n-esimo-dia-util` and `ultimo-dia-util` walk business days via `Calendar`.
    """
    target = add_months(reference_period, due_month_offset)
    year, month = (int(part) for part in target.split("-"))
    last_day = _last_day_of_month(year, month)

    match due_rule:
        case FixedDayRule(day=day):
            return date(year, month, min(day, last_day))
        case LastBusinessDayRule():
            for day_num in range(last_day, 0, -1):
                candidate = date(year, month, day_num)
                if calendar.is_business_day(candidate):
                    return candidate
            return date(year, month, last_day)  # defensive: no real calendar lacks a business day
        case _:  # NthBusinessDayRule
            business_days = 0
            last_business_day = date(year, month, last_day)
            for day_num in range(1, last_day + 1):
                candidate = date(year, month, day_num)
                if calendar.is_business_day(candidate):
                    business_days += 1
                    last_business_day = candidate
                    if business_days == due_rule.nth:
                        return candidate
            # Fewer business days in the month than the requested nth: the last one.
            return last_business_day


def _month_matches_anchor(month: int, interval_months: int, anchor_month: int | None) -> bool:
    """Does this month phase-match the anchor, given the interval? Interval <=1 or no anchor always matches."""
    if interval_months <= 1 or anchor_month is None:
        return True
    return ((month - anchor_month) % interval_months + interval_months) % interval_months == 0


def is_recurrence_occurrence(recurrence: Recurrence, reference_period: str) -> bool:
    """Is the reference period `YYYY-MM` an occurrence of the Recurrence?

    Monthly (or anchor-less) occurs every month; interval > 1 with an anchor only
    occurs on the months in phase with the anchor. Single source of the phase rule
    — shared with `recent_occurrences` and the year map, so a non-monthly Bill
    never diverges on when it occurs.
    """
    return _month_matches_anchor(
        int(reference_period[5:7]), recurrence.interval_months, recurrence.anchor_month
    )


def recent_occurrences(recurrence: Recurrence, ref_reference_period: str, n: int) -> list[str]:
    """The last `n` occurrence reference periods <= `ref_reference_period`, oldest to most recent.

    Monthly yields the last `n` months; when interval > 1, steps back to the anchor
    (the most recent occurrence in phase) and then jumps `interval_months` at a time.
    """
    interval_months, anchor_month = recurrence.interval_months, recurrence.anchor_month
    idx = _month_index(ref_reference_period)

    if interval_months > 1 and anchor_month is not None:
        while not _month_matches_anchor((idx % 12) + 1, interval_months, anchor_month):
            idx -= 1

    out = [_reference_period_of_index(idx - i * interval_months) for i in range(n)]
    out.reverse()
    return out


def _grid_state(payment: Payment | None, due_date: date, today: date) -> GridState:
    if payment is not None:
        if payment.paid_on is None:
            return "pago-sem-data"
        delay = (payment.paid_on - due_date).days
        if delay <= 0:
            return "em-dia"
        if delay <= TOLERANCE_THRESHOLD_DAYS:
            return "atraso-leve"
        return "atraso"
    # No payment: still in time (awaiting) or already due unpaid (open, the hole).
    return "aguardando" if (due_date - today).days > 0 else "em-aberto"


def _representative_payment(payments: list[Payment]) -> Payment | None:
    """The payment that represents the reference period for state/punctuality (#6).

    The one that **completes** the payment — the most recent by `paid_on`. Under a
    split payment (more than one Payment in the month, schema-allowed), punctuality
    reflects when the obligation was actually settled; if the last installment is
    late, the month counts as late. A dated payment beats an undated one (backfill
    without a receipt) in the tie-break.
    """
    if not payments:
        return None
    representative = payments[0]
    for candidate in payments[1:]:
        if representative.paid_on is None or (
            candidate.paid_on is not None and candidate.paid_on > representative.paid_on
        ):
            representative = candidate
    return representative


def beacon_of_month(
    bill: Bill, payments: list[Payment], today: date, calendar: Calendar
) -> BeaconState:
    """The beacon of the current month (the most recent occurrence <= today), in the 4 states."""
    reference_period = recent_occurrences(bill.recurrence, reference_period_of(today), 1)[0]
    if any(p.reference_period == reference_period for p in payments):
        return "verde"

    due_date = resolve_due_date(bill.due_rule, bill.due_month_offset, reference_period, calendar)
    days = (due_date - today).days
    if days > PROXIMITY_THRESHOLD_DAYS:
        return "cinza"
    if days >= 1:
        return "amarelo"
    return "vermelho"  # due today (0) or already overdue (< 0)


def grid_occurrences(
    bill: Bill, payments: list[Payment], today: date, calendar: Calendar
) -> list[GridCell]:
    """The grid of the last 12 occurrences, each with its due date, state and amount paid."""
    reference_periods = recent_occurrences(
        bill.recurrence, reference_period_of(today), OCCURRENCES_IN_WINDOW
    )
    cells: list[GridCell] = []
    for reference_period in reference_periods:
        due_date = resolve_due_date(
            bill.due_rule, bill.due_month_offset, reference_period, calendar
        )
        # Occurrence before the Bill's effective period (ADR-0011): outside effect,
        # never an open hole. A value gap — the average/sparkline already skip it.
        if reference_period < bill.first_reference_period:
            cells.append(
                GridCell(
                    reference_period=reference_period,
                    due_date=due_date,
                    state="fora-vigencia",
                    amount_cents=None,
                )
            )
            continue
        # Split payment (CONTEXT.md #6): the cell's amount sums **every** payment of
        # the reference period; the state comes from the representative one.
        of_month = [p for p in payments if p.reference_period == reference_period]
        cells.append(
            GridCell(
                reference_period=reference_period,
                due_date=due_date,
                state=_grid_state(_representative_payment(of_month), due_date, today),
                amount_cents=sum(p.amount_cents for p in of_month) if of_month else None,
            )
        )
    return cells


def _round_half_up(total: int, count: int) -> int:
    """Rounds `total / count` to the nearest integer, ties rounding up (mirrors JS `Math.round`).

    Both operands are non-negative money sums here, so this integer formula avoids
    Python's `round()` (banker's rounding) without ever going through a float.
    """
    return (2 * total + count) // (2 * count)


def payments_summary(grid: list[GridCell]) -> PaymentsSummary:
    """Average 12 and sparkline over the grid's amounts paid.

    A month without a payment is a gap (`None`), never zero; the average skips gaps
    and is `None` without history. The average is a derived interpretation — it
    rounds to the cent.
    """
    sparkline = [cell.amount_cents for cell in grid]
    paid = [v for v in sparkline if v is not None]
    average = _round_half_up(sum(paid), len(paid)) if paid else None
    return PaymentsSummary(average_cents=average, sparkline=sparkline)


def default_payment_reference_period_from_grid(grid: list[GridCell]) -> str:
    """The default reference period for a payment (#63), from an already-derived grid.

    The oldest open occurrence — a late June Internet bill settles in June, not
    July (an out-of-order payment keeps the right reference period). Without any
    open cell, falls back to the current occurrence (the grid's last). Default
    only; the field stays editable. Takes the ready grid (does not recompute) so
    the edge can reuse the same `derive_bill_card` call.
    """
    open_cell = next((cell for cell in grid if cell.state == "em-aberto"), None)
    return (open_cell or grid[-1]).reference_period


def default_payment_reference_period(
    clock: Clock, calendar: Calendar, bill: Bill, payments: list[Payment]
) -> str:
    """Like `default_payment_reference_period_from_grid`, but derives the grid from `Clock`/`Calendar`."""
    grid = grid_occurrences(bill, payments, clock.today(), calendar)
    return default_payment_reference_period_from_grid(grid)


def derive_bill_card(
    clock: Clock, calendar: Calendar, bill: Bill, payments: list[Payment]
) -> BillCard:
    """Composes the whole Bill card from the `Clock`/`Calendar` ports and the facts (Bill + Payments)."""
    today = clock.today()
    grid = grid_occurrences(bill, payments, today, calendar)
    summary = payments_summary(grid)
    return BillCard(
        current_due_date=grid[-1].due_date,
        beacon=beacon_of_month(bill, payments, today, calendar),
        grid=grid,
        average_cents=summary.average_cents,
        sparkline=summary.sparkline,
    )
