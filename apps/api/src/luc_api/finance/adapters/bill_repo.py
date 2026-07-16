"""SqlBillRepo: Postgres/Core adapter for BillRepo — Row<->Bill mapping (Seam-2, F2).

`close_bill`/`reactivate_bill` are a surgical CAS on `estado`
(`update().where(estado == de).returning()`, ADR-0014): the transition only
applies if the row is still in the expected state, and an empty `RETURNING`
means the repo lost the race (or the target doesn't exist) — never an
exception.
"""

from datetime import date
from typing import Any

from sqlalchemy import Row, delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.finance.application.bill_repo import BillDependents, NewBill
from luc_api.finance.domain.bill import (
    Bill,
    BillData,
    DueRule,
    FixedDayRule,
    LastBusinessDayRule,
    NthBusinessDayRule,
    Recurrence,
)
from luc_api.shared.adapters.db.metadata import attachments, bills, payments

__all__ = ["SqlBillRepo"]


class SqlBillRepo:
    """`BillRepo` over SQLAlchemy Core (async, psycopg3) — the anti-corruption layer."""

    def __init__(self, engine: AsyncEngine) -> None:
        """Wraps the shared async engine; every method is its own transaction."""
        self._engine = engine

    async def create_bill(self, new_bill: NewBill) -> Bill:
        """Persist a new Bill and return it with identity and active state."""
        stmt = (
            insert(bills)
            .values(household_id=new_bill.household_id, **_bill_data_values(new_bill))
            .returning(*bills.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one()
        return _row_to_bill(row)

    async def list_bills(self, household_id: str) -> list[Bill]:
        """List every Bill of the Household."""
        stmt = select(bills).where(bills.c.household_id == household_id)
        async with self._engine.connect() as conn:
            rows = (await conn.execute(stmt)).all()
        return [_row_to_bill(row) for row in rows]

    async def get_bill(self, household_id: str, bill_id: str) -> Bill | None:
        """Read one Bill of the Household; `None` when missing or another Lar's."""
        stmt = select(bills).where(bills.c.household_id == household_id, bills.c.id == bill_id)
        async with self._engine.connect() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_bill(row) if row is not None else None

    async def edit_bill(self, household_id: str, bill_id: str, data: BillData) -> Bill | None:
        """Replace the Bill's data; `None` when missing or another Lar's."""
        stmt = (
            update(bills)
            .where(bills.c.household_id == household_id, bills.c.id == bill_id)
            .values(**_bill_data_values(data))
            .returning(*bills.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_bill(row) if row is not None else None

    async def close_bill(self, household_id: str, bill_id: str, closed_on: date) -> Bill | None:
        """Close an **active** Bill on the civil date; `None` when no active target."""
        stmt = (
            update(bills)
            .where(
                bills.c.household_id == household_id,
                bills.c.id == bill_id,
                bills.c.estado == "ativa",
            )
            .values(estado="encerrada", encerrada_em=closed_on)
            .returning(*bills.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_bill(row) if row is not None else None

    async def reactivate_bill(self, household_id: str, bill_id: str) -> Bill | None:
        """Reactivate a **closed** Bill, clearing the date; `None` when no closed target."""
        stmt = (
            update(bills)
            .where(
                bills.c.household_id == household_id,
                bills.c.id == bill_id,
                bills.c.estado == "encerrada",
            )
            .values(estado="ativa", encerrada_em=None)
            .returning(*bills.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_bill(row) if row is not None else None

    async def count_dependents(self, household_id: str, bill_id: str) -> BillDependents:
        """Count the Payments/Attachments hanging off the Bill."""
        async with self._engine.connect() as conn:
            return await _count_dependents(conn, household_id, bill_id)

    async def delete_bill(self, household_id: str, bill_id: str) -> BillDependents | None:
        """Delete the Bill and its dependents, returning the count; `None` when missing."""
        async with self._engine.begin() as conn:
            existing = (
                await conn.execute(
                    select(bills.c.id).where(
                        bills.c.household_id == household_id, bills.c.id == bill_id
                    )
                )
            ).one_or_none()
            if existing is None:
                return None
            dependents = await _count_dependents(conn, household_id, bill_id)
            await conn.execute(
                delete(bills).where(bills.c.household_id == household_id, bills.c.id == bill_id)
            )
        return dependents

    async def set_logo(self, household_id: str, bill_id: str, logo_key: str | None) -> Bill | None:
        """Point the Bill at its R2 logo object (or clear it); `None` when missing."""
        stmt = (
            update(bills)
            .where(bills.c.household_id == household_id, bills.c.id == bill_id)
            .values(logo_key=logo_key)
            .returning(*bills.c)
        )
        async with self._engine.begin() as conn:
            row = (await conn.execute(stmt)).one_or_none()
        return _row_to_bill(row) if row is not None else None


async def _count_dependents(conn: Any, household_id: str, bill_id: str) -> BillDependents:
    """Counts Payments of the Bill, and Attachments of those Payments — one connection."""
    payments_count = (
        await conn.execute(
            select(func.count())
            .select_from(payments)
            .where(payments.c.household_id == household_id, payments.c.bill_id == bill_id)
        )
    ).scalar_one()
    attachments_count = (
        await conn.execute(
            select(func.count())
            .select_from(attachments)
            .join(payments, attachments.c.payment_id == payments.c.id)
            .where(payments.c.household_id == household_id, payments.c.bill_id == bill_id)
        )
    ).scalar_one()
    return BillDependents(payments=payments_count, attachments=attachments_count)


def _bill_data_values(data: BillData) -> dict[str, object]:
    """Translates `BillData` into column values — the write half of the mapping."""
    return {
        "nome": data.name,
        "descricao": data.description,
        "icon": data.icon,
        "interval_months": data.recurrence.interval_months,
        "anchor_month": data.recurrence.anchor_month,
        "due_rule_kind": data.due_rule.kind,
        "due_rule_day": data.due_rule.day if isinstance(data.due_rule, FixedDayRule) else None,
        "due_rule_nth": data.due_rule.nth
        if isinstance(data.due_rule, NthBusinessDayRule)
        else None,
        "due_month_offset": data.due_month_offset,
        "primeira_competencia": data.first_reference_period,
    }


def _due_rule_from_row(row: Row[Any]) -> DueRule:
    """Translates the denormalized `due_rule_*` columns back into the `DueRule` union."""
    match row.due_rule_kind:
        case "dia-fixo":
            if row.due_rule_day is None:
                raise ValueError("dia-fixo bill row missing due_rule_day")
            return FixedDayRule(day=row.due_rule_day)
        case "n-esimo-dia-util":
            if row.due_rule_nth is None:
                raise ValueError("n-esimo-dia-util bill row missing due_rule_nth")
            return NthBusinessDayRule(nth=row.due_rule_nth)
        case "ultimo-dia-util":
            return LastBusinessDayRule()
        case _:
            raise ValueError(f"unknown due_rule_kind: {row.due_rule_kind!r}")


def _row_to_bill(row: Row[Any]) -> Bill:
    """Translates a `bills` row into a `Bill` — the read half of the mapping."""
    return Bill(
        id=row.id,
        household_id=row.household_id,
        name=row.nome,
        description=row.descricao,
        icon=row.icon,
        recurrence=Recurrence(interval_months=row.interval_months, anchor_month=row.anchor_month),
        due_rule=_due_rule_from_row(row),
        due_month_offset=row.due_month_offset,
        first_reference_period=row.primeira_competencia,
        state=row.estado,
        closed_on=row.encerrada_em,
        logo_key=row.logo_key,
    )
