"""Use-case: edit the *rule* of a Household's Bill (Conta), preserving its vigência start."""

from dataclasses import replace

from luc_api.finance.application.bill_repo import BillRepo
from luc_api.finance.application.create_bill import InvalidBillError
from luc_api.finance.domain.bill import Bill, BillRaw, validate_bill_data
from luc_api.finance.domain.validation import Invalid
from luc_api.shared.domain import NotFoundError

__all__ = ["BillNotFoundError", "edit_bill"]


class BillNotFoundError(NotFoundError):
    """The target Bill does not exist in the Household (unknown id or another Lar's)."""

    def __init__(self) -> None:
        """Fix the message; the missing id is edge context, not error state."""
        super().__init__("Bill (Conta) not found")


async def edit_bill(repo: BillRepo, household_id: str, bill_id: str, raw: BillRaw) -> Bill:
    """Validate in the core (the same rule as registration) and persist through the port.

    Re-reads the Bill to preserve the **first reference period** (primeira
    Competência, ADR-0011): the vigência starts there and editing the *rule*
    never moves its start (invariant #4 — readjusting recalculates future
    derivations, never rewrites past facts: only the Bill changes here, not the
    Payments). The form does not expose it. Both Pessoas edit everything
    (symmetric access, #1).
    """
    current = await repo.get_bill(household_id, bill_id)
    if current is None:
        raise BillNotFoundError()
    res = validate_bill_data(replace(raw, first_reference_period=current.first_reference_period))
    if isinstance(res, Invalid):
        raise InvalidBillError(res.errors)
    edited = await repo.edit_bill(household_id, bill_id, res.value)
    if edited is None:
        raise BillNotFoundError()
    return edited
