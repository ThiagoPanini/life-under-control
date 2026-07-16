"""Identity context: the Household (Lar), its Users (Pessoas) and their links.

Map: `domain` (Household/User facts, allowlist rules, phone normalization),
`application` (ports and use-cases: authenticated-user resolution that degrades
instead of raising, Google/WhatsApp linking, the sign-in allowlist gate),
`adapters` (the Postgres/Core repos — Seam-2, F2/ADR-0014).
"""

__all__: list[str] = []
