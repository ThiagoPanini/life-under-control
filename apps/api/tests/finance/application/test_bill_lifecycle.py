"""Bill (Conta) lifecycle — edit, close, reactivate, delete — against a fake of the port (Seam 1).

Oracle: apps/web/src/core/use-cases/bill-lifecycle.test.ts, suite ported 1:1.
The fake is a real store (it keeps and mutates Bills) so the use-cases have
something to act on; the dependents count is injectable, proving the use-case
only relays what the port reports.

Adaptation (ADR-0015): ``test_data_invalida_lanca_e_nao_encerra`` was dropped —
the closing date reaches the use-case as `datetime.date`, so an invalid string
cannot get here (parsing lives at the edge) and `EncerramentoInvalidoError` has
no Python counterpart.
"""

from dataclasses import fields, replace
from datetime import date

import pytest

from luc_api.finance.application.attachment_store import FakeAttachmentStore, FakeStoredObject
from luc_api.finance.application.bill_repo import BillDependents, BillRepo, NewBill
from luc_api.finance.application.close_bill import close_bill
from luc_api.finance.application.create_bill import InvalidBillError
from luc_api.finance.application.delete_bill import delete_bill, deletion_summary
from luc_api.finance.application.edit_bill import BillNotFoundError, edit_bill
from luc_api.finance.application.reactivate_bill import reactivate_bill
from luc_api.finance.domain.bill import (
    Bill,
    BillData,
    BillRaw,
    FixedDayRule,
    Recurrence,
)


class FakeBillRepo(BillRepo):
    """Stateful in-memory BillRepo; the dependents count is injectable."""

    def __init__(self, dependents: BillDependents | None = None) -> None:
        self.bills: list[Bill] = []
        self._dependents = dependents or BillDependents(payments=0, attachments=0)

    def _find(self, household_id: str, bill_id: str) -> Bill | None:
        return next(
            (b for b in self.bills if b.household_id == household_id and b.id == bill_id),
            None,
        )

    def _swap(self, old: Bill, new: Bill) -> Bill:
        self.bills[self.bills.index(old)] = new
        return new

    async def create_bill(self, new_bill: NewBill) -> Bill:
        data = {f.name: getattr(new_bill, f.name) for f in fields(BillData)}
        bill = Bill(
            **data,
            id=f"bill-{len(self.bills) + 1}",
            household_id=new_bill.household_id,
            state="ativa",
            closed_on=None,
            logo_key=None,
        )
        self.bills.append(bill)
        return bill

    async def list_bills(self, household_id: str) -> list[Bill]:
        return [b for b in self.bills if b.household_id == household_id]

    async def get_bill(self, household_id: str, bill_id: str) -> Bill | None:
        return self._find(household_id, bill_id)

    async def edit_bill(self, household_id: str, bill_id: str, data: BillData) -> Bill | None:
        bill = self._find(household_id, bill_id)
        if bill is None:
            return None
        edited = {f.name: getattr(data, f.name) for f in fields(BillData)}
        return self._swap(bill, replace(bill, **edited))

    async def close_bill(self, household_id: str, bill_id: str, closed_on: date) -> Bill | None:
        bill = self._find(household_id, bill_id)
        # Only an active Bill closes: re-closing finds no target (mirrors the
        # adapter's WHERE state='ativa'), preserving the original date (#4).
        if bill is None or bill.state != "ativa":
            return None
        return self._swap(bill, replace(bill, state="encerrada", closed_on=closed_on))

    async def reactivate_bill(self, household_id: str, bill_id: str) -> Bill | None:
        bill = self._find(household_id, bill_id)
        # Only a closed Bill reactivates (mirrors WHERE state='encerrada'): a
        # repeated Undo finds no closed target and fails safe, never "un-undoing".
        if bill is None or bill.state != "encerrada":
            return None
        return self._swap(bill, replace(bill, state="ativa", closed_on=None))

    async def count_dependents(self, household_id: str, bill_id: str) -> BillDependents:
        if self._find(household_id, bill_id) is None:
            return BillDependents(payments=0, attachments=0)
        return self._dependents

    async def delete_bill(self, household_id: str, bill_id: str) -> BillDependents | None:
        bill = self._find(household_id, bill_id)
        if bill is None:
            return None
        self.bills.remove(bill)
        return self._dependents

    async def set_logo(self, household_id: str, bill_id: str, logo_key: str | None) -> Bill | None:
        bill = self._find(household_id, bill_id)
        if bill is None:
            return None
        return self._swap(bill, replace(bill, logo_key=logo_key))


_DATA = BillData(
    name="Internet",
    description=None,
    icon="wifi",
    recurrence=Recurrence(interval_months=1, anchor_month=None),
    due_rule=FixedDayRule(day=15),
    due_month_offset=0,
    first_reference_period="2020-01",
)


async def with_one_bill(
    dependents: BillDependents | None = None,
) -> tuple[FakeBillRepo, Bill]:
    """Seed an active Bill in Household h-1 and return repo + the Bill."""
    repo = FakeBillRepo(dependents)
    data = {f.name: getattr(_DATA, f.name) for f in fields(BillData)}
    bill = await repo.create_bill(NewBill(**data, household_id="h-1"))
    return repo, bill


_VALID_RAW = BillRaw(
    name="Internet Fibra",
    description="300 mega",
    icon="wifi",
    interval_months=1,
    anchor_month=None,
    due_rule_kind="dia-fixo",
    due_rule_day=20,
    due_rule_nth=None,
    due_month_offset=0,
)


def valid_raw(**over: object) -> BillRaw:
    """Valid `BillRaw` for the edit — the edge sends raw strings/numbers."""
    return replace(_VALID_RAW, **over)  # type: ignore[arg-type]


# --- editBill (Seam 1) ---


async def test_valid_edit_persists_the_new_rule():
    # given an active Bill
    repo, bill = await with_one_bill()

    # when edited with valid raw data
    edited = await edit_bill(repo, "h-1", bill.id, valid_raw())

    # then the new rule persists on the same Bill (id and owner preserved), never a new one
    assert edited.name == "Internet Fibra"
    assert edited.description == "300 mega"
    assert edited.due_rule == FixedDayRule(day=20)
    assert edited.id == bill.id
    assert edited.household_id == "h-1"
    assert len(repo.bills) == 1


async def test_invalid_edit_raises_and_does_not_persist():
    repo, bill = await with_one_bill()

    with pytest.raises(InvalidBillError):
        await edit_bill(repo, "h-1", bill.id, valid_raw(name=""))

    assert repo.bills[0].name == "Internet"


async def test_editing_missing_bill_raises_not_found():
    repo, _ = await with_one_bill()

    with pytest.raises(BillNotFoundError):
        await edit_bill(repo, "h-1", "missing", valid_raw())


async def test_editing_another_household_bill_raises_not_found():
    # Household scoping: the Bill exists, but not for h-2 (access belongs to the owner Lar, #1)
    repo, bill = await with_one_bill()

    with pytest.raises(BillNotFoundError):
        await edit_bill(repo, "h-2", bill.id, valid_raw())


async def test_edit_preserves_the_first_reference_period():
    repo, bill = await with_one_bill()

    edited = await edit_bill(repo, "h-1", bill.id, valid_raw(first_reference_period="2030-12"))

    assert edited.first_reference_period == "2020-01"


# --- encerrarBill → close_bill (Seam 1) ---


async def test_close_records_state_and_date():
    repo, bill = await with_one_bill()

    closed = await close_bill(repo, "h-1", bill.id, date(2026, 6, 29))

    assert closed.state == "encerrada"
    assert closed.closed_on == date(2026, 6, 29)


async def test_closing_missing_bill_raises_not_found():
    repo, _ = await with_one_bill()

    with pytest.raises(BillNotFoundError):
        await close_bill(repo, "h-1", "missing", date(2026, 6, 29))


async def test_reclosing_does_not_rewrite_the_original_date():
    # symmetric-access race / stale form: the 2nd close must not overwrite the
    # already-recorded date (a past fact — invariant #4)
    repo, bill = await with_one_bill()
    await close_bill(repo, "h-1", bill.id, date(2026, 6, 29))

    with pytest.raises(BillNotFoundError):
        await close_bill(repo, "h-1", bill.id, date(2026, 12, 31))

    assert repo.bills[0].closed_on == date(2026, 6, 29)


# --- reativarBill → reactivate_bill (Seam 1) ---


async def with_one_closed_bill() -> tuple[FakeBillRepo, Bill]:
    """Seed an already-closed Bill in Household h-1 (the state Undo starts from)."""
    repo, bill = await with_one_bill(BillDependents(payments=4, attachments=2))
    await close_bill(repo, "h-1", bill.id, date(2026, 6, 29))
    return repo, bill


async def test_reactivate_returns_to_active_and_clears_the_date():
    repo, bill = await with_one_closed_bill()

    reactivated = await reactivate_bill(repo, "h-1", bill.id)

    # atomic reactivation: back to active and the date goes away in one step;
    # same Bill, never a new one
    assert reactivated.state == "ativa"
    assert reactivated.closed_on is None
    assert reactivated.id == bill.id
    assert len(repo.bills) == 1


async def test_reactivate_preserves_the_dependents():
    repo, bill = await with_one_closed_bill()

    # Undo is non-destructive: reactivating touches no Payments/Attachments (#4)
    await reactivate_bill(repo, "h-1", bill.id)

    assert await repo.count_dependents("h-1", bill.id) == BillDependents(payments=4, attachments=2)


async def test_double_reactivation_raises_not_found():
    # the Undo toast fades after 4.2s, but a double click / stale form must not
    # reactivate a Bill already back to active — the 2nd Undo fails safe
    repo, bill = await with_one_closed_bill()
    await reactivate_bill(repo, "h-1", bill.id)

    with pytest.raises(BillNotFoundError):
        await reactivate_bill(repo, "h-1", bill.id)

    assert repo.bills[0].state == "ativa"


async def test_reactivating_active_bill_raises_not_found():
    # a never-closed Bill has nothing to undo (only a closed one reactivates)
    repo, bill = await with_one_bill()

    with pytest.raises(BillNotFoundError):
        await reactivate_bill(repo, "h-1", bill.id)


async def test_reactivating_missing_bill_raises_not_found():
    repo, _ = await with_one_closed_bill()

    with pytest.raises(BillNotFoundError):
        await reactivate_bill(repo, "h-1", "missing")


async def test_reactivating_another_household_bill_raises_not_found():
    # Household scoping: another Lar's Undo does not see the Bill (#1)
    repo, bill = await with_one_closed_bill()

    with pytest.raises(BillNotFoundError):
        await reactivate_bill(repo, "h-2", bill.id)


# --- deleteBill + resumoDeExclusao → delete_bill + deletion_summary (Seam 1) ---


async def test_summary_reports_the_dependents_count():
    repo, bill = await with_one_bill(BillDependents(payments=3, attachments=5))

    summary = await deletion_summary(repo, "h-1", bill.id)

    assert summary == BillDependents(payments=3, attachments=5)


async def test_delete_removes_the_bill_and_returns_the_count():
    repo, bill = await with_one_bill(BillDependents(payments=2, attachments=1))
    store = FakeAttachmentStore()

    removed = await delete_bill(repo, store, "h-1", bill.id)

    assert removed == BillDependents(payments=2, attachments=1)
    assert len(repo.bills) == 0


async def test_deleting_missing_bill_raises_and_removes_nothing():
    repo, _ = await with_one_bill()
    store = FakeAttachmentStore()

    with pytest.raises(BillNotFoundError):
        await delete_bill(repo, store, "h-1", "missing")

    assert len(repo.bills) == 1


async def test_deleting_bill_with_logo_removes_the_r2_object():
    repo, bill = await with_one_bill()
    key = f"finance/bills/h-1/{bill.id}/up-1"
    await repo.set_logo("h-1", bill.id, key)
    store = FakeAttachmentStore(
        [FakeStoredObject(key=key, size_bytes=20_000, mime_type="image/png")]
    )

    await delete_bill(repo, store, "h-1", bill.id)

    assert store.keys() == []


async def test_deleting_bill_without_logo_does_not_touch_the_bucket():
    repo, bill = await with_one_bill()
    store = FakeAttachmentStore(
        [
            FakeStoredObject(
                key="finance/bills/h-1/another-bill/up-1", size_bytes=1, mime_type="image/png"
            )
        ]
    )

    await delete_bill(repo, store, "h-1", bill.id)

    assert store.keys() == ["finance/bills/h-1/another-bill/up-1"]
