"""Due-date digest content (issue #160, phase 2): the WhatsApp `digest_vencimentos` template.

The three parameters of the `digest_vencimentos` (#157) Meta utility template, in
the approved body's order. Each is a single line — Meta forbids an empty or
multi-line param; the Bill list lives inline separated by `", "`, and a bucket
with no Bill becomes the literal placeholder `"nenhuma"`.

The content is derived on the fly (invariant #3: no due-date state is ever
persisted) from the same dashboard "attention" derivation
(`derive_attention_strip`) — no new state. `None` means nothing needs attention
→ ADR-0012 says don't send the message.
"""

import re
from dataclasses import dataclass

from luc_api.finance.application.calendar import Calendar
from luc_api.finance.application.dashboard_attention import AttentionItem, derive_attention_strip
from luc_api.finance.domain.bill import Bill
from luc_api.finance.domain.payment import Payment
from luc_api.shared.application.clock import Clock
from luc_api.shared.domain.money import format_brl_no_cents

__all__ = ["DigestParams", "derive_digest_content"]

_EMPTY_BUCKET_PLACEHOLDER = "nenhuma"
"""Literal placeholder for a bucket with no Bill (Meta forbids an empty param)."""

_NO_ESTIMATE_PLACEHOLDER = "sem estimativa"
"""Literal placeholder for the estimated total when no item in the strip has history."""

_MAX_PARAM_LENGTH = 900
"""Defensive ceiling on a body param's length.

Meta rejects params that are too long (and forbids multi-line); with many overdue
Bills the list could overflow. Well below the real limit (~1024) to leave slack.
"""


def _sanitize_title(title: str) -> str:
    r"""Flattens the title into a single line — Meta forbids line break, tab and 4+ spaces in a param (#157).

    A Bill name imported from elsewhere could carry a stray `\n` — collapse any
    run of whitespace into a single space and trim the ends.
    """
    return re.sub(r"\s+", " ", title).strip()


def _format_item(item: AttentionItem) -> str:
    """Formats `Title ≈ R$ amount`, or just the title when the Bill has no history (never a disguised R$ 0)."""
    title = _sanitize_title(item.title)
    if item.estimated_amount_cents is None:
        return title
    return f"{title} ≈ {format_brl_no_cents(item.estimated_amount_cents)}"


def _limit_param(text: str) -> str:
    """Truncates with a trailing ellipsis if the param overflows Meta's ceiling (backstop)."""
    if len(text) <= _MAX_PARAM_LENGTH:
        return text
    return f"{text[: _MAX_PARAM_LENGTH - 1].rstrip()}…"


def _format_bucket(items: list[AttentionItem]) -> str:
    """Joins a bucket's items with `", "`, or the empty placeholder when there are none."""
    if not items:
        return _EMPTY_BUCKET_PLACEHOLDER
    return _limit_param(", ".join(_format_item(item) for item in items))


@dataclass(frozen=True)
class DigestParams:
    """The three parameters of the `digest_vencimentos` (#157) Meta utility template, approved body order."""

    overdue: str
    """`{{1}}` — overdue Bills (red beacon, includes "due today" — see adjudication below)."""
    due_soon: str
    """`{{2}}` — Bills due soon (yellow beacon, 1..3 days)."""
    estimated_total: str
    """`{{3}}` — estimated total (`≈ R$ …`) or `"sem estimativa"` when no item has history."""


def derive_digest_content(
    clock: Clock, calendar: Calendar, bills: list[Bill], payments: list[Payment]
) -> DigestParams | None:
    """Derives the daily due-date digest content (#160, phase 2), or `None` when nothing needs attention.

    Composes the same dashboard "attention" derivation (`derive_attention_strip`) —
    no new state. `None` means no Bill needs attention → ADR-0012 says don't send
    the message; a `DigestParams` value means send with those params. Buckets
    follow the occurrence's beacon: `{{1}}` overdue (red, includes "due today"),
    `{{2}}` due soon (yellow).

    Adjudication of the glossary x code divergence (#160's acceptance criteria):
    the beacon comes from the current code (`PROXIMITY_THRESHOLD_DAYS = 3`; "due
    today" = red), which governs the whole portal's beacon — the digest only
    exposes it on WhatsApp, without silently correcting it. Changing the threshold
    (glossary: 4 days, "due today" amber) is its own issue with operator sign-off,
    since it touches the attention strip and the cards.
    """
    strip = derive_attention_strip(clock, calendar, bills, payments)
    if strip.state == "calma":
        return None

    overdue = [item for item in strip.items if item.beacon == "vermelho"]
    due_soon = [item for item in strip.items if item.beacon == "amarelo"]

    return DigestParams(
        overdue=_format_bucket(overdue),
        due_soon=_format_bucket(due_soon),
        estimated_total=(
            _NO_ESTIMATE_PLACEHOLDER
            if strip.total_estimated_cents is None
            else f"≈ {format_brl_no_cents(strip.total_estimated_cents)}"
        ),
    )
