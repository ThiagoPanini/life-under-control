"""Bill card suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-bill-card.test.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.bill_card import (
    OCCURRENCES_IN_WINDOW,
    GridCell,
    beacon_of_month,
    default_payment_reference_period,
    derive_bill_card,
    grid_occurrences,
    payments_summary,
    recent_occurrences,
    resolve_due_date,
)
from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.domain.bill import (
    Bill,
    FixedDayRule,
    LastBusinessDayRule,
    NthBusinessDayRule,
    Recurrence,
)
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
    paid_on=date(2026, 6, 8),
    reference_period="2026-06",
    paid_by="p-1",
)


def payment(**over: object) -> Payment:
    return replace(_PAYMENT_BASE, **over)  # type: ignore[arg-type]


def cell(grid: list[GridCell], reference_period: str) -> GridCell:
    for c in grid:
        if c.reference_period == reference_period:
            return c
    raise AssertionError(f"cell {reference_period} missing")


# --- resolve_due_date (Seam 1) ---


def test_fixed_day_resolves_on_the_reference_period_day():
    v = resolve_due_date(FixedDayRule(day=10), 0, "2026-06", FakeCalendar())
    assert v == date(2026, 6, 10)


def test_fixed_day_with_offset_shifts_the_month():
    # a "January" condo fee with offset +1 is due on 08/Feb (the grilling case)
    v = resolve_due_date(FixedDayRule(day=8), 1, "2026-01", FakeCalendar())
    assert v == date(2026, 2, 8)


def test_fixed_day_past_month_end_clamps_to_the_last_day():
    # day 31 in February does not exist — clamps to the month's last civil day
    v = resolve_due_date(FixedDayRule(day=31), 0, "2026-02", FakeCalendar())
    assert v == date(2026, 2, 28)


def test_nth_business_day_counts_only_business_days():
    # June/2026 starts on a Monday; with no holiday, the 5th business day is 05/06
    v = resolve_due_date(NthBusinessDayRule(nth=5), 0, "2026-06", FakeCalendar())
    assert v == date(2026, 6, 5)


def test_nth_business_day_skips_a_holiday():
    # with 04/06 (Corpus Christi) a holiday, the 5th business day slips to 08/06
    cal = FakeCalendar(holidays=frozenset({date(2026, 6, 4)}))
    v = resolve_due_date(NthBusinessDayRule(nth=5), 0, "2026-06", cal)
    assert v == date(2026, 6, 8)


def test_last_business_day_steps_back_from_the_weekend():
    # 31/05/2026 is Sunday, 30 Saturday — the last business day is Friday 29/05
    v = resolve_due_date(LastBusinessDayRule(), 0, "2026-05", FakeCalendar())
    assert v == date(2026, 5, 29)


# --- recent_occurrences (Seam 1) ---


def test_monthly_yields_the_last_n_months_up_to_the_reference():
    comps = recent_occurrences(Recurrence(interval_months=1, anchor_month=None), "2026-03", 4)
    assert comps == ["2025-12", "2026-01", "2026-02", "2026-03"]


def test_bimonthly_anchored_lands_only_on_the_anchor_months():
    # bimonthly anchored in January: Jan, Mar, May… stepping back from April
    comps = recent_occurrences(Recurrence(interval_months=2, anchor_month=1), "2026-04", 4)
    assert comps == ["2025-09", "2025-11", "2026-01", "2026-03"]


def test_yearly_anchored_steps_back_year_by_year():
    comps = recent_occurrences(Recurrence(interval_months=12, anchor_month=1), "2026-06", 3)
    assert comps == ["2024-01", "2025-01", "2026-01"]


# --- beacon_of_month (Seam 1) ---

_CAL = FakeCalendar()


def test_paid_lights_green():
    bill = bill_base()
    payments = [payment(reference_period="2026-06")]
    assert beacon_of_month(bill, payments, date(2026, 6, 20), _CAL) == "verde"


def test_unpaid_and_far_from_due_stays_gray():
    assert beacon_of_month(bill_base(), [], date(2026, 6, 1), _CAL) == "cinza"


def test_unpaid_within_three_days_turns_yellow():
    assert beacon_of_month(bill_base(), [], date(2026, 6, 8), _CAL) == "amarelo"


def test_due_today_unpaid_turns_red():
    assert beacon_of_month(bill_base(), [], date(2026, 6, 10), _CAL) == "vermelho"


def test_already_overdue_unpaid_turns_red():
    assert beacon_of_month(bill_base(), [], date(2026, 6, 15), _CAL) == "vermelho"


# --- grid_occurrences (Seam 1) ---


def test_yields_twelve_cells_oldest_to_most_recent():
    grid = grid_occurrences(bill_base(), [], date(2026, 6, 15), _CAL)
    assert len(grid) == OCCURRENCES_IN_WINDOW
    assert grid[0].reference_period == "2025-07"
    assert grid[OCCURRENCES_IN_WINDOW - 1].reference_period == "2026-06"


def test_paid_before_the_due_date_stays_on_time():
    # condo fee "January", offset +1 (due 08/Feb), paid 26/Jan → on time
    bill = bill_base(due_rule=FixedDayRule(day=8), due_month_offset=1)
    payments = [payment(reference_period="2026-01", paid_on=date(2026, 1, 26))]
    grid = grid_occurrences(bill, payments, date(2026, 2, 10), _CAL)
    assert cell(grid, "2026-01").state == "em-dia"


def test_paid_within_three_days_after_due_is_a_light_delay():
    payments = [payment(reference_period="2026-05", paid_on=date(2026, 5, 13))]
    grid = grid_occurrences(bill_base(), payments, date(2026, 6, 15), _CAL)
    assert cell(grid, "2026-05").state == "atraso-leve"


def test_paid_more_than_three_days_after_due_is_a_delay():
    payments = [payment(reference_period="2026-05", paid_on=date(2026, 5, 20))]
    grid = grid_occurrences(bill_base(), payments, date(2026, 6, 15), _CAL)
    assert cell(grid, "2026-05").state == "atraso"


def test_overdue_and_never_paid_stays_open():
    grid = grid_occurrences(bill_base(), [], date(2026, 6, 15), _CAL)
    # May came due (10/05 < 15/06) with no payment → a hole
    assert cell(grid, "2026-05").state == "em-aberto"


def test_not_yet_due_and_unpaid_stays_awaiting():
    # offset +1: June's occurrence is due only 10/Jul, today 15/Jun → awaiting
    bill = bill_base(due_month_offset=1)
    grid = grid_occurrences(bill, [], date(2026, 6, 15), _CAL)
    assert cell(grid, "2026-06").state == "aguardando"


def test_paid_without_a_date_is_neutral_history():
    payments = [payment(reference_period="2026-05", paid_on=None)]
    grid = grid_occurrences(bill_base(), payments, date(2026, 6, 15), _CAL)
    assert cell(grid, "2026-05").state == "pago-sem-data"


def test_split_payment_sums_the_amount_and_state_from_the_completing_payment():
    # A split May payment (due 10/05): part on time (08/05), the rest late
    # (20/05). The cell sums both (10000) and punctuality reflects the
    # completing payment — the most recent, which is late.
    payments = [
        payment(id="p-a", reference_period="2026-05", amount_cents=4000, paid_on=date(2026, 5, 8)),
        payment(id="p-b", reference_period="2026-05", amount_cents=6000, paid_on=date(2026, 5, 20)),
    ]
    grid = grid_occurrences(bill_base(), payments, date(2026, 6, 15), _CAL)
    assert cell(grid, "2026-05").amount_cents == 10000
    assert cell(grid, "2026-05").state == "atraso"


def test_split_payment_all_on_time_stays_on_time():
    # Both May payments land before the due date (10/05): sum 10000, on time.
    payments = [
        payment(id="p-a", reference_period="2026-05", amount_cents=3000, paid_on=date(2026, 5, 6)),
        payment(id="p-b", reference_period="2026-05", amount_cents=7000, paid_on=date(2026, 5, 9)),
    ]
    grid = grid_occurrences(bill_base(), payments, date(2026, 6, 15), _CAL)
    assert cell(grid, "2026-05").amount_cents == 10000
    assert cell(grid, "2026-05").state == "em-dia"


def test_occurrence_before_the_first_reference_period_is_outside_effect():
    # A Bill effective only since March: February predates it — outside effect,
    # never a false open hole. Its amount is a gap (None).
    bill = bill_base(first_reference_period="2026-03")
    grid = grid_occurrences(bill, [], date(2026, 6, 15), _CAL)
    assert cell(grid, "2026-02").state == "fora-vigencia"
    assert cell(grid, "2026-02").amount_cents is None
    # March (the first reference period) is already effective: came due unpaid → open
    assert cell(grid, "2026-03").state == "em-aberto"


def test_grid_keeps_twelve_cells_with_outside_effect_entries():
    bill = bill_base(first_reference_period="2026-03")
    grid = grid_occurrences(bill, [], date(2026, 6, 15), _CAL)
    assert len(grid) == OCCURRENCES_IN_WINDOW
    assert len([c for c in grid if c.state == "fora-vigencia"]) == 8


def test_non_monthly_recurrence_respects_the_effect_period():
    # bimonthly anchored in January, effective since 2026-01: 2025 occurrences and
    # earlier are outside effect; 2026-01 (the first reference period) already counts.
    bill = bill_base(
        recurrence=Recurrence(interval_months=2, anchor_month=1), first_reference_period="2026-01"
    )
    grid = grid_occurrences(bill, [], date(2026, 6, 15), _CAL)
    assert cell(grid, "2025-11").state == "fora-vigencia"
    assert cell(grid, "2026-01").state == "em-aberto"


def test_bill_with_full_history_has_no_outside_effect_entries():
    # effective since 2020: no occurrence in the window predates it
    grid = grid_occurrences(bill_base(), [], date(2026, 6, 15), _CAL)
    assert not any(c.state == "fora-vigencia" for c in grid)


# --- payments_summary (Seam 1) ---


def test_average_and_sparkline_over_paid_with_a_gap_where_unpaid():
    payments = [
        payment(id="p-a", reference_period="2026-04", amount_cents=10000),
        payment(id="p-b", reference_period="2026-06", amount_cents=20000),
    ]
    grid = grid_occurrences(bill_base(), payments, date(2026, 6, 15), _CAL)
    summary = payments_summary(grid)
    assert summary.average_cents == 15000  # average of the two paid only
    assert len(summary.sparkline) == OCCURRENCES_IN_WINDOW
    # May's slot (unpaid) is a gap, not zero
    idx_may = next(i for i, c in enumerate(grid) if c.reference_period == "2026-05")
    assert summary.sparkline[idx_may] is None
    idx_apr = next(i for i, c in enumerate(grid) if c.reference_period == "2026-04")
    assert summary.sparkline[idx_apr] == 10000


def test_outside_effect_does_not_change_average_or_sparkline():
    # A young Bill (effective since March) with two payments: outside-effect cells
    # are gaps (None), never zero — average/sparkline match the non-clipped case.
    bill = bill_base(first_reference_period="2026-03")
    payments = [
        payment(id="p-a", reference_period="2026-04", amount_cents=10000),
        payment(id="p-b", reference_period="2026-06", amount_cents=20000),
    ]
    grid = grid_occurrences(bill, payments, date(2026, 6, 15), _CAL)
    summary = payments_summary(grid)
    assert summary.average_cents == 15000  # only the two paid; no outside-effect entered
    assert len(summary.sparkline) == OCCURRENCES_IN_WINDOW
    # an outside-effect month is a sparkline gap, never zero
    idx_jan = next(i for i, c in enumerate(grid) if c.reference_period == "2026-01")
    assert grid[idx_jan].state == "fora-vigencia"
    assert summary.sparkline[idx_jan] is None
    idx_apr = next(i for i, c in enumerate(grid) if c.reference_period == "2026-04")
    assert summary.sparkline[idx_apr] == 10000


def test_without_history_the_average_is_null():
    grid = grid_occurrences(bill_base(), [], date(2026, 6, 15), _CAL)
    summary = payments_summary(grid)
    assert summary.average_cents is None
    assert all(v is None for v in summary.sparkline)


# --- derive_bill_card (Seam 1) ---


def test_composes_the_card_with_clock_and_calendar_fakes():
    # the acceptance's canonical case: January condo fee, offset +1, due 08/Feb, paid 26/Jan → on time
    bill = bill_base(name="Condomínio", due_rule=FixedDayRule(day=8), due_month_offset=1)
    payments = [payment(reference_period="2026-01", paid_on=date(2026, 1, 26), amount_cents=90000)]
    card = derive_bill_card(FixedClock(date(2026, 2, 10)), FakeCalendar(), bill, payments)

    jan = cell(card.grid, "2026-01")
    assert jan.state == "em-dia"
    assert jan.due_date == date(2026, 2, 8)
    # the current month (February) is due only 08/Mar, today 10/Feb, unpaid → gray
    assert card.beacon == "cinza"
    assert card.current_due_date == date(2026, 3, 8)
    assert card.average_cents == 90000
    assert len(card.grid) == OCCURRENCES_IN_WINDOW


# --- default_payment_reference_period (Seam 1, #63) ---


def _on_time_payments(reference_periods: list[str]) -> list[Payment]:
    """On-time payments (day 05, before the fixed day-10 due date) for each reference period."""
    return [
        payment(id=f"p-{i}", reference_period=rp, paid_on=date(int(rp[:4]), int(rp[5:7]), 5))
        for i, rp in enumerate(reference_periods)
    ]


def test_default_reference_period_is_the_oldest_open_one():
    # the whole window (12 months) on time except May — the oldest hole in the
    # grid. June (current) is also open (today is past day 10), but the payment
    # should target May: the oldest, not the most recent.
    bill = bill_base()
    paid = recent_occurrences(bill.recurrence, "2026-04", 10)  # 2025-07 .. 2026-04
    reference_period = default_payment_reference_period(
        FixedClock(date(2026, 6, 15)), _CAL, bill, _on_time_payments(paid)
    )
    assert reference_period == "2026-05"


def test_without_any_open_falls_back_to_the_current_one():
    # the whole window on time through May; June (current) has not come due yet —
    # no hole, so the payment targets the current month.
    bill = bill_base()
    paid = recent_occurrences(bill.recurrence, "2026-05", 11)  # 2025-07 .. 2026-05
    reference_period = default_payment_reference_period(
        FixedClock(date(2026, 6, 5)), _CAL, bill, _on_time_payments(paid)
    )
    assert reference_period == "2026-06"
