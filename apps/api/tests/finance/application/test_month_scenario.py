"""Month scenario suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-cenario-mes.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.month_scenario import (
    ClosingProjection,
    ProjectionComparison,
    derive_month_scenario,
)
from luc_api.finance.application.reference_period_shape import SettledCount
from luc_api.finance.domain.bill import Bill, FixedDayRule, Recurrence
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import FixedClock

_BILL_BASE = Bill(
    id="bill-1",
    household_id="h-1",
    name="Luz",
    description=None,
    icon="zap",
    recurrence=Recurrence(interval_months=1, anchor_month=None),
    due_rule=FixedDayRule(day=10),
    due_month_offset=0,
    first_reference_period="2020-01",
    state="ativa",
    closed_on=None,
    logo_key=None,
)


def bill_base(**over: object) -> Bill:
    return replace(_BILL_BASE, **over)  # type: ignore[arg-type]


_PAYMENT_BASE = Payment(
    id="pay-1",
    household_id="h-1",
    bill_id="bill-1",
    amount_cents=10000,
    paid_on=date(2026, 7, 8),
    reference_period="2026-07",
    paid_by="p-1",
)


def payment(**over: object) -> Payment:
    return replace(_PAYMENT_BASE, **over)  # type: ignore[arg-type]


def test_all_settled_exact_projection_and_comparison_with_previous_month():
    payments = [
        payment(id="jul", reference_period="2026-07", amount_cents=10000),
        payment(id="jun", reference_period="2026-06", amount_cents=12500, paid_on=date(2026, 6, 9)),
    ]
    scenario = derive_month_scenario(FixedClock(date(2026, 7, 9)), [bill_base()], payments)

    assert scenario.reference_period == "2026-07"
    assert scenario.today == date(2026, 7, 9)
    assert scenario.month_end == date(2026, 7, 31)
    assert scenario.paid_cents == 10000
    assert scenario.settled == SettledCount(settled=1, total=1)
    assert scenario.pending == 0
    assert scenario.estimated_remaining_cents == 0
    assert scenario.projection == ClosingProjection(state="exata", amount_cents=10000)
    # (10000 - 12500) / 12500 = -20%
    assert scenario.comparison == ProjectionComparison(
        state="comparado", previous_reference_period="2026-06", delta_percent=-20
    )


def test_pending_sums_historical_average_into_remaining_and_estimated_projection():
    bills = [bill_base(id="luz"), bill_base(id="agua", name="Água")]
    payments = [
        payment(id="luz-jul", bill_id="luz", reference_period="2026-07", amount_cents=10000),
        payment(id="agua-jun", bill_id="agua", reference_period="2026-06", amount_cents=4000),
        payment(id="agua-mai", bill_id="agua", reference_period="2026-05", amount_cents=6000),
    ]
    scenario = derive_month_scenario(FixedClock(date(2026, 7, 9)), bills, payments)

    # agua pending: average(4000, 6000) = 5000 still estimated until month's end
    assert scenario.settled == SettledCount(settled=1, total=2)
    assert scenario.pending == 1
    assert scenario.estimated_remaining_cents == 5000
    assert scenario.projection == ClosingProjection(state="estimada", amount_cents=15000)
    # june paid only 4000 -> projection 15000 = +275%
    assert scenario.comparison == ProjectionComparison(
        state="comparado", previous_reference_period="2026-06", delta_percent=275
    )


def test_pending_without_history_does_not_become_zero():
    scenario = derive_month_scenario(FixedClock(date(2026, 7, 9)), [bill_base()], [])

    assert scenario.paid_cents == 0
    assert scenario.pending == 1
    assert scenario.estimated_remaining_cents is None
    assert scenario.projection == ClosingProjection(state="sem-estimativa")
    assert scenario.comparison == ProjectionComparison(state="sem-base")


def test_previous_month_without_paid_comparison_without_base():
    payments = [payment(id="jul", reference_period="2026-07", amount_cents=10000)]
    scenario = derive_month_scenario(FixedClock(date(2026, 7, 9)), [bill_base()], payments)

    assert scenario.projection == ClosingProjection(state="exata", amount_cents=10000)
    assert scenario.comparison == ProjectionComparison(state="sem-base")


def test_bill_out_of_phase_does_not_enter_the_months_universe():
    # Yearly anchored in August: July is not an occurrence — becomes neither settled nor pending.
    yearly = bill_base(
        id="seguro", name="Seguro", recurrence=Recurrence(interval_months=12, anchor_month=8)
    )
    scenario = derive_month_scenario(FixedClock(date(2026, 7, 9)), [bill_base(), yearly], [])

    assert scenario.settled.total == 1
    assert scenario.pending == 1
