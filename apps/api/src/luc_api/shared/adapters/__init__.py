"""Shared adapters layer: concrete implementations of the shared ports.

Map: `system_clock` (the real `Clock` in the Household timezone), `db` (the
Postgres/Core persistence base — `MetaData`, the async engine factory and the
boot-time `alembic upgrade head`, shared by every context's repos). May depend
on `application` and `domain`; frameworks and I/O live here, never upstream.
"""

from luc_api.shared.adapters.system_clock import SystemClock, system_clock

__all__ = ["SystemClock", "system_clock"]
