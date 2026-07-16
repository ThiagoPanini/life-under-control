"""Finance application layer: write use-cases and the ports they depend on.

Map: ports + handmade fakes in `bill_repo`, `payment_repo`, `attachment_repo`
and `attachment_store` (these also re-export the `Bill`/`Payment` read-shaped
domain types — the public surface other contexts type against, e.g. whatsapp);
Bill use-cases in `create_bill`, `list_bills`, `edit_bill`, `close_bill`,
`reactivate_bill` and `delete_bill`; Payment use-cases in `record_payment`,
`edit_payment` and `delete_payment`; Attachment use-cases in
`prepare_attachment_upload`, `register_attachment` and `remove_attachment`;
the deterministic historical import in `import_backfill`.
May depend on `domain`; must never import adapters or any framework.
"""

from luc_api.finance.application.attachment_repo import (
    AttachmentRepo,
    FakeAttachmentRepo,
    NewAttachment,
    receipt_key,
)
from luc_api.finance.application.attachment_store import (
    AttachmentStore,
    FakeAttachmentStore,
    FakeStoredObject,
    StoredObjectMeta,
)
from luc_api.finance.application.bill_repo import (
    Bill,
    BillDependents,
    BillRepo,
    DueRule,
    FixedDayRule,
    LastBusinessDayRule,
    NewBill,
    NthBusinessDayRule,
    Recurrence,
)
from luc_api.finance.application.close_bill import close_bill
from luc_api.finance.application.create_bill import InvalidBillError, create_bill
from luc_api.finance.application.delete_bill import delete_bill, deletion_summary
from luc_api.finance.application.delete_payment import delete_payment
from luc_api.finance.application.edit_bill import BillNotFoundError, edit_bill
from luc_api.finance.application.edit_payment import PaymentNotFoundError, edit_payment
from luc_api.finance.application.import_backfill import (
    ImportResult,
    LoadReceipt,
    ReceiptContent,
    import_backfill,
)
from luc_api.finance.application.list_bills import list_bills
from luc_api.finance.application.payment_repo import (
    FakePaymentRepo,
    NewPayment,
    Payment,
    PaymentRaw,
    PaymentRepo,
)
from luc_api.finance.application.prepare_attachment_upload import (
    InvalidAttachmentError,
    PreparedUpload,
    prepare_attachment_upload,
)
from luc_api.finance.application.reactivate_bill import reactivate_bill
from luc_api.finance.application.record_payment import InvalidPaymentError, record_payment
from luc_api.finance.application.register_attachment import register_attachment
from luc_api.finance.application.remove_attachment import remove_attachment

__all__ = [
    "AttachmentRepo",
    "AttachmentStore",
    "Bill",
    "BillDependents",
    "BillNotFoundError",
    "BillRepo",
    "DueRule",
    "FakeAttachmentRepo",
    "FakeAttachmentStore",
    "FakePaymentRepo",
    "FakeStoredObject",
    "FixedDayRule",
    "ImportResult",
    "InvalidAttachmentError",
    "InvalidBillError",
    "InvalidPaymentError",
    "LastBusinessDayRule",
    "LoadReceipt",
    "NewAttachment",
    "NewBill",
    "NewPayment",
    "NthBusinessDayRule",
    "Payment",
    "PaymentNotFoundError",
    "PaymentRaw",
    "PaymentRepo",
    "PreparedUpload",
    "ReceiptContent",
    "Recurrence",
    "StoredObjectMeta",
    "close_bill",
    "create_bill",
    "delete_bill",
    "delete_payment",
    "deletion_summary",
    "edit_bill",
    "edit_payment",
    "import_backfill",
    "list_bills",
    "prepare_attachment_upload",
    "reactivate_bill",
    "receipt_key",
    "record_payment",
    "register_attachment",
    "remove_attachment",
]
