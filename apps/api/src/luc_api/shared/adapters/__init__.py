"""Shared adapters layer: concrete implementations of the shared ports.

Map: `system_clock` (the real `Clock` in the Household timezone). May depend on
`application` and `domain`; frameworks and I/O live here, never upstream.
"""

from luc_api.shared.adapters.system_clock import SystemClock, system_clock

__all__ = ["SystemClock", "system_clock"]
