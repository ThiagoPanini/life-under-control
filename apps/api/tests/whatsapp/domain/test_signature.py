"""signature_valid: suite ported 1:1 from the TS oracle (Seam 0).

Oracle: apps/web/src/core/domain/whatsapp-assinatura.test.ts.
"""

import hashlib
import hmac

from luc_api.whatsapp.domain.signature import signature_valid

_APP_SECRET = "segredo-do-app-meta"
_RAW_BODY = '{"object":"whatsapp_business_account","entry":[]}'


def _sign(body: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def test_valid_signature_is_accepted():
    header = _sign(_RAW_BODY, _APP_SECRET)

    assert signature_valid(_RAW_BODY, header, _APP_SECRET) is True


def test_signature_with_wrong_secret_is_rejected():
    header = _sign(_RAW_BODY, "secret-errado")

    assert signature_valid(_RAW_BODY, header, _APP_SECRET) is False


def test_body_changed_after_signing_is_rejected():
    header = _sign(_RAW_BODY, _APP_SECRET)

    assert signature_valid(f"{_RAW_BODY} ", header, _APP_SECRET) is False


def test_header_without_sha256_prefix_is_rejected():
    digest_without_prefix = hmac.new(
        _APP_SECRET.encode(), _RAW_BODY.encode(), hashlib.sha256
    ).hexdigest()

    assert signature_valid(_RAW_BODY, digest_without_prefix, _APP_SECRET) is False


def test_null_header_is_rejected():
    assert signature_valid(_RAW_BODY, None, _APP_SECRET) is False


def test_empty_header_is_rejected():
    assert signature_valid(_RAW_BODY, "", _APP_SECRET) is False


def test_digest_of_different_length_is_rejected_without_raising():
    assert signature_valid(_RAW_BODY, "sha256=abcd", _APP_SECRET) is False
