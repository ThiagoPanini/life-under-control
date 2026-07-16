"""Agenda (issue #23): active Bills projected as a **pure view**.

Holds no data of its own (invariant #7); disappears if the Bills disappear.
Lists the **unpaid** occurrences of the **current + next month** ("~45 days"),
each with its expected due date and no amount (invariant #5: projects the
"when", never the "how much"). What's paid drops off the Agenda. Everything
derives from Bills + Payments + `Clock` + `Calendar` (invariant #3), reusing
`resolve_due_date` from the Bill's card (#21).

The shape is **Area-agnostic** from day one (ADR-0006): `AgendaItem` speaks of a
Generator (`generator_id`) in an Area (`area`), not of a Bill by name — the next
Areas plug into the same shape. Today only Finance feeds the projection.

**Window scope.** Anchored at the **current occurrence** of each Bill — the same
one the card's beacon looks at (`recent_occurrences(..., 1)`) — and walking
forward by the recurrence. The current, unpaid and already-due occurrence enters
as `em-aberto` (parity with the red beacon, even for a non-monthly Bill whose
current occurrence fell months ago); the following ones enter as `aguardando`
while they fall due within the window (current month + next, "~45 days"). What
falls due beyond that stays out. Reuses the card's recurrence axis instead of
recomputing the phase — a single source of truth.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from luc_api.finance.application.bill_card import (
    add_months,
    recent_occurrences,
    reference_period_of,
    resolve_due_date,
)
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.domain.bill import Bill
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = ["AgendaArea", "AgendaItem", "project_agenda"]

type AgendaArea = Literal["financas"]
"""Area feeding the Agenda. Grows as more Areas plug in (ADR-0006)."""


@dataclass(frozen=True)
class AgendaItem:
    """One Agenda item: an unpaid occurrence, **with no amount** (invariant #5).

    Clickable: `(area, generator_id, reference_period)` points to that
    occurrence's settlement.
    """

    area: AgendaArea
    """The Area owning the occurrence — discriminates the click's destination."""
    generator_id: str
    """Id of the source Generator (the Bill, in Finance) — the click's "what" (ADR-0005)."""
    reference_period: str
    """Reference period of the occurrence (`YYYY-MM`) — the click's "when"."""
    title: str
    """Displayed label ("Netflix")."""
    due_date: date
    """Expected due date — the sort key in time."""
    state: Literal["em-aberto", "aguardando"]
    """Unpaid: already due/due today (`em-aberto`) or still upcoming (`aguardando`)."""


def project_agenda(
    clock: Clock, calendar: Calendar, bills: list[Bill], payments: list[Payment]
) -> list[AgendaItem]:
    """Projects the Agenda from Bills + Payments.

    For each **active** Bill, walks its unpaid occurrences from the current one
    through the end of the window (current month + next), sorted by due date
    (ties broken by title). The edge injects the real adapters; Seam 1 injects
    the `Clock`/`Calendar` fakes.
    """
    today = clock.today()
    next_month = add_months(reference_period_of(today), 1)

    items: list[AgendaItem] = []
    for bill in bills:
        if bill.state != "ativa":
            continue
        # Anchors at the current occurrence (the same one the card's beacon
        # reads) and walks the recurrence forward — always in phase, no phase
        # recomputation here.
        reference_period = recent_occurrences(bill.recurrence, reference_period_of(today), 1)[0]
        while True:
            due_date = resolve_due_date(
                bill.due_rule, bill.due_month_offset, reference_period, calendar
            )
            # Due today counts as em-aberto.
            upcoming = due_date > today
            # Upcoming only enters within the window; overdue-unpaid always
            # enters (the current one, open). Since the due date grows with the
            # reference period, the first one due beyond the window ends the walk.
            if upcoming and reference_period_of(due_date) > next_month:
                break
            paid = any(
                p.bill_id == bill.id and p.reference_period == reference_period for p in payments
            )
            if not paid:
                items.append(
                    AgendaItem(
                        area="financas",
                        generator_id=bill.id,
                        reference_period=reference_period,
                        title=bill.name,
                        due_date=due_date,
                        state="aguardando" if upcoming else "em-aberto",
                    )
                )
            reference_period = add_months(reference_period, bill.recurrence.interval_months)

    return sorted(items, key=lambda item: (item.due_date, item.title))
