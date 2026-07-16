"""Occurrence state derivations (issue #62): the beacon/phrase/order for every occurrence view.

Dashboard, hybrid line, Bill detail, agenda: no edge reinterprets — the same
input yields the same phrase in every view. The input already carries the
resolved due date (the Bill projects the "when" — invariant #5) and whether
the occurrence is settled (has a Payment in that reference period); this
module knows neither Bill nor Payment, only the reading already done of them.
"""

from dataclasses import dataclass
from datetime import date

from luc_api.finance.application.bill_card import PROXIMITY_THRESHOLD_DAYS, BeaconState
from luc_api.finance.domain.bill import MONTHS_PT, Recurrence
from luc_api.finance.domain.payment import describe_reference_period_pt
from luc_api.shared.domain import format_br_date

__all__ = [
    "Occurrence",
    "beacon_of_occurrence",
    "long_reading_of_occurrence",
    "phrase_of_occurrence",
    "sort_by_urgency",
]

_BEACON_RANK: dict[BeaconState, int] = {"vermelho": 0, "amarelo": 1, "cinza": 2, "verde": 3}


@dataclass(frozen=True)
class Occurrence:
    """An occurrence already read: resolved due date, reference period and settlement."""

    due_date: date
    """Expected due date of the occurrence, already resolved by the Bill (invariant #5)."""
    reference_period: str
    """The reference period (Competência) of the occurrence, `YYYY-MM`."""
    recurrence: Recurrence
    """The Bill's Recurrence — sets the reference period's display granularity."""
    settled: bool
    """Has a Payment in that reference period."""


def _days_until_due(occurrence: Occurrence, today: date) -> int:
    """Civil days from `today` to the occurrence's due date — negative once it is overdue."""
    return (occurrence.due_date - today).days


def beacon_of_occurrence(occurrence: Occurrence, today: date) -> BeaconState:
    """The occurrence's beacon in the 4 states."""
    if occurrence.settled:
        return "verde"
    days = _days_until_due(occurrence, today)
    if days > PROXIMITY_THRESHOLD_DAYS:
        return "cinza"
    if days >= 1:
        return "amarelo"
    return "vermelho"


def phrase_of_occurrence(occurrence: Occurrence, today: date) -> str:
    """The occurrence's reading phrase (product copy).

    E.g. "venceu há 8 dias", "vence hoje", "vence em 2 dias", "em 14 dias",
    "quitada · Julho/2026".
    """
    if occurrence.settled:
        period = describe_reference_period_pt(occurrence.reference_period, occurrence.recurrence)
        return f"quitada · {period}"

    days = _days_until_due(occurrence, today)
    if days < 0:
        return f"venceu há {-days} {'dia' if -days == 1 else 'dias'}"
    if days == 0:
        return "vence hoje"
    if days <= PROXIMITY_THRESHOLD_DAYS:
        return f"vence em {days} {'dia' if days == 1 else 'dias'}"
    return f"em {days} {'dia' if days == 1 else 'dias'}"


def long_reading_of_occurrence(occurrence: Occurrence, today: date) -> str:
    """The occurrence's long reading, for the Bill detail header-card (#59).

    Settled never repeats the due date — the pill/short phrase already covers
    "when it was paid".
    """
    month = MONTHS_PT[int(occurrence.reference_period[5:7]) - 1].lower()
    if occurrence.settled:
        return f"competência de {month} quitada"

    days = _days_until_due(occurrence, today)
    due_date_br = format_br_date(occurrence.due_date)
    if days < 0:
        return f"competência de {month} sem Lançamento — venceu {due_date_br}"
    if days == 0:
        return f"competência de {month} sem Lançamento — vence hoje"
    return f"competência de {month} sem Lançamento — vence {due_date_br}"


def sort_by_urgency(occurrences: list[Occurrence], today: date) -> list[Occurrence]:
    """Sorts occurrences by urgency: red → yellow → gray → green; ties break by due-date proximity.

    Returns a new list; the input is never mutated.
    """

    def _urgency_key(occurrence: Occurrence) -> tuple[int, int]:
        beacon_rank = _BEACON_RANK[beacon_of_occurrence(occurrence, today)]
        return (beacon_rank, _days_until_due(occurrence, today))

    return sorted(occurrences, key=_urgency_key)
