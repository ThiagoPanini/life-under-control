"""The three highlights of the last closed month, derived from the facts (ADR-0003, pure).

Interpretation, never a column (CONTEXT.md #3): variation only exists between
closed months — the current month is partial and stays out. Compares the last
closed one (`closed_reference_period = today - 1 month`) against the one
before it (`base_reference_period = today - 2 months`), aggregating
settlements per Bill before measuring (splits sum). Each metric is a
discriminated state: with no computable candidate, it's `insuficiente` —
never an artificial zero or percentage.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from luc_api.finance.application.bill_card import add_months, reference_period_of
from luc_api.finance.domain.bill import Bill
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock

__all__ = [
    "BiggestPayment",
    "BillVariation",
    "MonthHighlights",
    "derive_month_highlights",
]


@dataclass(frozen=True)
class BillVariation:
    """The variation of a Bill between the base month and the closed month.

    `insuficiente` when no Bill has a valid base for the requested sign (no
    computable increase/decrease). In `ok`, `percent` always exists: only a
    Bill with `base_cents > 0` in both months is a candidate (CONTEXT.md #6 —
    no dividing by zero nor an artificial "+100%" for a new Bill; that Bill
    simply doesn't compete for the variation).
    """

    state: Literal["insuficiente", "ok"]
    bill_id: str | None = None
    name: str | None = None
    base_cents: int | None = None
    """Cents aggregated in the base month (always > 0 when `state == "ok"` — a candidate prerequisite)."""
    current_cents: int | None = None
    """Cents aggregated in the closed month."""
    delta_cents: int | None = None
    """`current_cents - base_cents`: positive is an increase, negative is a decrease."""
    percent: float | None = None
    """Percent variation over the base."""


@dataclass(frozen=True)
class BiggestPayment:
    """The biggest individual Payment of the closed month.

    An individual fact, not the Bill's aggregate — a Bill with many small
    settlements doesn't beat one big settlement from another; this is the
    deliberate correction of #101 over the prototype, which used the
    aggregate.
    """

    state: Literal["insuficiente", "ok"]
    bill_id: str | None = None
    name: str | None = None
    amount_cents: int | None = None
    reference_period: str | None = None
    payment_id: str | None = None


@dataclass(frozen=True)
class MonthHighlights:
    """The three highlights + the reference periods (current/compared) to label the UI."""

    current_reference_period: str
    """The current month (partial, in progress) — only to label "X in progress" in the UI."""
    base_reference_period: str
    closed_reference_period: str
    biggest_increase: BillVariation
    biggest_decrease: BillVariation
    biggest_payment: BiggestPayment


@dataclass(frozen=True)
class _VariationCandidate:
    """Candidate for an increase/decrease: a Bill present in both months, with a positive base."""

    bill_id: str
    name: str
    base_cents: int
    current_cents: int
    delta_cents: int
    percent: float


def _select_variation(
    candidates: list[_VariationCandidate], kind: Literal["alta", "queda"]
) -> BillVariation:
    """Pick the biggest increase or decrease among the candidates, by percent (as the prototype does).

    An increase (`kind == "alta"`) wants the biggest percent; a decrease wants
    the smallest (most negative). Tied on percent → smallest `bill_id`. No
    candidate of the requested sign → `insuficiente`.
    """
    of_sign = [c for c in candidates if (c.percent > 0 if kind == "alta" else c.percent < 0)]
    if not of_sign:
        return BillVariation(state="insuficiente")

    best = of_sign[0]
    for candidate in of_sign[1:]:
        wins = (
            candidate.percent > best.percent if kind == "alta" else candidate.percent < best.percent
        )
        if wins or (candidate.percent == best.percent and candidate.bill_id < best.bill_id):
            best = candidate

    return BillVariation(
        state="ok",
        bill_id=best.bill_id,
        name=best.name,
        base_cents=best.base_cents,
        current_cents=best.current_cents,
        delta_cents=best.delta_cents,
        percent=best.percent,
    )


def _select_biggest_payment(
    payments: list[Payment], closed_reference_period: str, resolve_name: Callable[[str], str]
) -> BiggestPayment:
    """Pick the biggest individual Payment of the closed month.

    Scans the facts of that reference period (not the aggregate) and picks
    the one with the biggest `amount_cents`; tied → smallest `payment_id`. No
    fact in the closed month → `insuficiente`.
    """
    of_month = [p for p in payments if p.reference_period == closed_reference_period]
    if not of_month:
        return BiggestPayment(state="insuficiente")

    biggest = of_month[0]
    for payment in of_month[1:]:
        if payment.amount_cents > biggest.amount_cents or (
            payment.amount_cents == biggest.amount_cents and payment.id < biggest.id
        ):
            biggest = payment

    return BiggestPayment(
        state="ok",
        bill_id=biggest.bill_id,
        name=resolve_name(biggest.bill_id),
        amount_cents=biggest.amount_cents,
        reference_period=biggest.reference_period,
        payment_id=biggest.id,
    )


def derive_month_highlights(
    clock: Clock, bills: list[Bill], payments: list[Payment]
) -> MonthHighlights:
    """Derive the highlights of the last closed month from all Household Bills and Payments.

    Same array as the Historical Analysis (no new query). Pure: only `Clock`
    decides "today"; no I/O.

    Deterministic, documented tie-break: an increase/decrease tied on
    `percent` picks the smallest `bill_id`; Payments tied on `amount_cents`
    pick the smallest `payment_id`. Arbitrary choice, but stable and
    collision-free (unique ids).
    """
    current_reference_period = reference_period_of(clock.today())
    closed_reference_period = add_months(current_reference_period, -1)
    base_reference_period = add_months(current_reference_period, -2)

    name_by_bill = {bill.id: bill.name for bill in bills}

    def resolve_name(bill_id: str) -> str:
        return name_by_bill.get(bill_id, "Conta")

    # Aggregate, per Bill, the cents of each of the two compared months
    # (splits sum) — a single pass over the facts that fall in the two
    # compared reference periods.
    base_by_bill: dict[str, int] = {}
    current_by_bill: dict[str, int] = {}
    for payment in payments:
        if payment.reference_period == base_reference_period:
            base_by_bill[payment.bill_id] = (
                base_by_bill.get(payment.bill_id, 0) + payment.amount_cents
            )
        elif payment.reference_period == closed_reference_period:
            current_by_bill[payment.bill_id] = (
                current_by_bill.get(payment.bill_id, 0) + payment.amount_cents
            )

    # Variation candidates: only Bills present in BOTH months with a positive
    # base — the honest month-over-month comparison. A new Bill (no base) or
    # a closed one (no closed month) has no computable variation and stays
    # out (CONTEXT.md #3, #6).
    candidates: list[_VariationCandidate] = []
    for bill_id, base_cents in base_by_bill.items():
        current_cents = current_by_bill.get(bill_id)
        if current_cents is None or base_cents <= 0:
            continue
        candidates.append(
            _VariationCandidate(
                bill_id=bill_id,
                name=resolve_name(bill_id),
                base_cents=base_cents,
                current_cents=current_cents,
                delta_cents=current_cents - base_cents,
                percent=((current_cents - base_cents) / base_cents) * 100,
            )
        )

    return MonthHighlights(
        current_reference_period=current_reference_period,
        base_reference_period=base_reference_period,
        closed_reference_period=closed_reference_period,
        biggest_increase=_select_variation(candidates, "alta"),
        biggest_decrease=_select_variation(candidates, "queda"),
        biggest_payment=_select_biggest_payment(payments, closed_reference_period, resolve_name),
    )
