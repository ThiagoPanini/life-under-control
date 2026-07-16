"""Calendar port (ADR-0003): the one question the Bill's derivations need — is a day a bank business day?

The core resolves the expected due date (nth business day, last business day)
without knowing the real calendar — the adapter carries the national bank
calendar (weekends + fixed and movable Easter-derived holidays; no municipal
holiday). The Seam 1 fake takes whichever non-business days the test wants.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Protocol

__all__ = ["Calendar", "FakeCalendar"]

_SATURDAY = 5


class Calendar(Protocol):
    """Domain calendar port — answers whether a civil date is a bank business day."""

    def is_business_day(self, day: date) -> bool:
        """Is this civil date a bank business day (neither weekend nor holiday)?"""
        ...


@dataclass(frozen=True)
class FakeCalendar:
    """Deterministic Calendar double: business day = not a weekend and not an injected holiday.

    No holiday by default — the test injects only the ones the scenario cares
    about. The real adapter computes the actual national bank calendar.
    """

    holidays: frozenset[date] = field(default_factory=frozenset[date])

    def is_business_day(self, day: date) -> bool:
        """Business day = weekday (Mon-Fri) and not in the injected holiday set."""
        return day.weekday() < _SATURDAY and day not in self.holidays
