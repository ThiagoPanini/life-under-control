"""Dinheiro no LUC é exato e em centavos (invariante #6): inteiro, BRL, nunca float.

É a única forma de virar valor monetário em texto para a UI.
"""

import re

_TAM_GRUPO_MILHAR = 3  # dinheiro tem 2 casas → grupo final de 3 dígitos é milhar
_MIN_CASAS_DECIMAIS = 1
_MAX_CASAS_DECIMAIS = 2
_MAX_CENTAVOS_SEGURO = 2**53 - 1  # espelha Number.isSafeInteger do TS (não estoura o bigint)

# re.ASCII: o \d do Python casa dígitos Unicode; o do JS é ASCII-only (paridade TS).
_SO_DIGITOS_PONTO_VIRGULA = re.compile(r"[\d.,]+", re.ASCII)
_VALOR_NORMALIZADO = re.compile(r"\d+(\.\d{1,2})?", re.ASCII)


def _garantir_inteiro(cents: object) -> None:
    """Rejeita valor monetário que não seja inteiro em centavos (invariante #6)."""
    if not isinstance(cents, int) or isinstance(cents, bool):
        raise ValueError(f"valor monetário deve ser inteiro em centavos, recebido: {cents}")


def _com_milhar(reais: int) -> str:
    """Insere o ponto de milhar num inteiro de reais (1000000 → "1.000.000")."""
    return f"{reais:,}".replace(",", ".")


def format_brl(cents: int) -> str:
    """Formata centavos (inteiro) como BRL — "R$ 1.234,56" (milhar com ponto)."""
    _garantir_inteiro(cents)
    negativo = cents < 0
    abs_cents = abs(cents)
    reais = abs_cents // 100
    centavos = abs_cents % 100
    return f"{'-' if negativo else ''}R$ {_com_milhar(reais)},{centavos:02d}"


def format_brl_sem_centavos(cents: int) -> str:
    """Formata centavos como BRL sem casa decimal — "R$ 1.240" (estimativa, ≈).

    Arredonda ao real mais próximo por aritmética inteira (sem float): uma média
    não finge a precisão de um fato. Fatos exatos continuam em `format_brl`.
    """
    _garantir_inteiro(cents)
    negativo = cents < 0
    reais = (abs(cents) + 50) // 100
    return f"{'-' if negativo else ''}R$ {_com_milhar(reais)}"


def parse_centavos(texto: str) -> int | None:
    """Lê um valor BRL digitado em centavos inteiros — `None` se inválido/não-positivo.

    Aceita o formato brasileiro com milhar ("1.234,56" · "1.500"), a vírgula
    decimal sem milhar ("19,99") e o ponto decimal do teclado numérico
    ("1234.56"), além do inteiro de reais ("1500" → R$ 1.500,00). Recusa mais de
    2 casas decimais, sinal negativo e caractere fora do esperado. Sem float:
    monta os centavos a partir das partes inteiras.
    """
    limpo = re.sub(r"^R\$", "", texto.strip(), flags=re.IGNORECASE)
    limpo = re.sub(r"\s", "", limpo)
    if limpo == "" or not _SO_DIGITOS_PONTO_VIRGULA.fullmatch(limpo):
        return None

    if "," in limpo:
        # Vírgula é o decimal; pontos são de milhar.
        normal = limpo.replace(".", "").replace(",", ".")
    else:
        normal = _normalizar_so_com_pontos(limpo)
    if normal is None or not _VALOR_NORMALIZADO.fullmatch(normal):
        return None

    reais, _, frac = normal.partition(".")
    centavos = int(reais) * 100 + int(frac.ljust(2, "0"))
    if centavos <= 0 or centavos > _MAX_CENTAVOS_SEGURO:
        return None
    return centavos


def _normalizar_so_com_pontos(limpo: str) -> str | None:
    """Resolve a ambiguidade do ponto sem vírgula: milhar (grupo final de 3) vs decimal.

    "1.500" → "1500" (milhar); "129.90" → "129.90" (decimal, com pontos
    anteriores como milhar). `None` se a forma não couber em nenhum dos dois.
    """
    if "." not in limpo:
        return limpo
    partes = limpo.split(".")
    tam_ultima = len(partes[-1])
    if tam_ultima == _TAM_GRUPO_MILHAR:
        return "".join(partes)
    if _MIN_CASAS_DECIMAIS <= tam_ultima <= _MAX_CASAS_DECIMAIS:
        dec = partes.pop()
        return f"{''.join(partes)}.{dec}"
    return None


def centavos_para_campo(cents: int) -> str:
    """Projeta centavos no texto que o campo de valor edita ("1234,56", sem milhar).

    Round-trip com `parse_centavos`. Distinto de `format_brl`, que é para exibir.
    """
    _garantir_inteiro(cents)
    reais = abs(cents) // 100
    centavos = abs(cents) % 100
    # int não tem -0: quando |cents| < 1 real, o sinal some (espelha String(-0) -> "0"
    # do TS); só há sinal quando existe real inteiro negativo.
    if cents < 0:
        reais = -reais
    return f"{reais},{centavos:02d}"
