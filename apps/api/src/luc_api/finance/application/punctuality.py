"""Punctuality 12m (issue #58): composes over the Bill card's occurrence grid (issue #21) — never reimplements beacon or state.

Counts only occurrences already due (never `aguardando`, which never had a
chance to be late) with a known payment date (never `pago-sem-data` —
backfill without a receipt can't be judged for punctuality). `sem-historico`
("no history") when no occurrence qualifies.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from luc_api.finance.application.bill_card import GridCell, grid_occurrences
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.domain.bill import Bill
from luc_api.finance.domain.payment import Payment

__all__ = [
    "PunctualityDetail",
    "PunctualityState",
    "calculate_bill_punctuality",
    "calculate_punctuality_12m",
    "detail_bill_punctuality",
]

PunctualityState = Literal["sem-historico", "calculada"]
"""State of a punctuality reading: `sem-historico` (no occurrence qualifies) or `calculada`.

Values stay pt-BR, as in the TS oracle — a persisted/edge contract precedent
(mirrors `GridState`, `BillState`).
"""


@dataclass(frozen=True)
class PunctualityDetail:
    """A ready-for-UI reading of a Bill's punctuality: percentage plus a factual N/M phrase."""

    state: PunctualityState
    percentage: int | None = None
    """0-100 rounded percentage on time; `None` under `sem-historico`."""
    on_time: int | None = None
    """Count of on-time occurrences; `None` under `sem-historico`."""
    total: int | None = None
    """Count of occurrences that qualify for the punctuality count; `None` under `sem-historico`."""
    phrase: str | None = None
    """pt-BR product copy, e.g. "8/10 no prazo"; `None` under `sem-historico`."""


def _active_bills(bills: list[Bill]) -> list[Bill]:
    """Bills in `ativa` state — a closed Bill never enters the Household's aggregate."""
    return [bill for bill in bills if bill.state == "ativa"]


def _round_half_up_percentage(on_time: int, total: int) -> int:
    """Rounds `on_time / total * 100` to the nearest integer, ties rounding up (mirrors JS `Math.round`).

    Both operands are non-negative counts here, so this integer formula avoids
    Python's `round()` (banker's rounding) without ever going through a float.
    """
    return (2 * on_time * 100 + total) // (2 * total)


def detail_bill_punctuality(grid: list[GridCell]) -> PunctualityDetail:
    """A ready-for-UI reading of the grid's punctuality: percentage and a factual N/M phrase.

    Counts only occurrences already due, with a known payment date: `aguardando`
    never had a chance to be late, `pago-sem-data` (backfill without a receipt)
    can't be judged for punctuality, and `fora-vigencia` predates the Bill's
    effective period (ADR-0011) — none of the three ever drag down a young
    Bill's punctuality.
    """
    on_time = 0
    total = 0
    for cell in grid:
        if cell.state in ("aguardando", "pago-sem-data", "fora-vigencia"):
            continue
        total += 1
        if cell.state == "em-dia":
            on_time += 1
    if total == 0:
        return PunctualityDetail(state="sem-historico")
    return PunctualityDetail(
        state="calculada",
        percentage=_round_half_up_percentage(on_time, total),
        on_time=on_time,
        total=total,
        phrase=f"{on_time}/{total} no prazo",
    )


def _punctuality_of_grid(grid: list[GridCell]) -> int | None:
    """The shared core both public functions delegate to: a bare 0-100 percentage, or `None`."""
    detail = detail_bill_punctuality(grid)
    return detail.percentage if detail.state == "calculada" else None


def calculate_punctuality_12m(
    bills: list[Bill], payments: list[Payment], today: date, calendar: Calendar
) -> int | None:
    """Punctuality 12m of the whole Household: active Bills only, over their occurrence grids."""
    grid = [
        cell
        for bill in _active_bills(bills)
        for cell in grid_occurrences(
            bill, [payment for payment in payments if payment.bill_id == bill.id], today, calendar
        )
    ]
    return _punctuality_of_grid(grid)


def calculate_bill_punctuality(grid: list[GridCell]) -> int | None:
    """Punctuality 12m of **one** Bill (issue #59), over the grid it already carries from `derive_bill_card` — nothing recomputed.

    Unlike `calculate_punctuality_12m`, does not filter by active Bill: this
    reading shows the Bill's own punctuality even when it is closed.
    """
    return _punctuality_of_grid(grid)
