"""Calendar port (ADR-0003): the one question due-date derivations need.

The core resolves the due day (nth business day, last business day of the month)
without knowing the real calendar — a bank-holiday adapter arrives later. The fake
injects whichever non-business days a test wants (mirrors the TS oracle's
`calendar.fake.ts`; default has no holiday, weekday-only).
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Protocol

__all__ = ["Calendar", "FakeCalendar"]

_SATURDAY = 5  # date.weekday(): Monday=0 ... Sunday=6


class Calendar(Protocol):
    """Domain calendar — answers whether a civil date is a bank business day."""

    def is_business_day(self, day: date) -> bool:
        """Is this civil date a business day (neither weekend nor holiday)?"""
        ...


@dataclass(frozen=True)
class FakeCalendar:
    """Deterministic `Calendar` double: business day = weekday not in the injected holidays."""

    holidays: frozenset[date] = field(default_factory=frozenset[date])

    def is_business_day(self, day: date) -> bool:
        """Weekday not present in `holidays`."""
        if day in self.holidays:
            return False
        return day.weekday() < _SATURDAY
