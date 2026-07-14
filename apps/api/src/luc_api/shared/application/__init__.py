"""Shared application layer: ports and use-case plumbing common to every context.

Map: `clock` (the `Clock` port and its `FixedClock` test double). May depend on
`domain`; must never import adapters or any framework.
"""

from luc_api.shared.application.clock import Clock, FixedClock

__all__ = ["Clock", "FixedClock"]
