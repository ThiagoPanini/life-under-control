"""FakeCalendar suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/calendar.fake.ts (no dedicated .test.ts — behavior
is exercised indirectly by every derive-* test that imports it; this suite covers the
double directly since it is new in Python).
"""

from datetime import date

from luc_api.finance.application.calendar import FakeCalendar


def test_weekday_is_business_day():
    calendar = FakeCalendar()

    assert calendar.is_business_day(date(2026, 7, 6)) is True  # Monday


def test_saturday_is_not_business_day():
    calendar = FakeCalendar()

    assert calendar.is_business_day(date(2026, 7, 4)) is False


def test_sunday_is_not_business_day():
    calendar = FakeCalendar()

    assert calendar.is_business_day(date(2026, 7, 5)) is False


def test_injected_holiday_is_not_business_day():
    calendar = FakeCalendar(holidays=frozenset({date(2026, 6, 4)}))  # Corpus Christi

    assert calendar.is_business_day(date(2026, 6, 4)) is False


def test_weekday_not_in_holidays_stays_business_day():
    calendar = FakeCalendar(holidays=frozenset({date(2026, 6, 4)}))

    assert calendar.is_business_day(date(2026, 7, 6)) is True
