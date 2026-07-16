"""Historical analysis derivation (issue #189): the Total Paid by Month series.

Nothing here is a column — the series is computed from `Payment`s + `Clock`
(invariant #3: persist facts, derive interpretations). The window is arithmetic
over civil months (no `Calendar`, unlike the bill card): the Total Paid by Month
never depends on business days.
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from luc_api.finance.application.bill_card import recent_occurrences, reference_period_of
from luc_api.finance.domain.bill import Recurrence
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = [
    "HISTORICAL_WINDOW_MONTHS",
    "MONTHLY",
    "MonthTotalPoint",
    "MonthTotalState",
    "derive_historical_analysis",
]

HISTORICAL_WINDOW_MONTHS = 12
"""The Historical Analysis window: the twelve consecutive reference periods up to the current one (inclusive)."""

MONTHLY = Recurrence(interval_months=1, anchor_month=None)
"""Pure monthly recurrence — enumerates the consecutive-month window (no anchor).

Shared with the year map (#102, ported right after this one), which uses the
same window (ADR-0011).
"""

MonthTotalState = Literal["fechado", "em-curso", "sem-dado"]
"""State of one series point.

`em-curso` is the current month (partial); `sem-dado` is a closed month without
any Payment — an honest absence, not a zero spend (CONTEXT.md #3: absence != zero).
The rest is `fechado` (closed month with a fact). Values stay pt-BR (persisted/edge
contract precedent, like `BeaconState`).
"""


@dataclass(frozen=True)
class MonthTotalPoint:
    """One point of the Total Paid by Month series."""

    reference_period: str
    amount_cents: int
    state: MonthTotalState


def _index_by_reference_period(payments: list[Payment]) -> dict[str, list[Payment]]:
    """Groups Payments by reference period in one pass — the index the window queries."""
    index: dict[str, list[Payment]] = defaultdict(list)
    for payment in payments:
        index[payment.reference_period].append(payment)
    return index


def derive_historical_analysis(
    clock: Clock, payments: list[Payment], size: int = HISTORICAL_WINDOW_MONTHS
) -> list[MonthTotalPoint] | None:
    """Total Paid by Month in the last `size` reference periods up to the current one.

    Derived only from the facts (`Clock` injected, no `Calendar` — the window is
    civil-month arithmetic, not business-day). Sums **all** Payments per reference
    period, without filtering by Bill state: splits sum and facts of Bills closed
    today still count. Pre-indexes the Payments by reference period (one scan) and
    only then walks the window.

    Returns `None` when there is no Payment at all in the whole window — the
    honest empty state, never confused with twelve months of zero (CONTEXT.md #3:
    absence != zero). A non-`None` return is always the full-size list of points
    (one per month in the window), with `sem-dado` marking months without a fact —
    a short history stays visible, it never disappears.
    """
    current_reference_period = reference_period_of(clock.today())
    window = recent_occurrences(MONTHLY, current_reference_period, size)
    by_reference_period = _index_by_reference_period(payments)

    # One scan of the window: builds the points and detects any fact (which keeps
    # the series alive even without an active Bill) — no second pass.
    points: list[MonthTotalPoint] = []
    has_fact = False
    for reference_period in window:
        facts = by_reference_period.get(reference_period, [])
        if facts:
            has_fact = True
        amount_cents = sum(payment.amount_cents for payment in facts)
        state: MonthTotalState = (
            "em-curso"
            if reference_period == current_reference_period
            else "sem-dado"
            if not facts
            else "fechado"
        )
        points.append(
            MonthTotalPoint(
                reference_period=reference_period, amount_cents=amount_cents, state=state
            )
        )

    return points if has_fact else None
