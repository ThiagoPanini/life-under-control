"""Whatsapp application layer: ports, their fakes, and the response orchestration.

Map: `payment_proposal_repo` (the Proposal's CAS persistence port + fake),
`conta_matcher` (LLM Bill-matching port + fake), `whatsapp_messenger`
(message-sending port + fake), `calendar` (bank business-day port + fake),
`bill_occurrences` (a minimal Bill-occurrence slice pulled forward from #189 —
see its module docstring); `respond_to_proposal` (Confirm/Cancel/menu Alterar
orchestration, CAS-last + compensation, free-text editing, expiry sweep).
May depend on `domain` and on `luc_api.finance.application` (never
`luc_api.finance.domain` — import-linter enforces this); must never import
adapters or any framework.
"""

from luc_api.whatsapp.application.calendar import Calendar, FakeCalendar
from luc_api.whatsapp.application.conta_matcher import ContaMatcher, fake_conta_matcher
from luc_api.whatsapp.application.payment_proposal_repo import (
    AmountPatch,
    DuplicateProposalError,
    FakePaymentProposalRepo,
    FieldPatch,
    PaidOnPatch,
    PayeePatch,
    PaymentProposalRepo,
)
from luc_api.whatsapp.application.respond_to_proposal import (
    BILL_LIST_TITLE,
    CHOOSE_BILL_BUTTON,
    CHOOSE_FIELD_BUTTON,
    CHOOSE_MONTH_BUTTON,
    MESSAGE_ALREADY_RESOLVED,
    MESSAGE_BILL_GONE,
    MESSAGE_CANCELLED,
    MESSAGE_INVALID_RECEIPT,
    MESSAGE_MISSING_BILL,
    MESSAGE_MISSING_DATA,
    MESSAGE_MONTH_NEEDS_BILL,
    MESSAGE_NO_BILLS,
    MESSAGE_NO_MONTHS,
    MESSAGE_PROPOSAL_GONE,
    MESSAGE_TRY_CONFIRM_AGAIN,
    BillLister,
    InteractionInput,
    ResponderDeps,
    SweepDeps,
    TextEditDeps,
    TextInput,
    edit_text_field,
    respond_to_proposal,
    sweep_expired_proposals,
)
from luc_api.whatsapp.application.whatsapp_messenger import (
    FakeWhatsappMessenger,
    WhatsappMessenger,
    WhatsappTemplate,
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
    "AmountPatch",
    "BillLister",
    "Calendar",
    "ContaMatcher",
    "DuplicateProposalError",
    "FakeCalendar",
    "FakePaymentProposalRepo",
    "FakeWhatsappMessenger",
    "FieldPatch",
    "InteractionInput",
    "PaidOnPatch",
    "PayeePatch",
    "PaymentProposalRepo",
    "ResponderDeps",
    "SweepDeps",
    "TextEditDeps",
    "TextInput",
    "WhatsappMessenger",
    "WhatsappTemplate",
    "edit_text_field",
    "fake_conta_matcher",
    "respond_to_proposal",
    "sweep_expired_proposals",
]
