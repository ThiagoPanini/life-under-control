"""Payment Proposal (Proposta de Lançamento) — pure core (ADR-0003, ADR-0012, CONTEXT.md).

What a WhatsApp receipt becomes **before** the couple confirms: the matched
Bill, amount, paid-on date and reference period read off the receipt,
answered in chat with buttons. **Not a fact** — only becomes a Payment when
confirmed; cancelled or expired leaves no domain effect (forbidden glossary
terms: pré-lançamento, lançamento pendente, rascunho).

Only the domain shape, states, staging-key derivation and message/button
composition live here. No Drizzle/Postgres, no HTTP, no SDK.

Wire values that are part of the persisted/edge contract (state literals,
button/list ids) stay in pt-BR, verbatim from the TS oracle — only the code
identifiers are English (ADR-0016).
"""

import hashlib
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal, TypedDict, cast

from luc_api.shared.domain import is_valid_reference_period

__all__ = [
    "ACTION_CANCEL",
    "ACTION_CHANGE",
    "ACTION_CONFIRM",
    "ACTION_SWAP",
    "ACTIVE_PROPOSAL_STATES",
    "CHANGE_MENU_TITLE",
    "CHOOSE_BILL_PREFIX",
    "CHOOSE_FIELD_PREFIX",
    "CHOOSE_MONTH_PREFIX",
    "FREE_TEXT_FIELDS",
    "MONTH_LIST_TITLE",
    "PROPOSAL_TTL_DAYS",
    "BillOption",
    "ChangeAction",
    "ChooseBillAction",
    "ChooseFieldAction",
    "ChooseMonthAction",
    "ConfirmOrCancelAction",
    "EditableField",
    "FreeTextField",
    "InteractiveButton",
    "InteractiveRow",
    "NewPaymentProposal",
    "PaymentProposal",
    "PaymentProposalData",
    "ProposalAction",
    "ProposalState",
    "ProposalSummary",
    "bill_rows",
    "describe_month_in_full",
    "duplicate_receipt_message",
    "expired_proposal_message",
    "field_edit_prompt",
    "field_not_understood_message",
    "field_rows",
    "format_payment_created",
    "format_proposal_message",
    "is_expired",
    "is_free_text_field",
    "parse_button_action",
    "proposal_buttons",
    "receipt_hash",
    "reference_period_rows",
    "staging_key_for",
]

# --- state ---

type ProposalState = Literal["proposta", "confirmada", "cancelada", "expirada"]
"""Life state of the Proposal. `proposta` = open, awaiting the couple; the
three others are terminal. Only `confirmada` produces a Payment."""

ACTIVE_PROPOSAL_STATES: tuple[ProposalState, ...] = ("proposta", "confirmada")
"""States in which a Proposal is **active** for repeat detection: open
(`proposta`) or already turned Payment (`confirmada`). `cancelada`/`expirada`
are terminal and don't count — resending the same file after cancelling opens
a new Proposal."""

type FreeTextField = Literal["valor", "data", "favorecido"]
"""Fields edited by **free text** (deterministic per-field parser)."""

type EditableField = Literal["conta", "competencia", "valor", "data", "favorecido"]
"""Every field the menu Alterar edits. Conta/Competência by list; the rest by
free text — `FreeTextField` is the subset."""


@dataclass(frozen=True)
class PaymentProposalData:
    """The data of a Proposal read off the receipt — `None` field = illegible, never guessed (ADR-0013)."""

    wa_message_id: str
    """The WhatsApp message that originated the Proposal (edge audit/idempotency)."""
    bytes_hash: str
    """SHA-256 (hex) of the media bytes — repeat-receipt detection (same file)."""
    paid_by: str
    """The Pessoa who sent the receipt (id) — authorship, not authorization (#1)."""
    bill_id: str | None
    """The candidate matched Bill; `None` when matching found no confident candidate."""
    amount_cents: int | None
    """Amount in cents, BRL, positive integer (#6); `None` when illegible."""
    paid_on: date | None
    """Civil date of the payment; `None` when illegible."""
    reference_period: str | None
    """Inferred reference period (`year-month`); `None` without a matched Bill or not inferable."""
    payee: str | None
    """Payee read off the receipt (matching signal only, never displayed); `None` when illegible."""
    staging_key: str
    """Transitory key of the bytes in object storage (staging), promoted on Confirm."""
    mime_type: str
    """MIME type of the downloaded media."""


@dataclass(frozen=True)
class PaymentProposal(PaymentProposalData):
    """A persisted Proposal: the data + identity, owning Household, state and birth."""

    id: str
    household_id: str
    state: ProposalState
    created_at: date
    """Civil date the Proposal was born on — only the date matters for TTL comparison."""
    awaiting_field: FreeTextField | None
    """Menu Alterar conversation state (#178): the free-text field the bot is
    waiting for (`valor`/`data`/`favorecido`). `None` = no pending edit."""
    awaiting_person: str | None
    """The Pessoa the pending free-text edit is waiting on. `None` = no pending edit."""


@dataclass(frozen=True)
class NewPaymentProposal(PaymentProposalData):
    """Data of a new Proposal already assembled, plus identity and owner (the Household)."""

    id: str
    household_id: str


class InteractiveButton(TypedDict):
    """A WhatsApp quick-reply button: the `id` (the Pessoa never sees it) and the `label`."""

    id: str
    label: str


class InteractiveRow(TypedDict):
    """A row of a WhatsApp interactive list: hidden id + visible label (<=24 chars)."""

    id: str
    label: str


@dataclass(frozen=True)
class BillOption:
    """A Bill candidate offered for matching or listing: id + display name."""

    bill_id: str
    name: str


# --- staging key + receipt hash ---

_STAGING_PREFIX = "finance/proposals"


def staging_key_for(household_id: str, proposal_id: str) -> str:
    """Derives the staging key of a receipt still in Proposal: `finance/proposals/{household}/{proposal}`.

    Transitory by definition — on Confirm the bytes migrate to the canonical
    key (`receipt_key`) once the Payment (and its `payment_id`) exists.
    """
    return f"{_STAGING_PREFIX}/{household_id}/{proposal_id}"


def receipt_hash(content: bytes) -> str:
    """SHA-256 (hex) of the media bytes — the receipt's identity to detect resending the **same file**."""
    return hashlib.sha256(content).hexdigest()


def duplicate_receipt_message(existing: PaymentProposal) -> str:
    """The repeat-receipt warning: the same file already has an open Proposal or already became a Payment."""
    if existing.state == "confirmada":
        return "Esse comprovante já virou um Lançamento aqui. 👍"
    return "Esse comprovante já está aguardando sua confirmação aqui no chat. 👆"


# --- buttons ---

ACTION_CONFIRM = "confirmar"
ACTION_CHANGE = "alterar"
"""The menu Alterar (#178) generalizes the old "Trocar Conta": edits every collected field."""
ACTION_SWAP = "trocar"
"""Legacy "Trocar Conta" button of pre-#178 Proposals — the parser still accepts it, routing to the menu Alterar."""
ACTION_CANCEL = "cancelar"


def proposal_buttons(proposal_id: str) -> list[InteractiveButton]:
    """The three buttons of a Proposal, each carrying its id in the action."""
    return [
        {"id": f"{ACTION_CONFIRM}:{proposal_id}", "label": "Confirmar"},
        {"id": f"{ACTION_CHANGE}:{proposal_id}", "label": "Alterar"},
        {"id": f"{ACTION_CANCEL}:{proposal_id}", "label": "Cancelar"},
    ]


@dataclass(frozen=True)
class ProposalSummary:
    """The already-formatted summary of a Proposal for the message — each field is final text or `None`."""

    bill_name: str | None
    amount: str | None
    paid_on: str | None
    reference_period: str | None


_ILLEGIBLE = "_não consegui ler — confira no comprovante_"
_NO_BILL = "_não identifiquei — toque *Alterar*_"


def format_proposal_message(summary: ProposalSummary) -> str:
    """Composes the Proposal message: matched Bill, amount, paid-on date and reference period, one per line."""
    return "\n".join(
        [
            "Comprovante recebido! Confira e confirme 👇",
            "",
            f"*Conta:* {summary.bill_name if summary.bill_name is not None else _NO_BILL}",
            f"*Valor:* {summary.amount if summary.amount is not None else _ILLEGIBLE}",
            f"*Pagamento:* {summary.paid_on if summary.paid_on is not None else _ILLEGIBLE}",
            f"*Competência:* {summary.reference_period if summary.reference_period is not None else _ILLEGIBLE}",
        ]
    )


CHOOSE_BILL_PREFIX = "conta"

_TITLE_MAX_LEN = 24


def _cut_title(text: str) -> str:
    """A list row's title must fit the WhatsApp limit (24 chars)."""
    return f"{text[:23]}…" if len(text) > _TITLE_MAX_LEN else text


def bill_rows(proposal_id: str, bills: list[BillOption]) -> list[InteractiveRow]:
    """Rows of the Bill list (Alterar -> Conta).

    Each candidate Bill becomes a row whose id carries the Proposal and the
    chosen Bill (`conta:{proposal_id}:{bill_id}`).
    """
    return [
        {"id": f"{CHOOSE_BILL_PREFIX}:{proposal_id}:{b.bill_id}", "label": _cut_title(b.name)}
        for b in bills
    ]


CHOOSE_FIELD_PREFIX = "campo"
CHOOSE_MONTH_PREFIX = "mes"

FREE_TEXT_FIELDS: frozenset[str] = frozenset({"valor", "data", "favorecido"})

_FIELD_MENU: list[tuple[EditableField, str]] = [
    ("conta", "Conta"),
    ("competencia", "Competência (mês)"),
    ("valor", "Valor"),
    ("data", "Data de pagamento"),
    ("favorecido", "Favorecido"),
]
_EDITABLE_FIELDS: frozenset[str] = frozenset(field for field, _ in _FIELD_MENU)


def is_free_text_field(field: EditableField) -> bool:
    """Is this a free-text field? (type guard for text routing at the edge, #178)."""
    return field in FREE_TEXT_FIELDS


CHANGE_MENU_TITLE = "O que você quer alterar?"


def field_rows(proposal_id: str) -> list[InteractiveRow]:
    """Rows of the menu Alterar (#178).

    Each editable field becomes a row whose id carries the Proposal and the
    field (`campo:{proposal_id}:{field}`).
    """
    return [
        {"id": f"{CHOOSE_FIELD_PREFIX}:{proposal_id}:{field}", "label": label}
        for field, label in _FIELD_MENU
    ]


MONTH_LIST_TITLE = "Qual é a Competência (mês)?"

_MONTHS_PT = (
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)


def describe_month_in_full(reference_period: str) -> str:
    """Reference period's month in full, lowercase: "2026-07" -> "julho de 2026"."""
    year, month = reference_period.split("-")
    return f"{_MONTHS_PT[int(month) - 1]} de {year}"


def reference_period_rows(proposal_id: str, reference_periods: list[str]) -> list[InteractiveRow]:
    """Rows of the reference-period list (#178).

    Each candidate month becomes a row whose id carries the Proposal and the
    reference period (`mes:{proposal_id}:{YYYY-MM}`).
    """
    rows: list[InteractiveRow] = []
    for period in reference_periods:
        label_full = describe_month_in_full(period)
        capitalized = label_full[0].upper() + label_full[1:]
        rows.append(
            {
                "id": f"{CHOOSE_MONTH_PREFIX}:{proposal_id}:{period}",
                "label": _cut_title(capitalized),
            }
        )
    return rows


def field_edit_prompt(field: FreeTextField) -> str:
    """Text asking for a free-text field, with an example (#178)."""
    if field == "valor":
        return "Qual o valor certo? Manda em reais — ex.: *253,43*."
    if field == "data":
        return "Qual a data de pagamento? Manda *dd/mm* ou *dd/mm/aaaa* — ex.: *05/07/2026*."
    return "Qual o favorecido? Manda o nome como aparece no comprovante."


def field_not_understood_message(field: FreeTextField) -> str:
    """Parse-failure message (#178): the text didn't match the field's format.

    Drops the pending edit (so it does NOT say "send again" as if still
    waiting), brings the example and points to re-tapping the menu — the next
    loose text goes back to being echo, never trapped.
    """
    if field == "valor":
        return "Não entendi o valor. Toque *Alterar* → *Valor* e manda de novo — ex.: *253,43*."
    if field == "data":
        return "Não entendi a data. Toque *Alterar* → *Data* e manda de novo — ex.: *05/07/2026*."
    return "Não entendi. Toque *Alterar* → *Favorecido* e manda o nome de novo."


# --- button/list id parsing ---


class ConfirmOrCancelAction(TypedDict):
    """A tap on the Confirmar or Cancelar button."""

    action: Literal["confirmar", "cancelar"]
    proposal_id: str


class ChangeAction(TypedDict):
    """A tap on the Alterar button (or the legacy Trocar Conta one) — opens the field menu."""

    action: Literal["alterar"]
    proposal_id: str


class ChooseFieldAction(TypedDict):
    """A tap on a row of the field menu (Alterar)."""

    action: Literal["escolher-campo"]
    proposal_id: str
    field: EditableField


class ChooseBillAction(TypedDict):
    """A tap on a row of the Bill list (Alterar -> Conta)."""

    action: Literal["escolher-conta"]
    proposal_id: str
    bill_id: str


class ChooseMonthAction(TypedDict):
    """A tap on a row of the reference-period list (Alterar -> Competência)."""

    action: Literal["escolher-mes"]
    proposal_id: str
    reference_period: str


type ProposalAction = (
    ConfirmOrCancelAction | ChangeAction | ChooseFieldAction | ChooseBillAction | ChooseMonthAction
)
"""What the Pessoa tapped: one of the Proposal's three buttons or a list row.
Inverse of `proposal_buttons`/`bill_rows`/`field_rows`/`reference_period_rows`.
`None` = unrecognizable id — the edge silently ignores it, never guesses an action."""


_BUTTON_ID_PARTS = 2
_LIST_ROW_ID_PARTS = 3


def parse_button_action(reply_id: str) -> ProposalAction | None:  # noqa: PLR0911 — mirrors the oracle's single function
    """What the Pessoa tapped — one of the Proposal's buttons or a list row. `None` = unrecognized id."""
    parts = reply_id.split(":")
    if len(parts) == _BUTTON_ID_PARTS:
        action, proposal_id = parts
        if not proposal_id:
            return None
        if action == ACTION_CONFIRM:
            return {"action": "confirmar", "proposal_id": proposal_id}
        if action == ACTION_CANCEL:
            return {"action": "cancelar", "proposal_id": proposal_id}
        # "Alterar" (#178) and the legacy "Trocar Conta" (#159) fall into the same field menu.
        if action in (ACTION_CHANGE, ACTION_SWAP):
            return {"action": "alterar", "proposal_id": proposal_id}
        return None
    if len(parts) == _LIST_ROW_ID_PARTS:
        prefix, proposal_id, value = parts
        if not proposal_id or not value:
            return None
        if prefix == CHOOSE_BILL_PREFIX:
            return {"action": "escolher-conta", "proposal_id": proposal_id, "bill_id": value}
        if prefix == CHOOSE_FIELD_PREFIX and value in _EDITABLE_FIELDS:
            return {
                "action": "escolher-campo",
                "proposal_id": proposal_id,
                "field": cast(EditableField, value),
            }
        if prefix == CHOOSE_MONTH_PREFIX and is_valid_reference_period(value):
            return {
                "action": "escolher-mes",
                "proposal_id": proposal_id,
                "reference_period": value,
            }
    return None


# --- expiry ---

PROPOSAL_TTL_DAYS = 7
"""Lifetime of an unanswered Proposal (days) — expiry derived from the clock (invariant #3)."""


def is_expired(created_at: date, today: date) -> bool:
    """Has the Proposal expired?

    **Derived** truth from the clock (`created_at + TTL < today`), not a
    column: the persisted `expirada` state is only the timestamp of the
    cleanup act.
    """
    return today > created_at + timedelta(days=PROPOSAL_TTL_DAYS)


def expired_proposal_message() -> str:
    """The stale Proposal (TTL blown): never becomes a fact; points to resending to open a new one."""
    return "Essa Proposta expirou (mais de 7 dias). Manda o comprovante de novo que eu faço uma nova. 🔁"


def format_payment_created(summary: ProposalSummary) -> str:
    """The summary of the **fact created** on Confirm: the Payment was born with Bill, amount and reference period."""
    return "\n".join(
        [
            "Pronto! Registrei o pagamento ✅",
            "",
            f"*Conta:* {summary.bill_name if summary.bill_name is not None else '—'}",
            f"*Valor:* {summary.amount if summary.amount is not None else '—'}",
            f"*Competência:* {summary.reference_period if summary.reference_period is not None else '—'}",
        ]
    )
