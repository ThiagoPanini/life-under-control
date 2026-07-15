"""Identity dependency: validates the internal JWT (BFF-minted) and injects Identity.

The edge resolves who is acting — the User (Pessoa) and their Household (Lar) —
before any handler runs; use-cases never see HTTP nor token (ADR-0014).
"""

from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Request

from luc_api.settings import Settings

__all__ = ["AuthenticationError", "CurrentIdentity", "Identity", "current_identity"]

INTERNAL_JWT_ISSUER = "luc-web"
INTERNAL_JWT_AUDIENCE = "luc-api"
_LEEWAY_SECONDS = 5
_REQUIRED_CLAIMS = ["exp", "iat", "sub", "iss", "aud", "household"]


class AuthenticationError(Exception):
    """The request carries no valid identity (absent, expired or forged token)."""


@dataclass(frozen=True, slots=True)
class Identity:
    """Who is acting — the User (Pessoa) — and in which Household (Lar)."""

    user_id: str
    household_id: str


def current_identity(request: Request) -> Identity:
    """Validates the Authorization Bearer JWT and resolves the acting identity.

    Args:
        request: The incoming request; the shared secret lives in the app state.

    Returns:
        The identity carried by the token claims (sub, household).

    Raises:
        AuthenticationError: If the token is absent, expired, forged, from the wrong
            issuer/audience or misses a required claim — the central handler
            translates it to 401 problem+json.
    """
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme != "Bearer" or not token:
        raise AuthenticationError("Missing bearer token")

    settings: Settings = request.app.state.settings
    try:
        claims = jwt.decode(  # pyright: ignore[reportUnknownMemberType] — PyJWT's key type
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=INTERNAL_JWT_ISSUER,
            audience=INTERNAL_JWT_AUDIENCE,
            leeway=_LEEWAY_SECONDS,
            options={"require": _REQUIRED_CLAIMS},
        )
    except jwt.InvalidTokenError as error:
        raise AuthenticationError("Invalid internal token") from error

    user_id = claims.get("sub")
    household_id = claims.get("household")
    if not isinstance(user_id, str) or not isinstance(household_id, str):
        raise AuthenticationError("Token identity claims are malformed")
    return Identity(user_id=user_id, household_id=household_id)


CurrentIdentity = Annotated[Identity, Depends(current_identity)]
