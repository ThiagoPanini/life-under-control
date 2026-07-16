"""Seam-2: SqlPaymentRepo against a real Postgres — mapping and scoping (F2)."""

from datetime import date

from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.finance.adapters.bill_repo import SqlBillRepo
from luc_api.finance.adapters.payment_repo import SqlPaymentRepo
from luc_api.finance.application.payment_repo import NewPayment
from luc_api.finance.domain.payment import PaymentData
from tests.support.finance import new_bill, scaffold_bill
from tests.support.postgres import create_household, create_user, requires_postgres

__all__: list[str] = []

pytestmark = requires_postgres


def _new_payment(household_id: str, bill_id: str, paid_by: str, **over: object) -> NewPayment:
    values: dict[str, object] = {
        "amount_cents": 1500,
        "paid_on": date(2026, 7, 15),
        "reference_period": "2026-07",
        "paid_by": paid_by,
    } | over
    return NewPayment(household_id=household_id, bill_id=bill_id, **values)  # type: ignore[arg-type]


async def test_create_payment_returns_domain_with_id(pg_engine: AsyncEngine) -> None:
    household_id, user_id, bill_id = await scaffold_bill(pg_engine)
    repo = SqlPaymentRepo(pg_engine)

    payment = await repo.create_payment(_new_payment(household_id, bill_id, user_id))

    assert payment.id
    assert payment.household_id == household_id
    assert payment.bill_id == bill_id
    assert payment.amount_cents == 1500
    assert payment.paid_on == date(2026, 7, 15)
    assert payment.paid_by == user_id


async def test_create_payment_with_null_paid_on_round_trips(pg_engine: AsyncEngine) -> None:
    household_id, user_id, bill_id = await scaffold_bill(pg_engine)
    repo = SqlPaymentRepo(pg_engine)

    payment = await repo.create_payment(_new_payment(household_id, bill_id, user_id, paid_on=None))

    assert payment.paid_on is None


async def test_list_payments_scopes_by_bill(pg_engine: AsyncEngine) -> None:
    household_id, user_id, bill_id = await scaffold_bill(pg_engine)
    other_bill = await SqlBillRepo(pg_engine).create_bill(new_bill(household_id))
    repo = SqlPaymentRepo(pg_engine)
    await repo.create_payment(_new_payment(household_id, bill_id, user_id, amount_cents=100))
    await repo.create_payment(_new_payment(household_id, bill_id, user_id, amount_cents=200))
    await repo.create_payment(_new_payment(household_id, other_bill.id, user_id, amount_cents=300))

    payments = await repo.list_payments(household_id, bill_id)

    assert sorted(p.amount_cents for p in payments) == [100, 200]


async def test_list_all_payments_scopes_by_household(pg_engine: AsyncEngine) -> None:
    household_id, user_id, bill_id = await scaffold_bill(pg_engine)
    other_household_id = await create_household(pg_engine)
    other_user_id = await create_user(pg_engine, other_household_id)
    other_bill = await SqlBillRepo(pg_engine).create_bill(new_bill(other_household_id))
    repo = SqlPaymentRepo(pg_engine)
    await repo.create_payment(_new_payment(household_id, bill_id, user_id))
    await repo.create_payment(_new_payment(other_household_id, other_bill.id, other_user_id))

    payments = await repo.list_all_payments(household_id)

    assert [p.household_id for p in payments] == [household_id]


async def test_edit_payment_of_another_household_is_none(pg_engine: AsyncEngine) -> None:
    household_id, user_id, bill_id = await scaffold_bill(pg_engine)
    other_household_id = await create_household(pg_engine)
    repo = SqlPaymentRepo(pg_engine)
    payment = await repo.create_payment(_new_payment(household_id, bill_id, user_id))

    edited = await repo.edit_payment(
        other_household_id,
        payment.id,
        PaymentData(
            amount_cents=999, paid_on=date(2026, 7, 20), reference_period="2026-07", paid_by=user_id
        ),
    )

    assert edited is None


async def test_edit_payment_replaces_data(pg_engine: AsyncEngine) -> None:
    household_id, user_id, bill_id = await scaffold_bill(pg_engine)
    repo = SqlPaymentRepo(pg_engine)
    payment = await repo.create_payment(_new_payment(household_id, bill_id, user_id))

    edited = await repo.edit_payment(
        household_id,
        payment.id,
        PaymentData(
            amount_cents=999, paid_on=date(2026, 7, 20), reference_period="2026-08", paid_by=user_id
        ),
    )

    assert edited is not None
    assert edited.amount_cents == 999
    assert edited.reference_period == "2026-08"


async def test_delete_payment_of_another_household_is_false(pg_engine: AsyncEngine) -> None:
    household_id, user_id, bill_id = await scaffold_bill(pg_engine)
    other_household_id = await create_household(pg_engine)
    repo = SqlPaymentRepo(pg_engine)
    payment = await repo.create_payment(_new_payment(household_id, bill_id, user_id))

    assert await repo.delete_payment(other_household_id, payment.id) is False


async def test_delete_payment_then_second_delete_is_false(pg_engine: AsyncEngine) -> None:
    household_id, user_id, bill_id = await scaffold_bill(pg_engine)
    repo = SqlPaymentRepo(pg_engine)
    payment = await repo.create_payment(_new_payment(household_id, bill_id, user_id))

    assert await repo.delete_payment(household_id, payment.id) is True
    assert await repo.delete_payment(household_id, payment.id) is False
