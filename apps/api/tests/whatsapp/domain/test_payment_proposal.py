"""Payment Proposal (Proposta de Lançamento) — pure core: suite ported 1:1 from the TS oracle.

Oracle: apps/web/src/core/domain/payment-proposal.test.ts.
"""

from dataclasses import replace
from datetime import date

from luc_api.whatsapp.domain.payment_proposal import (
    BillOption,
    ProposalSummary,
    bill_rows,
    expired_proposal_message,
    field_edit_prompt,
    field_not_understood_message,
    field_rows,
    format_payment_created,
    format_proposal_message,
    is_expired,
    is_free_text_field,
    parse_button_action,
    proposal_buttons,
    reference_period_rows,
    staging_key_for,
)

# --- staging_key_for ---


def test_staging_key_prefixes_area_and_household_without_a_payment_yet():
    # The Proposal has no Payment yet — the key is transitory (not the canonical
    # `finance/payments/{household}/{payment}/{attachment}`), promoted only on Confirm.
    assert staging_key_for("household-1", "prop-1") == "finance/proposals/household-1/prop-1"


# --- proposal_buttons ---


def test_three_buttons_confirm_change_cancel_carry_the_proposal_id():
    assert proposal_buttons("prop-1") == [
        {"id": "confirmar:prop-1", "label": "Confirmar"},
        {"id": "alterar:prop-1", "label": "Alterar"},
        {"id": "cancelar:prop-1", "label": "Cancelar"},
    ]


# --- format_proposal_message ---


_BASE_SUMMARY = ProposalSummary(
    bill_name="Condomínio",
    amount="R$ 1.234,56",
    paid_on="07/07/2026",
    reference_period="Julho/2026",
)


def _summary(**over: object) -> ProposalSummary:
    return replace(_BASE_SUMMARY, **over)  # type: ignore[arg-type]


def test_full_proposal_lists_bill_amount_paid_on_and_reference_period():
    msg = format_proposal_message(_summary())

    assert "Condomínio" in msg
    assert "R$ 1.234,56" in msg
    assert "07/07/2026" in msg
    assert "Julho/2026" in msg


def test_illegible_amount_is_flagged_blank_never_guessed():
    msg = format_proposal_message(_summary(amount=None))

    assert "não consegui ler" in msg
    assert "R$ 0" not in msg


def test_unidentified_bill_points_to_change():
    msg = format_proposal_message(_summary(bill_name=None))

    assert "Alterar" in msg


# --- parse_button_action ---


def test_confirm_cancel_button_returns_action_and_proposal():
    assert parse_button_action("confirmar:prop-1") == {
        "action": "confirmar",
        "proposal_id": "prop-1",
    }
    assert parse_button_action("cancelar:prop-1") == {"action": "cancelar", "proposal_id": "prop-1"}


def test_change_button_and_legacy_swap_fall_into_the_same_action():
    assert parse_button_action("alterar:prop-1") == {"action": "alterar", "proposal_id": "prop-1"}
    # A "Trocar Conta" button from a pre-#178 Proposal still routes to the menu.
    assert parse_button_action("trocar:prop-1") == {"action": "alterar", "proposal_id": "prop-1"}


def test_list_row_returns_choose_bill_with_bill_id():
    assert parse_button_action("conta:prop-1:bill-luz") == {
        "action": "escolher-conta",
        "proposal_id": "prop-1",
        "bill_id": "bill-luz",
    }


def test_field_row_returns_choose_field_validated():
    assert parse_button_action("campo:prop-1:valor") == {
        "action": "escolher-campo",
        "proposal_id": "prop-1",
        "field": "valor",
    }
    # A field outside the known set -> None (never guessed).
    assert parse_button_action("campo:prop-1:apagar") is None


def test_month_row_returns_choose_month_with_valid_reference_period():
    assert parse_button_action("mes:prop-1:2026-07") == {
        "action": "escolher-mes",
        "proposal_id": "prop-1",
        "reference_period": "2026-07",
    }
    # Malformed reference period -> None.
    assert parse_button_action("mes:prop-1:2026-13") is None


def test_unrecognized_id_returns_none_never_guessed():
    assert parse_button_action("oi") is None
    assert parse_button_action("apagar:prop-1") is None
    assert parse_button_action("confirmar:") is None
    assert parse_button_action("conta:prop-1") is None


# --- menu Alterar ---


def test_menu_rows_cover_the_five_editable_fields():
    rows = field_rows("prop-1")

    assert [r["id"] for r in rows] == [
        "campo:prop-1:conta",
        "campo:prop-1:competencia",
        "campo:prop-1:valor",
        "campo:prop-1:data",
        "campo:prop-1:favorecido",
    ]
    # Each row re-parses to the right field (round-trip with the parser).
    assert parse_button_action(rows[2]["id"]) == {
        "action": "escolher-campo",
        "proposal_id": "prop-1",
        "field": "valor",
    }


def test_month_rows_label_in_full_and_carry_the_reference_period():
    rows = reference_period_rows("prop-1", ["2026-06", "2026-07"])

    assert rows == [
        {"id": "mes:prop-1:2026-06", "label": "Junho de 2026"},
        {"id": "mes:prop-1:2026-07", "label": "Julho de 2026"},
    ]


def test_is_free_text_field_separates_free_text_from_list():
    assert is_free_text_field("valor") is True
    assert is_free_text_field("data") is True
    assert is_free_text_field("favorecido") is True
    assert is_free_text_field("conta") is False
    assert is_free_text_field("competencia") is False


def test_free_text_field_prompt_brings_an_example():
    assert "253,43" in field_edit_prompt("valor")
    assert "05/07/2026" in field_edit_prompt("data")
    assert "favorecido" in field_edit_prompt("favorecido").lower()


def test_parse_failure_message_brings_example_and_points_to_re_tapping():
    # Drops the pendency -> the message doesn't say "send again" as if still waiting:
    # it points to re-tapping Alterar -> field, with the example (never traps waiting).
    assert "253,43" in field_not_understood_message("valor")
    assert "05/07/2026" in field_not_understood_message("data")
    for field in ("valor", "data", "favorecido"):
        assert "Alterar" in field_not_understood_message(field)
        assert "Não entendi" in field_not_understood_message(field)


# --- bill_rows ---


def test_each_bill_becomes_a_row_with_the_proposal_id_and_the_bill_id():
    rows = bill_rows(
        "prop-1",
        [BillOption(bill_id="bill-luz", name="Luz"), BillOption(bill_id="bill-agua", name="Água")],
    )

    assert rows == [
        {"id": "conta:prop-1:bill-luz", "label": "Luz"},
        {"id": "conta:prop-1:bill-agua", "label": "Água"},
    ]


def test_long_title_is_cut_at_the_whatsapp_limit():
    [row] = bill_rows(
        "prop-1",
        [
            BillOption(
                bill_id="b", name="Conta com um nome bem maior que o limite de vinte e quatro"
            )
        ],
    )

    assert len(row["label"]) <= 24
    assert parse_button_action(row["id"]) == {
        "action": "escolher-conta",
        "proposal_id": "prop-1",
        "bill_id": "b",
    }


# --- is_expired ---


def test_within_ttl_has_not_expired():
    assert is_expired(date(2026, 7, 7), date(2026, 7, 14)) is False


def test_past_ttl_has_expired():
    assert is_expired(date(2026, 7, 7), date(2026, 7, 15)) is True


# --- messages ---


def test_expired_proposal_points_to_resending():
    assert "expirou" in expired_proposal_message().lower()


def test_payment_created_confirms_the_registration():
    msg = format_payment_created(
        ProposalSummary(
            bill_name="Luz",
            amount="R$ 253,43",
            paid_on="05/07/2026",
            reference_period="Julho/2026",
        )
    )

    assert "Registrei" in msg
    assert "Luz" in msg
    assert "R$ 253,43" in msg
    assert "Julho/2026" in msg
