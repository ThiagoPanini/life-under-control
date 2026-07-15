"""Server edge: the identity dependency validates the internal JWT and injects Identity."""

from datetime import UTC, datetime, timedelta

import jwt
from httpx import ASGITransport, AsyncClient

from luc_api.main import create_app
from luc_api.settings import Settings

# HS256 keys must be >= 32 bytes (RFC 7518); short keys trip PyJWT's warning.
SECRET = "identity-test-secret-0123456789abcdef"
WRONG_SECRET = "wrong-secret-0123456789abcdef-xxxxxx"


def mint_token(secret: str = SECRET, **overrides: object) -> str:
    now = datetime.now(tz=UTC)
    claims: dict[str, object] = {
        "iss": "luc-web",
        "aud": "luc-api",
        "sub": "user-1",
        "household": "household-1",
        "iat": now,
        "exp": now + timedelta(seconds=60),
    }
    claims.update(overrides)
    claims = {key: value for key, value in claims.items() if value is not None}
    return jwt.encode(claims, secret, algorithm="HS256")  # pyright: ignore[reportUnknownMemberType]


def client() -> AsyncClient:
    transport = ASGITransport(app=create_app(settings=Settings(jwt_secret=SECRET)))
    return AsyncClient(transport=transport, base_url="http://test")


async def test_valid_token_returns_identity() -> None:
    token = mint_token()

    async with client() as http:
        response = await http.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"user_id": "user-1", "household_id": "household-1"}


async def test_missing_authorization_returns_401_problem_json() -> None:
    async with client() as http:
        response = await http.get("/me")

    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["status"] == 401


async def test_expired_token_returns_401() -> None:
    # Expired beyond the 5s leeway the validator allows.
    token = mint_token(exp=datetime.now(tz=UTC) - timedelta(seconds=60))

    async with client() as http:
        response = await http.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")


async def test_wrong_audience_returns_401() -> None:
    token = mint_token(aud="other-api")

    async with client() as http:
        response = await http.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


async def test_wrong_issuer_returns_401() -> None:
    token = mint_token(iss="other-web")

    async with client() as http:
        response = await http.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


async def test_invalid_signature_returns_401() -> None:
    token = mint_token(secret=WRONG_SECRET)

    async with client() as http:
        response = await http.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


async def test_missing_household_claim_returns_401() -> None:
    token = mint_token(household=None)

    async with client() as http:
        response = await http.get("/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


async def test_non_bearer_scheme_returns_401() -> None:
    async with client() as http:
        response = await http.get("/me", headers={"Authorization": "Basic abc"})

    assert response.status_code == 401
