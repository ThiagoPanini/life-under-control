"""SqlAttachmentRepo: Postgres/Core adapter for AttachmentRepo — Row<->Attachment mapping (Seam-2, F2)."""

from typing import Any

from sqlalchemy import Row, delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.finance.application.attachment_repo import NewAttachment
from luc_api.finance.domain.attachment import Attachment
from luc_api.shared.adapters.db.metadata import attachments

__all__ = ["SqlAttachmentRepo"]


class SqlAttachmentRepo:
    """`AttachmentRepo` over SQLAlchemy Core (async, psycopg3) — the anti-corruption layer."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Wraps the shared async engine; every method is its own transaction."""
        self._engine = engine

    async def create_attachment(self, new_attachment: NewAttachment) -> Attachment:
        """Persist new Attachment metadata; `created_at` comes from the database clock."""
        stmt = (
            insert(attachments)
            .values(
                id=new_attachment.id,
                household_id=new_attachment.household_id,
                payment_id=new_attachment.payment_id,
                nome_original=new_attachment.original_name,
                tipo_mime=new_attachment.mime_type,
                tamanho_bytes=new_attachment.size_bytes,
                chave_r2=new_attachment.r2_key,
                uploaded_by=new_attachment.uploaded_by,
            )
            .returning(*attachments.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one()
        return _row_to_attachment(row)

    async def list_attachments(self, household_id: str, payment_id: str) -> list[Attachment]:
        """List the Attachments of one Payment of the Household."""
        stmt = select(attachments).where(
            attachments.c.household_id == household_id, attachments.c.payment_id == payment_id
        )
        async with self._engine.connect() as conn:
            rows = (await conn.execute(stmt)).all()
        return [_row_to_attachment(row) for row in rows]

    async def list_attachments_by_payments(
        self, household_id: str, payment_ids: list[str]
    ) -> list[Attachment]:
        """List the Attachments of several Payments of the Household in one round-trip."""
        if not payment_ids:
            return []
        stmt = select(attachments).where(
            attachments.c.household_id == household_id,
            attachments.c.payment_id.in_(payment_ids),
        )
        async with self._engine.connect() as conn:
            rows = (await conn.execute(stmt)).all()
        return [_row_to_attachment(row) for row in rows]

    async def get_attachment(self, household_id: str, attachment_id: str) -> Attachment | None:
        """Read one Attachment of the Household; `None` when missing or another Lar's."""
        stmt = select(attachments).where(
            attachments.c.household_id == household_id, attachments.c.id == attachment_id
        )
        async with self._engine.connect() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_attachment(row) if row is not None else None

    async def rename_attachment(
        self, household_id: str, attachment_id: str, original_name: str
    ) -> Attachment | None:
        """Rename the Attachment; `None` when missing or another Lar's."""
        stmt = (
            update(attachments)
            .where(attachments.c.household_id == household_id, attachments.c.id == attachment_id)
            .values(nome_original=original_name)
            .returning(*attachments.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_attachment(row) if row is not None else None

    async def delete_attachment(self, household_id: str, attachment_id: str) -> Attachment | None:
        """Delete the Attachment, returning it (its R2 key must still be cleaned up by the caller)."""
        stmt = (
            delete(attachments)
            .where(attachments.c.household_id == household_id, attachments.c.id == attachment_id)
            .returning(*attachments.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_attachment(row) if row is not None else None


def _row_to_attachment(row: Row[Any]) -> Attachment:
    """Translates an `attachments` row into an `Attachment` — the read half of the mapping."""
    return Attachment(
        id=row.id,
        household_id=row.household_id,
        payment_id=row.payment_id,
        original_name=row.nome_original,
        mime_type=row.tipo_mime,
        size_bytes=row.tamanho_bytes,
        r2_key=row.chave_r2,
        uploaded_by=row.uploaded_by,
        created_at=row.criado_em,
    )
