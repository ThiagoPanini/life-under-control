"""Datas civis do domínio (YYYY-MM-DD), no fuso do Lar — nunca timestamps (#3).

Validação, formatação pt-BR e parse do que o casal digita no chat. Puro: o "hoje"
é sempre injetado, sem relógio.
"""

import re
from datetime import date

DIAS_SEMANA_CURTOS = ("dom", "seg", "ter", "qua", "qui", "sex", "sáb")

_DIGITOS_ANO_CURTO = 2  # "26" → 2026
_MAX_RECUO_ANOS = 8  # pior caso: intervalo entre dois 29/02 (virada de século)

# re.ASCII: \d do Python casa dígitos Unicode (o do JS é ASCII-only). \Z, não $: o $
# do Python casa antes de um \n final e aceitaria lixo com newline.
_DATA_ISO = re.compile(r"\A\d{4}-\d{2}-\d{2}\Z", re.ASCII)
_COMPETENCIA = re.compile(r"\A\d{4}-(0[1-9]|1[0-2])\Z", re.ASCII)
_DATA_BR = re.compile(r"\A(\d{1,2})/(\d{1,2})(?:/(\d{2}|\d{4}))?\Z", re.ASCII)


def dia_da_semana_abreviado(iso: str) -> str:
    """Dia da semana abreviado de uma data civil ISO ("2026-07-06" → "seg")."""
    ano, mes, dia = (int(p) for p in iso.split("-"))
    # `weekday()` tem segunda=0; deslocamos para domingo=0 (como o TS getUTCDay).
    return DIAS_SEMANA_CURTOS[(date(ano, mes, dia).weekday() + 1) % 7]


def eh_competencia_valida(s: str) -> bool:
    """É uma Competência `ano-mês` (YYYY-MM) com mês entre 01 e 12?"""
    return _COMPETENCIA.match(s) is not None


def eh_data_iso_valida(s: str) -> bool:
    """É uma data civil ISO (YYYY-MM-DD) real?

    Rejeita formato torto, mês fora de 1-12 e dia inexistente (29/02 em ano comum,
    31 de mês curto). O domínio trabalha em datas civis, não timestamps (#3).
    """
    if not _DATA_ISO.match(s):
        return False
    ano, mes, dia = (int(p) for p in s.split("-"))
    try:
        date(ano, mes, dia)
    except ValueError:
        return False
    return True


def formatar_data_br(iso: str) -> str:
    """Formata uma data civil ISO em pt-BR ("2026-06-29" → "29/06/2026")."""
    ano, mes, dia = iso.split("-")
    return f"{dia}/{mes}/{ano}"


def parse_data_br_para_iso(texto: str, hoje_iso: str) -> str | None:
    """Lê `dd/mm` ou `dd/mm/aaaa` (ano de 2 ou 4 dígitos) → ISO, ou `None` se irreal.

    Sem ano, pega a ocorrência passada mais recente — um comprovante é sempre
    pagamento já feito (nunca futuro): recua ano a ano de `hoje_iso` até casar uma
    data real que não seja futura. Puro: `hoje_iso` é injetado, sem relógio.
    """
    m = _DATA_BR.match(texto.strip())
    if not m:
        return None

    dia = m.group(1).rjust(2, "0")
    mes = m.group(2).rjust(2, "0")

    if m.group(3) is not None:
        # Ano explícito: intenção do casal — valida a realidade, sem forçar passado.
        ano_bruto = m.group(3)
        ano = f"20{ano_bruto}" if len(ano_bruto) == _DIGITOS_ANO_CURTO else ano_bruto
        iso = f"{ano}-{mes}-{dia}"
        return iso if eh_data_iso_valida(iso) else None

    # Sem ano: desce do ano de hoje até a 1ª ocorrência real e não-futura.
    ano_hoje = int(hoje_iso[:4])
    # range exclui o fim; o -1 inclui o recuo cheio de _MAX_RECUO_ANOS anos (pior caso
    # 29/02 na virada de século não-bissexta: 2096, 8 anos atrás de 2104).
    for ano_n in range(ano_hoje, ano_hoje - _MAX_RECUO_ANOS - 1, -1):
        iso = f"{ano_n}-{mes}-{dia}"
        if eh_data_iso_valida(iso) and iso <= hoje_iso:
            return iso
    return None
