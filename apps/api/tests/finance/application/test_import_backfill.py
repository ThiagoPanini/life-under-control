"""Deterministic historical import against fakes of the ports (Seam 2).

Oracle: apps/web/src/core/use-cases/import-backfill.test.ts, suite ported 1:1.
"""

import re
from dataclasses import replace
from datetime import date

from luc_api.finance.application.attachment_repo import FakeAttachmentRepo
from luc_api.finance.application.attachment_store import FakeAttachmentStore
from luc_api.finance.application.import_backfill import ReceiptContent, import_backfill
from luc_api.finance.application.payment_repo import FakePaymentRepo
from luc_api.finance.domain.backfill import ManifestReceipt, ManifestRow

_ROW = ManifestRow(
    bill_id="bill-luz",
    reference_period="2024-03",
    paid_on=date(2024, 3, 15),
    amount_cents=20390,
    receipt_amount_cents=20390,
    paid_by="p-thi",
    receipt=None,
    flags=["ok"],
    needs_review=False,
)


def row(**over: object) -> ManifestRow:
    """A manifest row, overridable per scenario."""
    return replace(_ROW, **over)  # type: ignore[arg-type]


async def no_bytes(_path: str) -> ReceiptContent | None:
    """Receipt loader that never finds bytes — for the no-upload scenarios."""
    return None


async def with_bytes(_path: str) -> ReceiptContent | None:
    """Receipt loader that always finds 4 bytes of image/jpeg."""
    return ReceiptContent(content=bytes([1, 2, 3, 4]), mime_type="image/jpeg")


class FailingPutStore(FakeAttachmentStore):
    """Store that blows up on `put` (R2 down / object too large)."""

    async def put(self, key: str, content: bytes, mime_type: str) -> None:
        raise RuntimeError("R2 down")


_RECEIPT = ManifestReceipt(file_path="luz/2024/conta-luz-202403.jpeg", mime_type="image/jpeg")


async def test_imports_payment_with_manifest_date():
    repo = FakePaymentRepo()

    result = await import_backfill(
        repo, FakeAttachmentStore(), FakeAttachmentRepo(), no_bytes, "h-1", [row()]
    )

    assert len(result.created) == 1
    payment = result.created[0]
    assert payment.household_id == "h-1"
    assert payment.bill_id == "bill-luz"
    assert payment.reference_period == "2024-03"
    assert payment.paid_on == date(2024, 3, 15)
    assert payment.amount_cents == 20390
    assert payment.paid_by == "p-thi"
    assert len(await repo.list_payments("h-1", "bill-luz")) == 1


async def test_null_date_persists_paid_without_date():
    repo = FakePaymentRepo()

    result = await import_backfill(
        repo,
        FakeAttachmentStore(),
        FakeAttachmentRepo(),
        no_bytes,
        "h-1",
        [row(paid_on=None, flags=["sem-recibo"])],
    )

    assert result.created[0].paid_on is None


async def test_row_under_review_is_not_inserted():
    repo = FakePaymentRepo()

    result = await import_backfill(
        repo,
        FakeAttachmentStore(),
        FakeAttachmentRepo(),
        no_bytes,
        "h-1",
        [row(needs_review=True, flags=["valor-divergente"])],
    )

    assert len(result.created) == 0
    assert len(result.needs_review) == 1
    assert len(await repo.list_payments("h-1", "bill-luz")) == 0


async def test_idempotent_reimporting_same_manifest_does_not_duplicate():
    repo = FakePaymentRepo()
    store = FakeAttachmentStore()
    attachments = FakeAttachmentRepo()
    manifest = [row(), row(reference_period="2024-04", paid_on=None)]

    first = await import_backfill(repo, store, attachments, no_bytes, "h-1", manifest)
    second = await import_backfill(repo, store, attachments, no_bytes, "h-1", manifest)

    assert len(first.created) == 2
    assert len(second.created) == 0
    assert second.skipped == 2
    assert len(await repo.list_payments("h-1", "bill-luz")) == 2


async def test_receipt_uploads_to_store_and_registers_attachment():
    repo = FakePaymentRepo()
    store = FakeAttachmentStore()
    attachments = FakeAttachmentRepo()

    result = await import_backfill(
        repo, store, attachments, with_bytes, "h-1", [row(receipt=_RECEIPT)]
    )

    assert result.attachments == 1
    assert len(store.keys()) == 1
    payment = result.created[0]
    registered = await attachments.list_attachments("h-1", payment.id)
    assert len(registered) == 1
    assert registered[0].size_bytes == 4
    assert registered[0].mime_type == "image/jpeg"


async def test_row_with_invalid_amount_goes_to_invalid_not_inserted():
    repo = FakePaymentRepo()

    result = await import_backfill(
        repo,
        FakeAttachmentStore(),
        FakeAttachmentRepo(),
        no_bytes,
        "h-1",
        [row(amount_cents=0, flags=["sem-recibo"])],
    )

    assert len(result.created) == 0
    assert len(result.invalid) == 1
    assert len(await repo.list_payments("h-1", "bill-luz")) == 0


async def test_no_receipt_bytes_payment_persists_without_attachment():
    repo = FakePaymentRepo()
    store = FakeAttachmentStore()
    attachments = FakeAttachmentRepo()

    result = await import_backfill(
        repo, store, attachments, no_bytes, "h-1", [row(receipt=_RECEIPT)]
    )

    assert len(result.created) == 1
    assert result.attachments == 0
    assert len(result.attachment_failures) == 1
    assert len(store.keys()) == 0


async def test_reattaches_receipt_on_preexisting_payment_without_attachment():
    repo = FakePaymentRepo()
    store = FakeAttachmentStore()
    attachments = FakeAttachmentRepo()
    manifest = [row(receipt=_RECEIPT)]

    # 1st round: file inaccessible — the Payment enters, but without attachment.
    first = await import_backfill(repo, store, attachments, no_bytes, "h-1", manifest)
    assert len(first.created) == 1
    assert first.attachments == 0

    # 2nd round: the file opens now — no duplicate Payment, but the attachment is repaired.
    second = await import_backfill(repo, store, attachments, with_bytes, "h-1", manifest)
    assert len(second.created) == 0
    assert second.skipped == 1
    assert second.attachments == 1

    payment = first.created[0]
    assert len(await attachments.list_attachments("h-1", payment.id)) == 1


async def test_does_not_reattach_when_preexisting_payment_already_has_attachment():
    repo = FakePaymentRepo()
    store = FakeAttachmentStore()
    attachments = FakeAttachmentRepo()
    manifest = [row(receipt=_RECEIPT)]

    await import_backfill(repo, store, attachments, with_bytes, "h-1", manifest)
    second = await import_backfill(repo, store, attachments, with_bytes, "h-1", manifest)

    assert second.skipped == 1
    assert second.attachments == 0  # already had an attachment: no re-upload
    payment = (await repo.list_payments("h-1", "bill-luz"))[0]
    assert len(await attachments.list_attachments("h-1", payment.id)) == 1


async def test_upload_failure_does_not_abort_the_batch():
    repo = FakePaymentRepo()
    attachments = FakeAttachmentRepo()

    result = await import_backfill(
        repo,
        FailingPutStore(),
        attachments,
        with_bytes,
        "h-1",
        [
            row(receipt=_RECEIPT),
            row(
                reference_period="2024-04",
                receipt=ManifestReceipt(
                    file_path="luz/2024/conta-luz-202404.jpeg", mime_type="image/jpeg"
                ),
            ),
        ],
    )

    # The batch does not abort: both Payments enter, only the attachments fail.
    assert len(result.created) == 2
    assert result.attachments == 0
    assert len(result.attachment_failures) == 2
    assert len(await repo.list_payments("h-1", "bill-luz")) == 2


async def test_attachment_gets_uuid_id_not_payment_derived():
    repo = FakePaymentRepo()
    store = FakeAttachmentStore()
    attachments = FakeAttachmentRepo()

    result = await import_backfill(
        repo, store, attachments, with_bytes, "h-1", [row(receipt=_RECEIPT)]
    )

    payment = result.created[0]
    registered = await attachments.list_attachments("h-1", payment.id)
    assert len(registered) == 1
    # `attachments.id` is a `uuid` column in Postgres: the Attachment id has to be
    # a UUID, not the old `<paymentId>-0` — which blew up with `22P02 invalid
    # input syntax for type uuid` in the real ingestion (the receipt went up to
    # R2, but no row was inserted).
    uuid_re = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    assert re.fullmatch(uuid_re, registered[0].id, re.IGNORECASE)
    assert registered[0].id != f"{payment.id}-0"


async def test_uses_injected_id_generator_for_attachment():
    repo = FakePaymentRepo()
    store = FakeAttachmentStore()
    attachments = FakeAttachmentRepo()
    fixed_id = "11111111-1111-4111-8111-111111111111"

    result = await import_backfill(
        repo,
        store,
        attachments,
        with_bytes,
        "h-1",
        [row(receipt=_RECEIPT)],
        lambda: fixed_id,
    )

    registered = await attachments.list_attachments("h-1", result.created[0].id)
    assert registered[0].id == fixed_id
