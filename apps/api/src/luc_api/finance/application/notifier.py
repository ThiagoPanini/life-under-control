"""Notifier port (ADR-0003, issue #189): sends a pre-approved template through whatever channel.

Minimal on purpose (decision log): the digest is the only consumer today and it
only ever sends a template — never free text, buttons or lists. The concrete
adapter (the WhatsApp Business Graph API) arrives in the messenger slice; only
the digest's actual need is named here, not the full messenger contract.
"""

from dataclasses import dataclass, field
from typing import Protocol

__all__ = ["FakeNotifier", "Notifier", "Template"]


@dataclass(frozen=True)
class Template:
    """A pre-approved template message: name, language and the body's ordered params."""

    name: str
    language: str
    params: tuple[str, ...]


class Notifier(Protocol):
    """Sends a pre-approved template — the only way to start a conversation outside the 24h window."""

    async def send_template(self, to: str, template: Template) -> bool:
        """Sends the template to `to` (E.164); `True` only when the channel accepted it.

        Unlike other sends, a refusal must stay visible to the caller: the
        digest claims the day's dedup key before sending and releases it only
        on a `False` here — a failed send must never poison the day.
        """
        ...


@dataclass
class FakeNotifier:
    """In-memory Notifier double — records every attempted send, accepts unless told to refuse."""

    accepts: bool = True
    sent: list[tuple[str, Template]] = field(default_factory=list[tuple[str, Template]])

    async def send_template(self, to: str, template: Template) -> bool:
        """Records the attempt; returns `accepts`."""
        self.sent.append((to, template))
        return self.accepts
