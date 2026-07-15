"""Life Under Control (LUC) backend: domain, ports/adapters and server edges.

Map: `shared` (kernel — the common domain language), `identity` (the Household,
its Users and their links), `health` (liveness edge), `main` (composition root).
Bounded contexts (finance, whatsapp) keep growing here as sibling packages
(ADR-0014).
"""

__all__: list[str] = []
