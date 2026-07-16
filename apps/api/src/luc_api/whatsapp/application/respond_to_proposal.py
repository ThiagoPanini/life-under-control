"""Respond to a Payment Proposal (#159/#178): the couple's replies in chat.

The buttons Confirmar / Alterar / Cancelar, the menu Alterar (edits every
collected field) and editing by list (Bill/reference period) or free text
(amount/paid-on/payee). Runs **post-response** to the webhook (ADR-0012), over
the already-persisted Proposal (out of #190's scope — a later slice owns the
receipt-intake pipeline that creates it).

**Confirm** is the only path that becomes a fact: it creates the Payment
(reusing `record_payment`) and promotes the receipt from staging to the
canonical key (an Attachment identical to the portal's). Cancel/expiry leave
no domain effect.

The menu Alterar (#178) introduces **per-sender conversation state**: asking
for a free-text field stores `awaiting_{field,person}` on the Proposal, and
the next text message from that Pessoa is read only as that field
(`edit_text_field`, called from the edge).

Expiry is **derived from the clock** (`created_at + TTL`, invariant #3): the
persisted `expirada` state is only the timestamp of the cleanup act. Two
paths, no new job: lazy (a late interaction here) and the opportunistic sweep
(`sweep_expired_proposals`).
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Protocol

from luc_api.finance.application import (
    AttachmentRepo,
    AttachmentStore,
    Bill,
    InvalidAttachmentError,
    Payment,
    PaymentRaw,
    PaymentRepo,
    receipt_key,
    record_payment,
    register_attachment,
)
from luc_api.shared.application import Clock
from luc_api.shared.domain import format_br_date, format_brl, parse_br_date, parse_brl
from luc_api.whatsapp.application.bill_occurrences import (
    infer_reference_period_on_bill_change,
    month_of,
    occurrences_recent,
)
from luc_api.whatsapp.application.calendar import Calendar
from luc_api.whatsapp.application.conta_matcher import ContaMatcher
from luc_api.whatsapp.application.payment_proposal_repo import (
    AmountPatch,
    FieldPatch,
    PaidOnPatch,
    PayeePatch,
    PaymentProposalRepo,
)
from luc_api.whatsapp.application.whatsapp_messenger import WhatsappMessenger
from luc_api.whatsapp.domain import (
    CHANGE_MENU_TITLE,
    MONTH_LIST_TITLE,
    BillOption,
    EditableField,
    FreeTextField,
    PaymentProposal,
    ProposalAction,
    ProposalSummary,
    bill_rows,
    describe_month_in_full,
    expired_proposal_message,
    field_edit_prompt,
    field_not_understood_message,
    field_rows,
    format_payment_created,
    format_proposal_message,
    is_expired,
    proposal_buttons,
    reference_period_rows,
)

__all__ = [
    "BILL_LIST_TITLE",
    "CHOOSE_BILL_BUTTON",
    "CHOOSE_FIELD_BUTTON",
    "CHOOSE_MONTH_BUTTON",
    "MESSAGE_ALREADY_RESOLVED",
    "MESSAGE_BILL_GONE",
    "MESSAGE_CANCELLED",
    "MESSAGE_INVALID_RECEIPT",
    "MESSAGE_MISSING_BILL",
    "MESSAGE_MISSING_DATA",
    "MESSAGE_MONTH_NEEDS_BILL",
    "MESSAGE_NO_BILLS",
    "MESSAGE_NO_MONTHS",
    "MESSAGE_PROPOSAL_GONE",
    "MESSAGE_TRY_CONFIRM_AGAIN",
    "BillLister",
    "InteractionInput",
    "ResponderDeps",
    "SweepDeps",
    "TextEditDeps",
    "TextInput",
    "edit_text_field",
    "respond_to_proposal",
    "sweep_expired_proposals",
]

MESSAGE_PROPOSAL_GONE = (
    "Não achei essa Proposta — talvez já tenha sido resolvida ou expirada. "
    "Manda o comprovante de novo. 🔁"
)
"""The Proposal is gone (button id of a Proposal that no longer exists) — points to resending."""
MESSAGE_ALREADY_RESOLVED = "Essa Proposta já foi resolvida. 👍"
"""A tap on a button of a Proposal already out of the open state (confirmed/cancelled/expired)."""
MESSAGE_MISSING_BILL = (
    "Antes de confirmar, toque *Alterar* → *Conta* pra eu saber em qual Conta lançar. 🙏"
)
"""Confirm without a matched Bill: forces Alterar -> Conta first (no Bill, nowhere to record against)."""
MESSAGE_MISSING_DATA = (
    "Faltou ler algum dado do comprovante. Toque *Alterar* pra completar, por favor. 🙏"
)
"""Confirm with illegible amount/paid-on/reference-period: never creates an invalid Payment (ADR-0013)."""
MESSAGE_TRY_CONFIRM_AGAIN = (
    "Não consegui registrar agora. Toque *Confirmar* de novo daqui a pouco. 🙏"
)
"""Transient failure creating the Payment (database/R2) — asks for retry; the Proposal stays open, retry is safe."""
MESSAGE_INVALID_RECEIPT = (
    "Esse comprovante não pôde ser registrado (arquivo grande demais ou inválido). "
    "Manda um mais leve, por favor. 📎"
)
"""PERMANENT error registering the receipt (file too large/invalid) — resending doesn't help."""
MESSAGE_CANCELLED = "Cancelado — não registrei nada. 👍"
MESSAGE_NO_BILLS = "Você ainda não tem Contas ativas pra escolher."
MESSAGE_BILL_GONE = "Não achei essa Conta. Toque *Alterar* → *Conta* de novo."
MESSAGE_MONTH_NEEDS_BILL = (
    "Escolhe a Conta primeiro (*Alterar* → *Conta*) — a Competência depende dela. 🙏"
)
BILL_LIST_TITLE = "Qual é a Conta certa?"
MESSAGE_NO_MONTHS = (
    "Não achei Competências pra escolher nessa Conta. Confere a Conta em *Alterar* → *Conta*. 🙏"
)
"""No month to offer (a Bill that only starts in the future) — never sends an empty list (Graph API rejects it)."""

CHOOSE_FIELD_BUTTON = "Escolher campo"
"""Label of the button that opens each interactive list (#178) — varies by context, never fixed."""
CHOOSE_BILL_BUTTON = "Escolher Conta"
CHOOSE_MONTH_BUTTON = "Escolher mês"

_MAX_LIST_ROWS = 10
"""Ceiling of an interactive list row count (Graph API)."""
_MONTHS_OFFERED_COUNT = 6
"""How many recent reference periods to offer on Alterar -> Mês (fits the list ceiling)."""
_MAX_PAYEE_LEN = 120
"""Ceiling of a hand-edited payee (matching label, never displayed) — avoids a giant text."""

_MONTHS_PT = (
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
)


class BillLister(Protocol):
    """The narrow slice of BillRepo this use-case needs (mirrors `Pick<BillRepo, "listarBills">`)."""

    async def list_bills(self, household_id: str) -> list[Bill]:
        """List every Bill of the Household."""
        ...


@dataclass
class ResponderDeps:
    """Dependencies of `respond_to_proposal` — all ports, fakes in tests."""

    proposal_repo: PaymentProposalRepo
    payment_repo: PaymentRepo
    attachment_repo: AttachmentRepo
    bill_repo: BillLister
    matcher: ContaMatcher
    store: AttachmentStore
    messenger: WhatsappMessenger
    clock: Clock
    calendar: Calendar
    new_id: Callable[[], str] | None = None
    """Generates the Attachment id — injectable for the test to be deterministic."""
    log: Callable[[str], None] | None = None
    """Injectable log (default `print`) — doesn't tie the use-case to the global console."""


@dataclass
class InteractionInput:
    """A couple's reply to a Proposal, with the Pessoa and Household already resolved by the edge."""

    household_id: str
    sender: str
    person_id: str
    """The Pessoa who tapped the button (id) — owner of the menu Alterar's pending edit (#178)."""
    action: ProposalAction


def _default_new_id() -> str:
    return str(uuid.uuid4())


def _log(log: Callable[[str], None] | None, message: str) -> None:
    (log or print)(message)


def _receipt_display_name(mime_type: str) -> str:
    """Display name of the receipt in the Attachment (cosmetic) — the type dictates the extension."""
    ext = (
        "pdf"
        if mime_type == "application/pdf"
        else (mime_type.rsplit("/", maxsplit=1)[-1] or "jpg")
    )
    return f"comprovante-whatsapp.{ext}"


def _order_by_ranking(bills: list[Bill], ranking: list[str]) -> list[Bill]:
    """Orders Bills by the matcher's ranking; those outside the ranking go last (original order)."""
    seen: set[str] = set()
    ordered: list[Bill] = []
    # Ranking first (dedup: a repeated id from the matcher doesn't become a
    # duplicate list row, which the Graph API rejects); those outside preserve order.
    for bill_id in ranking:
        bill = next((b for b in bills if b.id == bill_id), None)
        if bill is not None and bill.id not in seen:
            seen.add(bill.id)
            ordered.append(bill)
    for bill in bills:
        if bill.id not in seen:
            seen.add(bill.id)
            ordered.append(bill)
    return ordered


_ANNUAL_INTERVAL_MONTHS = 12


def _describe_reference_period(reference_period: str, interval_months: int) -> str:
    """Describes a reference period at the Recurrence's granularity: "Julho/2026", or just the year when annual."""
    year, month = reference_period.split("-")
    if interval_months == _ANNUAL_INTERVAL_MONTHS:
        return year
    return f"{_MONTHS_PT[int(month) - 1]}/{year}"


async def _remove_staging_safely(
    store: AttachmentStore, key: str, log: Callable[[str], None] | None
) -> None:
    """Removes the orphaned staging object without derailing the flow.

    Becomes garbage to collect on failure, never a throw.
    """
    try:
        await store.remove(key)
    except Exception as e:
        _log(log, f"whatsapp: failed to clean up staging {key}: {e}")


async def respond_to_proposal(deps: ResponderDeps, request: InteractionInput) -> None:
    """Routes a tap on a Proposal button/list row to the matching handler."""
    log = deps.log
    household_id, sender, person_id, action = (
        request.household_id,
        request.sender,
        request.person_id,
        request.action,
    )

    proposal = await deps.proposal_repo.get_by_id(household_id, action["proposal_id"])
    if proposal is None:
        await deps.messenger.send_text(sender, MESSAGE_PROPOSAL_GONE)
        return

    # Lazy expiry: an open, old Proposal (created_at+TTL < today) never becomes a
    # fact — stamps `expirada`, cleans the staging and points to resending.
    if proposal.state == "proposta" and is_expired(proposal.created_at, deps.clock.today()):
        await deps.proposal_repo.mark_expired(household_id, proposal.id)
        await _remove_staging_safely(deps.store, proposal.staging_key, log)
        await deps.messenger.send_text(sender, expired_proposal_message())
        return

    # A Proposal in a terminal state (already confirmed/cancelled/expired): no
    # button acts — informs and doesn't redo work. This is the idempotency of the
    # repeat tap **before** any write (the CAS below only covers the concurrent race).
    if proposal.state != "proposta":
        msg = (
            expired_proposal_message() if proposal.state == "expirada" else MESSAGE_ALREADY_RESOLVED
        )
        await deps.messenger.send_text(sender, msg)
        return

    if action["action"] == "confirmar":
        await _confirm(deps, log, proposal, sender)
    elif action["action"] == "cancelar":
        await _cancel(deps, log, proposal, sender)
    elif action["action"] == "alterar":
        await _present_fields(deps, proposal, sender)
    elif action["action"] == "escolher-campo":
        await _choose_field(deps, log, proposal, action["field"], sender, person_id)
    elif action["action"] == "escolher-conta":
        await _change_bill(deps, proposal, action["bill_id"], sender)
    elif action["action"] == "escolher-mes":
        await _change_month(deps, proposal, action["reference_period"], sender)


async def _present_fields(deps: ResponderDeps, proposal: PaymentProposal, sender: str) -> None:
    """The menu Alterar (#178): the list of the Proposal's editable fields."""
    await deps.messenger.send_list(
        sender, CHANGE_MENU_TITLE, field_rows(proposal.id), CHOOSE_FIELD_BUTTON
    )


async def _choose_field(  # noqa: PLR0913 -- arity mirrors the oracle's use-case signature
    deps: ResponderDeps,
    log: Callable[[str], None] | None,
    proposal: PaymentProposal,
    field: EditableField,
    sender: str,
    person_id: str,
) -> None:
    """The Pessoa chose a field in the menu Alterar.

    Bill/reference-period open a list; the free-text ones (amount/paid-on/
    payee) mark the pending edit (`set_awaiting`) and ask for the value — the
    next text message from her is read as that field (at the edge).
    """
    if field == "conta":
        await _present_bills(deps, log, proposal, sender)
        return
    if field == "competencia":
        await _present_months(deps, proposal, sender)
        return

    marked = await deps.proposal_repo.set_awaiting(
        proposal.household_id, proposal.id, field, person_id
    )
    if marked is None:
        await deps.messenger.send_text(sender, MESSAGE_ALREADY_RESOLVED)
        return
    await deps.messenger.send_text(sender, field_edit_prompt(field))


async def _present_months(deps: ResponderDeps, proposal: PaymentProposal, sender: str) -> None:
    """Alterar -> Mês: lists the recent reference periods of the chosen Bill (recurrence-dependent)."""
    # Only an **active** Bill (parity with Confirm/change-Bill): offering months of
    # an archived Bill would lead to an edit that Confirm later rejects.
    bill = None
    if proposal.bill_id is not None:
        bills = await deps.bill_repo.list_bills(proposal.household_id)
        bill = next((b for b in bills if b.id == proposal.bill_id and b.state == "ativa"), None)
    if bill is None:
        await deps.messenger.send_text(sender, MESSAGE_MONTH_NEEDS_BILL)
        return

    periods = [
        p
        for p in occurrences_recent(
            bill.recurrence, month_of(deps.clock.today()), _MONTHS_OFFERED_COUNT
        )
        if p >= bill.first_reference_period
    ]
    periods.reverse()  # the most recent (most likely) on top of the list
    # A Bill that only starts in the future -> no valid occurrence; never sends an
    # empty list (the Graph API rejects `rows: []` and the interaction would blow up).
    if not periods:
        await deps.messenger.send_text(sender, MESSAGE_NO_MONTHS)
        return
    rows = reference_period_rows(proposal.id, periods)
    await deps.messenger.send_list(sender, MONTH_LIST_TITLE, rows, CHOOSE_MONTH_BUTTON)


async def _change_month(
    deps: ResponderDeps, proposal: PaymentProposal, reference_period: str, sender: str
) -> None:
    """Alterar -> Mês -> choice: writes the reference period and re-offers the Proposal."""
    updated = await deps.proposal_repo.update_reference_period(
        proposal.household_id, proposal.id, reference_period
    )
    if updated is None:
        await deps.messenger.send_text(sender, MESSAGE_ALREADY_RESOLVED)
        return
    await _re_offer_proposal(deps, updated, sender)


async def _confirm(
    deps: ResponderDeps, log: Callable[[str], None] | None, proposal: PaymentProposal, sender: str
) -> None:
    household_id = proposal.household_id
    # No Bill, nowhere to record against; illegible amount/paid-on/reference-period
    # would make an invalid Payment (ADR-0013 never guesses) — guides before any write.
    if proposal.bill_id is None:
        await deps.messenger.send_text(sender, MESSAGE_MISSING_BILL)
        return
    if (
        proposal.amount_cents is None
        or proposal.paid_on is None
        or proposal.reference_period is None
    ):
        await deps.messenger.send_text(sender, MESSAGE_MISSING_DATA)
        return

    # Revalidates the Bill is active: the Proposal lives for days and the Bill may
    # have been closed meanwhile — never records against an archived Bill (parity
    # with the portal). Already keeps `bill` for the summary, no post-commit read
    # that could fail after the fact is created.
    bills = await deps.bill_repo.list_bills(household_id)
    bill = next((b for b in bills if b.id == proposal.bill_id and b.state == "ativa"), None)
    if bill is None:
        await deps.messenger.send_text(sender, MESSAGE_BILL_GONE)
        return

    # Creates Payment + Attachment BEFORE committing the state — the CAS is the
    # **final commit**. A failure here undoes the partial and leaves the Proposal
    # intact in `proposta`: retry is safe (never duplicates, never ends up
    # confirmed-without-Payment). A PERMANENT error (invalid receipt) doesn't
    # enter a retry loop — a distinct message.
    payment: Payment | None = None
    attachment_id: str | None = None
    canonical_key: str | None = None
    try:
        payment = await record_payment(
            deps.payment_repo,
            deps.clock,
            household_id,
            bill.id,
            PaymentRaw(
                amount_cents=proposal.amount_cents,
                paid_on=proposal.paid_on,
                reference_period=proposal.reference_period,
                paid_by=proposal.paid_by,
            ),
        )
        attachment_id = (deps.new_id or _default_new_id)()
        canonical_key = receipt_key(household_id, payment.id, attachment_id)
        # Promotes the bytes staging->canonical (already in R2, only the key
        # changes) and registers the Attachment reading the real metadata at the
        # canonical key (honest, #3).
        await deps.store.copy(proposal.staging_key, canonical_key)
        await register_attachment(
            deps.attachment_repo,
            deps.store,
            household_id,
            payment.id,
            attachment_id,
            proposal.paid_by,
            _receipt_display_name(proposal.mime_type),
        )
    except Exception as e:
        await _compensate_partial(deps, household_id, payment, attachment_id, canonical_key, log)
        _log(log, f"whatsapp: failed to create Payment for Proposal {proposal.id}: {e}")
        permanent = isinstance(e, InvalidAttachmentError)
        await deps.messenger.send_text(
            sender, MESSAGE_INVALID_RECEIPT if permanent else MESSAGE_TRY_CONFIRM_AGAIN
        )
        return

    # Commit: CAS `proposta -> confirmada`. Lost the race (a concurrent double-tap
    # confirmed between the state check and here) -> undoes the just-created
    # Payment; the winner already has theirs.
    confirmed = await deps.proposal_repo.confirm(household_id, proposal.id)
    if confirmed is None:
        await _compensate_partial(deps, household_id, payment, attachment_id, canonical_key, log)
        await deps.messenger.send_text(sender, MESSAGE_ALREADY_RESOLVED)
        return

    await _remove_staging_safely(deps.store, proposal.staging_key, log)
    summary = ProposalSummary(
        bill_name=bill.name,
        amount=format_brl(proposal.amount_cents),
        paid_on=format_br_date(proposal.paid_on),
        reference_period=_describe_reference_period(
            proposal.reference_period, bill.recurrence.interval_months
        ),
    )
    await deps.messenger.send_text(sender, format_payment_created(summary))


async def _compensate_partial(  # noqa: PLR0913 -- arity mirrors the oracle's use-case signature
    deps: ResponderDeps,
    household_id: str,
    payment: Payment | None,
    attachment_id: str | None,
    canonical_key: str | None,
    log: Callable[[str], None] | None,
) -> None:
    """Undoes a partial Confirm (failure before commit, or a lost race).

    Removes the canonical object already copied, the Attachment and the
    Payment already created — in reverse order, each step best-effort (never
    re-raises). The Proposal stays intact in `proposta`, ready for a new Confirm.
    """
    if canonical_key is not None:
        await _remove_staging_safely(deps.store, canonical_key, log)
    if attachment_id is not None:
        try:
            await deps.attachment_repo.delete_attachment(household_id, attachment_id)
        except Exception as e:
            _log(log, f"whatsapp: failed to compensate Attachment {attachment_id}: {e}")
    if payment is not None:
        try:
            await deps.payment_repo.delete_payment(household_id, payment.id)
        except Exception as e:
            _log(log, f"whatsapp: failed to compensate Payment {payment.id}: {e}")


async def _cancel(
    deps: ResponderDeps, log: Callable[[str], None] | None, proposal: PaymentProposal, sender: str
) -> None:
    cancelled = await deps.proposal_repo.cancel(proposal.household_id, proposal.id)
    if cancelled is None:
        await deps.messenger.send_text(sender, MESSAGE_ALREADY_RESOLVED)
        return
    await _remove_staging_safely(deps.store, proposal.staging_key, log)
    await deps.messenger.send_text(sender, MESSAGE_CANCELLED)


async def _present_bills(
    deps: ResponderDeps, log: Callable[[str], None] | None, proposal: PaymentProposal, sender: str
) -> None:
    active = [
        b for b in await deps.bill_repo.list_bills(proposal.household_id) if b.state == "ativa"
    ]
    if not active:
        await deps.messenger.send_text(sender, MESSAGE_NO_BILLS)
        return
    # Ranks by the same LLM matcher (#177); if it's down, lists unordered instead
    # of disappearing — the couple still picks by hand.
    ranking: list[str] = []
    try:
        ranking = await deps.matcher(
            proposal.payee, [BillOption(bill_id=b.id, name=b.name) for b in active]
        )
    except Exception as e:
        _log(log, f"whatsapp: matcher unavailable in swap-Bill for Proposal {proposal.id}: {e}")
    # The Graph API's interactive list has a hard ceiling of 10 rows — no native
    # pagination. With more active Bills, cuts at the ceiling; the matcher's
    # ranking leads, so the right Bill lands on top the vast majority of the time.
    # Never a silent cut: logs what was left out.
    if len(active) > _MAX_LIST_ROWS:
        _log(
            log,
            f"whatsapp: household has {len(active)} active Bills > {_MAX_LIST_ROWS} — "
            f"list truncated in swap-Bill for Proposal {proposal.id}",
        )
    ordered = _order_by_ranking(active, ranking)[:_MAX_LIST_ROWS]
    rows = bill_rows(proposal.id, [BillOption(bill_id=b.id, name=b.name) for b in ordered])
    await deps.messenger.send_list(sender, BILL_LIST_TITLE, rows, CHOOSE_BILL_BUTTON)


async def _change_bill(
    deps: ResponderDeps, proposal: PaymentProposal, bill_id: str, sender: str
) -> None:
    household_id = proposal.household_id
    bills = await deps.bill_repo.list_bills(household_id)
    bill = next((b for b in bills if b.id == bill_id and b.state == "ativa"), None)
    if bill is None:
        await deps.messenger.send_text(sender, MESSAGE_BILL_GONE)
        return

    # Re-infers the reference period for the new Bill. Without the printed due
    # date persisted on the Proposal, falls back to the oldest-still-open
    # occurrence (the "last open" model — decision of 04/07).
    payments = [
        p for p in await deps.payment_repo.list_all_payments(household_id) if p.bill_id == bill.id
    ]
    reference_period = infer_reference_period_on_bill_change(
        bill, payments, deps.clock.today(), deps.calendar
    )

    updated = await deps.proposal_repo.update_bill(
        household_id, proposal.id, bill.id, reference_period
    )
    if updated is None:
        await deps.messenger.send_text(sender, MESSAGE_ALREADY_RESOLVED)
        return
    # Passes the already-loaded `bill` — avoids re-offering re-querying the Bill list.
    await _re_offer_proposal(deps, updated, sender, bill)


class _ReOfferDeps(Protocol):
    """The narrow slice `_re_offer_proposal` needs — shared by `ResponderDeps` and `TextEditDeps`."""

    bill_repo: BillLister
    messenger: WhatsappMessenger


async def _re_offer_proposal(
    deps: _ReOfferDeps,
    proposal: PaymentProposal,
    sender: str,
    known_bill: Bill | None = None,
) -> None:
    """Re-renders the Proposal (summary + Confirmar/Alterar/Cancelar buttons) after any edit.

    Derives the summary from the Proposal's **current** fields. `known_bill`
    avoids a re-query when the caller already has the Bill in hand (change-
    Bill); without it, looks it up. The reference period uses the Bill's
    recurrence; without a Bill, falls back to the month in full (never the raw ISO).
    """
    bill = known_bill
    if bill is None and proposal.bill_id is not None:
        bills = await deps.bill_repo.list_bills(proposal.household_id)
        bill = next((b for b in bills if b.id == proposal.bill_id), None)

    reference_period_fmt: str | None = None
    if proposal.reference_period is not None:
        reference_period_fmt = (
            _describe_reference_period(proposal.reference_period, bill.recurrence.interval_months)
            if bill is not None
            else describe_month_in_full(proposal.reference_period)
        )

    summary = ProposalSummary(
        bill_name=bill.name if bill is not None else None,
        amount=format_brl(proposal.amount_cents) if proposal.amount_cents is not None else None,
        paid_on=format_br_date(proposal.paid_on) if proposal.paid_on is not None else None,
        reference_period=reference_period_fmt,
    )
    await deps.messenger.send_buttons(
        sender, format_proposal_message(summary), proposal_buttons(proposal.id)
    )


@dataclass
class TextEditDeps:
    """What free-text editing needs — a light subset, no R2/Bedrock (a text never fails on media env)."""

    proposal_repo: PaymentProposalRepo
    bill_repo: BillLister
    messenger: WhatsappMessenger
    clock: Clock


@dataclass
class TextInput:
    """A free-text message from the couple, with Pessoa and Household already resolved by the edge."""

    household_id: str
    sender: str
    person_id: str
    text: str


async def edit_text_field(deps: TextEditDeps, request: TextInput) -> bool:
    """Interprets a free-text message (#178).

    If the Pessoa has a pending edit (tapped Alterar -> Valor/Data/Favorecido),
    reads the text **only** as that field (deterministic parser), writes it
    and re-offers the Proposal. Parse failure -> **drops** the pending edit
    and points to re-tapping the menu (otherwise the next loose text would
    fall here again, never at the echo — the Pessoa would get trapped).
    Returns `True` if it **consumed** the text as an edit; `False` = no
    pending edit (the edge echoes the usage instructions).
    """
    proposal = await deps.proposal_repo.get_awaiting_by_person(
        request.household_id, request.person_id
    )
    if proposal is None or proposal.awaiting_field is None:
        return False

    field = proposal.awaiting_field
    patch = _parse_free_text_field(field, request.text, deps.clock.today())
    if patch is None:
        # A human fact is trusted, but validated (#178): the parser is the
        # validation. Format didn't match -> drops the pending edit and points to
        # re-tapping the menu. Keeping the pendency would trap the Pessoa: every
        # next text would fall here, never at the echo.
        await deps.proposal_repo.clear_awaiting(request.household_id, request.person_id)
        await deps.messenger.send_text(request.sender, field_not_understood_message(field))
        return True

    updated = await deps.proposal_repo.update_field(request.household_id, proposal.id, patch)
    if updated is None:
        await deps.messenger.send_text(request.sender, MESSAGE_ALREADY_RESOLVED)
        return True
    await _re_offer_proposal(deps, updated, request.sender)
    return True


def _parse_free_text_field(field: FreeTextField, text: str, today: date) -> FieldPatch | None:
    """Reads the free text as the requested field -> patch, or `None` if the format doesn't match."""
    if field == "valor":
        cents = parse_brl(text)
        return AmountPatch(amount_cents=cents) if cents is not None else None
    if field == "data":
        parsed = parse_br_date(text, today)
        return PaidOnPatch(paid_on=parsed) if parsed is not None else None
    payee = text.strip()
    return PayeePatch(payee=payee[:_MAX_PAYEE_LEN]) if payee != "" else None


@dataclass
class SweepDeps:
    """Dependencies of `sweep_expired_proposals`."""

    proposal_repo: PaymentProposalRepo
    store: AttachmentStore
    clock: Clock
    log: Callable[[str], None] | None = None


async def sweep_expired_proposals(deps: SweepDeps) -> None:
    """Opportunistic sweep of expired Proposals (#159).

    Runs post-response to any processed event, no new job. Lists the open
    ones, and for each the clock already expired stamps `expirada` and
    removes the orphaned staging — no old Proposal's bytes survive in the bucket.
    """
    today = deps.clock.today()
    for p in await deps.proposal_repo.list_open():
        if not is_expired(p.created_at, today):
            continue
        await deps.proposal_repo.mark_expired(p.household_id, p.id)
        await _remove_staging_safely(deps.store, p.staging_key, deps.log)
