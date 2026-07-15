"""Allowlist parsing and membership (ADR-0004) — pure rules, no Auth.js.

New tests (no direct TS oracle): in the web app these rules are covered only
through `can_sign_in` and `link_google`.
"""

from luc_api.identity.domain.access import email_in_allowlist, parse_allowlist


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


def test_membership_is_case_insensitive_and_ignores_spaces():
    allowlist = ["thiago@gmail.com"]

    assert email_in_allowlist("  THIAGO@gmail.com  ", allowlist) is True


def test_missing_email_is_not_a_member():
    assert email_in_allowlist(None, ["a@x.com"]) is False
