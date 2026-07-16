"""Use-case: prepare a receipt upload via signed URL (ADR-0008), step 1 of 2."""

from dataclasses import dataclass

from luc_api.finance.application.attachment_store import AttachmentStore
from luc_api.finance.domain.attachment import AttachmentRaw, receipt_key, validate_attachment_data
from luc_api.finance.domain.validation import FieldError, Invalid
from luc_api.shared.domain import ValidationError

__all__ = ["InvalidAttachmentError", "PreparedUpload", "prepare_attachment_upload"]


class InvalidAttachmentError(ValidationError):
    """The attachment failed domain validation — carries the per-field errors."""

    def __init__(self, errors: list[FieldError]) -> None:
        """Keep the per-field errors for the edge to render."""
        super().__init__("Attachment (Anexo) failed domain validation")
        self.errors = errors


@dataclass(frozen=True)
class PreparedUpload:
    """What the edge needs for the direct upload: the signed URL and the id/key to confirm later."""

    attachment_id: str
    r2_key: str
    upload_url: str


async def prepare_attachment_upload(
    store: AttachmentStore,
    household_id: str,
    payment_id: str,
    attachment_id: str,
    raw: AttachmentRaw,
) -> PreparedUpload:
    """Validate the raw metadata, derive the key in the domain and sign the PUT.

    The `attachment_id` comes from the edge (generated before the upload, same
    as in the key). **Nothing is persisted here**: metadata only enters the
    database when the browser confirms the upload (`register_attachment`),
    avoiding an orphan row if the upload fails.
    """
    res = validate_attachment_data(raw)
    if isinstance(res, Invalid):
        raise InvalidAttachmentError(res.errors)
    r2_key = receipt_key(household_id, payment_id, attachment_id)
    upload_url = await store.upload_url(r2_key, res.value.mime_type)
    return PreparedUpload(attachment_id=attachment_id, r2_key=r2_key, upload_url=upload_url)
