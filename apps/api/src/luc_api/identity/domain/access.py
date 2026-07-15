"""Household access (Acesso) — pure core, ADR-0004.

Authorization is the allowlist (config), kept apart from identity/authorship
(the `users` store, ADR-0002). Only pure rules live here: allowlist parsing
and email membership. No Auth.js, no network.
"""

__all__ = ["email_in_allowlist", "parse_allowlist"]


def parse_allowlist(raw: str | None) -> list[str]:
    """Parse the comma-separated allowlist into unique, lowercased emails."""
    emails = [email.strip().lower() for email in (raw or "").split(",")]
    return list(dict.fromkeys(email for email in emails if email))


def email_in_allowlist(email: str | None, allowlist: list[str]) -> bool:
    """Is the email in the allowlist? Case-insensitive, ignoring surrounding spaces."""
    if not email:
        return False
    return email.strip().lower() in allowlist
