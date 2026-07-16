"""Due digest content suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-digest-vencimentos.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.application.due_digest_content import DigestParams, derive_digest_content
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


def history(bill_id: str, amount_may: int, amount_apr: int) -> list[Payment]:
    """Two reference periods of history (average 11000) for the `bill_id` Bill."""
    return [
        payment(
            id=f"{bill_id}-mai",
            bill_id=bill_id,
            reference_period="2026-05",
            amount_cents=amount_may,
        ),
        payment(
            id=f"{bill_id}-abr",
            bill_id=bill_id,
            reference_period="2026-04",
            amount_cents=amount_apr,
        ),
    ]


def test_nothing_pending_does_not_send_digest():
    bills = [bill_base(id="luz")]
    # already settled in July -> green beacon, out of the strip -> digest does not go out
    payments = [payment(id="luz-jul", bill_id="luz", reference_period="2026-07")]
    content = derive_digest_content(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, payments)
    assert content is None


def test_only_due_soon_overdue_bucket_is_placeholder():
    # fixed-day 12, today 2026-07-10 -> due in 2 days -> yellow
    bills = [bill_base(id="agua", name="Água", due_rule=FixedDayRule(day=12))]
    payments = history("agua", 5000, 5000)
    content = derive_digest_content(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, payments)
    assert content == DigestParams(
        overdue="nenhuma",
        due_soon="Água ≈ R$ 50",
        estimated_total="≈ R$ 50",
    )


def test_mixes_overdue_and_due_soon_two_buckets_by_beacon():
    bills = [
        # fixed-day 2, today 2026-07-10 -> overdue by 8 days -> red
        bill_base(id="luz", name="Luz", due_rule=FixedDayRule(day=2)),
        # fixed-day 12 -> due in 2 days -> yellow
        bill_base(id="agua", name="Água", due_rule=FixedDayRule(day=12)),
    ]
    payments = [*history("luz", 10000, 12000), *history("agua", 5000, 5000)]
    content = derive_digest_content(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, payments)
    assert content == DigestParams(
        overdue="Luz ≈ R$ 110",
        due_soon="Água ≈ R$ 50",
        estimated_total="≈ R$ 160",
    )


def test_without_history_item_only_title_and_total_no_estimate():
    # yellow, no payments -> estimated_amount_cents None -> total None
    bills = [bill_base(id="net", name="Internet", due_rule=FixedDayRule(day=12))]
    content = derive_digest_content(FixedClock(date(2026, 7, 10)), FakeCalendar(), bills, [])
    assert content == DigestParams(
        overdue="nenhuma",
        due_soon="Internet",
        estimated_total="sem estimativa",
    )
