"""App settings: environment-backed configuration for the server edge."""

import os
from dataclasses import dataclass
from typing import Self

__all__ = ["Settings"]

_JWT_SECRET_ENV = "LUC_INTERNAL_JWT_SECRET"


@dataclass(frozen=True, slots=True)
class Settings:
    """Server-edge configuration, resolved once at boot (fail-closed)."""

    jwt_secret: str

    @classmethod
    def from_env(cls) -> Self:
        """Reads the settings from the environment.

        Returns:
            The resolved settings.

        Raises:
            RuntimeError: If LUC_INTERNAL_JWT_SECRET is absent (the app refuses to boot
                without the shared secret rather than accepting unauthenticated calls).
        """
        secret = os.environ.get(_JWT_SECRET_ENV)
        if not secret:
            raise RuntimeError(f"{_JWT_SECRET_ENV} is not set; refusing to boot without it")
        return cls(jwt_secret=secret)
