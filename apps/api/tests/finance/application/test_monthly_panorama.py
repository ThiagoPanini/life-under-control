"""Monthly panorama suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-panorama-mensal.ts.
"""

from dataclasses import replace
from datetime import date

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


# --- derivarPanoramaMensal — valores (Seam 1) ---


def test_split_payments_sum_into_paid():
    # Two split settlements of the same Bill+reference period sum into the paid card.
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 15)),
        FakeCalendar(),
        [bill_base()],
        [
            payment(
                id="p-a", reference_period="2026-07", amount_cents=3000, paid_on=date(2026, 7, 5)
            ),
            payment(
                id="p-b", reference_period="2026-07", amount_cents=2000, paid_on=date(2026, 7, 6)
            ),
        ],
    )

    assert card.state == "pago"
    assert card.amount == CardAmount(state="pago", amount_cents=5000)


def test_paid_prevails_even_when_overdue():
    # Due date (day 10) has already passed, but there's a Payment in the reference period: paid prevails.
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 20)),
        FakeCalendar(),
        [bill_base()],
        [payment(reference_period="2026-07", amount_cents=4000, paid_on=date(2026, 7, 18))],
    )

    assert card.state == "pago"


def test_estimate_average_when_open_with_history():
    # Open (day 10, today day 5 -> 5 days left) with history: estimate from the average of 2 prior periods.
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 5)),
        FakeCalendar(),
        [bill_base()],
        [
            payment(
                id="p-05", reference_period="2026-05", amount_cents=6000, paid_on=date(2026, 5, 8)
            ),
            payment(
                id="p-06", reference_period="2026-06", amount_cents=4000, paid_on=date(2026, 6, 8)
            ),
        ],
    )

    assert card.amount == CardAmount(state="estimativa", amount_cents=5000)


def test_estimate_sums_split_history():
    # The historical average also aggregates split settlements per reference period.
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 5)),
        FakeCalendar(),
        [bill_base()],
        [
            payment(
                id="p-06a",
                reference_period="2026-06",
                amount_cents=3000,
                paid_on=date(2026, 6, 8),
            ),
            payment(
                id="p-06b",
                reference_period="2026-06",
                amount_cents=1000,
                paid_on=date(2026, 6, 9),
            ),
        ],
    )

    # only reference period with history (06) sums 4000 -> average = 4000.
    assert card.amount == CardAmount(state="estimativa", amount_cents=4000)


def test_explicit_absence_without_history_never_zero():
    # No valid base: an explicit absence, never an invented R$ 0,00.
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 5)), FakeCalendar(), [bill_base()], []
    )

    assert card.amount == CardAmount(state="ausente")


def test_authorship_of_last_payer_and_none_when_open():
    (paid,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 15)),
        FakeCalendar(),
        [bill_base()],
        [
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
        ],
    )
    assert paid.authorship == "jakeline"

    (open_card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 5)), FakeCalendar(), [bill_base()], []
    )
    assert open_card.authorship is None


# --- derivarPanoramaMensal — estados (Seam 1) ---


def test_a_vencer_when_five_days_or_more():
    # today day 5, due date day 10 -> 5 days left.
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 5)), FakeCalendar(), [bill_base()], []
    )

    assert card.state == "a-vencer"


def test_vence_em_breve_between_today_and_four_days():
    # today day 6, due date day 10 -> 4 days left.
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 6)), FakeCalendar(), [bill_base()], []
    )

    assert card.state == "vence-em-breve"


def test_threshold_four_to_five():
    dia10 = bill_base(due_rule=FixedDayRule(day=10))

    (four,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 6)), FakeCalendar(), [dia10], []
    )
    (five,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 5)), FakeCalendar(), [dia10], []
    )
    assert four.state == "vence-em-breve"
    assert five.state == "a-vencer"


def test_due_today_is_vence_em_breve_not_vencida():
    # today == due date (day 10): due today is NOT a consumed delay.
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 10)), FakeCalendar(), [bill_base()], []
    )

    assert card.state == "vence-em-breve"


def test_vencida_only_after_the_due_date():
    # today day 11, due date day 10 -> overdue since yesterday.
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 11)), FakeCalendar(), [bill_base()], []
    )

    assert card.state == "vencida"


# --- derivarPanoramaMensal — frase (Seam 1) ---


def test_phrase_vence_amanha_when_one_day_left():
    # today day 9, due date day 10 -> "vence amanhã" (Final prototype), not "vence em 1 dia".
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 9)), FakeCalendar(), [bill_base()], []
    )

    assert card.phrase == "vence amanhã"


def test_phrase_a_vencer_also_says_vence_em():
    # today day 5, due date day 20 -> a-vencer uses the SAME "vence em N dias" phrase
    # as the prototype (no open state says just "em N dias").
    (card,) = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 5)),
        FakeCalendar(),
        [bill_base(due_rule=FixedDayRule(day=20))],
        [],
    )

    assert card.state == "a-vencer"
    assert card.phrase == "vence em 15 dias"


# --- derivarPanoramaMensal — escopo e ordem (Seam 1) ---


def test_only_bills_with_current_occurrence():
    # A yearly Bill (January anchor) has no occurrence in July -> out of the panorama.
    monthly = bill_base(id="mensal")
    yearly = bill_base(id="anual", recurrence=Recurrence(interval_months=12, anchor_month=1))

    cards = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 15)), FakeCalendar(), [monthly, yearly], []
    )

    assert [c.bill_id for c in cards] == ["mensal"]


def test_closed_bill_outside_panorama():
    closed = bill_base(id="enc", state="encerrada", closed_on=date(2026, 6, 30))

    cards = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 15)), FakeCalendar(), [closed], []
    )

    assert cards == []


def test_ordering_vencida_first_pago_last():
    vencida = bill_base(id="b-vencida", due_rule=FixedDayRule(day=3))
    breve = bill_base(id="b-breve", due_rule=FixedDayRule(day=12))
    a_vencer = bill_base(id="b-avencer", due_rule=FixedDayRule(day=20))
    pago = bill_base(id="b-pago", due_rule=FixedDayRule(day=5))

    cards = derive_monthly_panorama(
        FixedClock(fixed_today=date(2026, 7, 10)),
        FakeCalendar(),
        [a_vencer, pago, breve, vencida],
        [payment(bill_id="b-pago", reference_period="2026-07", amount_cents=1000)],
    )

    assert [c.bill_id for c in cards] == ["b-vencida", "b-breve", "b-avencer", "b-pago"]
