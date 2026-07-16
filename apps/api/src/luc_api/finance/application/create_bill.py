"""Use-case: register a Bill (Conta) in the Household."""

from dataclasses import fields

from luc_api.finance.application.bill_repo import BillRepo, NewBill
from luc_api.finance.domain.bill import Bill, BillData, BillRaw, validate_bill_data
from luc_api.finance.domain.validation import FieldError, Invalid
from luc_api.shared.domain import ValidationError

__all__ = ["InvalidBillError", "create_bill"]


class InvalidBillError(ValidationError):
    """The registration failed domain validation — carries the per-field errors."""

    def __init__(self, errors: list[FieldError]) -> None:
        """Keep the per-field errors for the edge to render."""
        super().__init__("Bill (Conta) failed domain validation")
        self.errors = errors


async def create_bill(repo: BillRepo, household_id: str, raw: BillRaw) -> Bill:
    """Validate the rule (shape + offset + anchor) in the core and persist through the port.

    Never the store directly. The `household_id` comes from the edge (the
    logged-in Household), not the form. Any Pessoa registers (#1).
    """
    res = validate_bill_data(raw)
    if isinstance(res, Invalid):
        raise InvalidBillError(res.errors)
    data = {f.name: getattr(res.value, f.name) for f in fields(BillData)}
    return await repo.create_bill(NewBill(**data, household_id=household_id))
