"""Year map derivation (issue #102): the Bill x reference-period matrix.

Nothing here is a column — every cell derives from the Bill's effective period,
its Recurrence, the Payments and `Clock`/`Calendar` (invariant #3: persist
facts, derive interpretations).

A Bill's **effective period** runs from `first_reference_period` (where it
starts projecting) to the reference period of its closing (`closed_on`), or is
open-ended while active. Months outside it are never "unpaid": they're
`fora-vigencia`. Inside it, a month outside the Recurrence's phase is
`sem-ocorrencia`; an occurrence with no fact is `por-vir` or `vencida`
depending on the due date; an occurrence with a fact sums the splits and
compares against the **Bill's own average** (valid facts only, gap != zero)
with a +/-5% tolerance.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from luc_api.finance.application.bill_card import (
    is_recurrence_occurrence,
    recent_occurrences,
    reference_period_of,
    resolve_due_date,
    round_half_up,
)
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.application.historical_analysis import HISTORICAL_WINDOW_MONTHS, MONTHLY
from luc_api.finance.domain.bill import Bill, BillState
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = [
    "YEAR_MAP_WINDOW_MONTHS",
    "CellState",
    "MapCell",
    "MapRow",
    "ValueClassification",
    "YearMap",
    "classify_value",
    "derive_year_map",
]

YEAR_MAP_WINDOW_MONTHS = HISTORICAL_WINDOW_MONTHS
"""The map's window: the twelve reference periods up to the current one — the SAME window as the historical analysis (ADR-0011)."""

_TOLERANCE_DIVISOR = 20
"""±5% "at the average" without floats: |deviation| <= 5% of average <=> |deviation| * 20 <= average (5% = average/20). Integer cents (invariant #6)."""

ValueClassification = Literal["acima", "na-media", "abaixo"]
"""Classifies a fact against the Bill's average with +/-5% tolerance. Values stay pt-BR."""


def classify_value(amount_cents: int, average_cents: int) -> ValueClassification:
    """Classifies an amount against an average with +/-5% tolerance (integer cents, no floats)."""
    deviation = amount_cents - average_cents
    if abs(deviation) * _TOLERANCE_DIVISOR <= average_cents:
        return "na-media"
    return "acima" if deviation > 0 else "abaixo"


CellState = Literal[
    "fora-vigencia", "sem-ocorrencia", "por-vir", "vencida", "acima", "na-media", "abaixo"
]
"""State of one map cell.

`fora-vigencia`/`sem-ocorrencia` are honest absences (never "unpaid"); a
fact-less occurrence is `por-vir`/`vencida`; the `acima`/`na-media`/`abaixo`
trio classifies a fact against the Bill's average. Values stay pt-BR.
"""


@dataclass(frozen=True)
class MapCell:
    """One cell of the map: the reference period, its state, the aggregated amount and the deviation vs average."""

    reference_period: str
    state: CellState
    amount_cents: int | None
    """Sum of the Bill+reference-period facts (cents); `None` without a fact (a gap, never zero)."""
    deviation_cents: int | None
    """Deviation (cents) vs the Bill's average (`amount_cents - average_cents`); `None` when not computable."""


@dataclass(frozen=True)
class MapRow:
    """One row of the map: the Bill, its average of valid facts and the twelve cells of the window."""

    bill_id: str
    name: str
    icon: str
    state: BillState
    average_cents: int | None
    """Average (cents) of the Bill's valid facts in the window; `None` without history."""
    cells: list[MapCell]
    """The twelve cells, oldest reference period to most recent."""


@dataclass(frozen=True)
class YearMap:
    """The Year Map.

    `sem-contas` is the honest empty state: no Bill's effective period
    intersects the window. `com-contas` carries the window and one row per
    Bill alive in the period (including a closed one whose effective period
    still touches the window).
    """

    state: Literal["sem-contas", "com-contas"]
    reference_periods: list[str] = field(default_factory=list[str])
    """The window's reference periods."""
    rows: list[MapRow] = field(default_factory=list[MapRow])
    """One row per Bill whose effective period intersects the window."""


def _index_by_bill(payments: list[Payment]) -> dict[str, list[Payment]]:
    """Groups Payments by Bill in one pass — the index each row queries."""
    index: dict[str, list[Payment]] = defaultdict(list)
    for payment in payments:
        index[payment.bill_id].append(payment)
    return index


def _classify_cell(  # noqa: PLR0913 — arity mirrors the oracle's classificarCelula
    bill: Bill,
    reference_period: str,
    total: int | None,
    average: int | None,
    end_reference_period: str | None,
    today: date,
    calendar: Calendar,
) -> MapCell:
    """Classifies one cell.

    Precedence order: outside the effective period first; then a present fact
    (never hidden, even falling outside the Recurrence's phase); only then the
    fact-less occurrence (`por-vir`/`vencida`) and the no-occurrence month.
    """
    if reference_period < bill.first_reference_period or (
        end_reference_period is not None and reference_period > end_reference_period
    ):
        return MapCell(
            reference_period=reference_period,
            state="fora-vigencia",
            amount_cents=None,
            deviation_cents=None,
        )

    if total is not None:
        # There's a fact: at least one value, so the average is not None. The
        # guard keeps the type honest.
        state: CellState = "na-media" if average is None else classify_value(total, average)
        deviation = None if average is None else total - average
        return MapCell(
            reference_period=reference_period,
            state=state,
            amount_cents=total,
            deviation_cents=deviation,
        )

    if not is_recurrence_occurrence(bill.recurrence, reference_period):
        return MapCell(
            reference_period=reference_period,
            state="sem-ocorrencia",
            amount_cents=None,
            deviation_cents=None,
        )

    due_date = resolve_due_date(bill.due_rule, bill.due_month_offset, reference_period, calendar)
    # "Due today" already counts as overdue (>=), like the card's beacon/grid (a
    # due date <= today is the open hole) — the two cockpits must never disagree
    # on day-D urgency.
    return MapCell(
        reference_period=reference_period,
        state="vencida" if today >= due_date else "por-vir",
        amount_cents=None,
        deviation_cents=None,
    )


def derive_year_map(
    clock: Clock, calendar: Calendar, bills: list[Bill], payments: list[Payment]
) -> YearMap:
    """Derives the Year Map from the `Clock`/`Calendar` ports and the facts (Bills + Payments).

    The edge injects the real adapters; Seam 1 injects the fakes. One scan
    indexes the Payments by Bill; each Bill whose effective period intersects
    the window becomes a row.
    """
    today = clock.today()
    window = recent_occurrences(MONTHLY, reference_period_of(today), YEAR_MAP_WINDOW_MONTHS)
    first_window_reference_period = window[0]
    last_window_reference_period = window[-1]
    by_bill = _index_by_bill(payments)

    rows: list[MapRow] = []
    for bill in bills:
        end_reference_period = reference_period_of(bill.closed_on) if bill.closed_on else None
        # Does the effective period intersect the window? (starts before the
        # window ends and didn't end before it starts.)
        if bill.first_reference_period > last_window_reference_period:
            continue
        if (
            end_reference_period is not None
            and end_reference_period < first_window_reference_period
        ):
            continue

        # Totals per reference period within the window AND the effective
        # period — splits of the same Bill+reference-period sum. A fact
        # outside the effective period (reference period before the first, or
        # after closing) is hidden in the cell (fora-vigencia); it must not
        # enter the average, or it would pollute an average without a
        # matching cell.
        totals: dict[str, int] = {}
        for payment in by_bill.get(bill.id, []):
            if (
                payment.reference_period < first_window_reference_period
                or payment.reference_period > last_window_reference_period
            ):
                continue
            if payment.reference_period < bill.first_reference_period or (
                end_reference_period is not None and payment.reference_period > end_reference_period
            ):
                continue
            totals[payment.reference_period] = (
                totals.get(payment.reference_period, 0) + payment.amount_cents
            )

        values = list(totals.values())
        average = round_half_up(sum(values), len(values)) if values else None

        cells = [
            _classify_cell(
                bill,
                reference_period,
                totals.get(reference_period),
                average,
                end_reference_period,
                today,
                calendar,
            )
            for reference_period in window
        ]
        rows.append(
            MapRow(
                bill_id=bill.id,
                name=bill.name,
                icon=bill.icon,
                state=bill.state,
                average_cents=average,
                cells=cells,
            )
        )

    if not rows:
        return YearMap(state="sem-contas")
    return YearMap(state="com-contas", reference_periods=window, rows=rows)
