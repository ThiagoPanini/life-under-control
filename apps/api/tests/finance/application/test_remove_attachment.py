"""removeAttachment: suite ported 1:1 from the TS oracle (Seam 1).

Oracle: apps/web/src/core/use-cases/remove-attachment.test.ts.
"""

from datetime import UTC, datetime

from luc_api.finance.application.attachment_repo import FakeAttachmentRepo
from luc_api.finance.application.attachment_store import FakeAttachmentStore, FakeStoredObject
from luc_api.finance.application.remove_attachment import remove_attachment
from luc_api.finance.domain.attachment import Attachment

_EXISTING = Attachment(
    id="att-1",
    household_id="h-1",
    payment_id="pay-1",
    r2_key="h-1/pay-1/att-1",
    uploaded_by="p-1",
    original_name="comprovante.pdf",
    mime_type="application/pdf",
    size_bytes=48_000,
    created_at=datetime(2026, 6, 10, 12, 0, 0, tzinfo=UTC),
)

_STORED = FakeStoredObject(key="h-1/pay-1/att-1", size_bytes=48_000, mime_type="application/pdf")


# --- removeAttachment (Seam 1) ---


async def test_remove_deletes_metadata_and_object():
    # given an attachment with its object in the bucket
    repo = FakeAttachmentRepo([_EXISTING])
    store = FakeAttachmentStore([_STORED])

    # when removed
    ok = await remove_attachment(store, repo, "h-1", "att-1")

    # then both the metadata and the object are gone
    assert ok is True
    assert len(await repo.list_attachments("h-1", "pay-1")) == 0
    assert len(store.keys()) == 0


async def test_removing_missing_returns_false_and_leaves_the_bucket_alone():
    repo = FakeAttachmentRepo()
    store = FakeAttachmentStore([_STORED])

    ok = await remove_attachment(store, repo, "h-1", "att-x")

    assert ok is False
    # the bucket stays intact — no object deleted for a key the metadata did not own
    assert store.keys() == ["h-1/pay-1/att-1"]


async def test_removing_another_household_does_not_delete():
    repo = FakeAttachmentRepo([_EXISTING])
    store = FakeAttachmentStore([_STORED])

    assert await remove_attachment(store, repo, "h-outro", "att-1") is False
    assert len(await repo.list_attachments("h-1", "pay-1")) == 1
    assert store.keys() == ["h-1/pay-1/att-1"]
