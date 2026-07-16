"""User colors derived from hue — presentation invariant of the Household.

The hue is persisted; fg/bg are derived (persist facts, derive interpretations).
"""

from luc_api.identity.domain.household import UserColors, avatar_key, user_colors


def test_hue_211_derives_thiago_colors():
    assert user_colors(211) == UserColors(fg="hsl(211 76% 74%)", bg="hsl(211 44% 23%)")


def test_hue_14_derives_jakeline_colors():
    assert user_colors(14) == UserColors(fg="hsl(14 76% 74%)", bg="hsl(14 44% 23%)")


def test_avatar_key_is_fixed_per_user():
    # New test (no TS oracle): one fixed key per User — re-upload overwrites (idempotent).
    assert avatar_key("u-thiago") == "identity/users/u-thiago/avatar"
