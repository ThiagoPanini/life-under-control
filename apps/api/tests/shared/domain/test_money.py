"""Money is exact and in cents (invariant #6): suite ported 1:1 from the TS oracle."""

import pytest

from luc_api.shared.domain.money import (
    cents_to_input_text,
    format_brl,
    format_brl_no_cents,
    parse_brl,
)


# --- format_brl ---------------------------------------------------------------
def test_zero_cents_formats_as_zero_reais():
    assert format_brl(0) == "R$ 0,00"


def test_amount_with_cents_uses_decimal_comma():
    assert format_brl(980_00) == "R$ 980,00"
    assert format_brl(5) == "R$ 0,05"
    assert format_brl(199) == "R$ 1,99"


def test_thousands_use_dot_separator():
    assert format_brl(3_751_20) == "R$ 3.751,20"
    assert format_brl(1_000_000_00) == "R$ 1.000.000,00"


def test_negative_amount_gets_sign_prefix():
    assert format_brl(-980_00) == "-R$ 980,00"


def test_non_integer_cents_raises_error():
    with pytest.raises(ValueError, match="integer in cents"):
        format_brl(10.5)  # type: ignore[arg-type]


# --- parse_brl ------------------------------------------------------------
def test_accepts_br_format_with_thousands_and_comma():
    assert parse_brl("1.234,56") == 123456
    assert parse_brl("R$ 1.234,56") == 123456


def test_accepts_decimal_comma_without_thousands():
    assert parse_brl("19,99") == 1999
    assert parse_brl("1234,5") == 123450


def test_accepts_numeric_keypad_decimal_dot():
    assert parse_brl("1234.56") == 123456
    assert parse_brl("129.90") == 12990


def test_accepts_thousands_dot_without_comma():
    assert parse_brl("1.500") == 150000
    assert parse_brl("1.234.567") == 123456700


def test_integer_without_decimals_means_whole_reais():
    assert parse_brl("1234") == 123400
    assert parse_brl("100") == 10000


def test_rejects_empty_and_garbage():
    assert parse_brl("") is None
    assert parse_brl("  ") is None
    assert parse_brl("abc") is None
    assert parse_brl("1,234") is None  # 3 decimal places is not money
    assert parse_brl("-10,00") is None  # a negative amount never settles a payment


# --- cents_to_input_text ------------------------------------------------------
def test_projects_cents_into_input_text():
    assert cents_to_input_text(123456) == "1234,56"
    assert cents_to_input_text(1999) == "19,99"
    assert cents_to_input_text(5) == "0,05"
    assert cents_to_input_text(10000) == "100,00"


def test_round_trips_with_parse_brl():
    assert parse_brl(cents_to_input_text(123456)) == 123456


# --- format_brl_no_cents --------------------------------------------------
def test_rounds_estimate_to_whole_reais():
    assert format_brl_no_cents(123958) == "R$ 1.240"
    assert format_brl_no_cents(123901) == "R$ 1.239"


def test_thousands_dot_and_no_decimal_places():
    assert format_brl_no_cents(1234500) == "R$ 12.345"
    assert format_brl_no_cents(9900) == "R$ 99"


def test_rejects_non_integer_like_format_brl():
    with pytest.raises(ValueError):
        format_brl_no_cents(10.5)  # type: ignore[arg-type]


# --- TS parity (review findings) ------------------------------------------
def test_rejects_non_ascii_unicode_digits():
    # Python's `\d` would match Unicode digits; JS's is ASCII-only.
    assert parse_brl("١٩,٩٩") is None


def test_rejects_amount_above_the_safe_integer():
    # Mirrors TS Number.isSafeInteger — keeps the edge bigint from overflowing.
    assert parse_brl("99999999999999999999") is None


def test_negative_below_one_real_drops_the_sign_like_ts():
    # |cents| < 1 real: String(-0) -> "0" in TS; a negative whole real keeps the sign.
    assert cents_to_input_text(-5) == "0,05"
    assert cents_to_input_text(-150) == "-1,50"
