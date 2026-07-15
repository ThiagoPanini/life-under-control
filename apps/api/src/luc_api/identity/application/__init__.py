"""Identity application layer: ports and use-cases of the Household identity.

Map: `resolve_authenticated_user` (session -> User, degrade-not-raise),
`can_sign_in` (allowlist gate, ADR-0004), `link_google` / `link_phone`
(link operations, raise semantic errors), `user_repo` / `household_repo`
(ports with in-memory doubles). May depend on `domain`; must never import
adapters or any framework.
"""

from luc_api.identity.application.can_sign_in import InvalidAllowlistError, can_sign_in
from luc_api.identity.application.household_repo import (
    HouseholdRepo,
    InMemoryHouseholdRepo,
)
from luc_api.identity.application.link_google import (
    EmailNotInAllowlistError,
    LinkConflictError,
    link_google,
)
from luc_api.identity.application.link_phone import (
    InvalidPhoneError,
    PhoneLinkConflictError,
    link_phone,
    unlink_phone,
)
from luc_api.identity.application.resolve_authenticated_user import (
    resolve_authenticated_user,
)
from luc_api.identity.application.user_repo import InMemoryUserRepo, UserRepo

__all__ = [
    "EmailNotInAllowlistError",
    "HouseholdRepo",
    "InMemoryHouseholdRepo",
    "InMemoryUserRepo",
    "InvalidAllowlistError",
    "InvalidPhoneError",
    "LinkConflictError",
    "PhoneLinkConflictError",
    "UserRepo",
    "can_sign_in",
    "link_google",
    "link_phone",
    "resolve_authenticated_user",
    "unlink_phone",
]
