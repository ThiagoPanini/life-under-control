"""PaymentRepo port: persistence of Payments (Lançamentos), Household-scoped.

The handmade in-memory fake ships beside the Protocol (the `FixedClock`
precedent) so every suite drives the same double.
"""

from dataclasses import dataclass, fields
from typing import Protocol

from luc_api.finance.domain.payment import Payment, PaymentData, PaymentRaw

__all__ = ["FakePaymentRepo", "NewPayment", "Payment", "PaymentRaw", "PaymentRepo"]


@dataclass(frozen=True)
class NewPayment(PaymentData):
    """A Payment about to be persisted: the validated data plus its owners."""

    household_id: str
    bill_id: str


class PaymentRepo(Protocol):
    """Persistence port for Payments; adapters implement it, use-cases depend on it."""

    async def create_payment(self, new_payment: NewPayment) -> Payment:
        """Persist a new Payment and return it with identity."""
        ...

    async def list_payments(self, household_id: str, bill_id: str) -> list[Payment]:
        """List the Payments of one Bill of the Household."""
        ...

    async def list_all_payments(self, household_id: str) -> list[Payment]:
        """List every Payment of the Household, across Bills."""
        ...

    async def edit_payment(
        self, household_id: str, payment_id: str, data: PaymentData
    ) -> Payment | None:
        """Replace the Payment's data; `None` when missing or another Lar's."""
        ...

    async def delete_payment(self, household_id: str, payment_id: str) -> bool:
        """Delete the Payment; `False` when missing or another Lar's."""
        ...


class FakePaymentRepo:
    """In-memory PaymentRepo, Household-scoped — the test double of the port."""

    def __init__(self, seed: list[Payment] | None = None) -> None:
        """Seed the store with pre-existing Payments (ids keep counting after them)."""
        seed = seed or []
        self._store: dict[str, Payment] = {p.id: p for p in seed}
        self._count = len(seed)

    async def create_payment(self, new_payment: NewPayment) -> Payment:
        """Persist with a sequential `pay-<n>` id."""
        self._count += 1
        data = {f.name: getattr(new_payment, f.name) for f in fields(PaymentData)}
        payment = Payment(
            **data,
            id=f"pay-{self._count}",
            household_id=new_payment.household_id,
            bill_id=new_payment.bill_id,
        )
        self._store[payment.id] = payment
        return payment

    async def list_payments(self, household_id: str, bill_id: str) -> list[Payment]:
        """List the Payments of one Bill of the Household."""
        return [
            p
            for p in self._store.values()
            if p.household_id == household_id and p.bill_id == bill_id
        ]

    async def list_all_payments(self, household_id: str) -> list[Payment]:
        """List every Payment of the Household, across Bills."""
        return [p for p in self._store.values() if p.household_id == household_id]

    async def edit_payment(
        self, household_id: str, payment_id: str, data: PaymentData
    ) -> Payment | None:
        """Replace the Payment's data; `None` when missing or another Lar's."""
        current = self._store.get(payment_id)
        if current is None or current.household_id != household_id:
            return None
        changes = {f.name: getattr(data, f.name) for f in fields(PaymentData)}
        updated = Payment(
            **changes,
            id=current.id,
            household_id=current.household_id,
            bill_id=current.bill_id,
        )
        self._store[payment_id] = updated
        return updated

    async def delete_payment(self, household_id: str, payment_id: str) -> bool:
        """Delete the Payment; `False` when missing or another Lar's."""
        current = self._store.get(payment_id)
        if current is None or current.household_id != household_id:
            return False
        del self._store[payment_id]
        return True
