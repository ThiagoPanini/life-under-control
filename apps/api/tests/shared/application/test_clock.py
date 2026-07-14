"""FixedClock: the deterministic double of the `Clock` port (Seam 1)."""

from datetime import date

from luc_api.shared.application.clock import FixedClock


def test_fixed_clock_returns_the_injected_date():
    assert FixedClock(date(2026, 7, 10)).today() == date(2026, 7, 10)
