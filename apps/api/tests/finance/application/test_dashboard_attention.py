"""Dashboard attention suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-atencao.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.application.dashboard_attention import (
    AttentionItem,
    AttentionStrip,
    NextItem,
    derive_active_area_hero,
    derive_attention_strip,
    derive_dashboard_attention,
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
    paid_on=date(2026, 6, 8),
    reference_period="2026-06",
    paid_by="p-1",
)


def payment(**over: object) -> Payment:
    return replace(_PAYMENT_BASE, **over)  # type: ignore[arg-type]


# --- derive_attention_strip (Seam 1) ---


def test_red_beacon_enters_the_strip_with_phrase_origin_and_estimate():
    bills = [bill_base(id="luz")]
    payments = [
        payment(id="luz-mai", bill_id="luz", reference_period="2026-05", amount_cents=10000),
        payment(id="luz-abr", bill_id="luz", reference_period="2026-04", amount_cents=12000),
    ]
    # today 2026-07-10, the due date of reference period 2026-07 is day 10 -> due today (red)
    strip = derive_attention_strip(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, payments)

    assert strip.state == "pendente"
    assert strip.items == [
        AttentionItem(
            bill_id="luz",
            title="Luz",
            reference_period="2026-07",
            beacon="vermelho",
            phrase="vence hoje",
            detail="competência de julho, sem Lançamento",
            source="Finanças · Pagamentos Recorrentes",
            estimated_amount_cents=11000,
        )
    ]
    assert strip.total_estimated_cents == 11000


def test_nothing_pending_state_calm_never_an_empty_list():
    bills = [bill_base(id="luz")]
    payments = [payment(id="luz-jul", bill_id="luz", reference_period="2026-07")]
    # already settled in July -> green beacon, out of the strip
    strip = derive_attention_strip(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, payments)
    assert strip == AttentionStrip(state="calma")


def test_sorts_red_before_yellow_and_closed_does_not_enter():
    bills = [
        bill_base(id="amarela", name="Água", due_rule=FixedDayRule(day=12)),
        bill_base(id="vermelha", name="Luz", due_rule=FixedDayRule(day=2)),
        bill_base(id="fora", name="Encerrada", state="encerrada"),
    ]
    strip = derive_attention_strip(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, [])
    assert strip.state == "pendente"
    assert [item.bill_id for item in strip.items] == ["vermelha", "amarela"]


def test_without_history_estimated_amount_none_and_out_of_the_total():
    bills = [bill_base(id="nova", name="Internet")]
    strip = derive_attention_strip(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, [])
    assert strip.state == "pendente"
    assert strip.items[0].estimated_amount_cents is None
    assert strip.total_estimated_cents is None


# --- derive_active_area_hero (Seam 1) ---


def test_headline_settled_next_and_track_of_the_month():
    bills = [
        bill_base(id="luz", name="Luz", due_rule=FixedDayRule(day=2)),
        bill_base(id="agua", name="Água", due_rule=FixedDayRule(day=20)),
    ]
    payments = [payment(id="luz-jul", bill_id="luz", reference_period="2026-07")]
    hero = derive_active_area_hero(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, payments)

    assert hero.reference_period == "2026-07"
    assert hero.settled == SettledCount(settled=1, total=2)
    assert hero.next == NextItem(title="Água", phrase="em 10 dias")
    assert len(hero.track) == 2


def test_next_none_when_everything_settled():
    bills = [bill_base(id="luz")]
    payments = [payment(id="luz-jul", bill_id="luz", reference_period="2026-07")]
    hero = derive_active_area_hero(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, payments)
    assert hero.next is None


def test_overdue_bill_does_not_become_next_it_is_already_in_the_strip():
    bills = [
        bill_base(id="agua", name="Água", due_rule=FixedDayRule(day=2)),
        bill_base(id="aluguel", name="Aluguel", due_rule=FixedDayRule(day=25)),
    ]
    # today 2026-07-10: Água is already overdue (day 2), Aluguel is still ahead (day 25)
    hero = derive_active_area_hero(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, [])
    assert hero.next == NextItem(title="Aluguel", phrase="em 15 dias")


# --- derive_dashboard_attention (Seam 1) ---


def test_composes_strip_and_hero_from_the_same_clock():
    bills = [bill_base(id="luz", due_rule=FixedDayRule(day=2))]
    dashboard = derive_dashboard_attention(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, [])
    assert dashboard.strip.state == "pendente"
    assert dashboard.hero.reference_period == "2026-07"
