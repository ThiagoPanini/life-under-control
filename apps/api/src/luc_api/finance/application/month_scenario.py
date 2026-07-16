"""Current-month Payment Scenario (redesign Final da Análise): what's already paid (exact), what's still committed (an estimate from open Bills) and the closing projection compared to the previous month.

Everything derives from Bills + Payments + `Clock` (invariant #3) — nothing here
is a column.

The comparison never breaks "a partial month never enters a delta" (#48): what's
compared is the **closing projection** (a full month, even if estimated) against
the previous month's total paid — never the partial running total.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from luc_api.finance.application.bill_card import add_months, reference_period_of
from luc_api.finance.application.reference_period_shape import (
    SettledCount,
    bills_of_month,
    count_settled,
    historical_average_up_to,
    sum_paid_in_month,
)
from luc_api.finance.domain.bill import Bill
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = [
    "ClosingProjection",
    "ClosingProjectionState",
    "MonthScenario",
    "ProjectionComparison",
    "derive_month_scenario",
]

ClosingProjectionState = Literal["exata", "estimada", "sem-estimativa"]
"""State of the closing projection: exact when nothing pends, estimated when it pends with history, without one otherwise.

Values stay pt-BR — a persisted/edge contract, same precedent as `BeaconState`.
"""


@dataclass(frozen=True)
class ClosingProjection:
    """Closing projection: exact when nothing pends; estimated when it pends with history."""

    state: ClosingProjectionState
    amount_cents: int | None = None
    """The projected amount, in cents; present for `exata`/`estimada`, `None` for `sem-estimativa`."""


@dataclass(frozen=True)
class ProjectionComparison:
    """Delta of the projection vs the previous month's total paid; without a base when there's no projection or the previous month was empty."""

    state: Literal["sem-base", "comparado"]
    previous_reference_period: str | None = None
    """Set only when `comparado`."""
    delta_percent: float | None = None
    """A genuine percentage (not cents); set only when `comparado`. Not rounded here (matches the oracle) — display rounds it."""


@dataclass(frozen=True)
class MonthScenario:
    """The current month's Payment Scenario: paid, pending, closing projection and comparison to the previous month."""

    reference_period: str
    """The current reference period (`YYYY-MM`) — the Scenario is always of today's month."""
    today: date
    month_end: date
    """Last civil day of the reference period — the "until dd/mm" of the reading."""
    paid_cents: int
    """Total paid in the reference period (exact — the only number that isn't an estimate)."""
    settled: SettledCount
    pending: int
    """This month's Bills still without a Payment."""
    estimated_remaining_cents: int | None
    """Sum of the pending Bills' historical averages; `None` without history for any of them."""
    projection: ClosingProjection
    comparison: ProjectionComparison


def _last_day_of_reference_period(reference_period: str) -> date:
    """The last civil day of a reference period `YYYY-MM`, as a native date — handles a leap February."""
    year, month = (int(part) for part in reference_period.split("-"))
    first_of_next_month = date(year + month // 12, month % 12 + 1, 1)
    return first_of_next_month - timedelta(days=1)


def _estimate_pending(
    pending_bills: list[Bill], payments: list[Payment], reference_period: str
) -> int | None:
    """Estimates what's still owed: sum of the pending Bills' historical averages (no disguised zero).

    Zero pending Bills is a real "nothing left to estimate" (`0`), distinct from
    pending Bills that all lack history (`None`).
    """
    if not pending_bills:
        return 0
    total: int | None = None
    for bill in pending_bills:
        average = historical_average_up_to(bill, payments, reference_period)
        if average is None:
            continue
        total = (total or 0) + average
    return total


def _project_closing(
    paid_cents: int, pending: int, estimated_remaining_cents: int | None
) -> ClosingProjection:
    """Projects the month's closing amount from what's paid plus what's estimated to still be owed."""
    if pending == 0:
        return ClosingProjection(state="exata", amount_cents=paid_cents)
    if estimated_remaining_cents is None:
        return ClosingProjection(state="sem-estimativa")
    return ClosingProjection(state="estimada", amount_cents=paid_cents + estimated_remaining_cents)


def _compare_with_previous_month(
    bills: list[Bill],
    payments: list[Payment],
    reference_period: str,
    projection: ClosingProjection,
) -> ProjectionComparison:
    """Compares the closing projection to the previous month's total paid, as a percent delta."""
    # `amount_cents` is only absent for "sem-estimativa" — the same guard as the
    # oracle's `projecao.estado === "sem-estimativa"`, phrased for narrowing.
    if projection.amount_cents is None:
        return ProjectionComparison(state="sem-base")
    previous_reference_period = add_months(reference_period, -1)
    base = sum_paid_in_month(bills, payments, previous_reference_period)
    if base <= 0:
        return ProjectionComparison(state="sem-base")
    return ProjectionComparison(
        state="comparado",
        previous_reference_period=previous_reference_period,
        delta_percent=((projection.amount_cents - base) / base) * 100,
    )


def derive_month_scenario(
    clock: Clock, bills: list[Bill], payments: list[Payment]
) -> MonthScenario:
    """Composes the current month's Scenario from the `Clock` port and the facts (Bills + Payments)."""
    today = clock.today()
    reference_period = reference_period_of(today)
    of_month = bills_of_month(bills, reference_period)
    pending_bills = [
        bill
        for bill in of_month
        if not any(
            p.bill_id == bill.id and p.reference_period == reference_period for p in payments
        )
    ]
    paid_cents = sum_paid_in_month(bills, payments, reference_period)
    estimated_remaining_cents = _estimate_pending(pending_bills, payments, reference_period)
    projection = _project_closing(paid_cents, len(pending_bills), estimated_remaining_cents)

    return MonthScenario(
        reference_period=reference_period,
        today=today,
        month_end=_last_day_of_reference_period(reference_period),
        paid_cents=paid_cents,
        settled=count_settled(bills, payments, reference_period),
        pending=len(pending_bills),
        estimated_remaining_cents=estimated_remaining_cents,
        projection=projection,
        comparison=_compare_with_previous_month(bills, payments, reference_period, projection),
    )
