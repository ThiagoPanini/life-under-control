"""Agenda suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-agenda.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.agenda import derive_agenda
from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.domain.bill import Bill, FixedDayRule, Recurrence
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import FixedClock

_CALENDAR = FakeCalendar()

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
    paid_on=date(2026, 5, 8),
    reference_period="2026-05",
    paid_by="p-1",
)


def payment(**over: object) -> Payment:
    return replace(_PAYMENT_BASE, **over)  # type: ignore[arg-type]


def test_open_occurrence_enters_overdue_group_with_note_and_warn_tone():
    groups = derive_agenda(FixedClock(date(2026, 6, 12)), _CALENDAR, [bill_base()], [])

    assert groups[0].title == "Atrasado"
    assert groups[0].note == "venceu ou vence hoje, sem Lançamento"
    assert groups[0].tone == "warn"


def test_overdue_group_always_comes_before_future_months():
    groups = derive_agenda(FixedClock(date(2026, 6, 12)), _CALENDAR, [bill_base()], [])
    assert [group.title for group in groups] == ["Atrasado", "Julho de 2026"]


def test_future_month_groups_have_note_projections_of_bills():
    groups = derive_agenda(FixedClock(date(2026, 6, 5)), _CALENDAR, [bill_base()], [])
    july = next(group for group in groups if group.title == "Julho de 2026")

    assert july.note == "projeções das Contas"
    assert july.tone == "default"


def test_due_today_enters_overdue_with_phrase_vence_hoje():
    # the group's note covers "venceu ou vence hoje" — it must not contradict the
    # row's own phrase when the due date is today.
    groups = derive_agenda(FixedClock(date(2026, 6, 10)), _CALENDAR, [bill_base()], [])

    assert groups[0].title == "Atrasado"
    assert groups[0].items[0].due_date == date(2026, 6, 10)
    assert groups[0].items[0].phrase == "vence hoje"


def test_no_overdue_occurrences_does_not_create_overdue_group():
    groups = derive_agenda(FixedClock(date(2026, 6, 5)), _CALENDAR, [bill_base()], [])
    assert "Atrasado" not in [group.title for group in groups]


def test_item_carries_beacon_and_phrase_from_occurrence_state_reading():
    groups = derive_agenda(FixedClock(date(2026, 6, 12)), _CALENDAR, [bill_base()], [])

    assert groups[0].items[0].beacon == "vermelho"
    assert groups[0].items[0].phrase == "venceu há 2 dias"


def test_item_carries_subject_of_the_bill():
    groups = derive_agenda(FixedClock(date(2026, 6, 12)), _CALENDAR, [bill_base()], [])
    assert groups[0].items[0].subject == "Pagamentos Recorrentes"


def test_estimated_amount_is_the_historical_average_up_to_reference_period():
    payments = [
        payment(reference_period="2026-04"),
        payment(reference_period="2026-05", amount_cents=12000),
    ]
    groups = derive_agenda(FixedClock(date(2026, 6, 12)), _CALENDAR, [bill_base()], payments)
    assert groups[0].items[0].estimated_amount_cents == 11000


def test_without_history_estimated_amount_is_none():
    groups = derive_agenda(FixedClock(date(2026, 6, 12)), _CALENDAR, [bill_base()], [])
    assert groups[0].items[0].estimated_amount_cents is None


def test_paid_occurrence_does_not_appear_in_any_group():
    payments = [payment(reference_period="2026-06")]
    groups = derive_agenda(FixedClock(date(2026, 6, 5)), _CALENDAR, [bill_base()], payments)
    reference_periods = [item.reference_period for group in groups for item in group.items]

    assert "2026-06" not in reference_periods


def test_no_active_bills_agenda_has_no_groups():
    assert derive_agenda(FixedClock(date(2026, 6, 5)), _CALENDAR, [], []) == []
