"""WhatsApp phone link operations (Vínculo, issue #152): User <-> phone.

Same shape as the Google link: validate everything, then write. No external
allowlist here — only E.164 shape and uniqueness inside the Household.
"""

from collections.abc import Sequence

from luc_api.identity.application.user_repo import UserRepo
from luc_api.identity.domain.household import User, UserNotInHouseholdError
from luc_api.identity.domain.phone import normalize_phone_e164
from luc_api.shared.domain.errors import ConflictError, InvalidInputError

__all__ = [
    "InvalidPhoneError",
    "PhoneLinkConflictError",
    "link_phone",
    "unlink_phone",
]


class InvalidPhoneError(InvalidInputError):
    """The given phone is not a valid BR number."""

    def __init__(self, raw_phone: str) -> None:
        """Record which raw input failed normalization."""
        super().__init__(f"Phone {raw_phone} is not a valid BR number")


class PhoneLinkConflictError(ConflictError):
    """The phone is already linked to another Household User."""

    def __init__(self, phone: str) -> None:
        """Record which phone is in conflict."""
        super().__init__(f"Phone {phone} is already linked to another User")


async def link_phone(
    user_repo: UserRepo,
    users: Sequence[User],
    user_id: str,
    raw_phone: str,
) -> None:
    """Link the normalized phone to the Household User, validating before writing."""
    if not any(user.id == user_id for user in users):
        raise UserNotInHouseholdError(user_id)

    phone = normalize_phone_e164(raw_phone)
    if phone is None:
        raise InvalidPhoneError(raw_phone)

    already_linked = await user_repo.get_by_whatsapp_phone(phone)
    if already_linked is not None and already_linked.id != user_id:
        raise PhoneLinkConflictError(phone)

    await user_repo.link_whatsapp_phone(user_id, phone)


async def unlink_phone(
    user_repo: UserRepo,
    users: Sequence[User],
    user_id: str,
) -> None:
    """Remove the phone link of the Household User."""
    if not any(user.id == user_id for user in users):
        raise UserNotInHouseholdError(user_id)

    await user_repo.unlink_whatsapp_phone(user_id)
