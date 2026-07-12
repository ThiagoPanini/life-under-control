"""Datas civis (YYYY-MM-DD): validação, formatação pt-BR e parse do chat (1:1 TS)."""

from luc_api.shared.domain.civil_date import (
    dia_da_semana_abreviado,
    eh_competencia_valida,
    eh_data_iso_valida,
    formatar_data_br,
    parse_data_br_para_iso,
)

HOJE = "2026-07-08"


# --- parse_data_br_para_iso (portado 1:1 de parse-data-br.test.ts) ------------
def test_dia_mes_ano_completo_vira_iso():
    assert parse_data_br_para_iso("05/07/2026", HOJE) == "2026-07-05"


def test_um_digito_em_dia_e_mes_normaliza_com_zero():
    assert parse_data_br_para_iso("5/7/2026", HOJE) == "2026-07-05"


def test_sem_ano_infere_o_ano_de_hoje():
    assert parse_data_br_para_iso("05/07", HOJE) == "2026-07-05"


def test_sem_ano_que_cairia_no_futuro_recua_um_ano():
    # Hoje 08/01/2026; comprovante de 31/12 é do ano passado (fato passado).
    assert parse_data_br_para_iso("31/12", "2026-01-08") == "2025-12-31"


def test_ano_de_dois_digitos_assume_2000():
    assert parse_data_br_para_iso("05/07/26", HOJE) == "2026-07-05"


def test_data_impossivel_no_mes_curto_devolve_null():
    assert parse_data_br_para_iso("31/04/2026", HOJE) is None


def test_29_de_fevereiro_em_ano_nao_bissexto_devolve_null():
    assert parse_data_br_para_iso("29/02/2025", HOJE) is None


def test_29_de_fevereiro_em_ano_bissexto_vale():
    assert parse_data_br_para_iso("29/02/2024", HOJE) == "2024-02-29"


def test_29_de_fevereiro_sem_ano_recua_ate_o_bissexto_anterior():
    # 2026 e 2025 não têm 29/02 — a ocorrência passada mais recente é 2024.
    assert parse_data_br_para_iso("29/02", HOJE) == "2024-02-29"


def test_sem_ano_no_mesmo_dia_de_hoje_vale_hoje():
    assert parse_data_br_para_iso("08/07", HOJE) == "2026-07-08"


def test_lixo_e_formato_errado_devolvem_null():
    assert parse_data_br_para_iso("ontem", HOJE) is None
    assert parse_data_br_para_iso("2026-07-05", HOJE) is None
    assert parse_data_br_para_iso("05-07-2026", HOJE) is None
    assert parse_data_br_para_iso("", HOJE) is None
    assert parse_data_br_para_iso("13/13/2026", HOJE) is None


# --- eh_data_iso_valida -------------------------------------------------------
def test_data_iso_real_e_valida():
    assert eh_data_iso_valida("2026-07-06") is True


def test_data_iso_com_dia_inexistente_e_invalida():
    assert eh_data_iso_valida("2025-02-29") is False
    assert eh_data_iso_valida("2026-04-31") is False


def test_formato_torto_nao_e_data_iso():
    assert eh_data_iso_valida("2026-7-6") is False
    assert eh_data_iso_valida("06/07/2026") is False


# --- formatar_data_br ---------------------------------------------------------
def test_formata_iso_em_pt_br():
    assert formatar_data_br("2026-06-29") == "29/06/2026"


# --- eh_competencia_valida ----------------------------------------------------
def test_competencia_ano_mes_valida():
    assert eh_competencia_valida("2026-07") is True


def test_competencia_com_mes_fora_da_faixa_e_invalida():
    assert eh_competencia_valida("2026-13") is False
    assert eh_competencia_valida("2026-00") is False
    assert eh_competencia_valida("2026-07-01") is False


# --- dia_da_semana_abreviado --------------------------------------------------
def test_dia_da_semana_abreviado_de_data_iso():
    # 2026-07-06 é segunda-feira.
    assert dia_da_semana_abreviado("2026-07-06") == "seg"


def test_dia_da_semana_cobre_domingo_e_sabado():
    # Boundary do shift domingo=0 ((weekday()+1)%7): 05/07 é domingo, 11/07 é sábado.
    assert dia_da_semana_abreviado("2026-07-05") == "dom"
    assert dia_da_semana_abreviado("2026-07-11") == "sáb"


# --- paridade com o TS (achados de review) ------------------------------------
def test_rejeita_data_iso_com_newline_final():
    # O `$` do Python casaria antes do `\n`; `\Z` fecha a brecha (paridade JS).
    assert eh_data_iso_valida("2026-07-06\n") is False
    assert eh_competencia_valida("2026-07\n") is False


def test_rejeita_digito_unicode_em_data_iso():
    assert eh_data_iso_valida("۲۰۲۶-۰۷-۰۶") is False  # noqa: RUF001  (dígitos não-ASCII de propósito)


def test_sem_ano_recua_ate_o_pior_caso_de_8_anos():
    # 29/02 na virada de século não-bissexta: hoje em 2104 (antes de 29/02) → 2096.
    assert parse_data_br_para_iso("29/02", "2104-01-15") == "2096-02-29"
