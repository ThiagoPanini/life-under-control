"""Composition root helpers: provide_* factories, one per port — no DI container.

The annotated return type is where pyright validates the adapter's structural
adherence to the port (ADR-0014).
"""

from luc_api.settings import Settings
from luc_api.shared.adapters.system_clock import SystemClock
from luc_api.shared.application.clock import Clock

__all__ = ["provide_clock", "provide_settings"]


def provide_clock() -> Clock:
    """Provides the real clock adapter behind the Clock port.

    Returns:
        The system clock (Household timezone).
    """
    return SystemClock()


def provide_settings() -> Settings:
    """Provides the environment-backed settings (fail-closed).

    Returns:
        The resolved settings.
    """
    return Settings.from_env()
