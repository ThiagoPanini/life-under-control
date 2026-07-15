"""Use-cases: the deletion summary and the destructive delete of a Bill (Conta)."""

from luc_api.finance.application.attachment_store import AttachmentStore
from luc_api.finance.application.bill_repo import BillDependents, BillRepo
from luc_api.finance.application.edit_bill import BillNotFoundError

__all__ = ["delete_bill", "deletion_summary"]


async def deletion_summary(repo: BillRepo, household_id: str, bill_id: str) -> BillDependents:
    """Count the dependents (Payments/Attachments) a deletion would take along.

    The count the destructive confirmation shows before the warning. Reads
    through the port, never the store directly.
    """
    return await repo.count_dependents(household_id, bill_id)


async def delete_bill(
    repo: BillRepo,
    store: AttachmentStore,
    household_id: str,
    bill_id: str,
) -> BillDependents:
    """Delete a Household's Bill — destructive — and return the count of what it took.

    Removes the Bill together with its Payments and Attachments; `None` from the
    port (missing Bill or another Lar's) becomes an error. Both Pessoas delete
    (symmetric access, #1). The logo, if any, lives in R2 (not in
    `payments`/`attachments`) — the `on delete cascade` does not reach it, so
    this use-case removes the object explicitly after the Bill is gone.
    """
    bill = await repo.get_bill(household_id, bill_id)
    removed = await repo.delete_bill(household_id, bill_id)
    if removed is None:
        raise BillNotFoundError()
    if bill is not None and bill.logo_key is not None:
        await store.remove(bill.logo_key)
    return removed
