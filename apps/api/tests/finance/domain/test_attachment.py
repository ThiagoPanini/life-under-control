"""Attachment (Anexo) validation rule: suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/domain/attachment.test.ts. The `validarLogo` describe
(logo ceiling, ADR-0008) is logo-side and stays out of the facts slice (#188);
only the receipt (comprovante) rule is ported.
"""

from luc_api.finance.domain.attachment import (
    MAX_RECEIPT_BYTES,
    AttachmentRaw,
    validate_attachment_data,
)

# --- validarDadosAttachment — the receipt keeps the 25 MB ceiling ---


def test_6mb_receipt_still_accepted():
    assert MAX_RECEIPT_BYTES == 25 * 1024 * 1024

    res = validate_attachment_data(
        AttachmentRaw(
            original_name="recibo.png",
            mime_type="image/png",
            size_bytes=6 * 1024 * 1024,
        )
    )

    assert res.ok is True
