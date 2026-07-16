"""HMAC-SHA256 signature verification for the Meta WhatsApp webhook (Seam 0)."""

import hashlib
import hmac

__all__ = ["signature_valid"]

_PREFIX = "sha256="


def signature_valid(raw_body: str, signature_header: str | None, app_secret: str) -> bool:
    """Verifies the `x-hub-signature-256` header against the raw request body.

    Never raises: any malformed input (missing header, wrong prefix, length
    mismatch) is simply rejected. Runs over the raw body string, before JSON
    parsing. Constant-time compare via `hmac.compare_digest`.
    """
    if signature_header is None or not signature_header.startswith(_PREFIX):
        return False

    received_hex = signature_header[len(_PREFIX) :]
    expected_hex = hmac.new(app_secret.encode(), raw_body.encode(), hashlib.sha256).hexdigest()

    if len(received_hex) != len(expected_hex):
        return False

    return hmac.compare_digest(received_hex, expected_hex)
