"""Shared kernel: the common domain language every context speaks.

Not a utils bag — only what two or more contexts genuinely use belongs here,
and it stays minimal by design. Map: `domain` (money, civil dates, semantic
errors), `application` (the `Clock` port), `adapters` (`SystemClock`).
"""

__all__: list[str] = []
