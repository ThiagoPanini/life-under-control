"""AttachmentRepo port: persistence of Attachment (Anexo) metadata, Household-scoped.

The handmade in-memory fake ships beside the Protocol so every suite drives the
same double.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from luc_api.finance.domain.attachment import Attachment, AttachmentData, receipt_key

__all__ = ["AttachmentRepo", "FakeAttachmentRepo", "NewAttachment", "receipt_key"]


@dataclass(frozen=True)
class NewAttachment(AttachmentData):
    """An Attachment about to be persisted: validated metadata plus identity and owners."""

    id: str
    household_id: str
    payment_id: str
    r2_key: str
    uploaded_by: str


class AttachmentRepo(Protocol):
    """Persistence port for Attachment metadata; adapters implement it."""

    async def create_attachment(self, new_attachment: NewAttachment) -> Attachment:
        """Persist the metadata of an uploaded receipt and return the Attachment."""
        ...

    async def list_attachments(self, household_id: str, payment_id: str) -> list[Attachment]:
        """List the Attachments of one Payment of the Household."""
        ...

    async def list_attachments_by_payments(
        self, household_id: str, payment_ids: list[str]
    ) -> list[Attachment]:
        """List the Attachments of several Payments at once (batch read)."""
        ...

    async def get_attachment(self, household_id: str, attachment_id: str) -> Attachment | None:
        """Read one Attachment of the Household; `None` when missing or another Lar's."""
        ...

    async def rename_attachment(
        self, household_id: str, attachment_id: str, original_name: str
    ) -> Attachment | None:
        """Change the display label; `None` when missing or another Lar's."""
        ...

    async def delete_attachment(self, household_id: str, attachment_id: str) -> Attachment | None:
        """Delete the metadata, returning what was removed; `None` when missing."""
        ...


class FakeAttachmentRepo:
    """In-memory AttachmentRepo, Household-scoped — the test double of the port."""

    def __init__(self, seed: list[Attachment] | None = None) -> None:
        """Seed the store with pre-existing Attachments."""
        self._store: dict[str, Attachment] = {a.id: a for a in (seed or [])}

    async def create_attachment(self, new_attachment: NewAttachment) -> Attachment:
        """Persist with a fixed `created_at` (the fake has no clock)."""
        attachment = Attachment(
            original_name=new_attachment.original_name,
            mime_type=new_attachment.mime_type,
            size_bytes=new_attachment.size_bytes,
            id=new_attachment.id,
            household_id=new_attachment.household_id,
            payment_id=new_attachment.payment_id,
            r2_key=new_attachment.r2_key,
            uploaded_by=new_attachment.uploaded_by,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        self._store[attachment.id] = attachment
        return attachment

    async def list_attachments(self, household_id: str, payment_id: str) -> list[Attachment]:
        """List the Attachments of one Payment of the Household."""
        return [
            a
            for a in self._store.values()
            if a.household_id == household_id and a.payment_id == payment_id
        ]

    async def list_attachments_by_payments(
        self, household_id: str, payment_ids: list[str]
    ) -> list[Attachment]:
        """List the Attachments of several Payments at once (batch read)."""
        targets = set(payment_ids)
        return [
            a
            for a in self._store.values()
            if a.household_id == household_id and a.payment_id in targets
        ]

    async def get_attachment(self, household_id: str, attachment_id: str) -> Attachment | None:
        """Read one Attachment of the Household; `None` when missing or another Lar's."""
        attachment = self._store.get(attachment_id)
        if attachment is None or attachment.household_id != household_id:
            return None
        return attachment

    async def rename_attachment(
        self, household_id: str, attachment_id: str, original_name: str
    ) -> Attachment | None:
        """Change the display label; `None` when missing or another Lar's."""
        attachment = self._store.get(attachment_id)
        if attachment is None or attachment.household_id != household_id:
            return None
        renamed = Attachment(
            original_name=original_name,
            mime_type=attachment.mime_type,
            size_bytes=attachment.size_bytes,
            id=attachment.id,
            household_id=attachment.household_id,
            payment_id=attachment.payment_id,
            r2_key=attachment.r2_key,
            uploaded_by=attachment.uploaded_by,
            created_at=attachment.created_at,
        )
        self._store[attachment_id] = renamed
        return renamed

    async def delete_attachment(self, household_id: str, attachment_id: str) -> Attachment | None:
        """Delete the metadata, returning what was removed; `None` when missing."""
        attachment = self._store.get(attachment_id)
        if attachment is None or attachment.household_id != household_id:
            return None
        del self._store[attachment_id]
        return attachment
