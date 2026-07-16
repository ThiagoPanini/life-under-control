"""registerAttachment (anexar comprovante, confirm side): suite ported 1:1 from the TS oracle.

Oracle: apps/web/src/core/use-cases/register-attachment.test.ts.
"""

from dataclasses import replace

import pytest

from luc_api.finance.application.attachment_repo import FakeAttachmentRepo
from luc_api.finance.application.attachment_store import FakeAttachmentStore, FakeStoredObject
from luc_api.finance.application.prepare_attachment_upload import InvalidAttachmentError
from luc_api.finance.application.register_attachment import register_attachment

# An object "already uploaded" to the fake R2, at the key the register will derive.
_UPLOADED = FakeStoredObject(
    key="finance/payments/h-1/pay-1/att-1",
    size_bytes=48_000,
    mime_type="application/pdf",
)


def uploaded(**over: object) -> FakeStoredObject:
    return replace(_UPLOADED, **over)  # type: ignore[arg-type]


# --- registerAttachment (Seam 1) ---


async def test_register_persists_metadata_observed_in_r2():
    # given an uploaded object
    repo = FakeAttachmentRepo()
    store = FakeAttachmentStore([uploaded()])

    # when registered
    att = await register_attachment(repo, store, "h-1", "pay-1", "att-1", "p-1", "comprovante.pdf")

    # then the persisted metadata is what the R2 observed, not what the client declared
    assert att.id == "att-1"
    assert att.household_id == "h-1"
    assert att.payment_id == "pay-1"
    assert att.uploaded_by == "p-1"
    assert att.original_name == "comprovante.pdf"
    assert att.size_bytes == 48_000
    assert att.mime_type == "application/pdf"
    assert len(await repo.list_attachments("h-1", "pay-1")) == 1


async def test_key_is_derived_in_the_core_not_given_by_the_edge():
    repo = FakeAttachmentRepo()
    store = FakeAttachmentStore([uploaded(key="finance/payments/h-9/pay-7/att-3")])

    att = await register_attachment(repo, store, "h-9", "pay-7", "att-3", "p-2", "comprovante.pdf")

    assert att.r2_key == "finance/payments/h-9/pay-7/att-3"


async def test_missing_upload_raises_and_does_not_persist():
    repo = FakeAttachmentRepo()
    store = FakeAttachmentStore([])  # nothing uploaded at that key

    with pytest.raises(InvalidAttachmentError):
        await register_attachment(repo, store, "h-1", "pay-1", "att-1", "p-1", "comprovante.pdf")

    assert len(await repo.list_attachments("h-1", "pay-1")) == 0


async def test_oversized_real_bytes_raise_even_with_innocent_name():
    repo = FakeAttachmentRepo()
    # The client uploaded a 26 MB file; the ceiling is enforced on the real bytes.
    store = FakeAttachmentStore([uploaded(size_bytes=26 * 1024 * 1024)])

    with pytest.raises(InvalidAttachmentError):
        await register_attachment(repo, store, "h-1", "pay-1", "att-1", "p-1", "comprovante.pdf")

    assert len(await repo.list_attachments("h-1", "pay-1")) == 0


async def test_unsupported_real_type_raises():
    repo = FakeAttachmentRepo()
    store = FakeAttachmentStore([uploaded(mime_type="text/csv")])

    with pytest.raises(InvalidAttachmentError):
        await register_attachment(repo, store, "h-1", "pay-1", "att-1", "p-1", "planilha.csv")
