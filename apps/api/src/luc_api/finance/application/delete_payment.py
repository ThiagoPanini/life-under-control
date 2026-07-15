"""Use-case: delete a Payment (Lançamento) of the Household — undo a mistaken record."""

from luc_api.finance.application.edit_payment import PaymentNotFoundError
from luc_api.finance.application.payment_repo import PaymentRepo

__all__ = ["delete_payment"]


async def delete_payment(repo: PaymentRepo, household_id: str, payment_id: str) -> None:
    """Delete through the port; `False` (missing or another Household's) becomes an error.

    Both Pessoas delete (symmetric access, #1); "who paid" is authorship, not an
    edit lock.
    """
    removed = await repo.delete_payment(household_id, payment_id)
    if not removed:
        raise PaymentNotFoundError
