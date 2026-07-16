"""Household access (Acesso) — pure core, ADR-0004.

Authorization is the allowlist (config), kept apart from identity/authorship
(the `users` store, ADR-0002). Only pure rules live here: allowlist parsing,
email membership and the session lifetime policy. No Auth.js, no network.
"""

__all__ = ["SESSION_MAX_AGE_SECONDS", "email_in_allowlist", "parse_allowlist"]

SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
"""JWT session lifetime in seconds (30 days) — pt-BR: sessão.

Deliberately explicit: the Auth.js default is already ~30 days, but pinning it
makes the policy intentional and immune to a silent lib change. It is also the
ceiling of the allowlist TOCTOU window (ADR-0004): the allowlist is only
checked at sign-in (time-of-check), so removing a User does not revoke a JWT
issued before this deadline — the nuclear mitigation is rotating the auth
secret. Acceptable in the 2-User Household (symmetric access, removal is rare).
"""

_BOM = "\ufeff"


def _trim(value: str) -> str:
    """Trim whitespace plus the BOM (U+FEFF), like the oracle's JS `trim()`.

    Python's `str.strip()` does not treat U+FEFF as whitespace, but ECMAScript
    does — a BOM-prefixed allowlist env value (Windows-edited) must still parse.
    """
    trimmed = value.strip()
    while trimmed.startswith(_BOM) or trimmed.endswith(_BOM):
        trimmed = trimmed.strip(_BOM).strip()
    return trimmed


def parse_allowlist(raw: str | None) -> list[str]:
    """Parse the comma-separated allowlist into unique, lowercased emails."""
    emails = [_trim(email).lower() for email in (raw or "").split(",")]
    return list(dict.fromkeys(email for email in emails if email))


def email_in_allowlist(email: str | None, allowlist: list[str]) -> bool:
    """Is the email in the allowlist? Case-insensitive, ignoring surrounding spaces."""
    if not email:
        return False
    return _trim(email).lower() in allowlist
