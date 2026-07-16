"""Whatsapp context (Área de ingestão): the WhatsApp receipt-to-Payment core.

Map: `domain` (Payment Proposal lifecycle, signature check — pure rules),
`application` (ports and orchestration use-cases: responding to a Proposal,
proposing one from a receipt). Adapters (Bedrock, Graph API, Postgres) arrive
in later F2 slices (ADR-0014); this context stays framework-free until then.
"""

__all__: list[str] = []
