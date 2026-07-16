"""In-memory `UserRepo` double semantics (new tests — the TS fake had no suite).

Pins the port guarantees the use-case suites exercise only indirectly:
case-insensitive lookups, the unlinked-User guard and the point writes.
"""

from luc_api.identity.application.user_repo import InMemoryUserRepo
from luc_api.identity.domain.household import User


def make_user(
    user_id: str = "u-thiago",
    google_email: str | None = None,
    whatsapp_phone: str | None = None,
) -> User:
    """Thiago fixture, unlinked by default."""
    return User(
        id=user_id,
        name="Thiago",
        email="thiago@casapanini.lar",
        google_email=google_email,
        hue=211,
        initial="T",
        avatar_key=None,
        whatsapp_phone=whatsapp_phone,
    )


async def test_get_by_email_is_case_insensitive():
    repo = InMemoryUserRepo([make_user()])

    found = await repo.get_by_email("THIAGO@casapanini.LAR")

    assert found is not None
    assert found.id == "u-thiago"


async def test_get_by_google_email_is_case_insensitive():
    repo = InMemoryUserRepo([make_user(google_email="thiago@gmail.com")])

    found = await repo.get_by_google_email("Thiago@GMAIL.com")

    assert found is not None
    assert found.id == "u-thiago"


async def test_empty_google_email_never_matches_an_unlinked_user():
    repo = InMemoryUserRepo([make_user(google_email=None)])

    assert await repo.get_by_google_email("") is None


async def test_set_avatar_key_persists_the_key():
    repo = InMemoryUserRepo([make_user()])

    await repo.set_avatar_key("u-thiago", "identity/users/u-thiago/avatar")

    found = await repo.get_by_email("thiago@casapanini.lar")
    assert found is not None
    assert found.avatar_key == "identity/users/u-thiago/avatar"


async def test_link_google_email_lowercases_before_persisting():
    repo = InMemoryUserRepo([make_user()])

    await repo.link_google_email("u-thiago", "Thiago@GMAIL.com")

    found = await repo.get_by_email("thiago@casapanini.lar")
    assert found is not None
    assert found.google_email == "thiago@gmail.com"


async def test_link_and_unlink_whatsapp_phone_round_trip():
    repo = InMemoryUserRepo([make_user()])

    await repo.link_whatsapp_phone("u-thiago", "+5511987654321")
    linked = await repo.get_by_whatsapp_phone("+5511987654321")
    await repo.unlink_whatsapp_phone("u-thiago")
    unlinked = await repo.get_by_whatsapp_phone("+5511987654321")

    assert linked is not None
    assert linked.id == "u-thiago"
    assert unlinked is None


async def test_point_writes_to_an_unknown_user_are_noops():
    repo = InMemoryUserRepo([make_user()])

    await repo.set_avatar_key("u-ghost", "identity/users/u-ghost/avatar")
    await repo.link_google_email("u-ghost", "ghost@gmail.com")
    await repo.link_whatsapp_phone("u-ghost", "+5511900000000")
    await repo.unlink_whatsapp_phone("u-ghost")

    assert await repo.get_by_google_email("ghost@gmail.com") is None
    assert await repo.get_by_whatsapp_phone("+5511900000000") is None
