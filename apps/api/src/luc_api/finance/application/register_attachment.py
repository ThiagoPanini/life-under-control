"""Use-case: register a receipt's metadata after the browser uploaded it to R2 (step 2 of 2)."""

from luc_api.finance.application.attachment_repo import AttachmentRepo, NewAttachment
from luc_api.finance.application.attachment_store import AttachmentStore
from luc_api.finance.application.prepare_attachment_upload import InvalidAttachmentError
from luc_api.finance.domain.attachment import (
    Attachment,
    AttachmentRaw,
    receipt_key,
    validate_attachment_data,
)
from luc_api.finance.domain.validation import FieldError, Invalid

__all__ = ["register_attachment"]


def _missing_upload() -> InvalidAttachmentError:
    """The confirmed object does not exist in R2 (the upload never arrived) — nothing to register."""
    return InvalidAttachmentError(
        [FieldError(field="arquivo", message="Upload não encontrado. Tente anexar de novo.")]
    )


async def register_attachment(  # noqa: PLR0913 — arity mirrors the oracle's use-case signature
    repo: AttachmentRepo,
    store: AttachmentStore,
    household_id: str,
    payment_id: str,
    attachment_id: str,
    uploaded_by: str,
    original_name: str,
) -> Attachment:
    """Read the **real** size and type of the R2 object and persist those facts.

    Never trusts what the client declares — the 25 MB ceiling and the type are
    enforced on the bytes that actually landed (CONTEXT.md #3). Re-derives the
    key from the ids. `household_id`/`uploaded_by` come from the edge. The
    `original_name` is cosmetic (display label) and stays as the client sent it.
    """
    r2_key = receipt_key(household_id, payment_id, attachment_id)
    real = await store.metadata(r2_key)
    if real is None:
        raise _missing_upload()

    res = validate_attachment_data(
        AttachmentRaw(
            original_name=original_name,
            mime_type=real.mime_type,
            size_bytes=real.size_bytes,
        )
    )
    if isinstance(res, Invalid):
        raise InvalidAttachmentError(res.errors)

    return await repo.create_attachment(
        NewAttachment(
            original_name=res.value.original_name,
            mime_type=res.value.mime_type,
            size_bytes=res.value.size_bytes,
            id=attachment_id,
            household_id=household_id,
            payment_id=payment_id,
            r2_key=r2_key,
            uploaded_by=uploaded_by,
        )
    )
