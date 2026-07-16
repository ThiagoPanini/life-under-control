"""Monthly panorama (issue #93): the single derivation that turns Bills + Payments + `Clock` + `Calendar` into the ready-made models for the current month's Analysis cards.

Every state/amount reading lives here — the React edge only attaches
name/logo and presents, never recomputes a domain rule nor scans Payments
per Bill (invariant #3; ADR-0003).

The card distinguishes a **fact** (`pago` — the exact sum of the reference
period's Payments, including split settlements), an **estimate** (`≈`
historical average, when open with history), and an **absence** (an
explicit shape, never an invented `R$ 0,00` — CONTEXT.md #4/#5: the exact
amount is only born at the Payment).
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from luc_api.finance.application.bill_card import reference_period_of, resolve_due_date
from luc_api.finance.application.calendar import Calendar
from luc_api.finance.application.reference_period_shape import (
    bills_of_month,
    historical_average_up_to,
)
from luc_api.finance.domain.bill import Bill
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock
from luc_api.shared.domain.civil_date import format_br_date

__all__ = [
    "DUE_SOON_THRESHOLD_DAYS",
    "CardAmount",
    "MonthCardState",
    "PanoramaCard",
    "derive_monthly_panorama",
    "phrase_of_month_card",
    "state_of_occurrence",
]

MonthCardState = Literal["pago", "a-vencer", "vence-em-breve", "vencida"]
"""The card's state in the current month. `pago` prevails over dates; the rest derive from the distance to the due date.

Only `vencida` (a consumed due date) wears the `danger` semantic;
`vence-em-breve` is attention (amber). Values stay pt-BR — a persisted/edge
contract, same precedent as `BeaconState`/`GridState`/`MarkerState`.
"""

DUE_SOON_THRESHOLD_DAYS = 4
"""Threshold (days) of due-date **proximity**: 0 to N days left turns the card `vence-em-breve`; N+1 and beyond, `a-vencer`.

"Due today" (0 days) lands in `vence-em-breve` — not a consumed delay
(issue #93).
"""


@dataclass(frozen=True)
class CardAmount:
    """The displayed amount: a summed fact when paid, an estimate (`≈`) with history, or an explicit absence."""

    state: Literal["pago", "estimativa", "ausente"]
    amount_cents: int | None = None
    """The `pago` total or the `estimativa` average, in cents; `None` for `ausente`."""


@dataclass(frozen=True)
class PanoramaCard:
    """The card of a Bill with a current occurrence: state, amount, authorship and reading."""

    bill_id: str
    state: MonthCardState
    reference_period: str
    """The current occurrence's reference period (Competência, `YYYY-MM`) — the settlement is born into it."""
    due_date: date
    """Expected due date of the current occurrence — derived, never a column."""
    amount: CardAmount
    authorship: str | None
    """Who recorded the reference period's last settlement; `None` while open."""
    phrase: str
    """pt-BR product copy."""
    average_cents: int | None
    """Historical average (cents) to prefill the settlement form; `None` without history."""


_URGENCY_RANK: dict[MonthCardState, int] = {
    "vencida": 0,
    "vence-em-breve": 1,
    "a-vencer": 2,
    "pago": 3,
}
"""Urgency rank: vencida in front, pago at the end; ties break by due-date proximity."""


def _days_until(today: date, target: date) -> int:
    """Civil days from `today` to `target` — negative once `target` has passed."""
    return (target - today).days


def state_of_occurrence(settled: bool, days: int) -> MonthCardState:
    """The occurrence's state: `pago` first, else derived from the distance to the due date."""
    if settled:
        return "pago"
    if days < 0:
        return "vencida"
    if days <= DUE_SOON_THRESHOLD_DAYS:
        return "vence-em-breve"
    return "a-vencer"


def _plural(days: int) -> str:
    """pt-BR singular/plural of "dia(s)"."""
    return "dia" if days == 1 else "dias"


def phrase_of_month_card(state: MonthCardState, days: int, paid_on: date | None) -> str:
    """The card's reading phrase (product copy), pt-BR.

    E.g. "pago em dd/mm", "pago · sem data", "venceu há N dia(s)", "vence
    hoje", "vence amanhã", "vence em N dias".
    """
    if state == "pago":
        if paid_on is None:
            return "pago · sem data"
        return f"pago em {format_br_date(paid_on)[:5]}"
    # Single phrase for every open state, as in the Final prototype: "venceu há",
    # "vence hoje", "vence amanhã", "vence em N dias" — a-vencer does not abbreviate.
    if days < 0:
        return f"venceu há {-days} {_plural(-days)}"
    if days == 0:
        return "vence hoje"
    if days == 1:
        return "vence amanhã"
    return f"vence em {days} dias"


def _last_settlement(bill_payments: list[Payment]) -> Payment | None:
    """The reference period's last settlement (by paid date) — carries authorship and "pago em".

    An undated Payment sorts as the earliest possible date (`date.min`),
    reproducing the oracle's `(a.dataPagamento ?? "").localeCompare(...)`
    treatment of a missing date as an empty string (sorts first).
    """
    if not bill_payments:
        return None
    return sorted(bill_payments, key=lambda p: p.paid_on or date.min)[-1]


def derive_monthly_panorama(
    clock: Clock, calendar: Calendar, bills: list[Bill], payments: list[Payment]
) -> list[PanoramaCard]:
    """The current month's panorama cards — only active Bills with an occurrence in the reference period (the M universe of `bills_of_month`), already sorted by urgency.

    Indexes Payments by Bill in a single pass; the edge never runs a
    quadratic scan (issue #93).
    """
    today = clock.today()
    reference_period = reference_period_of(today)

    # Bill -> its Payments index: one pass, no per-Bill scan.
    by_bill: dict[str, list[Payment]] = {}
    for p in payments:
        by_bill.setdefault(p.bill_id, []).append(p)

    cards: list[PanoramaCard] = []
    for bill in bills_of_month(bills, reference_period):
        due_date = resolve_due_date(
            bill.due_rule, bill.due_month_offset, reference_period, calendar
        )
        own = by_bill.get(bill.id, [])
        settlements = [p for p in own if p.reference_period == reference_period]
        total = sum(p.amount_cents for p in settlements) if settlements else None
        settled = total is not None
        days = _days_until(today, due_date)
        state = state_of_occurrence(settled, days)

        average = historical_average_up_to(bill, own, reference_period) if not settled else None
        if total is not None:
            amount = CardAmount(state="pago", amount_cents=total)
        elif average is not None:
            amount = CardAmount(state="estimativa", amount_cents=average)
        else:
            amount = CardAmount(state="ausente")

        last = _last_settlement(settlements)
        cards.append(
            PanoramaCard(
                bill_id=bill.id,
                state=state,
                reference_period=reference_period,
                due_date=due_date,
                amount=amount,
                authorship=last.paid_by if last is not None else None,
                phrase=phrase_of_month_card(
                    state, days, last.paid_on if last is not None else None
                ),
                average_cents=average,
            )
        )

    return sorted(cards, key=lambda c: (_URGENCY_RANK[c.state], _days_until(today, c.due_date)))
