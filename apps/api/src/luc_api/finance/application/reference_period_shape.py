"""Reference period shape (issue #61): feeds the reference-period lens (#58), the dashboard (#47) and the month track.

Everything derives from Bills + Payments + `Clock` + `Calendar` (invariant #3)
for an arbitrary reference period — not necessarily today's.

Honest consequence of "no value on the Bill" (CONTEXT.md), the same as the
cockpit's (#22): **projected** is always an estimate (`~`) derived from
history; **paid** is the only exact number. Bills without history do not
enter the sum — never a disguised `R$ 0,00`.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal, NamedTuple

from luc_api.finance.application.bill_card import (
    OCCURRENCES_IN_WINDOW,
    PROXIMITY_THRESHOLD_DAYS,
    add_months,
    recent_occurrences,
    resolve_due_date,
    round_half_up,
)
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.domain.bill import Bill
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = [
    "MarkerState",
    "PriorPending",
    "ReferencePeriodShape",
    "SettledCount",
    "TrackMarker",
    "bills_of_month",
    "count_settled",
    "derive_reference_period_shape",
    "derive_track_markers",
    "estimate_remaining_for_month",
    "historical_average_up_to",
    "list_prior_pending",
    "project_month_spend",
    "sum_paid_in_month",
]


def _active_bills(bills: list[Bill]) -> list[Bill]:
    return [b for b in bills if b.state == "ativa"]


def _has_occurrence_in_month(bill: Bill, reference_period: str) -> bool:
    """Is the reference period an occurrence month of the Bill's Recurrence? (steps back to the anchor phase and compares)."""
    return recent_occurrences(bill.recurrence, reference_period, 1)[0] == reference_period


def bills_of_month(bills: list[Bill], reference_period: str) -> list[Bill]:
    """Active Bills with an occurrence in the reference period.

    The M denominator of `count_settled` and the universe of
    `project_month_spend`/the track markers.
    """
    return [b for b in _active_bills(bills) if _has_occurrence_in_month(b, reference_period)]


def _sum_in_reference_period(payments: list[Payment], reference_period: str) -> int | None:
    """Sums a reference period's Payments.

    The schema allows **more than one** Payment per Bill+reference period
    (split settlement); `None` when there is none (an absence, never zero).
    """
    relevant = [p for p in payments if p.reference_period == reference_period]
    if not relevant:
        return None
    return sum(p.amount_cents for p in relevant)


def historical_average_up_to(
    bill: Bill, payments: list[Payment], reference_period: str
) -> int | None:
    """Average (cents) of the Bill's history in the 12 occurrences **before** the reference period.

    The reference period itself stays out — it's what is being projected,
    not what already happened. Skips gaps (a month without a Payment does
    not count as zero) and sums split settlements of the same reference
    period; `None` without any Payment in the window.
    """
    month_before = add_months(reference_period, -1)
    window = recent_occurrences(bill.recurrence, month_before, OCCURRENCES_IN_WINDOW)
    own = [p for p in payments if p.bill_id == bill.id]
    values = [v for rp in window if (v := _sum_in_reference_period(own, rp)) is not None]
    if not values:
        return None
    return round_half_up(sum(values), len(values))


def project_month_spend(
    bills: list[Bill], payments: list[Payment], reference_period: str
) -> int | None:
    """Projected spend of the month: sum of each Bill's historical average, for Bills with an occurrence in the reference period.

    A Bill without history does not contribute (not zero); if none
    contributes, returns `None` — never `R$ 0,00` nor an invented estimate.
    """
    total: int | None = None
    for bill in bills_of_month(bills, reference_period):
        average = historical_average_up_to(bill, payments, reference_period)
        if average is None:
            continue
        total = (total or 0) + average
    return total


def sum_paid_in_month(bills: list[Bill], payments: list[Payment], reference_period: str) -> int:
    """Total paid in the reference period: exact sum of the Payments of the Bills with occurrence in it.

    The same M universe as `count_settled`, so `paid` never counts money from
    a Bill that `count_settled`/`project_month_spend` already excluded (e.g.
    an out-of-phase Payment on a bimonthly Bill).
    """
    of_month = {b.id for b in bills_of_month(bills, reference_period)}
    return sum(
        p.amount_cents
        for p in payments
        if p.bill_id in of_month and p.reference_period == reference_period
    )


def estimate_remaining_for_month(projected: int | None, paid: int) -> int | None:
    """Remaining to pay: projected minus paid, never negative, always an estimate (`~`).

    Without a projection (no history) there is no base to estimate the
    difference.
    """
    if projected is None:
        return None
    return max(0, projected - paid)


class SettledCount(NamedTuple):
    """N/M settled: `total` counts only active Bills with occurrence in the reference period."""

    settled: int
    total: int


def count_settled(
    bills: list[Bill], payments: list[Payment], reference_period: str
) -> SettledCount:
    """N/M settled: M = only active Bills with occurrence in the reference period; N = the ones that already have a Payment in it."""
    of_month = bills_of_month(bills, reference_period)
    settled = len(
        [
            b
            for b in of_month
            if any(p.bill_id == b.id and p.reference_period == reference_period for p in payments)
        ]
    )
    return SettledCount(settled=settled, total=len(of_month))


MarkerState = Literal["quitada", "a-vencer", "aguardando"]
"""State of the marker on the track: quitada (paid), a-vencer (close/overdue) or aguardando (far).

Values stay pt-BR — a persisted/edge contract, same precedent as
`BeaconState`/`GridState`.
"""


@dataclass(frozen=True)
class TrackMarker:
    """A track marker of the month: a Bill with occurrence in the reference period."""

    due_date: date
    """Expected due date of the occurrence — the position on the track."""
    reference_period: str
    """The marker's reference period — may fall on a different civil month than `due_date` when there's a `due_month_offset`."""
    bill_id: str
    title: str
    state: MarkerState
    expected_amount_cents: int | None
    """Real amount when settled; historical average when open; `None` without history."""


def derive_track_markers(
    clock: Clock,
    calendar: Calendar,
    bills: list[Bill],
    payments: list[Payment],
    reference_period: str,
) -> list[TrackMarker]:
    """The month track's markers: a Bill with occurrence in the reference period becomes a marker on the day of its expected due date.

    Settled shows the real settlement amount; open shows the historical
    average (`None` without history — never invents). Close/overdue (same
    threshold as the card's beacon) becomes "a-vencer"; far stays
    "aguardando".
    """
    today = clock.today()
    markers: list[TrackMarker] = []
    for bill in bills_of_month(bills, reference_period):
        due_date = resolve_due_date(
            bill.due_rule, bill.due_month_offset, reference_period, calendar
        )
        own = [p for p in payments if p.bill_id == bill.id]
        paid = _sum_in_reference_period(own, reference_period)

        if paid is not None:
            markers.append(
                TrackMarker(
                    due_date=due_date,
                    reference_period=reference_period,
                    bill_id=bill.id,
                    title=bill.name,
                    state="quitada",
                    expected_amount_cents=paid,
                )
            )
            continue

        days = (due_date - today).days
        state: MarkerState = "aguardando" if days > PROXIMITY_THRESHOLD_DAYS else "a-vencer"
        markers.append(
            TrackMarker(
                due_date=due_date,
                reference_period=reference_period,
                bill_id=bill.id,
                title=bill.name,
                state=state,
                expected_amount_cents=historical_average_up_to(bill, payments, reference_period),
            )
        )
    return markers


@dataclass(frozen=True)
class PriorPending:
    """A prior reference period pending: an open occurrence that was not silently absorbed."""

    bill_id: str
    title: str
    reference_period: str
    due_date: date


def list_prior_pending(
    calendar: Calendar, bills: list[Bill], payments: list[Payment], reference_period: str
) -> list[PriorPending]:
    """Pendings from prior reference periods: open occurrences (without a Payment) in the 12 reference periods preceding the target one, per active Bill.

    Always a collection — never absorbed into the current reference period's
    total. A reference period before the Bill's `first_reference_period` is
    outside its effective period (ADR-0011) — never a fabricated pending for a
    Bill that did not exist yet.
    """
    month_before = add_months(reference_period, -1)
    pending: list[PriorPending] = []
    for bill in _active_bills(bills):
        window = recent_occurrences(bill.recurrence, month_before, OCCURRENCES_IN_WINDOW)
        own = [p for p in payments if p.bill_id == bill.id]
        for rp in window:
            if rp < bill.first_reference_period:
                continue
            if any(p.reference_period == rp for p in own):
                continue
            due_date = resolve_due_date(bill.due_rule, bill.due_month_offset, rp, calendar)
            pending.append(
                PriorPending(
                    bill_id=bill.id, title=bill.name, reference_period=rp, due_date=due_date
                )
            )
    return pending


@dataclass(frozen=True)
class ReferencePeriodShape:
    """The whole shape of the reference period: the aggregates + the collection of prior pendings."""

    projected_cents: int | None
    paid_cents: int
    """Total **paid** in the reference period (exact): sum of the Payments of the Bills with occurrence in it."""
    remaining_cents: int | None
    settled: SettledCount
    markers: list[TrackMarker]
    prior_pending: list[PriorPending]
    """Never a singular field — the UI may summarize, but no pending is lost here."""


def derive_reference_period_shape(
    clock: Clock,
    calendar: Calendar,
    bills: list[Bill],
    payments: list[Payment],
    reference_period: str,
) -> ReferencePeriodShape:
    """Composes the whole reference period shape from the `Clock`/`Calendar` ports and the facts (Bills + Payments).

    The edge injects the real adapters; Seam 1 injects the fakes.
    """
    projected = project_month_spend(bills, payments, reference_period)
    paid = sum_paid_in_month(bills, payments, reference_period)
    return ReferencePeriodShape(
        projected_cents=projected,
        paid_cents=paid,
        remaining_cents=estimate_remaining_for_month(projected, paid),
        settled=count_settled(bills, payments, reference_period),
        markers=derive_track_markers(clock, calendar, bills, payments, reference_period),
        prior_pending=list_prior_pending(calendar, bills, payments, reference_period),
    )
