"""respond_to_proposal (Seam 1, #159/#178): suite ported 1:1 from the TS oracle.

The couple's replies to a Proposal — Confirmar (becomes a Payment with
Attachment), Cancelar, the menu Alterar (Bill/reference-period by list,
amount/paid-on/payee by free text), text editing and expiry. Only fakes
(repos, store, messenger, matcher, Clock) — no network, no database.

Oracle: apps/web/src/core/use-cases/responder-proposta.test.ts.
"""

from dataclasses import dataclass, replace
from datetime import date

from luc_api.finance.application import (
    Bill,
    FakeAttachmentRepo,
    FakeAttachmentStore,
    FakePaymentRepo,
    FakeStoredObject,
    FixedDayRule,
    Recurrence,
)
from luc_api.shared.application import FixedClock
from luc_api.whatsapp.application import (
    MESSAGE_ALREADY_RESOLVED,
    MESSAGE_BILL_GONE,
    MESSAGE_CANCELLED,
    MESSAGE_INVALID_RECEIPT,
    MESSAGE_MISSING_BILL,
    MESSAGE_MONTH_NEEDS_BILL,
    MESSAGE_NO_MONTHS,
    MESSAGE_PROPOSAL_GONE,
    MESSAGE_TRY_CONFIRM_AGAIN,
    FakeCalendar,
    FakePaymentProposalRepo,
    FakeWhatsappMessenger,
    InteractionInput,
    ResponderDeps,
    SweepDeps,
    TextEditDeps,
    TextInput,
    edit_text_field,
    fake_conta_matcher,
    respond_to_proposal,
    sweep_expired_proposals,
)
from luc_api.whatsapp.domain import PaymentProposal, ProposalAction

HOUSEHOLD = "lar-1"
THIAGO = "u-thiago"
SENDER = "5511987654321"
STAGING = "finance/proposals/lar-1/prop-1"

_BILL_LUZ = Bill(
    id="bill-luz",
    household_id=HOUSEHOLD,
    name="Luz",
    description=None,
    icon="zap",
    recurrence=Recurrence(interval_months=1, anchor_month=None),
    due_rule=FixedDayRule(day=10),
    due_month_offset=0,
    first_reference_period="2026-01",
    state="ativa",
    closed_on=None,
    logo_key=None,
)


def bill_luz(**over: object) -> Bill:
    return replace(_BILL_LUZ, **over)  # type: ignore[arg-type]


_PROPOSAL_SEED = PaymentProposal(
    id="prop-1",
    household_id=HOUSEHOLD,
    wa_message_id="wamid.C1",
    bytes_hash="hash-1",
    paid_by=THIAGO,
    bill_id="bill-luz",
    amount_cents=25343,
    paid_on=date(2026, 7, 5),
    reference_period="2026-07",
    payee="ENEL DISTRIBUICAO SAO PAULO",
    staging_key=STAGING,
    mime_type="image/jpeg",
    state="proposta",
    created_at=date(2026, 7, 7),
    awaiting_field=None,
    awaiting_person=None,
)


def proposal_seed(**over: object) -> PaymentProposal:
    return replace(_PROPOSAL_SEED, **over)  # type: ignore[arg-type]


class _BillLister:
    def __init__(self, bills: list[Bill]) -> None:
        self._bills = bills

    async def list_bills(self, household_id: str) -> list[Bill]:
        return self._bills


@dataclass
class Fixture:
    deps: ResponderDeps
    proposal_repo: FakePaymentProposalRepo
    payment_repo: FakePaymentRepo
    attachment_repo: FakeAttachmentRepo
    store: FakeAttachmentStore
    messenger: FakeWhatsappMessenger


def build(
    *,
    proposal: dict[str, object] | None = None,
    bills: list[Bill] | None = None,
    today: date = date(2026, 7, 8),
    matcher_ids: list[str] | None = None,
    staging_bytes: int = 2048,
) -> Fixture:
    p = proposal_seed(**(proposal or {}))
    proposal_repo = FakePaymentProposalRepo([p])
    payment_repo = FakePaymentRepo()
    attachment_repo = FakeAttachmentRepo()
    bill_list = bills if bills is not None else [bill_luz()]
    store = FakeAttachmentStore(
        [FakeStoredObject(key=p.staging_key, size_bytes=staging_bytes, mime_type=p.mime_type)]
    )
    messenger = FakeWhatsappMessenger()
    deps = ResponderDeps(
        proposal_repo=proposal_repo,
        payment_repo=payment_repo,
        attachment_repo=attachment_repo,
        bill_repo=_BillLister(bill_list),
        matcher=fake_conta_matcher(
            matcher_ids if matcher_ids is not None else [b.id for b in bill_list]
        ),
        store=store,
        messenger=messenger,
        clock=FixedClock(today),
        calendar=FakeCalendar(),
        new_id=lambda: "att-1",
    )
    return Fixture(deps, proposal_repo, payment_repo, attachment_repo, store, messenger)


def _action(**over: object) -> ProposalAction:
    return over  # type: ignore[return-value]


def _input(action: ProposalAction) -> InteractionInput:
    return InteractionInput(household_id=HOUSEHOLD, sender=SENDER, person_id=THIAGO, action=action)


def _get(repo: FakePaymentProposalRepo, proposal_id: str) -> PaymentProposal:
    proposal = repo.get(proposal_id)
    assert proposal is not None
    return proposal


async def _boom(*_args: object, **_kwargs: object) -> None:
    raise RuntimeError("indisponível")


async def _return_none(*_args: object, **_kwargs: object) -> None:
    return None


# --- respond_to_proposal (Seam 1) ---


async def test_confirm_creates_payment_with_attachment_promotes_staging_and_confirms():
    f = build()

    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))

    payments = await f.payment_repo.list_all_payments(HOUSEHOLD)
    assert len(payments) == 1
    assert payments[0].bill_id == "bill-luz"
    assert payments[0].amount_cents == 25343
    assert payments[0].reference_period == "2026-07"
    assert payments[0].paid_by == THIAGO

    # Attachment was born at the canonical key, staging promoted and cleaned.
    assert len(await f.attachment_repo.list_attachments(HOUSEHOLD, payments[0].id)) == 1
    keys = f.store.keys()
    assert STAGING not in keys
    assert any(k.startswith(f"finance/payments/{HOUSEHOLD}/{payments[0].id}/") for k in keys)

    assert _get(f.proposal_repo, "prop-1").state == "confirmada"
    reply = f.messenger.sent_texts[-1]["body"]
    assert "Registrei" in reply
    assert "Luz" in reply
    assert "R$ 253,43" in reply


async def test_repeated_confirm_does_not_duplicate_the_payment():
    f = build()

    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))
    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))

    assert len(await f.payment_repo.list_all_payments(HOUSEHOLD)) == 1
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_ALREADY_RESOLVED


async def test_confirm_without_bill_points_to_change_and_creates_no_payment():
    f = build(proposal={"bill_id": None, "reference_period": None})

    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))

    assert len(await f.payment_repo.list_all_payments(HOUSEHOLD)) == 0
    assert _get(f.proposal_repo, "prop-1").state == "proposta"
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_MISSING_BILL


async def test_cancel_leaves_no_trace_and_clears_staging():
    f = build()

    await respond_to_proposal(f.deps, _input(_action(action="cancelar", proposal_id="prop-1")))

    assert len(await f.payment_repo.list_all_payments(HOUSEHOLD)) == 0
    assert STAGING not in f.store.keys()  # noqa: SIM118 -- `.keys()` is a fake-only inspector, not a dict
    assert _get(f.proposal_repo, "prop-1").state == "cancelada"
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_CANCELLED


async def test_change_opens_the_menu_with_five_fields():
    f = build()

    await respond_to_proposal(f.deps, _input(_action(action="alterar", proposal_id="prop-1")))

    assert len(f.messenger.sent_lists) == 1
    # The button label varies by context (#178): here it's the field menu.
    assert f.messenger.sent_lists[0]["button_label"] == "Escolher campo"
    assert [r["id"] for r in f.messenger.sent_lists[0]["rows"]] == [
        "campo:prop-1:conta",
        "campo:prop-1:competencia",
        "campo:prop-1:valor",
        "campo:prop-1:data",
        "campo:prop-1:favorecido",
    ]


async def test_change_bill_presents_list_ranked_by_matcher():
    bills = [bill_luz(), bill_luz(id="bill-agua", name="Água")]
    f = build(bills=bills, matcher_ids=["bill-agua", "bill-luz"])

    await respond_to_proposal(
        f.deps, _input(_action(action="escolher-campo", proposal_id="prop-1", field="conta"))
    )

    assert len(f.messenger.sent_lists) == 1
    assert f.messenger.sent_lists[0]["button_label"] == "Escolher Conta"
    assert [r["id"] for r in f.messenger.sent_lists[0]["rows"]] == [
        "conta:prop-1:bill-agua",
        "conta:prop-1:bill-luz",
    ]


async def test_change_month_lists_recent_reference_periods_of_the_bill():
    f = build(today=date(2026, 7, 8))

    await respond_to_proposal(
        f.deps, _input(_action(action="escolher-campo", proposal_id="prop-1", field="competencia"))
    )

    # Monthly Bill -> recent reference periods, the most recent (July) on top.
    assert f.messenger.sent_lists[-1]["button_label"] == "Escolher mês"
    rows = f.messenger.sent_lists[-1]["rows"]
    assert rows[0]["id"] == "mes:prop-1:2026-07"
    assert "mes:prop-1:2026-06" in [r["id"] for r in rows]


async def test_change_month_of_closed_bill_offers_no_months():
    # An archived Bill doesn't enter the active list: offering its months would
    # lead to an edit that Confirm later rejects — parity with Confirm/change-Bill.
    f = build(bills=[bill_luz(state="encerrada", closed_on=date(2026, 7, 6))])

    await respond_to_proposal(
        f.deps, _input(_action(action="escolher-campo", proposal_id="prop-1", field="competencia"))
    )

    assert len(f.messenger.sent_lists) == 0
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_MONTH_NEEDS_BILL


async def test_change_month_of_future_only_bill_warns_without_empty_list():
    # A Bill whose 1st reference period is entirely future -> no valid occurrence.
    # Never sends an empty list (the Graph API rejects `rows: []`): warns by text.
    f = build(bills=[bill_luz(first_reference_period="2027-01")], today=date(2026, 7, 8))

    await respond_to_proposal(
        f.deps, _input(_action(action="escolher-campo", proposal_id="prop-1", field="competencia"))
    )

    assert len(f.messenger.sent_lists) == 0
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_NO_MONTHS


async def test_change_month_without_bill_points_to_choosing_bill_first():
    f = build(proposal={"bill_id": None})

    await respond_to_proposal(
        f.deps, _input(_action(action="escolher-campo", proposal_id="prop-1", field="competencia"))
    )

    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_MONTH_NEEDS_BILL


async def test_choose_month_writes_reference_period_and_re_offers():
    f = build()

    await respond_to_proposal(
        f.deps,
        _input(_action(action="escolher-mes", proposal_id="prop-1", reference_period="2026-06")),
    )

    assert _get(f.proposal_repo, "prop-1").reference_period == "2026-06"
    buttons = f.messenger.sent_buttons[-1]["buttons"]
    assert "Confirmar" in [b["label"] for b in buttons]


async def test_change_amount_marks_pending_edit_and_asks_for_amount_with_example():
    f = build()

    await respond_to_proposal(
        f.deps, _input(_action(action="escolher-campo", proposal_id="prop-1", field="valor"))
    )

    assert _get(f.proposal_repo, "prop-1").awaiting_field == "valor"
    assert _get(f.proposal_repo, "prop-1").awaiting_person == THIAGO
    assert "253,43" in f.messenger.sent_texts[-1]["body"]


async def test_choose_bill_rewrites_bill_reinfers_reference_period_and_re_offers():
    bills = [bill_luz(), bill_luz(id="bill-agua", name="Água")]
    f = build(bills=bills)

    await respond_to_proposal(
        f.deps, _input(_action(action="escolher-conta", proposal_id="prop-1", bill_id="bill-agua"))
    )

    assert _get(f.proposal_repo, "prop-1").bill_id == "bill-agua"
    assert _get(f.proposal_repo, "prop-1").reference_period is not None
    re_offer = f.messenger.sent_buttons[-1]
    assert "Água" in re_offer["body"]
    assert "Confirmar" in [b["label"] for b in re_offer["buttons"]]


async def test_choose_bill_by_list_does_not_drop_pending_text_edit():
    # Editing by list (Bill) is orthogonal to a pending text edit (#178): the
    # Pessoa tapped Alterar -> Valor and, before typing, touched the Bill instead.
    # The text pendency must survive — else the following "50,00" would echo
    # instead of writing.
    bills = [bill_luz(), bill_luz(id="bill-agua", name="Água")]
    f = build(bills=bills)
    await f.proposal_repo.set_awaiting(HOUSEHOLD, "prop-1", "valor", THIAGO)

    await respond_to_proposal(
        f.deps, _input(_action(action="escolher-conta", proposal_id="prop-1", bill_id="bill-agua"))
    )

    assert _get(f.proposal_repo, "prop-1").bill_id == "bill-agua"
    assert _get(f.proposal_repo, "prop-1").awaiting_field == "valor"
    # And the following text still writes the amount (doesn't become echo).
    text_deps = TextEditDeps(
        proposal_repo=f.deps.proposal_repo,
        bill_repo=f.deps.bill_repo,
        messenger=f.deps.messenger,
        clock=f.deps.clock,
    )
    consumed = await edit_text_field(
        text_deps, TextInput(household_id=HOUSEHOLD, sender=SENDER, person_id=THIAGO, text="50,00")
    )
    assert consumed is True
    assert _get(f.proposal_repo, "prop-1").amount_cents == 5000


async def test_interaction_with_expired_proposal_stamps_and_clears_without_confirming():
    # today > created_at(07-07) + 7d = 07-14 -> expired; tapping Confirm creates no fact.
    f = build(today=date(2026, 7, 20))

    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))

    assert len(await f.payment_repo.list_all_payments(HOUSEHOLD)) == 0
    assert _get(f.proposal_repo, "prop-1").state == "expirada"
    assert STAGING not in f.store.keys()  # noqa: SIM118 -- `.keys()` is a fake-only inspector, not a dict
    assert "expirou" in f.messenger.sent_texts[-1]["body"].lower()


async def test_nonexistent_proposal_points_to_resending():
    f = build()

    await respond_to_proposal(
        f.deps, _input(_action(action="confirmar", proposal_id="prop-fantasma"))
    )

    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_PROPOSAL_GONE


async def test_failure_creating_payment_keeps_proposal_open_and_asks_retry():
    f = build()
    f.payment_repo.create_payment = _boom  # type: ignore[method-assign]

    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))

    # CAS is the final commit: if record_payment fails, the state never turns —
    # stays `proposta` (never confirmed without a Payment) and retry is safe.
    assert len(await f.payment_repo.list_all_payments(HOUSEHOLD)) == 0
    assert _get(f.proposal_repo, "prop-1").state == "proposta"
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_TRY_CONFIRM_AGAIN


async def test_confirm_closed_bill_points_and_creates_no_payment():
    # The Proposal points to a Bill closed after the Proposal was made: never
    # records against an archived Bill (parity with the portal). bill_luz leaves
    # the active list.
    f = build(bills=[bill_luz(state="encerrada", closed_on=date(2026, 7, 6))])

    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))

    assert len(await f.payment_repo.list_all_payments(HOUSEHOLD)) == 0
    assert _get(f.proposal_repo, "prop-1").state == "proposta"
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_BILL_GONE


async def test_attachment_failure_compensates_payment_without_orphan():
    f = build()
    # record_payment creates the Payment; promoting the receipt fails right after.
    # Compensation DELETES the just-created Payment — the classic bug (an orphan
    # Payment that duplicates on retry) cannot exist.
    f.store.copy = _boom  # type: ignore[method-assign]

    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))

    assert len(await f.payment_repo.list_all_payments(HOUSEHOLD)) == 0
    assert _get(f.proposal_repo, "prop-1").state == "proposta"
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_TRY_CONFIRM_AGAIN


async def test_receipt_too_large_permanent_error_and_compensates():
    # Bytes above the ceiling (25 MB) passed the staging, but Confirm revalidates
    # the real metadata at the canonical key (register_attachment) -> raises.
    # PERMANENT error: distinct message (resending the same doesn't help), no orphan.
    f = build(staging_bytes=26 * 1024 * 1024)

    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))

    assert len(await f.payment_repo.list_all_payments(HOUSEHOLD)) == 0
    assert _get(f.proposal_repo, "prop-1").state == "proposta"
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_INVALID_RECEIPT


async def test_lost_race_on_commit_undoes_payment_and_warns_already_resolved():
    f = build()
    # Concurrent double-tap: the other click confirmed between the state check and
    # the CAS here -> confirm() returns None. The loser undoes what it created;
    # only the winner keeps the Payment (here, none — we simulate only the loser).
    f.proposal_repo.confirm = _return_none  # type: ignore[method-assign]

    await respond_to_proposal(f.deps, _input(_action(action="confirmar", proposal_id="prop-1")))

    assert len(await f.payment_repo.list_all_payments(HOUSEHOLD)) == 0
    keys = f.store.keys()
    assert not any(k.startswith(f"finance/payments/{HOUSEHOLD}/") for k in keys)
    assert f.messenger.sent_texts[-1]["body"] == MESSAGE_ALREADY_RESOLVED


# --- edit_text_field (menu Alterar by free text, #178) ---


def _text_deps(f: Fixture) -> TextEditDeps:
    return TextEditDeps(
        proposal_repo=f.deps.proposal_repo,
        bill_repo=f.deps.bill_repo,
        messenger=f.deps.messenger,
        clock=f.deps.clock,
    )


def _text_input(text: str) -> TextInput:
    return TextInput(household_id=HOUSEHOLD, sender=SENDER, person_id=THIAGO, text=text)


async def test_text_edits_amount_when_pending_and_re_offers():
    f = build()
    await f.proposal_repo.set_awaiting(HOUSEHOLD, "prop-1", "valor", THIAGO)

    consumed = await edit_text_field(_text_deps(f), _text_input("300,50"))

    assert consumed is True
    assert _get(f.proposal_repo, "prop-1").amount_cents == 30050
    # Pending edit cleared and Proposal re-offered with buttons.
    assert _get(f.proposal_repo, "prop-1").awaiting_field is None
    assert "R$ 300,50" in f.messenger.sent_buttons[-1]["body"]


async def test_text_edits_date_in_br_format():
    f = build()
    await f.proposal_repo.set_awaiting(HOUSEHOLD, "prop-1", "data", THIAGO)

    await edit_text_field(_text_deps(f), _text_input("10/06/2026"))

    assert _get(f.proposal_repo, "prop-1").paid_on == date(2026, 6, 10)


async def test_text_edits_payee_trimmed():
    f = build()
    await f.proposal_repo.set_awaiting(HOUSEHOLD, "prop-1", "favorecido", THIAGO)

    await edit_text_field(_text_deps(f), _text_input("  Enel SP  "))

    assert _get(f.proposal_repo, "prop-1").payee == "Enel SP"


async def test_text_not_matching_format_drops_edit_and_points_to_retap():
    f = build()
    await f.proposal_repo.set_awaiting(HOUSEHOLD, "prop-1", "valor", THIAGO)

    consumed = await edit_text_field(_text_deps(f), _text_input("sei lá"))

    assert consumed is True
    # Wrote no garbage; dropped the pendency (else the next loose text would stay
    # stuck here, never at the echo) and the message brings the example and points
    # to re-tapping the menu.
    assert _get(f.proposal_repo, "prop-1").amount_cents == 25343
    assert _get(f.proposal_repo, "prop-1").awaiting_field is None
    assert _get(f.proposal_repo, "prop-1").awaiting_person is None
    msg = f.messenger.sent_texts[-1]["body"]
    assert "Não entendi" in msg
    assert "Alterar" in msg
    assert "253,43" in msg


async def test_loose_text_after_parse_failure_goes_back_to_echo_not_consumed():
    f = build()
    await f.proposal_repo.set_awaiting(HOUSEHOLD, "prop-1", "valor", THIAGO)
    await edit_text_field(_text_deps(f), _text_input("sei lá"))

    # The following text has no more pending destination -> doesn't consume (edge echoes).
    consumed = await edit_text_field(_text_deps(f), _text_input("oi de novo"))

    assert consumed is False
    # The only output so far was the parse-failure guidance — nothing more.
    assert len(f.messenger.sent_texts) == 1


async def test_text_without_pending_edit_is_not_consumed_edge_echoes():
    f = build()

    consumed = await edit_text_field(_text_deps(f), _text_input("oi"))

    # Nothing pending -> False (the edge sends the usage echo); no reply from here.
    assert consumed is False
    assert len(f.messenger.sent_texts) == 0
    assert len(f.messenger.sent_buttons) == 0


# --- sweep_expired_proposals (Seam 1) ---


async def test_sweep_stamps_expired_and_clears_staging_of_old_ones_leaves_new_ones():
    old = proposal_seed(
        id="prop-velha",
        staging_key="finance/proposals/lar-1/prop-velha",
        created_at=date(2026, 6, 1),
    )
    new = proposal_seed(
        id="prop-nova",
        staging_key="finance/proposals/lar-1/prop-nova",
        created_at=date(2026, 7, 7),
    )
    proposal_repo = FakePaymentProposalRepo([old, new])
    store = FakeAttachmentStore(
        [
            FakeStoredObject(key=old.staging_key, size_bytes=1, mime_type="image/jpeg"),
            FakeStoredObject(key=new.staging_key, size_bytes=1, mime_type="image/jpeg"),
        ]
    )

    await sweep_expired_proposals(
        SweepDeps(proposal_repo=proposal_repo, store=store, clock=FixedClock(date(2026, 7, 8)))
    )

    assert _get(proposal_repo, "prop-velha").state == "expirada"
    assert _get(proposal_repo, "prop-nova").state == "proposta"
    keys = store.keys()
    assert old.staging_key not in keys
    assert new.staging_key in keys


# --- set_awaiting: one slot per Pessoa, in the right order (#178) ---


async def test_set_awaiting_on_open_releases_previous_slot_of_same_person():
    old = proposal_seed(id="prop-a", awaiting_field="data", awaiting_person=THIAGO)
    new = proposal_seed(id="prop-b", bytes_hash="hash-2")
    repo = FakePaymentProposalRepo([old, new])

    target = await repo.set_awaiting(HOUSEHOLD, "prop-b", "valor", THIAGO)

    assert target is not None
    assert target.awaiting_field == "valor"
    # The same person's old pendency was released — a single text destination.
    assert _get(repo, "prop-a").awaiting_field is None
    assert _get(repo, "prop-b").awaiting_field == "valor"


async def test_set_awaiting_on_closed_fails_cas_and_preserves_existing_pendency():
    # The target already left `proposta` (confirmed): the CAS doesn't take and
    # returns None. The right order (set before clearing) guarantees another
    # Proposal's pendency isn't zeroed by an invalid target.
    pending = proposal_seed(id="prop-a", awaiting_field="data", awaiting_person=THIAGO)
    closed = proposal_seed(id="prop-b", bytes_hash="hash-2", state="confirmada")
    repo = FakePaymentProposalRepo([pending, closed])

    target = await repo.set_awaiting(HOUSEHOLD, "prop-b", "valor", THIAGO)

    assert target is None
    assert _get(repo, "prop-a").awaiting_field == "data"
    assert _get(repo, "prop-a").awaiting_person == THIAGO
