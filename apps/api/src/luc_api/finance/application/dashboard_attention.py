"""Dashboard "attention" use-case (issue #47): composes reference-period shape (#61) and occurrence-state beacon/phrase/urgency (#62) — never recomputes beacon, phrase or proximity itself.

Today only Finance feeds real Bills; the origin catalog grows per Area
(ADR-0005), never generalized from here.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Literal, NamedTuple, cast

from luc_api.finance.application.bill_card import (
    recent_occurrences,
    reference_period_of,
    resolve_due_date,
)
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.application.occurrence_state import (
    Occurrence,
    beacon_of_occurrence,
    phrase_of_occurrence,
    sort_by_urgency,
)
from luc_api.finance.application.reference_period_shape import (
    SettledCount,
    TrackMarker,
    count_settled,
    derive_track_markers,
    historical_average_up_to,
)
from luc_api.finance.domain.bill import MONTHS_PT, Bill
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = [
    "ActiveAreaHero",
    "AttentionItem",
    "AttentionStrip",
    "DashboardAttention",
    "NextItem",
    "derive_active_area_hero",
    "derive_attention_strip",
    "derive_dashboard_attention",
]

_PAYMENTS_ORIGIN = (
    "Finanças · Pagamentos Recorrentes"  # ORIGEM_PAGAMENTOS — hardcoded: the Area/Subject
)
# catalog (AREAS/SUBJECTS in the TS oracle) doesn't exist in apps/api yet; only one Area/Subject pair
# is active today, so porting a whole generic catalog for one fixed label would be premature (CLAUDE.md).


@dataclass(frozen=True)
class AttentionItem:
    """One item of the "pede atenção" strip: overdue, due today, or due within 3 days."""

    bill_id: str
    title: str
    reference_period: str
    """The pending occurrence's reference period — the edge uses it to link the settlement to the right occurrence (#63)."""
    beacon: Literal["amarelo", "vermelho"]
    phrase: str
    """pt-BR product copy."""
    detail: str
    """pt-BR product copy."""
    source: str
    """pt-BR product copy — this module's `_PAYMENTS_ORIGIN` constant."""
    estimated_amount_cents: int | None
    """Average of the history (cents); `None` without history — never a disguised R$ 0,00."""


@dataclass(frozen=True)
class AttentionStrip:
    """The "pede atenção" strip: never a bare empty list — "calma" is the explicit state of nothing pending."""

    state: Literal["calma", "pendente"]
    items: list[AttentionItem] = field(default_factory=list[AttentionItem])
    total_estimated_cents: int | None = None


class NextItem(NamedTuple):
    """The active Area hero-card's next Bill: title and reading phrase."""

    title: str
    phrase: str


@dataclass(frozen=True)
class ActiveAreaHero:
    """The active Area's hero-card: settled count of the month, the next Bill, and the read-only mini-track."""

    reference_period: str
    settled: SettledCount
    next: NextItem | None
    track: list[TrackMarker]


@dataclass(frozen=True)
class DashboardAttention:
    """The dashboard's whole attention: the "pede atenção" strip + the active Area hero-card."""

    strip: AttentionStrip
    hero: ActiveAreaHero


def _current_occurrence(
    bill: Bill, payments: list[Payment], calendar: Calendar, today: date
) -> Occurrence:
    """The Bill's current occurrence (the most recent one <= today), already read for beacon/phrase/urgency."""
    reference_period = recent_occurrences(bill.recurrence, reference_period_of(today), 1)[0]
    due_date = resolve_due_date(bill.due_rule, bill.due_month_offset, reference_period, calendar)
    settled = any(p.bill_id == bill.id and p.reference_period == reference_period for p in payments)
    return Occurrence(
        due_date=due_date,
        reference_period=reference_period,
        recurrence=bill.recurrence,
        settled=settled,
    )


def _detail_without_payment(reference_period: str) -> str:
    """The strip item's detail line when the occurrence has no Payment yet; pt-BR product copy."""
    month = int(reference_period[5:7])
    return f"competência de {MONTHS_PT[month - 1].lower()}, sem Lançamento"


def _next_of_month(markers: list[TrackMarker], bills: list[Bill], today: date) -> NextItem | None:
    """The hero-card's next Bill: the earliest still-open marker due today or later.

    An overdue Bill already shows in the "pede atenção" strip (red beacon) —
    "next" is only what still lies ahead.
    """
    pending = sorted(
        (marker for marker in markers if marker.state != "quitada" and marker.due_date >= today),
        key=lambda marker: marker.due_date,
    )
    if not pending:
        return None
    next_marker = pending[0]
    bill = next((b for b in bills if b.id == next_marker.bill_id), None)
    if bill is None:
        return None
    occurrence = Occurrence(
        due_date=next_marker.due_date,
        reference_period=next_marker.reference_period,
        recurrence=bill.recurrence,
        settled=False,
    )
    return NextItem(title=next_marker.title, phrase=phrase_of_occurrence(occurrence, today))


def derive_attention_strip(
    clock: Clock, calendar: Calendar, bills: list[Bill], payments: list[Payment]
) -> AttentionStrip:
    """The "pede atenção" strip (issue #47): active Bills overdue, due today, or due within 3 days."""
    today = clock.today()
    active_bills = [bill for bill in bills if bill.state == "ativa"]
    candidates = [
        (bill, _current_occurrence(bill, payments, calendar, today)) for bill in active_bills
    ]
    candidates = [
        (bill, occurrence)
        for bill, occurrence in candidates
        if beacon_of_occurrence(occurrence, today) in ("amarelo", "vermelho")
    ]

    if not candidates:
        return AttentionStrip(state="calma")

    # Occurrences are fresh objects, one per candidate — identity (not value)
    # tells apart otherwise-identical occurrences from different Bills, mirroring
    # the oracle's reference-equality `.find`.
    bill_by_occurrence_id = {id(occurrence): bill for bill, occurrence in candidates}
    sorted_occurrences = sort_by_urgency([occurrence for _, occurrence in candidates], today)

    items: list[AttentionItem] = []
    for occurrence in sorted_occurrences:
        bill = bill_by_occurrence_id[id(occurrence)]
        beacon = cast("Literal['amarelo', 'vermelho']", beacon_of_occurrence(occurrence, today))
        items.append(
            AttentionItem(
                bill_id=bill.id,
                title=bill.name,
                reference_period=occurrence.reference_period,
                beacon=beacon,
                phrase=phrase_of_occurrence(occurrence, today),
                detail=_detail_without_payment(occurrence.reference_period),
                source=_PAYMENTS_ORIGIN,
                estimated_amount_cents=historical_average_up_to(
                    bill, payments, occurrence.reference_period
                ),
            )
        )

    estimates = [
        item.estimated_amount_cents for item in items if item.estimated_amount_cents is not None
    ]
    total_estimated_cents = sum(estimates) if estimates else None

    return AttentionStrip(
        state="pendente", items=items, total_estimated_cents=total_estimated_cents
    )


def derive_active_area_hero(
    clock: Clock, calendar: Calendar, bills: list[Bill], payments: list[Payment]
) -> ActiveAreaHero:
    """The active Area's hero-card (issue #47): "N/M settled" + next Bill + the month's read-only mini-track."""
    today = clock.today()
    reference_period = reference_period_of(today)
    markers = derive_track_markers(clock, calendar, bills, payments, reference_period)
    return ActiveAreaHero(
        reference_period=reference_period,
        settled=count_settled(bills, payments, reference_period),
        next=_next_of_month(markers, bills, today),
        track=markers,
    )


def derive_dashboard_attention(
    clock: Clock, calendar: Calendar, bills: list[Bill], payments: list[Payment]
) -> DashboardAttention:
    """Composes the strip and the hero-card from the same `Clock` — the dashboard consumes this whole."""
    return DashboardAttention(
        strip=derive_attention_strip(clock, calendar, bills, payments),
        hero=derive_active_area_hero(clock, calendar, bills, payments),
    )
