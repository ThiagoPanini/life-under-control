"""Civil dates: validation, pt-BR formatting and chat parsing (1:1 with the TS oracle)."""

from datetime import date

from luc_api.shared.domain.civil_date import (
    format_br_date,
    is_valid_reference_period,
    parse_br_date,
    parse_iso_date,
    weekday_abbrev,
)

TODAY = date(2026, 7, 8)


# --- parse_br_date (ported 1:1 from parse-data-br.test.ts) ---------------------
def test_full_day_month_year_parses_to_date():
    assert parse_br_date("05/07/2026", TODAY) == date(2026, 7, 5)


def test_single_digit_day_and_month_are_normalized():
    assert parse_br_date("5/7/2026", TODAY) == date(2026, 7, 5)


def test_without_year_infers_todays_year():
    assert parse_br_date("05/07", TODAY) == date(2026, 7, 5)


def test_without_year_that_would_land_in_the_future_goes_back_one_year():
    # Today 2026-01-08; a Dec 31 receipt is from last year (a past fact).
    assert parse_br_date("31/12", date(2026, 1, 8)) == date(2025, 12, 31)


def test_two_digit_year_assumes_the_2000s():
    assert parse_br_date("05/07/26", TODAY) == date(2026, 7, 5)


def test_impossible_day_in_a_short_month_returns_none():
    assert parse_br_date("31/04/2026", TODAY) is None


def test_feb_29_in_a_common_year_returns_none():
    assert parse_br_date("29/02/2025", TODAY) is None


def test_feb_29_in_a_leap_year_is_real():
    assert parse_br_date("29/02/2024", TODAY) == date(2024, 2, 29)


def test_feb_29_without_year_goes_back_to_the_previous_leap_year():
    # 2026 and 2025 have no Feb 29 — the most recent past occurrence is 2024.
    assert parse_br_date("29/02", TODAY) == date(2024, 2, 29)


def test_without_year_on_todays_own_date_is_today():
    assert parse_br_date("08/07", TODAY) == date(2026, 7, 8)


def test_garbage_and_wrong_shapes_return_none():
    assert parse_br_date("ontem", TODAY) is None
    assert parse_br_date("2026-07-05", TODAY) is None
    assert parse_br_date("05-07-2026", TODAY) is None
    assert parse_br_date("", TODAY) is None
    assert parse_br_date("13/13/2026", TODAY) is None


# --- parse_iso_date -------------------------------------------------------------
def test_a_real_iso_date_parses_to_date():
    assert parse_iso_date("2026-07-06") == date(2026, 7, 6)


def test_an_iso_date_with_a_nonexistent_day_returns_none():
    assert parse_iso_date("2025-02-29") is None
    assert parse_iso_date("2026-04-31") is None


def test_a_crooked_shape_is_not_an_iso_date():
    assert parse_iso_date("2026-7-6") is None
    assert parse_iso_date("06/07/2026") is None


# --- format_br_date -------------------------------------------------------------
def test_formats_a_civil_date_in_pt_br():
    assert format_br_date(date(2026, 6, 29)) == "29/06/2026"


# --- is_valid_reference_period --------------------------------------------------
def test_reference_period_year_month_is_valid():
    assert is_valid_reference_period("2026-07") is True


def test_reference_period_with_month_out_of_range_is_invalid():
    assert is_valid_reference_period("2026-13") is False
    assert is_valid_reference_period("2026-00") is False
    assert is_valid_reference_period("2026-07-01") is False


# --- weekday_abbrev -------------------------------------------------------------
def test_weekday_abbrev_of_a_civil_date():
    # 2026-07-06 is a Monday.
    assert weekday_abbrev(date(2026, 7, 6)) == "seg"


def test_weekday_covers_sunday_and_saturday():
    # Boundary of the sunday=0 shift ((weekday()+1)%7): Jul 5 is a Sunday, Jul 11 a Saturday.
    assert weekday_abbrev(date(2026, 7, 5)) == "dom"
    assert weekday_abbrev(date(2026, 7, 11)) == "sáb"


# --- TS parity (review findings) -------------------------------------------------
def test_rejects_an_iso_date_with_a_trailing_newline():
    # Python's `$` would match before the `\n`; `\Z` closes the gap (JS parity).
    assert parse_iso_date("2026-07-06\n") is None
    assert is_valid_reference_period("2026-07\n") is False


def test_rejects_unicode_digits_in_an_iso_date():
    assert parse_iso_date("۲۰۲۶-۰۷-۰۶") is None  # noqa: RUF001  (non-ASCII digits on purpose)


def test_without_year_goes_back_to_the_8_year_worst_case():
    # Feb 29 at a non-leap century turn: today in 2104 (before Feb 29) -> 2096.
    assert parse_br_date("29/02", date(2104, 1, 15)) == date(2096, 2, 29)
