"""Finance domain: the facts of the Área Finanças, pure and framework-free.

Map: `bill` (Conta — the recurring rule), `payment` (Lançamento — the payment
fact), `attachment` (Anexo — the receipt proof), `backfill` (deterministic
cross-check of the historical import), `validation` (field-error outcome shared
by the registration rules). Grows module-per-concept (ADR-0015).
"""

from luc_api.finance.domain.attachment import (
    MAX_RECEIPT_BYTES,
    Attachment,
    AttachmentData,
    AttachmentRaw,
    AttachmentValidation,
    is_accepted_receipt_type,
    receipt_key,
    validate_attachment_data,
)
from luc_api.finance.domain.backfill import (
    BackfillBill,
    BillEntry,
    ExtractedReceipt,
    ManifestFlag,
    ManifestReceipt,
    ManifestRow,
    ReceiptName,
    SheetRow,
    add_months,
    backfill_bill_raw,
    build_manifest,
    first_reference_period_of,
    parse_receipt_name,
    receipt_reference_period,
)
from luc_api.finance.domain.bill import (
    BILL_ICONS,
    Bill,
    BillData,
    BillRaw,
    BillState,
    BillValidation,
    DueRule,
    FixedDayRule,
    LastBusinessDayRule,
    NthBusinessDayRule,
    Recurrence,
    validate_bill_data,
)
from luc_api.finance.domain.payment import (
    Payment,
    PaymentData,
    PaymentRaw,
    PaymentValidation,
    validate_payment_data,
)
from luc_api.finance.domain.validation import FieldError, Invalid, Valid

__all__ = [
    "BILL_ICONS",
    "MAX_RECEIPT_BYTES",
    "Attachment",
    "AttachmentData",
    "AttachmentRaw",
    "AttachmentValidation",
    "BackfillBill",
    "Bill",
    "BillData",
    "BillEntry",
    "BillRaw",
    "BillState",
    "BillValidation",
    "DueRule",
    "ExtractedReceipt",
    "FieldError",
    "FixedDayRule",
    "Invalid",
    "LastBusinessDayRule",
    "ManifestFlag",
    "ManifestReceipt",
    "ManifestRow",
    "NthBusinessDayRule",
    "Payment",
    "PaymentData",
    "PaymentRaw",
    "PaymentValidation",
    "ReceiptName",
    "Recurrence",
    "SheetRow",
    "Valid",
    "add_months",
    "backfill_bill_raw",
    "build_manifest",
    "first_reference_period_of",
    "is_accepted_receipt_type",
    "parse_receipt_name",
    "receipt_key",
    "receipt_reference_period",
    "validate_attachment_data",
    "validate_bill_data",
    "validate_payment_data",
]
