"""Bill occurrence projections the menu Alterar needs — a minimal slice pulled forward from #189.

Which reference periods a Bill recurs on, its expected due date, and the
"oldest still-open occurrence" default used to re-infer a receipt's reference
period when the couple swaps the matched Bill (Alterar -> Conta). #189 (F1 —
financas projeções e digest) owns the full `derive-*` surface (card farol/
grid/sparkline, digest) — this module should be superseded/absorbed there
rather than redefined; see the #190 decision log for the adjudication.
"""

from datetime import date, timedelta

from luc_api.finance.application import (
    Bill,
    DueRule,
    FixedDayRule,
    LastBusinessDayRule,
    NthBusinessDayRule,
    Payment,
    Recurrence,
)
from luc_api.whatsapp.application.calendar import Calendar

__all__ = [
    "infer_reference_period_on_bill_change",
    "month_of",
    "occurrences_recent",
    "resolve_due_date",
]

_OCCURRENCE_WINDOW = 12


def _month_index(reference_period: str) -> int:
    year, month = reference_period.split("-")
    return int(year) * 12 + (int(month) - 1)


def _reference_period_of_index(idx: int) -> str:
    year, month = divmod(idx, 12)
    return f"{year}-{month + 1:02d}"


def month_of(day: date) -> str:
    """Reference period (`YYYY-MM`) of a civil date."""
    return f"{day.year:04d}-{day.month:02d}"


_MONTHS_PER_YEAR = 12


def _last_day_of_month(year: int, month: int) -> int:
    next_month_first = (
        date(year + 1, 1, 1) if month == _MONTHS_PER_YEAR else date(year, month + 1, 1)
    )
    return (next_month_first - timedelta(days=1)).day


def resolve_due_date(
    due_rule: DueRule, due_month_offset: int, reference_period: str, calendar: Calendar
) -> date:
    """Resolves the expected due date of a reference period.

    The reference period shifts by `due_month_offset` months; the rule then
    resolves the day: `dia-fixo` clamps to a civil day (capped at month end);
    `n-esimo-dia-util` and `ultimo-dia-util` walk business days via `Calendar`.
    """
    target_period = _reference_period_of_index(_month_index(reference_period) + due_month_offset)
    year, month = (int(part) for part in target_period.split("-"))
    last_day = _last_day_of_month(year, month)

    if isinstance(due_rule, FixedDayRule):
        return date(year, month, min(due_rule.day, last_day))

    if isinstance(due_rule, NthBusinessDayRule):
        business_days = 0
        last_business_day = date(year, month, last_day)
        for day_num in range(1, last_day + 1):
            candidate = date(year, month, day_num)
            if calendar.is_business_day(candidate):
                business_days += 1
                last_business_day = candidate
                if business_days == due_rule.nth:
                    return candidate
        # Fewer business days in the month than the requested nth: falls back
        # to the last available business day.
        return last_business_day

    assert isinstance(due_rule, LastBusinessDayRule)  # exhaustiveness over the closed DueRule union
    for day_num in range(last_day, 0, -1):
        candidate = date(year, month, day_num)
        if calendar.is_business_day(candidate):
            return candidate
    # A month with no business day at all is impossible in a real calendar; defensive fallback.
    return date(year, month, last_day)


def _matches_anchor_phase(month: int, interval_months: int, anchor_month: int | None) -> bool:
    if interval_months <= 1 or anchor_month is None:
        return True
    return (month - anchor_month) % interval_months == 0


def occurrences_recent(recurrence: Recurrence, reference_period: str, n: int) -> list[str]:
    """The last `n` reference periods of occurrence <= `reference_period`, oldest to most recent.

    Monthly returns the last `n` months; when the interval is > 1, walks back
    to the anchor (the most recent occurrence matching the periodicity) and
    then steps by `interval_months`.
    """
    interval_months, anchor_month = recurrence.interval_months, recurrence.anchor_month
    idx = _month_index(reference_period)

    if interval_months > 1 and anchor_month is not None:
        while not _matches_anchor_phase((idx % 12) + 1, interval_months, anchor_month):
            idx -= 1

    out: list[str] = []
    for _ in range(n):
        out.append(_reference_period_of_index(idx))
        idx -= interval_months
    return list(reversed(out))


def infer_reference_period_on_bill_change(
    bill: Bill, payments: list[Payment], today: date, calendar: Calendar
) -> str | None:
    """Reference period default (#63) when the couple swaps the matched Bill (Alterar -> Conta).

    The oldest still-open occurrence — a late June bill records against June,
    not July (paying out of order keeps the right reference period). Falls
    back to the current occurrence (the window's most recent) when none is
    open. Occurrences before the Bill's `first_reference_period` (ADR-0011)
    are never a candidate — they are outside its validity window.
    """
    window = occurrences_recent(bill.recurrence, month_of(today), _OCCURRENCE_WINDOW)
    valid_window = [period for period in window if period >= bill.first_reference_period]
    if not valid_window:
        return None
    paid_periods = {p.reference_period for p in payments}
    for period in valid_window:
        if period in paid_periods:
            continue
        due = resolve_due_date(bill.due_rule, bill.due_month_offset, period, calendar)
        if today >= due:
            return period
    return valid_window[-1]
