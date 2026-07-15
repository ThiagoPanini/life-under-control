"""Seam 1: the allowlist rule (ADR-0004) — pure, no Auth.js, no network."""

import pytest

from luc_api.identity.application.can_sign_in import InvalidAllowlistError, can_sign_in

ALLOW = "thiago@gmail.com, jakeline@gmail.com"


def test_both_allowlisted_emails_get_in():
    assert can_sign_in("thiago@gmail.com", ALLOW) is True
    assert can_sign_in("jakeline@gmail.com", ALLOW) is True


def test_third_email_is_barred():
    assert can_sign_in("intruso@gmail.com", ALLOW) is False


def test_match_is_case_insensitive_and_ignores_spaces():
    assert can_sign_in("Thiago@GMAIL.com", ALLOW) is True
    assert can_sign_in("  JAKELINE@gmail.com  ", ALLOW) is True


def test_mixed_case_allowlist_also_normalizes():
    # Normalization applies to both sides: a mixed-case config still matches.
    assert can_sign_in("thiago@gmail.com", "Thiago@GMAIL.com, JAKELINE@gmail.com") is True


def test_missing_email_is_barred():
    assert can_sign_in(None, ALLOW) is False


def test_allowlist_not_exactly_two_raises():
    with pytest.raises(InvalidAllowlistError):
        can_sign_in("a@x.com", "a@x.com")
    with pytest.raises(InvalidAllowlistError):
        can_sign_in("a@x.com", "a@x.com,b@x.com,c@x.com")
    with pytest.raises(InvalidAllowlistError):
        can_sign_in("a@x.com", "")
    with pytest.raises(InvalidAllowlistError):
        can_sign_in("a@x.com", None)


def test_allowlist_with_repeated_email_counts_as_one_and_raises():
    # "a@x, A@x" are the same User: 1 unique email -> does not satisfy "exactly 2".
    with pytest.raises(InvalidAllowlistError):
        can_sign_in("a@x.com", "a@x.com, A@x.com")
