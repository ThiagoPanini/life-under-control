"""Money in LUC is exact and in cents (invariant #6): integer, BRL, never float.

The only place where a monetary amount becomes text for the UI.
"""

import re

__all__ = ["cents_to_input_text", "format_brl", "format_brl_no_cents", "parse_brl"]

_THOUSANDS_GROUP_LEN = 3  # money has 2 decimal places -> a final group of 3 digits is thousands
_MIN_DECIMAL_PLACES = 1
_MAX_DECIMAL_PLACES = 2
_MAX_SAFE_CENTS = 2**53 - 1  # mirrors TS Number.isSafeInteger (no bigint overflow at the edge)

# re.ASCII: Python's \d matches Unicode digits; JS's is ASCII-only (TS parity).
_DIGITS_DOTS_COMMAS_ONLY = re.compile(r"[\d.,]+", re.ASCII)
_NORMALIZED_AMOUNT = re.compile(r"\d+(\.\d{1,2})?", re.ASCII)


def _ensure_int(cents: object) -> None:
    """Rejects a monetary amount that is not an integer in cents (invariant #6)."""
    if not isinstance(cents, int) or isinstance(cents, bool):
        raise ValueError(f"monetary amount must be an integer in cents, got: {cents}")


def _with_thousands_dot(reais: int) -> str:
    """Inserts the thousands dot into a whole amount of reais (1000000 -> "1.000.000")."""
    return f"{reais:,}".replace(",", ".")


def format_brl(cents: int) -> str:
    """Formats cents (integer) as BRL — "R$ 1.234,56" (dot as thousands separator)."""
    _ensure_int(cents)
    negative = cents < 0
    abs_cents = abs(cents)
    reais = abs_cents // 100
    remainder = abs_cents % 100
    return f"{'-' if negative else ''}R$ {_with_thousands_dot(reais)},{remainder:02d}"


def format_brl_no_cents(cents: int) -> str:
    """Formats cents as BRL with no decimal places — "R$ 1.240" (an estimate, ≈).

    Rounds to the nearest real using integer arithmetic (no float): an average must
    not fake the precision of a fact. Exact facts stay in `format_brl`.
    """
    _ensure_int(cents)
    negative = cents < 0
    reais = (abs(cents) + 50) // 100
    return f"{'-' if negative else ''}R$ {_with_thousands_dot(reais)}"


def parse_brl(text: str) -> int | None:
    """Reads a typed BRL amount into integer cents — `None` if invalid or non-positive.

    Accepts the Brazilian format with thousands ("1.234,56" · "1.500"), the decimal
    comma without thousands ("19,99") and the numeric-keypad decimal dot ("1234.56"),
    plus whole reais ("1500" -> R$ 1.500,00). Rejects more than 2 decimal places, a
    negative sign and unexpected characters. No float: cents are assembled from the
    integer parts.
    """
    cleaned = re.sub(r"^R\$", "", text.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s", "", cleaned)
    if cleaned == "" or not _DIGITS_DOTS_COMMAS_ONLY.fullmatch(cleaned):
        return None

    if "," in cleaned:
        # The comma is the decimal separator; dots are thousands.
        normalized = cleaned.replace(".", "").replace(",", ".")
    else:
        normalized = _normalize_dots_only(cleaned)
    if normalized is None or not _NORMALIZED_AMOUNT.fullmatch(normalized):
        return None

    reais, _, frac = normalized.partition(".")
    cents = int(reais) * 100 + int(frac.ljust(2, "0"))
    if cents <= 0 or cents > _MAX_SAFE_CENTS:
        return None
    return cents


def _normalize_dots_only(cleaned: str) -> str | None:
    """Resolves the comma-less dot ambiguity: thousands (final group of 3) vs decimal.

    "1.500" -> "1500" (thousands); "129.90" -> "129.90" (decimal, with earlier dots
    as thousands). `None` when the shape fits neither.
    """
    if "." not in cleaned:
        return cleaned
    parts = cleaned.split(".")
    last_len = len(parts[-1])
    if last_len == _THOUSANDS_GROUP_LEN:
        return "".join(parts)
    if _MIN_DECIMAL_PLACES <= last_len <= _MAX_DECIMAL_PLACES:
        decimals = parts.pop()
        return f"{''.join(parts)}.{decimals}"
    return None


def cents_to_input_text(cents: int) -> str:
    """Projects cents into the text the amount input edits ("1234,56", no thousands).

    Round-trips with `parse_brl`. Distinct from `format_brl`, which is for display.
    """
    _ensure_int(cents)
    reais = abs(cents) // 100
    remainder = abs(cents) % 100
    # int has no -0: below 1 whole real the sign vanishes (mirrors TS String(-0) ->
    # "0"); there is only a sign when a negative whole real exists.
    if cents < 0:
        reais = -reais
    return f"{reais},{remainder:02d}"
