"""Attachment (Anexo): a receipt file bound to a Payment — immutable after upload (invariant #4).

Logo-side helpers (ADR-0008 ceiling) stay out of the facts slice; this module
carries the receipt (comprovante) rule only.
"""

from dataclasses import dataclass
from datetime import datetime

from luc_api.finance.domain.validation import FieldError, Invalid, Valid

__all__ = [
    "MAX_RECEIPT_BYTES",
    "Attachment",
    "AttachmentData",
    "AttachmentRaw",
    "AttachmentValidation",
    "is_accepted_receipt_type",
    "receipt_key",
    "validate_attachment_data",
]

MAX_RECEIPT_BYTES = 25 * 1024 * 1024
"""Maximum size of a receipt (25 MB)."""


@dataclass(frozen=True)
class AttachmentData:
    """The metadata of an Attachment, already validated (the file's normalized shape)."""

    original_name: str
    mime_type: str
    size_bytes: int


@dataclass(frozen=True)
class Attachment(AttachmentData):
    """A persisted Attachment: metadata + identity, owner Household, Payment and R2 key.

    `uploaded_by` is authorship (#1); `created_at` is the upload instant —
    a persisted fact, immutable after upload (#4).
    """

    id: str
    household_id: str
    payment_id: str
    r2_key: str
    uploaded_by: str
    created_at: datetime


@dataclass(frozen=True, kw_only=True)
class AttachmentRaw:
    """Raw attachment input (edge-translated file pick; `None` bytes when not a number)."""

    original_name: str
    mime_type: str
    size_bytes: int | None


type AttachmentValidation = Valid[AttachmentData] | Invalid


def is_accepted_receipt_type(mime_type: str) -> bool:
    """Is it an accepted receipt type (image or PDF)? SVG stays out (active content)."""
    if mime_type == "application/pdf":
        return True
    if mime_type == "image/svg+xml":
        return False
    return mime_type.startswith("image/")


def _validate_file_size(
    size_bytes: int | None,
    max_bytes: int = MAX_RECEIPT_BYTES,
    limit_label: str = "25 MB",
) -> list[FieldError]:
    """Positive integer size within the ceiling — the rule every upload shares."""
    if size_bytes is None or size_bytes <= 0:
        return [FieldError(field="arquivo", message="Arquivo vazio ou inválido.")]
    if size_bytes > max_bytes:
        return [FieldError(field="arquivo", message=f"Arquivo maior que {limit_label}.")]
    return []


def validate_attachment_data(raw: AttachmentRaw) -> AttachmentValidation:
    """Validate and normalize the receipt metadata."""
    errors: list[FieldError] = []

    original_name = (raw.original_name or "").strip()
    if not original_name:
        errors.append(FieldError(field="arquivo", message="Selecione um arquivo."))

    mime_type = (raw.mime_type or "").strip()
    if not is_accepted_receipt_type(mime_type):
        errors.append(
            FieldError(field="arquivo", message="Tipo não suportado — envie uma imagem ou um PDF.")
        )

    errors.extend(_validate_file_size(raw.size_bytes))

    if errors or raw.size_bytes is None:
        return Invalid(errors=errors)

    return Valid(
        value=AttachmentData(
            original_name=original_name, mime_type=mime_type, size_bytes=raw.size_bytes
        )
    )


_RECEIPT_PREFIX = "finance/payments"


def receipt_key(household_id: str, payment_id: str, attachment_id: str) -> str:
    """Derive a receipt's R2 key: `finance/payments/{lar}/{lançamento}/{anexo}`."""
    return f"{_RECEIPT_PREFIX}/{household_id}/{payment_id}/{attachment_id}"
