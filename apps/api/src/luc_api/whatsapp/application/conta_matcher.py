"""Bill-matching port by LLM (revises ADR-0013).

Distinct from a receipt extractor (which only reads what is legible): this
uses world knowledge to link the receipt's **legal payee** ("ENEL DISTRIBUICAO
SAO PAULO") to the Household Bill's **nickname** ("Luz") — string similarity
never bridges that gap. Receives the payee and the candidate active Bills;
returns their ids ordered most-to-least likely, or **empty** when none fits
(abstains — no guess, invariant #3).

No score, no threshold: the human confirms the Proposal either way (propose-
and-confirm, ADR-0012). The top becomes the proposed Bill; the full list feeds
the Bill list of the menu Alterar. The edge injects the real adapter (Claude on
Bedrock, text — cheaper than the extractor's vision); use-cases use a fake, no
network. The core **does not trust** the adapter: it only accepts ids from the
set it offered.
"""

from collections.abc import Awaitable, Callable

from luc_api.whatsapp.domain.payment_proposal import BillOption

__all__ = ["ContaMatcher", "fake_conta_matcher"]

type ContaMatcher = Callable[[str | None, list[BillOption]], Awaitable[list[str]]]


def fake_conta_matcher(ranking: list[str] | None = None) -> ContaMatcher:
    """Deterministic ContaMatcher double: returns a scripted ordering of bill ids.

    A `None` payee abstains (empty) — no payee, nothing to match, mirroring
    the real adapter. Ids are filtered to the offered candidates: the core
    never trusts an id outside that set (same guard as the real adapter).
    """
    scripted = ranking or []

    async def matcher(payee: str | None, candidates: list[BillOption]) -> list[str]:
        if payee is None:
            return []
        offered = {c.bill_id for c in candidates}
        ordered: list[str] = []
        for bill_id in scripted:
            if bill_id in offered and bill_id not in ordered:
                ordered.append(bill_id)
        return ordered

    return matcher
