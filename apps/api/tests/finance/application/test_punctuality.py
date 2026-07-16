"""Punctuality suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-pontualidade.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.bill_card import GridCell, add_months, grid_occurrences
from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.application.punctuality import (
    PunctualityDetail,
    calculate_bill_punctuality,
    calculate_punctuality_12m,
    detail_bill_punctuality,
)
from luc_api.finance.domain.bill import Bill, FixedDayRule, Recurrence
from luc_api.finance.domain.payment import Payment

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


def _date_of(reference_period: str, day: int) -> date:
    return date(int(reference_period[:4]), int(reference_period[5:7]), day)


_CAL = FakeCalendar()

# The 12 reference periods of the grid window (2025-07 .. 2026-06), oldest to most recent.
_WINDOW = [add_months("2026-06", i - 11) for i in range(12)]


# --- calculate_punctuality_12m (Seam 1) ---


def test_no_active_bills_returns_none():
    assert calculate_punctuality_12m([], [], date(2026, 6, 12), _CAL) is None


def test_closed_bill_does_not_count_toward_punctuality():
    closed = bill_base(state="encerrada", closed_on=date(2026, 1, 1))
    paid = [
        payment(id=f"p-{i}", reference_period=c, paid_on=_date_of(c, 8))
        for i, c in enumerate(_WINDOW)
    ]

    assert calculate_punctuality_12m([closed], paid, date(2026, 6, 12), _CAL) is None


def test_percentage_on_time_over_occurrences_already_due():
    # fixed day 10, today the 12th: even the current reference period is already
    # due — the window's 12 occurrences are all due (none "aguardando").
    bill = bill_base()
    on_time = _WINDOW[:9]  # first 9: paid 2 days before the due date
    paid = [
        payment(id=f"p-{i}", reference_period=c, paid_on=_date_of(c, 8))
        for i, c in enumerate(on_time)
    ]
    # the last 3 (indices 9,10,11) have no Payment — "em-aberto", not on time

    assert calculate_punctuality_12m([bill], paid, date(2026, 6, 12), _CAL) == 75  # 9/12


def test_awaiting_and_paid_without_date_stay_outside_the_denominator():
    # fixed day 20, today the 12th: the current reference period is not due yet (awaiting)
    bill = bill_base(due_rule=FixedDayRule(day=20))
    no_date = _WINDOW[:5]  # paid without a date (backfill) — can't be judged for punctuality
    on_time = _WINDOW[5:8]  # paid on time
    # _WINDOW[8..10] have no Payment — "em-aberto", enters the denominator
    # _WINDOW[11] (current) has no Payment — "aguardando", outside the denominator
    paid = [
        payment(id=f"sd-{i}", reference_period=c, paid_on=None) for i, c in enumerate(no_date)
    ] + [
        payment(id=f"ed-{i}", reference_period=c, paid_on=_date_of(c, 15))
        for i, c in enumerate(on_time)
    ]

    # 3 on-time / (3 on-time + 3 open)
    assert calculate_punctuality_12m([bill], paid, date(2026, 6, 12), _CAL) == 50


def test_young_bill_all_on_time_marks_100_excluding_outside_effect():
    # effective only since March: the eight earlier occurrences are outside effect
    # and stay out of the denominator. The four within effect, all on time -> 100%.
    bill = bill_base(first_reference_period="2026-03")
    within_effect = [c for c in _WINDOW if c >= "2026-03"]
    paid = [
        payment(id=f"p-{i}", reference_period=c, paid_on=_date_of(c, 8))
        for i, c in enumerate(within_effect)
    ]

    assert calculate_punctuality_12m([bill], paid, date(2026, 6, 12), _CAL) == 100


# --- detail_bill_punctuality / calculate_bill_punctuality (Seam 1) ---

_CELL_BASE = GridCell(
    reference_period="2026-06", due_date=date(2026, 6, 10), state="em-dia", amount_cents=10000
)


def grid_cell(**over: object) -> GridCell:
    return replace(_CELL_BASE, **over)  # type: ignore[arg-type]


def test_detail_exposes_the_count_as_a_ready_phrase():
    grid = [
        grid_cell(reference_period="a", state="em-dia"),
        grid_cell(reference_period="b", state="em-dia"),
        grid_cell(reference_period="c", state="atraso"),
    ]

    assert detail_bill_punctuality(grid) == PunctualityDetail(
        state="calculada", percentage=67, on_time=2, total=3, phrase="2/3 no prazo"
    )


def test_empty_grid_has_no_history():
    assert calculate_bill_punctuality([]) is None


def test_awaiting_and_paid_without_date_are_outside_the_denominator():
    grid = [
        grid_cell(reference_period="a", state="em-dia"),
        grid_cell(reference_period="b", state="atraso-leve"),
        grid_cell(reference_period="c", state="aguardando", amount_cents=None),
        grid_cell(reference_period="d", state="pago-sem-data"),
    ]

    assert calculate_bill_punctuality(grid) == 50


def test_outside_effect_is_outside_the_denominator():
    grid = [
        grid_cell(reference_period="a", state="fora-vigencia", amount_cents=None),
        grid_cell(reference_period="b", state="fora-vigencia", amount_cents=None),
        grid_cell(reference_period="c", state="em-dia"),
        grid_cell(reference_period="d", state="em-dia"),
    ]

    assert detail_bill_punctuality(grid) == PunctualityDetail(
        state="calculada", percentage=100, on_time=2, total=2, phrase="2/2 no prazo"
    )


def test_closed_bill_still_counts_its_own_punctuality():
    # calculate_punctuality_12m excludes a closed Bill from the Household's
    # aggregate — but the Bill's own grid (already filtered on the detail page,
    # #59) does not disappear.
    bill = bill_base(state="encerrada", closed_on=date(2026, 5, 1))
    paid = [
        payment(id=f"p-{i}", reference_period=c, paid_on=_date_of(c, 8))
        for i, c in enumerate(_WINDOW[:6])
    ]
    grid = grid_occurrences(bill, paid, date(2026, 6, 12), _CAL)

    assert calculate_punctuality_12m([bill], paid, date(2026, 6, 12), _CAL) is None
    assert calculate_bill_punctuality(grid) == 50
