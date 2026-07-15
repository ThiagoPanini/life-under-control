"""Seam 0: pure normalization of a BR phone number to E.164 (issue #152)."""

from luc_api.identity.domain.phone import normalize_phone_e164


def test_number_with_country_code_and_ninth_digit_normalizes():
    assert normalize_phone_e164("+5511987654321") == "+5511987654321"


def test_number_without_country_code_normalizes():
    assert normalize_phone_e164("11987654321") == "+5511987654321"


def test_masked_number_normalizes():
    assert normalize_phone_e164("(11) 98765-4321") == "+5511987654321"


def test_number_with_country_code_and_mask_normalizes():
    assert normalize_phone_e164("+55 (11) 98765-4321") == "+5511987654321"


def test_landline_without_ninth_digit_normalizes():
    assert normalize_phone_e164("(11) 3665-4321") == "+551136654321"


def test_short_number_is_invalid():
    assert normalize_phone_e164("123") is None


def test_number_with_letters_is_invalid():
    assert normalize_phone_e164("telefone") is None


def test_empty_number_is_invalid():
    assert normalize_phone_e164("") is None


def test_too_long_number_is_invalid():
    assert normalize_phone_e164("551198765432199") is None
