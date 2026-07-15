"""Phone (Telefone) — pure core, issue #152.

E.164 normalization of the User's WhatsApp number: no I/O, no framework —
only the shape rule of the BR number.
"""

import re

__all__ = ["normalize_phone_e164"]


def normalize_phone_e164(raw: str) -> str | None:
    """Normalize a raw BR phone number to E.164, or `None` when invalid."""
    digits = re.sub(r"\D", "", raw)

    if digits.startswith("55") and len(digits) in (12, 13):
        local = digits[2:]
    elif len(digits) in (10, 11):
        local = digits
    else:
        return None

    return f"+55{local}"
