"""Digest send log port (ADR-0003, issue #189): the dedup guard for the daily due-date digest.

One digest per day per recipient (issue #160's AC). Named by what it does for
THIS use-case, not after any channel: a concrete adapter is free to reuse
whatever table the ingestion edge already has for idempotency (ADR-0012), but
this port only names the two operations the digest needs — claim before
sending, release if the send fails.
"""

from dataclasses import dataclass, field
from typing import Protocol

__all__ = ["DigestSendLog", "FakeDigestSendLog"]


class DigestSendLog(Protocol):
    """Dedup log for the daily digest — one claim per (day, recipient) key."""

    async def claim(self, key: str) -> bool:
        """Claims the key — `True` the first time (persists it), `False` if already claimed.

        Atomic: under a concurrent redelivery, only one call returns `True` (a
        unique index in the adapter decides, never a read-then-write race).
        """
        ...

    async def release(self, key: str) -> None:
        """Releases a claim (deletes it) — compensation for a refused send.

        The claim happens BEFORE sending; when the send fails, releasing lets
        the next run retry instead of poisoning the day. No-op if the key is
        not currently claimed.
        """
        ...


@dataclass
class FakeDigestSendLog:
    """In-memory DigestSendLog double: a plain set of currently-claimed keys."""

    claimed: set[str] = field(default_factory=set[str])

    async def claim(self, key: str) -> bool:
        """Adds the key if absent; `True` on first claim, `False` if already present."""
        if key in self.claimed:
            return False
        self.claimed.add(key)
        return True

    async def release(self, key: str) -> None:
        """Removes the key; no-op if absent."""
        self.claimed.discard(key)
