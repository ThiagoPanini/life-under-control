"""Use-case: list the Household's Bills (Contas)."""

from luc_api.finance.application.bill_repo import BillRepo
from luc_api.finance.domain.bill import Bill

__all__ = ["list_bills"]


async def list_bills(repo: BillRepo, household_id: str) -> list[Bill]:
    """The edge calls this, never the store directly.

    Symmetric access — returns everything in the Household, no per-Pessoa filter (#1).
    """
    return await repo.list_bills(household_id)
