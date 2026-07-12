"""Dinheiro é exato e em centavos (invariante #6): suíte portada 1:1 do TS."""

import pytest

from luc_api.shared.domain.money import (
    centavos_para_campo,
    format_brl,
    format_brl_sem_centavos,
    parse_centavos,
)


# --- format_brl ---------------------------------------------------------------
def test_zero_centavos_retorna_real_zerado():
    # given um valor zerado em centavos / when formatado / then mostra R$ 0,00
    assert format_brl(0) == "R$ 0,00"


def test_valor_com_centavos_usa_virgula_decimal():
    assert format_brl(980_00) == "R$ 980,00"
    assert format_brl(5) == "R$ 0,05"
    assert format_brl(199) == "R$ 1,99"


def test_milhar_usa_ponto_separador():
    assert format_brl(3_751_20) == "R$ 3.751,20"
    assert format_brl(1_000_000_00) == "R$ 1.000.000,00"


def test_valor_negativo_prefixa_sinal():
    assert format_brl(-980_00) == "-R$ 980,00"


def test_centavos_nao_inteiro_lanca_erro():
    with pytest.raises(ValueError, match="inteiro em centavos"):
        format_brl(10.5)  # type: ignore[arg-type]


# --- parse_centavos -----------------------------------------------------------
def test_aceita_formato_br_com_milhar_e_virgula():
    assert parse_centavos("1.234,56") == 123456
    assert parse_centavos("R$ 1.234,56") == 123456


def test_aceita_virgula_sem_milhar():
    assert parse_centavos("19,99") == 1999
    assert parse_centavos("1234,5") == 123450


def test_aceita_ponto_decimal_do_teclado_numerico():
    assert parse_centavos("1234.56") == 123456
    assert parse_centavos("129.90") == 12990


def test_aceita_ponto_de_milhar_sem_virgula():
    assert parse_centavos("1.500") == 150000
    assert parse_centavos("1.234.567") == 123456700


def test_inteiro_sem_decimal_vira_reais():
    assert parse_centavos("1234") == 123400
    assert parse_centavos("100") == 10000


def test_recusa_vazio_e_lixo():
    assert parse_centavos("") is None
    assert parse_centavos("  ") is None
    assert parse_centavos("abc") is None
    assert parse_centavos("1,234") is None  # 3 casas decimais não é dinheiro
    assert parse_centavos("-10,00") is None  # negativo não é uma baixa


# --- centavos_para_campo ------------------------------------------------------
def test_projeta_centavos_em_texto_de_input():
    assert centavos_para_campo(123456) == "1234,56"
    assert centavos_para_campo(1999) == "19,99"
    assert centavos_para_campo(5) == "0,05"
    assert centavos_para_campo(10000) == "100,00"


def test_round_trip_com_parse_centavos():
    assert parse_centavos(centavos_para_campo(123456)) == 123456


# --- format_brl_sem_centavos --------------------------------------------------
def test_arredonda_estimativa_para_reais_inteiros():
    assert format_brl_sem_centavos(123958) == "R$ 1.240"
    assert format_brl_sem_centavos(123901) == "R$ 1.239"


def test_milhar_com_ponto_e_sem_casa_decimal():
    assert format_brl_sem_centavos(1234500) == "R$ 12.345"
    assert format_brl_sem_centavos(9900) == "R$ 99"


def test_recusa_nao_inteiro_como_format_brl():
    with pytest.raises(ValueError):
        format_brl_sem_centavos(10.5)  # type: ignore[arg-type]


# --- paridade com o TS (achados de review) ------------------------------------
def test_recusa_digito_unicode_nao_ascii():
    # `\d` do Python casaria dígitos Unicode; o do JS é ASCII-only.
    assert parse_centavos("١٩,٩٩") is None


def test_recusa_valor_acima_do_inteiro_seguro():
    # Espelha o Number.isSafeInteger do TS — não deixa estourar o bigint na borda.
    assert parse_centavos("99999999999999999999") is None


def test_negativo_sub_real_perde_o_sinal_como_no_ts():
    # |cents| < 1 real: String(-0) → "0" no TS; real inteiro negativo mantém sinal.
    assert centavos_para_campo(-5) == "0,05"
    assert centavos_para_campo(-150) == "-1,50"
