"""WhatsappMessenger port (ADR-0012): sends messages back to the couple's chat.

The thin adapter talks to the Graph API; the phase-0 echo uses only
`send_text`, the Payment Proposal responds with `send_buttons`.
"""

from dataclasses import dataclass, field
from typing import Protocol, TypedDict

from luc_api.whatsapp.domain.payment_proposal import InteractiveButton, InteractiveRow

__all__ = [
    "FakeWhatsappMessenger",
    "SentButtons",
    "SentList",
    "SentTemplate",
    "SentText",
    "WhatsappMessenger",
    "WhatsappTemplate",
]


@dataclass(frozen=True)
class WhatsappTemplate:
    """A pre-approved Meta template (the only way to start a conversation outside the 24h window)."""

    name: str
    language: str
    """Meta language code (e.g. `pt_BR`)."""
    params: list[str]
    """Body params, in the order of `{{1}}...{{n}}`. Never empty nor multi-line."""


class WhatsappMessenger(Protocol):
    """Message-sending port for WhatsApp; adapters implement it, use-cases depend on it."""

    async def send_text(self, to: str, body: str) -> None:
        """Sends free text to the E.164 number."""
        ...

    async def send_buttons(self, to: str, body: str, buttons: list[InteractiveButton]) -> None:
        """Sends a message with quick-reply buttons (the Proposal: Confirmar/Alterar/Cancelar).

        The Graph API accepts at most 3 buttons.
        """
        ...

    async def send_list(
        self, to: str, body: str, rows: list[InteractiveRow], button_label: str
    ) -> None:
        """Sends an interactive list (the menu Alterar and the Bill/month lists): one selectable row per option.

        `button_label` is the text of the button that opens the list (<=20
        chars) — varies by context, never fixed. The Graph API accepts at
        most 10 rows.
        """
        ...

    async def send_template(self, to: str, template: WhatsappTemplate) -> bool:
        """Sends a pre-approved template: outside the 24h window only a template starts the conversation.

        Unlike the others (which swallow failure), **returns `True` only when
        Meta accepted** — the caller only claims the dedup on success.
        """
        ...


class SentText(TypedDict):
    """A recorded `send_text` call."""

    to: str
    body: str


class SentButtons(TypedDict):
    """A recorded `send_buttons` call."""

    to: str
    body: str
    buttons: list[InteractiveButton]


class SentList(TypedDict):
    """A recorded `send_list` call."""

    to: str
    body: str
    rows: list[InteractiveRow]
    button_label: str


class SentTemplate(TypedDict):
    """A recorded `send_template` call."""

    to: str
    template: WhatsappTemplate


@dataclass
class FakeWhatsappMessenger:
    """In-memory WhatsappMessenger — the test double of the port; every send is recorded for inspection."""

    sent_texts: list[SentText] = field(default_factory=list[SentText])
    sent_buttons: list[SentButtons] = field(default_factory=list[SentButtons])
    sent_lists: list[SentList] = field(default_factory=list[SentList])
    sent_templates: list[SentTemplate] = field(default_factory=list[SentTemplate])

    async def send_text(self, to: str, body: str) -> None:
        """Records the text send for inspection."""
        self.sent_texts.append({"to": to, "body": body})

    async def send_buttons(self, to: str, body: str, buttons: list[InteractiveButton]) -> None:
        """Records the buttons send for inspection."""
        self.sent_buttons.append({"to": to, "body": body, "buttons": buttons})

    async def send_list(
        self, to: str, body: str, rows: list[InteractiveRow], button_label: str
    ) -> None:
        """Records the list send for inspection."""
        self.sent_lists.append({"to": to, "body": body, "rows": rows, "button_label": button_label})

    async def send_template(self, to: str, template: WhatsappTemplate) -> bool:
        """Records the template send for inspection; always reports success."""
        self.sent_templates.append({"to": to, "template": template})
        return True
