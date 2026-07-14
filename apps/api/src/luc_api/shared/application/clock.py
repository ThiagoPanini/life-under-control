"""Clock port (ADR-0003): the domain works with civil dates, never timestamps (#3).

Injecting the clock makes "today" deterministic in tests (FixedClock) and pins the
Household timezone (America/Sao_Paulo) in a single place, the real adapter.
"""

from dataclasses import dataclass
from datetime import date
from typing import Protocol

__all__ = ["Clock", "FixedClock"]


class Clock(Protocol):
    """Domain clock — yields today's civil date in the Household timezone."""

    def today(self) -> date:
        """Today's civil date in the domain timezone."""
        ...


@dataclass(frozen=True)
class FixedClock:
    """Deterministic `Clock` double for tests: always yields the injected date."""

    fixed_today: date

    def today(self) -> date:
        """The fixed civil date of this clock."""
        return self.fixed_today
