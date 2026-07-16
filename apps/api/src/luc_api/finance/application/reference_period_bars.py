"""Reference period bar derivations (issue #55): bar state atop the total-paid series (#48).

`lacuna` (gap) is the honest absence — no active Bill expected an occurrence in
that reference period (e.g. a quarterly Bill outside its anchor month) —
distinct from `fechado` (closed) with `amount_cents: 0`, which is the real fact
"expected it and didn't pay". CONTEXT.md invariant #3: a derived interpretation,
never a zero disguising the absence of expectation.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from luc_api.finance.application.bill_card import recent_occurrences, reference_period_of
from luc_api.finance.application.finance_aggregates import MonthlySeriesPoint, points_of
from luc_api.finance.domain.bill import Bill

__all__ = [
    "BarPoint",
    "BarState",
    "closed_values",
    "reference_period_bar_points",
]

BarState = Literal["fechado", "em-curso", "lacuna"]
"""State of a bar (issue #55). Values stay pt-BR (persisted/edge contract precedent, like `BeaconState`)."""


@dataclass(frozen=True)
class BarPoint:
    """One bar: a reference period, its amount and derived bar state."""

    reference_period: str
    amount_cents: int
    state: BarState


def reference_period_bar_points(
    series: list[MonthlySeriesPoint] | None, bills: list[Bill], today: date
) -> list[BarPoint]:
    """Reclassify the total-paid series (#48) per bar.

    The current month is always `em-curso`; a closed month with no active Bill
    expecting an occurrence becomes `lacuna`; the rest is `fechado` (even when
    `amount_cents` is zero for lack of payment — a real fact, not a gap).
    """
    points = points_of(series)
    if not points:
        return []

    expected = _expected_reference_periods(bills, reference_period_of(today), len(points))
    return [
        BarPoint(
            reference_period=point.reference_period,
            amount_cents=point.amount_cents,
            state=(
                "em-curso"
                if point.current
                else "lacuna"
                if point.amount_cents == 0 and point.reference_period not in expected
                else "fechado"
            ),
        )
        for point in points
    ]


def closed_values(points: list[BarPoint]) -> list[int]:
    """Values ready for the sparkline (#55/#56): only `fechado` reference periods.

    Never `em-curso` (a partial month would lie on the line) nor `lacuna` (not a
    paid value, an absence of expectation).
    """
    return [point.amount_cents for point in points if point.state == "fechado"]


def _expected_reference_periods(
    bills: list[Bill], current_reference_period: str, size: int
) -> set[str]:
    """The reference periods some Bill expected an occurrence in, within the last `size` months.

    A closed Bill still expected an occurrence **before** it closed — excluding
    it would erase a real "expected it and didn't pay" fact (e.g. a missed month
    before canceling the subscription), disguising it as a gap. But it can't
    expect anything **after** its own closing, nor **before** it started
    projecting — hence the cap at the closing reference period's month on one
    end and `first_reference_period` on the other (a brand-new Bill must not
    turn the months before it existed into false "expected it" facts).
    """
    expected: set[str] = set()
    for bill in bills:
        ref_reference_period = (
            min(reference_period_of(bill.closed_on), current_reference_period)
            if bill.state == "encerrada" and bill.closed_on is not None
            else current_reference_period
        )
        for reference_period in recent_occurrences(bill.recurrence, ref_reference_period, size):
            if reference_period < bill.first_reference_period:
                continue
            expected.add(reference_period)
    return expected
