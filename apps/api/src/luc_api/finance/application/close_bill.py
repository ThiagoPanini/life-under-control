"""Use-case: close (encerrar) an **active** Bill of the Household on a civil date."""

from datetime import date

from luc_api.finance.application.bill_repo import BillRepo
from luc_api.finance.application.edit_bill import BillNotFoundError
from luc_api.finance.domain.bill import Bill

__all__ = ["close_bill"]


async def close_bill(repo: BillRepo, household_id: str, bill_id: str, closed_on: date) -> Bill:
    """Move the Bill to `encerrada`: it leaves the active list and stops projecting.

    History is preserved (#9 / invariant #4). The date ("when I cancelled the
    service") comes from the edge already parsed (`datetime.date`, ADR-0015) —
    the use-case reads no clock, so it is testable without a real Clock. The
    port only closes an active Bill (atomic transition): closing again finds no
    active Bill and raises `BillNotFoundError`, never rewriting the original
    date. Both Pessoas close (symmetric access, #1).
    """
    closed = await repo.close_bill(household_id, bill_id, closed_on)
    if closed is None:
        raise BillNotFoundError()
    return closed
