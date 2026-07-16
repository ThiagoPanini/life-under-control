"""Analytics view suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-visao-analitica.ts.
"""

import re
from dataclasses import replace
from datetime import date

from luc_api.finance.application.analytics_view import (
    AnalyticsRow,
    ValueDeviation,
    derive_analytics_view,
)
from luc_api.finance.application.bill_card import OCCURRENCES_IN_WINDOW
from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.application.monthly_panorama import CardAmount, derive_monthly_panorama
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
    paid_on=date(2026, 6, 8),
    reference_period="2026-06",
    paid_by="p-1",
)


def payment(**over: object) -> Payment:
    return replace(_PAYMENT_BASE, **over)  # type: ignore[arg-type]


def row(rows: list[AnalyticsRow], bill_id: str) -> AnalyticsRow:
    for r in rows:
        if r.bill_id == bill_id:
            return r
    raise AssertionError(f"row {bill_id} missing")


_CAL = FakeCalendar()


def test_no_bill_returns_empty():
    assert derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [], []) == []


def test_one_row_per_active_bill_ordered_by_urgency():
    vencida = bill_base(id="b-vencida", due_rule=FixedDayRule(day=5))
    em_breve = bill_base(id="b-breve", due_rule=FixedDayRule(day=12))
    a_vencer = bill_base(id="b-avencer", due_rule=FixedDayRule(day=25))

    rows = derive_analytics_view(
        FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [a_vencer, em_breve, vencida], []
    )

    assert [r.bill_id for r in rows] == ["b-vencida", "b-breve", "b-avencer"]


def test_row_state_matches_panorama():
    bills = [
        bill_base(id="b-a", due_rule=FixedDayRule(day=5)),
        bill_base(id="b-b", due_rule=FixedDayRule(day=25)),
    ]
    paid = [payment(bill_id="b-a", reference_period="2026-07", amount_cents=3000)]

    rows = derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, bills, paid)
    cards = derive_monthly_panorama(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, bills, paid)

    for card in cards:
        assert row(rows, card.bill_id).state == card.state


def test_non_monthly_bill_reflects_current_occurrence():
    # bimonthly anchored in January: in July there is NO occurrence (jan/mar/mai/jul... jul yes).
    # Using yearly to guarantee a month out of occurrence: January anchor, today July.
    yearly = bill_base(id="b-anual", recurrence=Recurrence(interval_months=12, anchor_month=1))

    rows = derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [yearly], [])

    # the current occurrence is January/2026 (the most recent up to today), not July.
    assert row(rows, "b-anual").current_reference_period == "2026-01"


def test_real_amount_when_current_occurrence_paid():
    paid = [payment(reference_period="2026-07", amount_cents=5000, paid_on=date(2026, 7, 10))]
    rows = derive_analytics_view(
        FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [bill_base()], paid
    )

    assert row(rows, "bill-1").amount == CardAmount(state="pago", amount_cents=5000)
    assert row(rows, "bill-1").authorship == "p-1"


def test_paid_amount_deviation_uses_same_rule_as_year_map():
    paid = [
        payment(id="p-06", reference_period="2026-06", amount_cents=7000),
        payment(
            id="p-07", reference_period="2026-07", amount_cents=13000, paid_on=date(2026, 7, 10)
        ),
    ]
    r = row(
        derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [bill_base()], paid),
        "bill-1",
    )

    assert r.average_cents == 10000
    assert r.value_deviation == ValueDeviation(amount_cents=3000, state="acima")


def test_estimate_amount_average_when_open():
    # day 10, today the 10th: the current occurrence (07) is due today with no Payment — open.
    paid = [
        payment(id="p-05", reference_period="2026-05", amount_cents=6000, paid_on=date(2026, 5, 8)),
        payment(id="p-06", reference_period="2026-06", amount_cents=4000, paid_on=date(2026, 6, 8)),
    ]
    rows = derive_analytics_view(
        FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [bill_base()], paid
    )

    assert row(rows, "bill-1").amount == CardAmount(state="estimativa", amount_cents=5000)


def test_grid_and_sparkline_same_window_of_twelve_agree_cell_by_cell():
    paid = [
        payment(id="p-04", reference_period="2026-04", amount_cents=10000),
        payment(id="p-06", reference_period="2026-06", amount_cents=20000),
    ]
    r = row(
        derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [bill_base()], paid),
        "bill-1",
    )

    assert len(r.grid) == OCCURRENCES_IN_WINDOW
    assert len(r.sparkline) == OCCURRENCES_IN_WINDOW
    # the sparkline is each grid cell's amount, cell by cell.
    assert r.sparkline == [cell.amount_cents for cell in r.grid]
    assert r.average_cents == 15000


def test_detailed_punctuality_with_n_of_m_on_time():
    paid = [
        payment(id="p-05", reference_period="2026-05", amount_cents=5000, paid_on=date(2026, 5, 8))
    ]
    r = row(
        derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [bill_base()], paid),
        "bill-1",
    )

    assert r.punctuality.state == "calculada"
    assert r.punctuality.phrase is not None
    assert re.search(r"\d+/\d+ no prazo", r.punctuality.phrase)


def test_urgency_phrase_of_current_occurrence():
    # paid today -> "pago em 10/07"; the phrase is the same source as the Panorama.
    paid = [payment(reference_period="2026-07", amount_cents=5000, paid_on=date(2026, 7, 10))]
    paid_row = row(
        derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [bill_base()], paid),
        "bill-1",
    )
    assert paid_row.phrase == "pago em 10/07"

    # open, day 10 today day 3 -> "vence em 7 dias"
    open_row = row(
        derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 3)), _CAL, [bill_base()], []),
        "bill-1",
    )
    assert open_row.phrase == "vence em 7 dias"


def test_absent_amount_without_history_never_invents_a_number():
    # New Bill (in effect since July), no Payment at all: open with no base —
    # amount is an explicit absence, never R$ 0,00 (CONTEXT.md #4/#5).
    new = bill_base(id="b-nova", first_reference_period="2026-07")
    r = row(
        derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 15)), _CAL, [new], []), "b-nova"
    )

    assert r.amount == CardAmount(state="ausente")
    assert r.average_cents is None


def test_non_monthly_bill_appears_alongside_monthly_ones():
    # the yearly one (out of phase in July) doesn't disappear — it joins the monthly one.
    monthly = bill_base(id="b-mensal")
    yearly = bill_base(id="b-anual", recurrence=Recurrence(interval_months=12, anchor_month=1))

    rows = derive_analytics_view(
        FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [monthly, yearly], []
    )

    assert {r.bill_id for r in rows} == {"b-mensal", "b-anual"}


def test_authorship_is_of_whoever_gave_the_last_settlement_of_the_current_occurrence():
    # split settlement in the current occurrence: authorship is the most recent by date.
    paid = [
        payment(
            id="p-a",
            reference_period="2026-07",
            amount_cents=3000,
            paid_on=date(2026, 7, 5),
            paid_by="thiago",
        ),
        payment(
            id="p-b",
            reference_period="2026-07",
            amount_cents=2000,
            paid_on=date(2026, 7, 8),
            paid_by="jakeline",
        ),
    ]
    r = row(
        derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [bill_base()], paid),
        "bill-1",
    )

    assert r.amount == CardAmount(state="pago", amount_cents=5000)
    assert r.authorship == "jakeline"


def test_young_bill_has_outside_effect_in_the_grid():
    young = bill_base(id="b-jovem", first_reference_period="2026-05")
    r = row(
        derive_analytics_view(FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [young], []),
        "b-jovem",
    )

    assert any(cell.state == "fora-vigencia" for cell in r.grid)


def test_closed_bills_excluded_by_default():
    active = bill_base(id="b-ativa")
    closed = bill_base(id="b-encerrada", state="encerrada", closed_on=date(2026, 3, 15))

    rows = derive_analytics_view(
        FixedClock(fixed_today=date(2026, 7, 10)), _CAL, [active, closed], []
    )

    assert [r.bill_id for r in rows] == ["b-ativa"]


def test_closed_bills_at_the_end_dimmed_when_included():
    active = bill_base(id="b-ativa", due_rule=FixedDayRule(day=5))
    closed_1 = bill_base(id="b-enc1", state="encerrada", closed_on=date(2026, 1, 10))
    closed_2 = bill_base(id="b-enc2", state="encerrada", closed_on=date(2026, 3, 10))

    rows = derive_analytics_view(
        FixedClock(fixed_today=date(2026, 7, 10)),
        _CAL,
        [closed_1, active, closed_2],
        [],
        include_closed=True,
    )

    # active first; closed at the end, most recent closing first.
    assert [r.bill_id for r in rows] == ["b-ativa", "b-enc2", "b-enc1"]
    assert row(rows, "b-enc2").closed is True
    assert row(rows, "b-ativa").closed is False
