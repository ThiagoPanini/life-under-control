"""Session lifetime pin (Seam 1, TS oracle `access.test.ts`) plus allowlist rules.

The two `SESSION_MAX_AGE_SECONDS` tests port the oracle 1:1. The allowlist
tests are new (in the web app those rules are covered only through
`can_sign_in` and `link_google`).
"""

from luc_api.identity.domain.access import (
    SESSION_MAX_AGE_SECONDS,
    email_in_allowlist,
    parse_allowlist,
)


def test_max_age_is_explicitly_30_days_in_seconds():
    assert SESSION_MAX_AGE_SECONDS == 30 * 24 * 60 * 60


def test_max_age_is_a_positive_integer():
    assert isinstance(SESSION_MAX_AGE_SECONDS, int)
    assert SESSION_MAX_AGE_SECONDS > 0


def test_parse_splits_trims_and_lowercases():
    assert parse_allowlist(" Thiago@GMAIL.com , jakeline@gmail.com ") == [
        "thiago@gmail.com",
        "jakeline@gmail.com",
    ]


def test_parse_drops_empty_entries():
    assert parse_allowlist("a@x.com,,b@x.com,") == ["a@x.com", "b@x.com"]


def test_parse_deduplicates_preserving_order():
    assert parse_allowlist("a@x.com, A@x.com, b@x.com") == ["a@x.com", "b@x.com"]


def test_parse_none_or_empty_yields_empty_list():
    assert parse_allowlist(None) == []
    assert parse_allowlist("") == []


def test_parse_strips_bom_like_the_js_oracle():
    assert parse_allowlist("\ufeffa@x.com, b@x.com") == ["a@x.com", "b@x.com"]


def test_membership_is_case_insensitive_and_ignores_spaces():
    allowlist = ["thiago@gmail.com"]

    assert email_in_allowlist("  THIAGO@gmail.com  ", allowlist) is True


def test_membership_ignores_a_bom_prefix():
    assert email_in_allowlist("\ufeffthiago@gmail.com", ["thiago@gmail.com"]) is True


def test_missing_email_is_not_a_member():
    assert email_in_allowlist(None, ["a@x.com"]) is False
