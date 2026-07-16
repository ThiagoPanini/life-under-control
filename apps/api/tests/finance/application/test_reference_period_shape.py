"""Reference period shape suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-forma-competencia.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.bill_card import add_months
from luc_api.finance.application.calendar import FakeCalendar
from luc_api.finance.application.reference_period_shape import (
    SettledCount,
    TrackMarker,
    count_settled,
    derive_reference_period_shape,
    derive_track_markers,
    estimate_remaining_for_month,
    list_prior_pending,
    project_month_spend,
    sum_paid_in_month,
)
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


# --- project_month_spend (Seam 1) ---


def test_projected_sums_averages_of_the_months_bills():
    bills = [bill_base(id="luz"), bill_base(id="agua", name="Água")]
    payments = [
        payment(id="luz-mai", bill_id="luz", reference_period="2026-05", amount_cents=10000),
        payment(id="luz-abr", bill_id="luz", reference_period="2026-04", amount_cents=12000),
        payment(id="agua-mai", bill_id="agua", reference_period="2026-05", amount_cents=4000),
        payment(id="agua-abr", bill_id="agua", reference_period="2026-04", amount_cents=6000),
    ]
    # luz: average(10000,12000) = 11000 · agua: average(4000,6000) = 5000 · sum = 16000
    assert project_month_spend(bills, payments, "2026-06") == 16000


def test_average_ignores_absences_never_zeroes():
    payments = [
        payment(id="a", reference_period="2026-03", amount_cents=9000),
        payment(id="b", reference_period="2026-01", amount_cents=9000),
        # the other 10 months of the window have no Payment — a gap, not zero
    ]
    # average(9000,9000) = 9000, not (9000+9000)/12
    assert project_month_spend([bill_base()], payments, "2026-06") == 9000


def test_average_sums_split_settlements_of_the_same_reference_period():
    # March was paid in two settlements (split) — the average must sum both, not
    # take only the first
    payments = [
        payment(id="a", reference_period="2026-03", amount_cents=6000),
        payment(id="b", reference_period="2026-03", amount_cents=4000),
    ]
    # a single month in the window: sums 10000 -> average 10000
    assert project_month_spend([bill_base()], payments, "2026-06") == 10000


def test_without_history_returns_none():
    # Bill with an occurrence in June, no Payment anywhere
    assert project_month_spend([bill_base()], [], "2026-06") is None


def test_yearly_recurrence_out_of_month_does_not_enter():
    # yearly IPTU anchored in January: June is not an occurrence month
    iptu = bill_base(
        id="iptu", name="IPTU", recurrence=Recurrence(interval_months=12, anchor_month=1)
    )
    payments = [payment(id="p", bill_id="iptu", reference_period="2025-01", amount_cents=120000)]
    # no Bill has an occurrence in June -> None, not IPTU's average
    assert project_month_spend([iptu], payments, "2026-06") is None


# --- sum_paid_in_month (Seam 1) ---


def test_sums_split_settlements_of_the_same_reference_period():
    payments = [
        payment(id="a", reference_period="2026-06", amount_cents=6000),
        payment(id="b", reference_period="2026-06", amount_cents=4000),
    ]
    assert sum_paid_in_month([bill_base()], payments, "2026-06") == 10000


def test_ignores_payment_out_of_phase_with_the_recurrence():
    # bimonthly anchored in January: June is not an occurrence month — a Payment
    # there is out of phase and must not inflate the paid total of a reference
    # period that is not even its own
    out_of_phase_bimonthly = bill_base(
        id="bimestral-fora", recurrence=Recurrence(interval_months=2, anchor_month=1)
    )
    payments = [
        payment(id="p", bill_id="bimestral-fora", reference_period="2026-06", amount_cents=99999)
    ]
    assert sum_paid_in_month([out_of_phase_bimonthly], payments, "2026-06") == 0


# --- estimate_remaining_for_month (Seam 1) ---


def test_remaining_never_negative():
    # paid (20000) exceeds projected (5000) — the difference never goes negative
    assert estimate_remaining_for_month(5000, 20000) == 0


def test_remaining_is_the_difference_when_positive():
    assert estimate_remaining_for_month(16000, 10000) == 6000


def test_without_history_does_not_estimate_remaining():
    assert estimate_remaining_for_month(None, 5000) is None


# --- count_settled (Seam 1) ---


def test_settled_denominator_is_only_the_months_occurrences():
    bills = [
        bill_base(id="ativa1", name="Ativa quitada"),
        bill_base(id="ativa2", name="Ativa em aberto"),
        bill_base(
            id="bimestral-fora",
            name="Bimestral fora de fase",
            recurrence=Recurrence(interval_months=2, anchor_month=1),
        ),
        bill_base(id="encerrada", name="Encerrada", state="encerrada", closed_on=date(2026, 1, 1)),
    ]
    payments = [payment(id="p", bill_id="ativa1", reference_period="2026-06", amount_cents=10000)]
    # M = only ativa1 + ativa2 (out-of-phase bimonthly and closed don't count) · N = only ativa1
    assert count_settled(bills, payments, "2026-06") == SettledCount(settled=1, total=2)


# --- derive_track_markers (Seam 1) ---


def _marker(markers: list[TrackMarker], bill_id: str) -> TrackMarker:
    for m in markers:
        if m.bill_id == bill_id:
            return m
    raise AssertionError(f"marker {bill_id} missing")


def test_markers_by_day_and_state():
    bills = [
        bill_base(id="luz", name="Luz", due_rule=FixedDayRule(day=10)),  # due 2 days ago, unpaid
        bill_base(
            id="netflix", name="Netflix", due_rule=FixedDayRule(day=14)
        ),  # due in 2 days, unpaid
        bill_base(id="agua", name="Água", due_rule=FixedDayRule(day=25)),  # due in 13 days, unpaid
        bill_base(id="internet", name="Internet", due_rule=FixedDayRule(day=5)),  # paid
    ]
    payments = [
        payment(id="luz-mai", bill_id="luz", reference_period="2026-05", amount_cents=9000),
        payment(id="luz-abr", bill_id="luz", reference_period="2026-04", amount_cents=9000),
        payment(id="netflix-mai", bill_id="netflix", reference_period="2026-05", amount_cents=3000),
        payment(
            id="internet-jun", bill_id="internet", reference_period="2026-06", amount_cents=8000
        ),
    ]
    markers = derive_track_markers(
        FixedClock(date(2026, 6, 12)), FakeCalendar(), bills, payments, "2026-06"
    )

    luz = _marker(markers, "luz")
    assert luz.due_date == date(2026, 6, 10)
    assert luz.state == "a-vencer"
    assert luz.expected_amount_cents == 9000

    netflix = _marker(markers, "netflix")
    assert netflix.due_date == date(2026, 6, 14)
    assert netflix.state == "a-vencer"
    assert netflix.expected_amount_cents == 3000

    agua = _marker(markers, "agua")
    assert agua.due_date == date(2026, 6, 25)
    assert agua.state == "aguardando"
    assert agua.expected_amount_cents is None  # sem histórico — never invents an estimate

    internet = _marker(markers, "internet")
    assert internet.due_date == date(2026, 6, 5)
    assert internet.reference_period == "2026-06"
    assert internet.state == "quitada"
    assert internet.expected_amount_cents == 8000  # real settlement amount, not the average


def test_settled_marker_sums_split_settlements():
    # a Bill paid in two settlements in the same reference period — the marker sums both
    bills = [bill_base(id="luz")]
    payments = [
        payment(id="a", bill_id="luz", reference_period="2026-06", amount_cents=6000),
        payment(id="b", bill_id="luz", reference_period="2026-06", amount_cents=4000),
    ]
    markers = derive_track_markers(
        FixedClock(date(2026, 6, 12)), FakeCalendar(), bills, payments, "2026-06"
    )
    assert markers[0].state == "quitada"
    assert markers[0].expected_amount_cents == 10000


# --- list_prior_pending (Seam 1) ---


def test_prior_pendings_are_a_collection():
    bill = bill_base(id="luz")
    month_before = add_months("2026-06", -1)
    # the 12 reference periods of the window ending the month before the target reference period
    window = [add_months(month_before, i - 11) for i in range(12)]
    without_payment = {"2026-02", "2026-04"}
    payments = [
        payment(id=f"p-{i}", bill_id="luz", reference_period=rp, amount_cents=9000)
        for i, rp in enumerate(rp for rp in window if rp not in without_payment)
    ]

    pending = list_prior_pending(FakeCalendar(), [bill], payments, "2026-06")

    # a collection, never a singular field — no pending is lost
    assert sorted(p.reference_period for p in pending) == ["2026-02", "2026-04"]
    assert all(p.bill_id == "luz" for p in pending)


def test_prior_pendings_never_predate_the_bills_first_reference_period():
    # a brand-new Bill (first_reference_period is the target month itself) must
    # not fabricate 12 pending months for a Bill that did not exist yet
    bill = bill_base(id="luz", first_reference_period="2026-06")

    pending = list_prior_pending(FakeCalendar(), [bill], [], "2026-06")

    assert pending == []


# --- derive_reference_period_shape (Seam 1) ---


def test_composes_the_reference_period_shape():
    bills = [bill_base(id="luz", name="Luz")]
    # full 12-months-before history (no gap) — does not generate a prior pending
    window = [add_months("2026-05", i - 11) for i in range(12)]
    payments = [
        payment(id=f"hist-{i}", bill_id="luz", reference_period=rp, amount_cents=9000)
        for i, rp in enumerate(window)
    ] + [payment(id="luz-jun", bill_id="luz", reference_period="2026-06", amount_cents=9500)]

    shape = derive_reference_period_shape(
        FixedClock(date(2026, 6, 12)), FakeCalendar(), bills, payments, "2026-06"
    )

    assert shape.projected_cents == 9000
    assert shape.paid_cents == 9500
    assert shape.remaining_cents == 0
    assert shape.settled == SettledCount(settled=1, total=1)
    assert len(shape.markers) == 1
    assert shape.prior_pending == []
