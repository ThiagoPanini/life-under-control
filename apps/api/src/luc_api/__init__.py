"""Life Under Control (LUC) backend: domain, ports/adapters and server edges.

Map: `shared` (kernel — the common domain language), `health` (liveness edge),
`main` (composition root). Bounded contexts (identity, finance, whatsapp) grow
here as sibling packages (ADR-0014).
"""

__all__: list[str] = []
