"""prepareAttachmentUpload: suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/prepare-attachment-upload.test.ts.
"""

from dataclasses import replace
from urllib.parse import quote

import pytest

from luc_api.finance.application.attachment_store import FakeAttachmentStore
from luc_api.finance.application.prepare_attachment_upload import (
    InvalidAttachmentError,
    prepare_attachment_upload,
)
from luc_api.finance.domain.attachment import AttachmentRaw

_VALID_RAW = AttachmentRaw(
    original_name="comprovante.pdf",
    mime_type="application/pdf",
    size_bytes=48_000,
)


def valid_raw(**over: object) -> AttachmentRaw:
    return replace(_VALID_RAW, **over)  # type: ignore[arg-type]


# --- prepareAttachmentUpload (Seam 1) ---


async def test_prepare_derives_scoped_key_and_signs_the_upload():
    # given an empty store
    store = FakeAttachmentStore()

    # when the upload is prepared
    out = await prepare_attachment_upload(store, "h-1", "pay-1", "att-1", valid_raw())

    # then the key is derived in the core, scoped by Household (#1), and signed
    assert out.attachment_id == "att-1"
    # key = finance/payments/{lar}/{lançamento}/{anexo} — the Área prefixes the
    # bucket, the Household scope prefixes the rest (#1).
    assert out.r2_key == "finance/payments/h-1/pay-1/att-1"
    assert quote("finance/payments/h-1/pay-1/att-1", safe="") in out.upload_url


async def test_prepare_persists_nothing():
    store = FakeAttachmentStore()

    await prepare_attachment_upload(store, "h-1", "pay-1", "att-1", valid_raw())

    # Signing the upload does not materialize the object — the browser uploads the bytes.
    assert len(store.keys()) == 0


async def test_unsupported_type_raises_and_does_not_sign():
    store = FakeAttachmentStore()

    with pytest.raises(InvalidAttachmentError):
        await prepare_attachment_upload(
            store, "h-1", "pay-1", "att-1", valid_raw(mime_type="text/csv")
        )


async def test_oversized_file_raises():
    store = FakeAttachmentStore()

    with pytest.raises(InvalidAttachmentError):
        await prepare_attachment_upload(
            store, "h-1", "pay-1", "att-1", valid_raw(size_bytes=26 * 1024 * 1024)
        )


async def test_image_is_accepted():
    store = FakeAttachmentStore()

    out = await prepare_attachment_upload(
        store,
        "h-1",
        "pay-1",
        "att-9",
        valid_raw(original_name="foto.jpg", mime_type="image/jpeg"),
    )

    assert quote("image/jpeg", safe="") in out.upload_url
