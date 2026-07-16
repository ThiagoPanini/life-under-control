"""Month highlights suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/derive-destaques-mes.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.finance.application.month_highlights import (
    BiggestPayment,
    BillVariation,
    derive_month_highlights,
)
from luc_api.finance.domain.bill import Bill, FixedDayRule, Recurrence
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import FixedClock

_BILL_BASE = Bill(
    id="bill-1",
    household_id="h-1",
    name="Energia",
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


def bill(**over: object) -> Bill:
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


def variation_ok(v: BillVariation) -> BillVariation:
    """Unwraps a variation, failing the test if it came back insufficient."""
    if v.state != "ok":
        raise AssertionError(f"expected ok, got {v.state}")
    return v


def biggest_payment_ok(p: BiggestPayment) -> BiggestPayment:
    """Unwraps the biggest payment, failing the test if it came back insufficient."""
    if p.state != "ok":
        raise AssertionError(f"expected ok, got {p.state}")
    return p


# Reference frame of every test: today 2026-06-15 -> current month 2026-06
# (partial, ignored); closed month = 2026-05; base month = 2026-04.


def test_ignores_partial_current_month_and_compares_last_two_closed():
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill()],
        [
            payment(id="b", reference_period="2026-04", amount_cents=1000),
            payment(id="f", reference_period="2026-05", amount_cents=3000),
            # Giant fact in the partial current month — cannot enter any metric.
            payment(id="atual", reference_period="2026-06", amount_cents=999999),
        ],
    )

    assert d.current_reference_period == "2026-06"
    assert d.base_reference_period == "2026-04"
    assert d.closed_reference_period == "2026-05"
    increase = variation_ok(d.biggest_increase)
    assert increase.bill_id == "bill-1"
    assert increase.base_cents == 1000
    assert increase.current_cents == 3000
    assert increase.delta_cents == 2000
    # The current month's Payment doesn't become the "biggest".
    assert biggest_payment_ok(d.biggest_payment).amount_cents == 3000


def test_increase_aggregates_splits_per_bill_before_variation():
    # Split settlement in the closed month: two Payments of the same Bill sum
    # before the variation.
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill()],
        [
            payment(id="b", reference_period="2026-04", amount_cents=1000),
            payment(id="f1", reference_period="2026-05", amount_cents=1500),
            payment(id="f2", reference_period="2026-05", amount_cents=1500),
        ],
    )

    increase = variation_ok(d.biggest_increase)
    assert increase.current_cents == 3000
    assert increase.base_cents == 1000
    assert increase.delta_cents == 2000
    assert increase.percent == 200


def test_new_bill_without_base_does_not_compete_for_increase():
    # Bill is born in the closed month: without a positive base there's no
    # computable variation — it doesn't become an artificial "+100%"
    # (CONTEXT.md #6). Only Bill -> insufficient increase.
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill()],
        [payment(id="f", reference_period="2026-05", amount_cents=5000)],
    )

    assert d.biggest_increase == BillVariation(state="insuficiente")
    assert d.biggest_decrease == BillVariation(state="insuficiente")
    # But the fact exists and is the biggest Payment of the closed month.
    assert biggest_payment_ok(d.biggest_payment).amount_cents == 5000


def test_percent_computed_when_base_is_positive():
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill()],
        [
            payment(id="b", reference_period="2026-04", amount_cents=2000),
            payment(id="f", reference_period="2026-05", amount_cents=3000),
        ],
    )

    assert variation_ok(d.biggest_increase).percent == 50


def test_biggest_increase_selects_biggest_positive_variation_and_identifies_bill():
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill(id="bill-1", name="Energia"), bill(id="bill-2", name="Internet")],
        [
            payment(id="b1", bill_id="bill-1", reference_period="2026-04", amount_cents=1000),
            payment(id="f1", bill_id="bill-1", reference_period="2026-05", amount_cents=2000),
            payment(id="b2", bill_id="bill-2", reference_period="2026-04", amount_cents=1000),
            payment(id="f2", bill_id="bill-2", reference_period="2026-05", amount_cents=4000),
        ],
    )

    increase = variation_ok(d.biggest_increase)
    assert increase.bill_id == "bill-2"
    assert increase.name == "Internet"
    assert increase.delta_cents == 3000
    assert increase.percent == 300


def test_biggest_decrease_selects_biggest_negative_variation_and_identifies_bill():
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill(id="bill-1", name="Energia"), bill(id="bill-2", name="Internet")],
        [
            payment(id="b1", bill_id="bill-1", reference_period="2026-04", amount_cents=5000),
            payment(id="f1", bill_id="bill-1", reference_period="2026-05", amount_cents=3000),
            payment(id="b2", bill_id="bill-2", reference_period="2026-04", amount_cents=8000),
            payment(id="f2", bill_id="bill-2", reference_period="2026-05", amount_cents=3000),
        ],
    )

    decrease = variation_ok(d.biggest_decrease)
    assert decrease.bill_id == "bill-2"
    assert decrease.name == "Internet"
    assert decrease.delta_cents == -5000
    assert decrease.percent == -62.5


def test_bill_missing_in_closed_month_does_not_compete_for_decrease():
    # Present in the base, absent in the closed month: without the pair of
    # both months there's no month-over-month variation — the Bill doesn't
    # compete for the decrease (not a fabricated "-100%").
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill()],
        [payment(id="b", reference_period="2026-04", amount_cents=4000)],
    )

    assert d.biggest_decrease == BillVariation(state="insuficiente")
    assert d.biggest_increase == BillVariation(state="insuficiente")


def test_biggest_payment_uses_individual_fact_not_bill_aggregate():
    # Bill A aggregates 6000 (two of 3000); Bill B has a single one of 5000.
    # The biggest aggregate is A, but the biggest individual FACT is B's (5000).
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill(id="bill-1", name="Energia"), bill(id="bill-2", name="Internet")],
        [
            payment(id="a1", bill_id="bill-1", reference_period="2026-05", amount_cents=3000),
            payment(id="a2", bill_id="bill-1", reference_period="2026-05", amount_cents=3000),
            payment(id="b1", bill_id="bill-2", reference_period="2026-05", amount_cents=5000),
        ],
    )

    biggest = biggest_payment_ok(d.biggest_payment)
    assert biggest.payment_id == "b1"
    assert biggest.bill_id == "bill-2"
    assert biggest.name == "Internet"
    assert biggest.amount_cents == 5000


def test_biggest_payment_is_from_closed_month_not_base():
    # A giant fact in the base month cannot win: the highlight is from the
    # last closed month.
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill()],
        [
            payment(id="base-grande", reference_period="2026-04", amount_cents=99999),
            payment(id="fechado", reference_period="2026-05", amount_cents=5000),
        ],
    )

    biggest = biggest_payment_ok(d.biggest_payment)
    assert biggest.payment_id == "fechado"
    assert biggest.reference_period == "2026-05"
    assert biggest.amount_cents == 5000


def test_delta_tie_breaks_by_ascending_bill_id():
    # Same variation; the deterministic tie-break picks the smallest bill_id.
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill(id="bill-b", name="Beta"), bill(id="bill-a", name="Alfa")],
        [
            payment(id="ba", bill_id="bill-a", reference_period="2026-04", amount_cents=1000),
            payment(id="fa", bill_id="bill-a", reference_period="2026-05", amount_cents=3000),
            payment(id="bb", bill_id="bill-b", reference_period="2026-04", amount_cents=1000),
            payment(id="fb", bill_id="bill-b", reference_period="2026-05", amount_cents=3000),
        ],
    )

    assert variation_ok(d.biggest_increase).bill_id == "bill-a"


def test_closed_bill_enters_comparison_with_resolved_name():
    # Facts of a Bill closed today still count and the name is resolved.
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill(id="bill-1", name="Netflix", state="encerrada", closed_on=date(2026, 5, 31))],
        [
            payment(id="b", reference_period="2026-04", amount_cents=1000),
            payment(id="f", reference_period="2026-05", amount_cents=4000),
        ],
    )

    increase = variation_ok(d.biggest_increase)
    assert increase.bill_id == "bill-1"
    assert increase.name == "Netflix"
    assert increase.delta_cents == 3000


def test_without_positive_variation_increase_becomes_insufficient_per_metric():
    # Only decreases in the window: the decrease exists, but the increase has
    # no candidate.
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill()],
        [
            payment(id="b", reference_period="2026-04", amount_cents=5000),
            payment(id="f", reference_period="2026-05", amount_cents=2000),
        ],
    )

    assert d.biggest_increase == BillVariation(state="insuficiente")
    assert variation_ok(d.biggest_decrease).delta_cents == -3000


def test_without_facts_in_compared_months_all_metrics_are_insufficient():
    # Nothing in the two closed months (only the partial one) -> every metric
    # is insufficient history.
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill()],
        [payment(id="atual", reference_period="2026-06", amount_cents=9000)],
    )

    assert d.base_reference_period == "2026-04"
    assert d.closed_reference_period == "2026-05"
    assert d.biggest_increase == BillVariation(state="insuficiente")
    assert d.biggest_decrease == BillVariation(state="insuficiente")
    assert d.biggest_payment == BiggestPayment(state="insuficiente")


def test_missing_base_month_leaves_variations_insufficient_but_keeps_biggest_payment():
    # Base month without any fact: no Bill has a base to compare against ->
    # no increase nor decrease; but the biggest Payment of the closed month
    # is still a highlight.
    d = derive_month_highlights(
        FixedClock(date(2026, 6, 15)),
        [bill()],
        [payment(id="f", reference_period="2026-05", amount_cents=5000)],
    )

    assert d.biggest_increase == BillVariation(state="insuficiente")
    assert d.biggest_decrease == BillVariation(state="insuficiente")
    biggest = biggest_payment_ok(d.biggest_payment)
    assert biggest.amount_cents == 5000
    assert biggest.reference_period == "2026-05"
