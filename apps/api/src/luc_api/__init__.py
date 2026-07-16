"""Life Under Control (LUC) backend: domain, ports/adapters and server edges.

Map: `shared` (kernel — the common domain language), `identity` (the Household,
its Users and their links), `finance` (Bills, Payments and Attachments),
`http` (server edges), `health` (liveness edge), `settings` / `composition` /
`main` (configuration and composition root). Bounded contexts (whatsapp, …)
keep growing here as sibling packages (ADR-0014).
"""

__all__: list[str] = []
