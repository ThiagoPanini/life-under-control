"""Seam-2: SqlBillRepo against a real Postgres — mapping, CAS, dependents (F2).

Every Household/Bill is created fresh per test (random uuid via the database's
own `gen_random_uuid()` default) — reruns against the same long-lived
Postgres never collide (the fixed-uuid lesson from the Drizzle Seam-2 suite).
"""

from datetime import date

from sqlalchemy.ext.asyncio import AsyncEngine

from luc_api.finance.adapters.bill_repo import SqlBillRepo
from luc_api.finance.adapters.payment_repo import SqlPaymentRepo
from luc_api.finance.application.payment_repo import NewPayment
from luc_api.finance.domain.bill import FixedDayRule, NthBusinessDayRule
from tests.support.finance import new_bill as _new_bill
from tests.support.postgres import create_household, create_user, requires_postgres

__all__: list[str] = []

pytestmark = requires_postgres


async def test_create_bill_returns_domain_with_id_and_active_state(
    pg_engine: AsyncEngine,
) -> None:
    household_id = await create_household(pg_engine)
    repo = SqlBillRepo(pg_engine)

    bill = await repo.create_bill(_new_bill(household_id))

    assert bill.id
    assert bill.household_id == household_id
    assert bill.state == "ativa"
    assert bill.closed_on is None
    assert bill.logo_key is None
    assert bill.due_rule == FixedDayRule(day=15)


async def test_create_bill_round_trips_nth_business_day_rule(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    repo = SqlBillRepo(pg_engine)

    bill = await repo.create_bill(_new_bill(household_id, due_rule=NthBusinessDayRule(nth=5)))

    assert bill.due_rule == NthBusinessDayRule(nth=5)


async def test_list_bills_scopes_by_household(pg_engine: AsyncEngine) -> None:
    household_a = await create_household(pg_engine)
    household_b = await create_household(pg_engine)
    repo = SqlBillRepo(pg_engine)
    await repo.create_bill(_new_bill(household_a, name="Luz"))
    await repo.create_bill(_new_bill(household_a, name="Água"))
    await repo.create_bill(_new_bill(household_b, name="Gás"))

    bills = await repo.list_bills(household_a)

    assert sorted(b.name for b in bills) == ["Luz", "Água"]


async def test_get_bill_of_another_household_is_none(pg_engine: AsyncEngine) -> None:
    household_a = await create_household(pg_engine)
    household_b = await create_household(pg_engine)
    repo = SqlBillRepo(pg_engine)
    bill = await repo.create_bill(_new_bill(household_a))

    assert await repo.get_bill(household_b, bill.id) is None
    assert (await repo.get_bill(household_a, bill.id)) == bill


async def test_close_bill_is_cas_and_second_close_finds_no_target(
    pg_engine: AsyncEngine,
) -> None:
    household_id = await create_household(pg_engine)
    repo = SqlBillRepo(pg_engine)
    bill = await repo.create_bill(_new_bill(household_id))

    closed = await repo.close_bill(household_id, bill.id, date(2026, 7, 15))
    assert closed is not None
    assert closed.state == "encerrada"
    assert closed.closed_on == date(2026, 7, 15)

    lost_race = await repo.close_bill(household_id, bill.id, date(2026, 7, 16))
    assert lost_race is None
    still_closed = await repo.get_bill(household_id, bill.id)
    assert still_closed is not None
    assert still_closed.closed_on == date(2026, 7, 15)


async def test_reactivate_bill_clears_closed_on(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    repo = SqlBillRepo(pg_engine)
    bill = await repo.create_bill(_new_bill(household_id))
    await repo.close_bill(household_id, bill.id, date(2026, 7, 15))

    reactivated = await repo.reactivate_bill(household_id, bill.id)

    assert reactivated is not None
    assert reactivated.state == "ativa"
    assert reactivated.closed_on is None


async def test_reactivate_bill_still_active_finds_no_target(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    repo = SqlBillRepo(pg_engine)
    bill = await repo.create_bill(_new_bill(household_id))

    assert await repo.reactivate_bill(household_id, bill.id) is None


async def test_count_dependents_counts_payments_and_their_attachments(
    pg_engine: AsyncEngine,
) -> None:
    household_id = await create_household(pg_engine)
    user_id = await create_user(pg_engine, household_id)
    bill_repo = SqlBillRepo(pg_engine)
    payment_repo = SqlPaymentRepo(pg_engine)
    bill = await bill_repo.create_bill(_new_bill(household_id))
    await payment_repo.create_payment(
        NewPayment(
            amount_cents=1000,
            paid_on=date(2026, 7, 15),
            reference_period="2026-07",
            paid_by=user_id,
            household_id=household_id,
            bill_id=bill.id,
        )
    )

    dependents = await bill_repo.count_dependents(household_id, bill.id)

    assert dependents.payments == 1
    assert dependents.attachments == 0


async def test_delete_bill_cascades_and_second_delete_finds_no_target(
    pg_engine: AsyncEngine,
) -> None:
    household_id = await create_household(pg_engine)
    repo = SqlBillRepo(pg_engine)
    bill = await repo.create_bill(_new_bill(household_id))

    dependents = await repo.delete_bill(household_id, bill.id)

    assert dependents is not None
    assert dependents.payments == 0
    assert await repo.get_bill(household_id, bill.id) is None
    assert await repo.delete_bill(household_id, bill.id) is None


async def test_set_logo_and_clear(pg_engine: AsyncEngine) -> None:
    household_id = await create_household(pg_engine)
    repo = SqlBillRepo(pg_engine)
    bill = await repo.create_bill(_new_bill(household_id))

    with_logo = await repo.set_logo(household_id, bill.id, "finance/bills/logo.png")
    assert with_logo is not None
    assert with_logo.logo_key == "finance/bills/logo.png"

    cleared = await repo.set_logo(household_id, bill.id, None)
    assert cleared is not None
    assert cleared.logo_key is None
