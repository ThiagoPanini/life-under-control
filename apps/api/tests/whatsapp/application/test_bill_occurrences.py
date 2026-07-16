"""Bill occurrence projections (a minimal slice pulled forward from #189 — see the
#190 decision log): suite ported 1:1 from the TS oracle's `resolverVencimento` and
`ocorrenciasRecentes` cases.

Oracle: apps/web/src/core/use-cases/derive-bill-card.test.ts.
"""

from datetime import date

from luc_api.finance.application import (
    FixedDayRule,
    LastBusinessDayRule,
    NthBusinessDayRule,
    Recurrence,
)
from luc_api.whatsapp.application.bill_occurrences import occurrences_recent, resolve_due_date
from luc_api.whatsapp.application.calendar import FakeCalendar

# --- resolve_due_date ---


def test_fixed_day_resolves_on_the_reference_period():
    due = resolve_due_date(FixedDayRule(day=10), 0, "2026-06", FakeCalendar())

    assert due == date(2026, 6, 10)


def test_fixed_day_with_offset_shifts_the_month():
    # a "January" condo fee with a +1 offset falls due on Feb 8 (the grilling's case)
    due = resolve_due_date(FixedDayRule(day=8), 1, "2026-01", FakeCalendar())

    assert due == date(2026, 2, 8)


def test_fixed_day_beyond_month_end_clamps_to_the_last_day():
    # day 31 doesn't exist in February — clamps to the civil month end
    due = resolve_due_date(FixedDayRule(day=31), 0, "2026-02", FakeCalendar())

    assert due == date(2026, 2, 28)


def test_nth_business_day_counts_only_business_days():
    # June/2026 starts on a Monday; with no holiday, the 5th business day is Jun 5
    due = resolve_due_date(NthBusinessDayRule(nth=5), 0, "2026-06", FakeCalendar())

    assert due == date(2026, 6, 5)


def test_nth_business_day_skips_a_holiday():
    # with Jun 4 (Corpus Christi) a holiday, the 5th business day slips to Jun 8
    calendar = FakeCalendar(holidays=frozenset([date(2026, 6, 4)]))

    due = resolve_due_date(NthBusinessDayRule(nth=5), 0, "2026-06", calendar)

    assert due == date(2026, 6, 8)


def test_last_business_day_steps_back_from_the_weekend():
    # May 31 2026 is a Sunday, May 30 a Saturday — the last business day is Fri May 29
    due = resolve_due_date(LastBusinessDayRule(), 0, "2026-05", FakeCalendar())

    assert due == date(2026, 5, 29)


# --- occurrences_recent ---


def test_monthly_returns_the_last_n_months_up_to_the_reference():
    periods = occurrences_recent(Recurrence(interval_months=1, anchor_month=None), "2026-03", 4)

    assert periods == ["2025-12", "2026-01", "2026-02", "2026-03"]


def test_bimonthly_anchored_only_lands_on_anchor_months():
    # bimonthly anchored on January: Jan, Mar, May... stepping back from April
    periods = occurrences_recent(Recurrence(interval_months=2, anchor_month=1), "2026-04", 4)

    assert periods == ["2025-09", "2025-11", "2026-01", "2026-03"]


def test_annual_anchored_steps_back_year_by_year():
    periods = occurrences_recent(Recurrence(interval_months=12, anchor_month=1), "2026-06", 3)

    assert periods == ["2024-01", "2025-01", "2026-01"]
