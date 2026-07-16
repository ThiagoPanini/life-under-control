"""Finance adapters: concrete implementations of the `application` ports.

Map: `r2_attachment_store` (`AttachmentStore` over an S3-compatible bucket —
R2 in production, MinIO in local dev/CI). May depend on `application` and
`domain`; nothing outside `finance` may import from here (ADR-0003).
"""

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
    "get_r2_client",
    "r2_attachment_store",
    "r2_client_config",
]
