"""SqlPaymentRepo: Postgres/Core adapter for PaymentRepo — Row<->Payment mapping (Seam-2, F2)."""

from typing import Any

from sqlalchemy import Row, delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.finance.application.payment_repo import NewPayment
from luc_api.finance.domain.payment import Payment, PaymentData
from luc_api.shared.adapters.db.metadata import payments

__all__ = ["SqlPaymentRepo"]


class SqlPaymentRepo:
    """`PaymentRepo` over SQLAlchemy Core (async, psycopg3) — the anti-corruption layer."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Wraps the shared async engine; every method is its own transaction."""
        self._engine = engine

    async def create_payment(self, new_payment: NewPayment) -> Payment:
        """Persist a new Payment and return it with identity."""
        stmt = (
            insert(payments)
            .values(
                household_id=new_payment.household_id,
                bill_id=new_payment.bill_id,
                **_payment_data_values(new_payment),
            )
            .returning(*payments.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one()
        return _row_to_payment(row)

    async def list_payments(self, household_id: str, bill_id: str) -> list[Payment]:
        """List the Payments of one Bill of the Household."""
        stmt = select(payments).where(
            payments.c.household_id == household_id, payments.c.bill_id == bill_id
        )
        async with self._engine.connect() as conn:
            rows = (await conn.execute(stmt)).all()
        return [_row_to_payment(row) for row in rows]

    async def list_all_payments(self, household_id: str) -> list[Payment]:
        """List every Payment of the Household, across Bills."""
        stmt = select(payments).where(payments.c.household_id == household_id)
        async with self._engine.connect() as conn:
            rows = (await conn.execute(stmt)).all()
        return [_row_to_payment(row) for row in rows]

    async def edit_payment(
        self, household_id: str, payment_id: str, data: PaymentData
    ) -> Payment | None:
        """Replace the Payment's data; `None` when missing or another Lar's."""
        stmt = (
            update(payments)
            .where(payments.c.household_id == household_id, payments.c.id == payment_id)
            .values(**_payment_data_values(data))
            .returning(*payments.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_payment(row) if row is not None else None

    async def delete_payment(self, household_id: str, payment_id: str) -> bool:
        """Delete the Payment; `False` when missing or another Lar's."""
        stmt = delete(payments).where(
            payments.c.household_id == household_id, payments.c.id == payment_id
        )
        async with self._engine.begin() as conn:
            result = await conn.execute(stmt)
        return result.rowcount > 0


def _payment_data_values(data: PaymentData) -> dict[str, object]:
    """Translates `PaymentData` into column values — the write half of the mapping."""
    return {
        "valor": data.amount_cents,
        "data_pagamento": data.paid_on,
        "competencia": data.reference_period,
        "paid_by": data.paid_by,
    }


def _row_to_payment(row: Row[Any]) -> Payment:
    """Translates a `payments` row into a `Payment` — the read half of the mapping."""
    return Payment(
        id=row.id,
        household_id=row.household_id,
        bill_id=row.bill_id,
        amount_cents=row.valor,
        paid_on=row.data_pagamento,
        reference_period=row.competencia,
        paid_by=row.paid_by,
    )
