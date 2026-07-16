"""Agenda ready for display (issue #60).

Enriches the projection (#23) with the state reading (#62 — beacon and
phrase, never redefined here) and the amount estimate (historical average,
#61); groups by temporal urgency — **Overdue** (everything `em-aberto`)
always first and apart, then one group per due month among the `aguardando`
occurrences.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from luc_api.finance.application.agenda_projection import AgendaItem, project_agenda
from luc_api.finance.application.bill_card import BeaconState, reference_period_of
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.application.occurrence_state import (
    Occurrence,
    beacon_of_occurrence,
    phrase_of_occurrence,
)
from luc_api.finance.application.reference_period_shape import historical_average_up_to
from luc_api.finance.domain.bill import Bill, describe_month_full_pt
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock, FixedClock

__all__ = ["AgendaGroup", "AgendaItemView", "derive_agenda"]

_ACTIVE_SUBJECT = (
    "Pagamentos Recorrentes"  # assuntoAtivoDe("financas") — hardcoded: the Area/Subject
)
# catalog doesn't exist in apps/api yet; only one Subject is active in Finance today, so porting a
# whole generic catalog for one fixed label would be premature (CLAUDE.md). Mirrors the same cut
# already made in dashboard_attention.py's `_PAYMENTS_ORIGIN`.


@dataclass(frozen=True)
class AgendaItemView(AgendaItem):
    """One Agenda item ready for a row: the projection (#23) + beacon/phrase (#62) + estimate (#61)."""

    beacon: BeaconState
    phrase: str
    """pt-BR product copy."""
    subject: str
    """The source Area's active Subject — today only "Pagamentos Recorrentes" in Finance."""
    estimated_amount_cents: int | None
    """Historical average up to the reference period, in cents; `None` without history — never invented."""


@dataclass(frozen=True)
class AgendaGroup:
    """A group of the Agenda: a title/note/tone plus the items sharing that temporal urgency."""

    title: str
    note: str
    tone: Literal["warn", "default"]
    items: list[AgendaItemView]


def _month_title(due_month: str) -> str:
    """Title of a due-month group ("2026-07" -> "Julho de 2026"), from the due date's month."""
    description = describe_month_full_pt(due_month)
    return description[:1].upper() + description[1:]


def _to_item_view(
    item: AgendaItem, bills: list[Bill], payments: list[Payment], today: date
) -> AgendaItemView:
    """Enriches a projected Agenda item with beacon, phrase, subject and estimated amount."""
    # Every item comes from `project_agenda(bills)` — the source Bill always exists in the same list.
    bill = next(b for b in bills if b.id == item.generator_id)
    occurrence = Occurrence(
        due_date=item.due_date,
        reference_period=item.reference_period,
        recurrence=bill.recurrence,
        settled=False,
    )
    return AgendaItemView(
        area=item.area,
        generator_id=item.generator_id,
        reference_period=item.reference_period,
        title=item.title,
        due_date=item.due_date,
        state=item.state,
        beacon=beacon_of_occurrence(occurrence, today),
        phrase=phrase_of_occurrence(occurrence, today),
        subject=_ACTIVE_SUBJECT,
        estimated_amount_cents=historical_average_up_to(bill, payments, item.reference_period),
    )


def _group(items: list[AgendaItemView]) -> list[AgendaGroup]:
    """Groups items by temporal urgency: Overdue always first and apart, then one group per due month."""
    groups: list[AgendaGroup] = []

    overdue = [item for item in items if item.state == "em-aberto"]
    if overdue:
        groups.append(
            AgendaGroup(
                title="Atrasado",
                note="venceu ou vence hoje, sem Lançamento",
                tone="warn",
                items=overdue,
            )
        )

    # A plain dict built by iterating `items` once preserves insertion (first-seen)
    # order exactly like the oracle's `Map` — the items already arrive sorted by
    # due date from `project_agenda`, so no extra sort is needed here.
    by_month: dict[str, list[AgendaItemView]] = {}
    for item in items:
        if item.state != "aguardando":
            continue
        month = reference_period_of(item.due_date)
        by_month.setdefault(month, []).append(item)

    for month, month_items in by_month.items():
        groups.append(
            AgendaGroup(
                title=_month_title(month),
                note="projeções das Contas",
                tone="default",
                items=month_items,
            )
        )

    return groups


def derive_agenda(
    clock: Clock, calendar: Calendar, bills: list[Bill], payments: list[Payment]
) -> list[AgendaGroup]:
    """Derives the Agenda ready for display.

    The edge injects the real adapters; Seam 1 injects the `Clock`/`Calendar` fakes.
    """
    today = clock.today()
    # A single `today` resolved for the whole composition's Clock — threaded manually
    # via a frozen Clock, so `project_agenda` (which resolves its own internally)
    # never disagrees with the `today` used here for beacon/phrase.
    clock_of_today = FixedClock(fixed_today=today)
    items = project_agenda(clock_of_today, calendar, bills, payments)
    return _group([_to_item_view(item, bills, payments, today) for item in items])
