"""SystemClock: asserts the shape (a pure civil date in the Household timezone)."""

from datetime import date

from luc_api.shared.adapters.system_clock import system_clock


def test_today_returns_a_pure_civil_date():
    # Real clock: we don't pin the value, we assert the shape — exactly a `date`,
    # never a `datetime` leaking time into the domain.
    today = system_clock().today()
    assert type(today) is date
