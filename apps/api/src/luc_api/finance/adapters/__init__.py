"""Finance adapters layer: concrete implementations of the finance ports (F2, ADR-0014).

Map: `SqlBillRepo`, `SqlPaymentRepo`, `SqlAttachmentRepo` (Postgres/Core repos,
Seam-2 — one per port in `application`, each an anti-corruption layer with
explicit Row<->entity mapping); `R2AttachmentStore` (`AttachmentStore` over an
S3-compatible bucket — R2 in production, MinIO in local dev/CI). May depend
on `application` and `domain`; nothing upstream depends on this layer.
"""

from luc_api.finance.adapters.attachment_repo import SqlAttachmentRepo
from luc_api.finance.adapters.bill_repo import SqlBillRepo
from luc_api.finance.adapters.payment_repo import SqlPaymentRepo
from luc_api.finance.adapters.r2_attachment_store import (
    R2AttachmentStore,
    R2ClientConfig,
    get_r2_client,
    r2_attachment_store,
    r2_client_config,
)

__all__ = [
    "R2AttachmentStore",
    "R2ClientConfig",
    "SqlAttachmentRepo",
    "SqlBillRepo",
    "SqlPaymentRepo",
    "get_r2_client",
    "r2_attachment_store",
    "r2_client_config",
]
