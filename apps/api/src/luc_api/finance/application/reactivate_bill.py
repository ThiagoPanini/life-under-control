"""Use-case: reactivate (reativar) a **closed** Bill of the Household — the Undo of closing."""

from luc_api.finance.application.bill_repo import BillRepo
from luc_api.finance.application.edit_bill import BillNotFoundError
from luc_api.finance.domain.bill import Bill

__all__ = ["reactivate_bill"]


async def reactivate_bill(repo: BillRepo, household_id: str, bill_id: str) -> Bill:
    """Return the Bill to `ativa` and clear `closed_on` atomically (#99's quick-gesture Undo).

    The Bill reappears in the panorama and projects again from there on. No fact
    is touched: Payments, Attachments and the logo remain (invariant #4) — Undo
    is non-destructive. The port only reactivates a closed Bill (atomic
    transition): a repeated Undo finds no closed Bill and raises
    `BillNotFoundError`, the same path as Household scoping (#1). Both Pessoas
    undo (symmetric access).
    """
    reactivated = await repo.reactivate_bill(household_id, bill_id)
    if reactivated is None:
        raise BillNotFoundError()
    return reactivated
