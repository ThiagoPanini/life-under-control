"""Use-case: deterministic historical import (issue #24) from a checked manifest."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from uuid import uuid4

from luc_api.finance.application.attachment_repo import AttachmentRepo
from luc_api.finance.application.attachment_store import AttachmentStore
from luc_api.finance.application.payment_repo import NewPayment, PaymentRepo
from luc_api.finance.application.register_attachment import register_attachment
from luc_api.finance.domain.attachment import receipt_key
from luc_api.finance.domain.backfill import ManifestRow
from luc_api.finance.domain.payment import Payment, PaymentRaw, validate_payment_data
from luc_api.finance.domain.validation import Invalid

__all__ = ["ImportResult", "LoadReceipt", "ReceiptContent", "import_backfill"]


@dataclass(frozen=True)
class ReceiptContent:
    """The bytes of a receipt read from the source (operator's disk) + its type."""

    content: bytes
    mime_type: str


type LoadReceipt = Callable[[str], Awaitable[ReceiptContent | None]]
"""Loads receipt bytes from the manifest's `file_path` label.

The IO boundary of the ingestion (reads `/mnt/c`, etc.): the use-case is pure,
this callable is what the edge injects. `None` when the file is not accessible —
the Payment still enters, just without an attachment.
"""


@dataclass(frozen=True)
class ImportResult:
    """The checkable outcome of one import round."""

    created: list[Payment]
    """The Payments created in this round."""
    skipped: int
    """How many were skipped for already existing (idempotency)."""
    needs_review: list[ManifestRow]
    """The rows with divergence — **not** inserted, for manual review."""
    invalid: list[ManifestRow]
    """The rows that failed domain validation (invalid shape) — not inserted."""
    attachments: int
    """How many receipts went up to R2 and became Attachments."""
    attachment_failures: list[ManifestRow]
    """The rows whose receipt did **not** attach (inaccessible file or R2 error).

    Repairable in a next round.
    """


def _file_name(path: str) -> str:
    """Only the file name (the Attachment display label), without the path."""
    return path.rsplit("/", maxsplit=1)[-1]


def _new_uuid() -> str:
    return str(uuid4())


async def import_backfill(  # noqa: PLR0913 — arity mirrors the oracle's use-case signature
    payment_repo: PaymentRepo,
    attachment_store: AttachmentStore,
    attachment_repo: AttachmentRepo,
    load_receipt: LoadReceipt,
    household_id: str,
    manifest: list[ManifestRow],
    new_id: Callable[[], str] = _new_uuid,
) -> ImportResult:
    """Consume an already-checked manifest: create the Payments, upload the receipts to R2.

    Unlike the normal record (`record_payment`), it **preserves the null date** —
    a row without a readable receipt becomes "paid without date", not "paid
    today". Rows marked for review do not enter (divergence is never inserted
    silently). It is **idempotent**: a reference period that already has a
    Payment in the Bill does not duplicate — but if that Payment was left
    **without an attachment** (the file was inaccessible in a prior round) and
    there is a receipt now, it re-attaches. The Attachment reuses
    `register_attachment` — uploads the bytes (`store.put`) and registers the
    **real** metadata the bucket returns. Attaching **degrades gracefully**: an
    inaccessible file, one too large (#3) or a transient R2 error goes to
    `attachment_failures` and the batch moves on — the whole import never aborts.
    """
    created: list[Payment] = []
    skipped = 0
    needs_review: list[ManifestRow] = []
    invalid: list[ManifestRow] = []
    attachments = 0
    attachment_failures: list[ManifestRow] = []

    async def attach(payment_id: str, paid_by: str, file_path: str) -> bool:
        """Upload the receipt and register the Attachment, reusing `register_attachment`.

        The Attachment id is a fresh UUID (`new_id`) — `attachments.id` is a
        `uuid` column in Postgres, so an id derived from the Payment
        (`<payment_id>-0`) does not work: it blows up with `22P02`. Idempotency
        belongs to the caller — this is only invoked when the Payment has no
        attachment yet. Returns `False` (without raising) when the file is
        inaccessible or the upload/registration fails — the Payment stays
        without an attachment, repairable in a next round.
        """
        loaded = await load_receipt(file_path)
        if loaded is None:
            return False  # inaccessible file: the Payment stays, without attachment

        attachment_id = new_id()
        key = receipt_key(household_id, payment_id, attachment_id)
        try:
            await attachment_store.put(key, loaded.content, loaded.mime_type)
            await register_attachment(
                attachment_repo,
                attachment_store,
                household_id,
                payment_id,
                attachment_id,
                paid_by,
                _file_name(file_path),
            )
        except Exception:  # an R2/validation failure must not sink the batch
            return False
        return True

    for manifest_row in manifest:
        if manifest_row.needs_review:
            needs_review.append(manifest_row)
            continue

        # Validate the shape in the core before writing — the backfill does not
        # bypass the invariant (#6: cents > 0) just for trusting the manifest.
        # `validate_payment_data` preserves the null date ("paid without date"),
        # so it does not rewrite with today like `record_payment` does.
        validated = validate_payment_data(
            PaymentRaw(
                amount_cents=manifest_row.amount_cents,
                paid_on=manifest_row.paid_on,
                reference_period=manifest_row.reference_period,
                paid_by=manifest_row.paid_by,
            )
        )
        if isinstance(validated, Invalid):
            invalid.append(manifest_row)
            continue

        # Idempotency: does the reference period already have a Payment in this Bill?
        existing_payments = await payment_repo.list_payments(household_id, manifest_row.bill_id)
        existing = next(
            (p for p in existing_payments if p.reference_period == manifest_row.reference_period),
            None,
        )

        if existing is not None:
            skipped += 1
            # No duplicate Payment — but if it was left without an attachment and
            # there is a receipt now, re-attach (repairs a prior round in which
            # the file was inaccessible).
            if manifest_row.receipt is not None:
                current = await attachment_repo.list_attachments(household_id, existing.id)
                if len(current) == 0:
                    if await attach(
                        existing.id, manifest_row.paid_by, manifest_row.receipt.file_path
                    ):
                        attachments += 1
                    else:
                        attachment_failures.append(manifest_row)
            continue

        payment = await payment_repo.create_payment(
            NewPayment(
                amount_cents=validated.value.amount_cents,
                paid_on=validated.value.paid_on,
                reference_period=validated.value.reference_period,
                paid_by=validated.value.paid_by,
                household_id=household_id,
                bill_id=manifest_row.bill_id,
            )
        )
        created.append(payment)

        if manifest_row.receipt is None:
            continue
        if await attach(payment.id, manifest_row.paid_by, manifest_row.receipt.file_path):
            attachments += 1
        else:
            attachment_failures.append(manifest_row)

    return ImportResult(
        created=created,
        skipped=skipped,
        needs_review=needs_review,
        invalid=invalid,
        attachments=attachments,
        attachment_failures=attachment_failures,
    )
