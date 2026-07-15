"""Identity domain layer: pure Household facts and rules, stdlib-only.

Map: `household` (User/Household types, colors and avatar key), `access`
(allowlist parsing and membership, ADR-0004), `phone` (E.164 normalization).
Nothing here may import application, adapters or any framework.
"""

from luc_api.identity.domain.access import email_in_allowlist, parse_allowlist
from luc_api.identity.domain.household import (
    Household,
    User,
    UserColors,
    UserNotInHouseholdError,
    avatar_key,
    user_colors,
)
from luc_api.identity.domain.phone import normalize_phone_e164

__all__ = [
    "Household",
    "User",
    "UserColors",
    "UserNotInHouseholdError",
    "avatar_key",
    "email_in_allowlist",
    "normalize_phone_e164",
    "parse_allowlist",
    "user_colors",
]
