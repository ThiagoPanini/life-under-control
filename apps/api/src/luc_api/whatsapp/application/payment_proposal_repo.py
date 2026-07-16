"""PaymentProposalRepo port: persistence of the Payment Proposal, Household-scoped.

Edge/adapter state (the `whatsapp_proposals` table), not a domain primitive
(ADR-0005): the Proposal names the transitory so it never contaminates the
Payment. The handmade in-memory fake ships beside the Protocol (the
`FixedClock` precedent) so every suite drives the same double.
"""

from dataclasses import dataclass, fields, replace
from datetime import date
from typing import Protocol

from luc_api.whatsapp.domain.payment_proposal import (
    ACTIVE_PROPOSAL_STATES,
    FreeTextField,
    NewPaymentProposal,
    PaymentProposal,
    PaymentProposalData,
)

__all__ = [
    "AmountPatch",
    "DuplicateProposalError",
    "FakePaymentProposalRepo",
    "FieldPatch",
    "PaidOnPatch",
    "PayeePatch",
    "PaymentProposalRepo",
]


class DuplicateProposalError(Exception):
    """`create` collided with an **active** Proposal of the same hash.

    The database's partial unique index decided, closing the check-then-insert
    race between two concurrent deliveries of the same file. The edge treats
    it as a repeat — warns referencing the existing one, never duplicates.
    """

    def __init__(self, bytes_hash: str) -> None:
        """Keep the colliding hash for the edge to reference the existing Proposal."""
        super().__init__("An active Proposal already exists for this receipt")
        self.bytes_hash = bytes_hash


@dataclass(frozen=True)
class AmountPatch:
    """Free-text edit of the amount field."""

    amount_cents: int


@dataclass(frozen=True)
class PaidOnPatch:
    """Free-text edit of the paid-on date field."""

    paid_on: date


@dataclass(frozen=True)
class PayeePatch:
    """Free-text edit of the payee field."""

    payee: str


type FieldPatch = AmountPatch | PaidOnPatch | PayeePatch
"""A free-text edit of exactly one field (Alterar -> Valor/Data/Favorecido)."""


class PaymentProposalRepo(Protocol):
    """Persistence port for the Payment Proposal; adapters implement it, use-cases depend on it."""

    async def create(self, new_proposal: NewPaymentProposal) -> PaymentProposal:
        """Persist a new Proposal (born in `proposta` state).

        Raises `DuplicateProposalError` when an active Proposal of the same
        `(household_id, bytes_hash)` already exists — the partial unique index
        closes the race.
        """
        ...

    async def get_active_by_hash(
        self, household_id: str, bytes_hash: str
    ) -> PaymentProposal | None:
        """The Household's **active** Proposal (`proposta` or `confirmada`) of the same bytes hash.

        The repeat-receipt detection: the same hash on an open or already-
        Payment Proposal warns, never duplicates; `cancelada`/`expirada` don't count.
        """
        ...

    async def get_by_id(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """The Household's Proposal by id (any state) — the buttons act on it."""
        ...

    async def confirm(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """CAS `proposta -> confirmada` — the Confirm's **commit**.

        `None` when it was **no longer** `proposta` (lost concurrent race):
        only one Confirm persists the Payment; the race's loser undoes what it
        created (a repeat tap is already blocked earlier, by the state check).
        """
        ...

    async def cancel(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """CAS `proposta -> cancelada`. `None` when no longer `proposta`."""
        ...

    async def mark_expired(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """CAS `proposta -> expirada` (lazy cleanup or sweep). `None` when no longer `proposta`."""
        ...

    async def update_bill(
        self, household_id: str, proposal_id: str, bill_id: str, reference_period: str | None
    ) -> PaymentProposal | None:
        """Rewrites Bill and reference period of a still-open Proposal (Alterar -> Conta).

        Does **not** touch a pending free-text edit (`awaiting_*`): editing by
        list is orthogonal to a pending free-text edit — only `update_field`/
        `clear_awaiting`/`set_awaiting` touch it. `None` when not `proposta`.
        """
        ...

    async def update_reference_period(
        self, household_id: str, proposal_id: str, reference_period: str
    ) -> PaymentProposal | None:
        """Rewrites only the reference period (Alterar -> Mês). Like `update_bill`, leaves a pending edit untouched."""
        ...

    async def update_field(
        self, household_id: str, proposal_id: str, patch: FieldPatch
    ) -> PaymentProposal | None:
        """Writes the value of a free-text field (Alterar -> Valor/Data/Favorecido) and **clears** the pending edit."""
        ...

    async def set_awaiting(
        self, household_id: str, proposal_id: str, field: FreeTextField, person: str
    ) -> PaymentProposal | None:
        """Marks the bot waiting on a free-text field from this Pessoa (Alterar -> Valor/Data/Favorecido).

        CAS `proposta`, setting `awaiting_field`/`awaiting_person` on **this**
        Proposal first and, only if the CAS took, **releases any other
        pending edit of the same Pessoa** (one slot per Pessoa). Order
        matters: a target no longer `proposta` must not clear another
        Proposal's pendency. `None` when no longer open.
        """
        ...

    async def get_awaiting_by_person(
        self, household_id: str, person: str
    ) -> PaymentProposal | None:
        """The open Proposal on which this Pessoa has a pending free-text edit. `None` if none pending."""
        ...

    async def clear_awaiting(self, household_id: str, person: str) -> None:
        """Releases every pending edit of this Pessoa in the Household."""
        ...

    async def list_open(self) -> list[PaymentProposal]:
        """Every still-open (`proposta`) Proposal — the opportunistic sweep filters expired ones by the clock."""
        ...


_FAKE_CREATED_ON = date(2026, 1, 1)


class FakePaymentProposalRepo:
    """In-memory PaymentProposalRepo — the test double of the port. No household filter on iteration order."""

    def __init__(self, seed: list[PaymentProposal] | None = None) -> None:
        """Seed the store with pre-existing Proposals (any state, any Household)."""
        self._store: dict[str, PaymentProposal] = {p.id: p for p in (seed or [])}

    def get(self, proposal_id: str) -> PaymentProposal | None:
        """Fake-only inspector: the Proposal currently in the store by id, regardless of Household."""
        return self._store.get(proposal_id)

    async def create(self, new_proposal: NewPaymentProposal) -> PaymentProposal:
        """Mirrors the database's partial unique index: at most one active Proposal per `(household, hash)`."""
        if await self.get_active_by_hash(new_proposal.household_id, new_proposal.bytes_hash):
            raise DuplicateProposalError(new_proposal.bytes_hash)
        data = {f.name: getattr(new_proposal, f.name) for f in fields(PaymentProposalData)}
        proposal = PaymentProposal(
            **data,
            id=new_proposal.id,
            household_id=new_proposal.household_id,
            state="proposta",
            created_at=_FAKE_CREATED_ON,
            awaiting_field=None,
            awaiting_person=None,
        )
        self._store[proposal.id] = proposal
        return proposal

    async def get_active_by_hash(
        self, household_id: str, bytes_hash: str
    ) -> PaymentProposal | None:
        """The Household's active Proposal of the same bytes hash; `None` if none is active."""
        for p in self._store.values():
            if (
                p.household_id == household_id
                and p.bytes_hash == bytes_hash
                and p.state in ACTIVE_PROPOSAL_STATES
            ):
                return p
        return None

    async def get_by_id(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """The Household's Proposal by id (any state); `None` when missing or another Household's."""
        p = self._store.get(proposal_id)
        return p if p is not None and p.household_id == household_id else None

    def _cas_open(
        self, household_id: str, proposal_id: str, **changes: object
    ) -> PaymentProposal | None:
        current = self._store.get(proposal_id)
        if current is None or current.household_id != household_id or current.state != "proposta":
            return None
        updated = replace(current, **changes)
        self._store[proposal_id] = updated
        return updated

    async def confirm(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """CAS `proposta -> confirmada`; `None` when it was no longer `proposta`."""
        return self._cas_open(household_id, proposal_id, state="confirmada")

    async def cancel(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """CAS `proposta -> cancelada`; `None` when it was no longer `proposta`."""
        return self._cas_open(household_id, proposal_id, state="cancelada")

    async def mark_expired(self, household_id: str, proposal_id: str) -> PaymentProposal | None:
        """CAS `proposta -> expirada`; `None` when it was no longer `proposta`."""
        return self._cas_open(household_id, proposal_id, state="expirada")

    async def update_bill(
        self, household_id: str, proposal_id: str, bill_id: str, reference_period: str | None
    ) -> PaymentProposal | None:
        """Rewrites Bill and reference period of a still-open Proposal; leaves a pending edit untouched."""
        return self._cas_open(
            household_id, proposal_id, bill_id=bill_id, reference_period=reference_period
        )

    async def update_reference_period(
        self, household_id: str, proposal_id: str, reference_period: str
    ) -> PaymentProposal | None:
        """Rewrites only the reference period; leaves a pending edit untouched."""
        return self._cas_open(household_id, proposal_id, reference_period=reference_period)

    async def update_field(
        self, household_id: str, proposal_id: str, patch: FieldPatch
    ) -> PaymentProposal | None:
        """Writes a free-text field's value and clears the pending edit."""
        if isinstance(patch, AmountPatch):
            changes: dict[str, object] = {"amount_cents": patch.amount_cents}
        elif isinstance(patch, PaidOnPatch):
            changes = {"paid_on": patch.paid_on}
        else:
            changes = {"payee": patch.payee}
        return self._cas_open(
            household_id, proposal_id, awaiting_field=None, awaiting_person=None, **changes
        )

    async def set_awaiting(
        self, household_id: str, proposal_id: str, field: FreeTextField, person: str
    ) -> PaymentProposal | None:
        """CAS-target-first: marks this Proposal waiting, then releases the person's other pending edits."""
        # One slot per Pessoa, in the right order (#178): sets the target FIRST;
        # only then releases any other pending edit of hers. Clearing first would
        # risk zeroing another Proposal's pendency if the target's set didn't take
        # (it doesn't, off `proposta`) — the CAS is the commit point.
        marked = self._cas_open(
            household_id, proposal_id, awaiting_field=field, awaiting_person=person
        )
        if marked is None:
            return None
        for other in list(self._store.values()):
            if (
                other.id != proposal_id
                and other.household_id == household_id
                and other.awaiting_person == person
            ):
                self._store[other.id] = replace(other, awaiting_field=None, awaiting_person=None)
        return marked

    async def get_awaiting_by_person(
        self, household_id: str, person: str
    ) -> PaymentProposal | None:
        """The open Proposal on which this Pessoa has a pending free-text edit; `None` if none pending."""
        for p in self._store.values():
            if (
                p.household_id == household_id
                and p.state == "proposta"
                and p.awaiting_person == person
                and p.awaiting_field is not None
            ):
                return p
        return None

    async def clear_awaiting(self, household_id: str, person: str) -> None:
        """Releases every pending edit of this Pessoa in the Household."""
        for p in list(self._store.values()):
            if p.household_id == household_id and p.awaiting_person == person:
                self._store[p.id] = replace(p, awaiting_field=None, awaiting_person=None)

    async def list_open(self) -> list[PaymentProposal]:
        """Every still-open (`proposta`) Proposal, regardless of Household."""
        return [p for p in self._store.values() if p.state == "proposta"]
