"""App settings: fail-closed boot when the internal JWT secret is missing."""

import pytest

from luc_api.settings import Settings


def test_from_env_reads_the_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LUC_INTERNAL_JWT_SECRET", "abc")

    assert Settings.from_env() == Settings(jwt_secret="abc")


def test_from_env_missing_secret_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LUC_INTERNAL_JWT_SECRET", raising=False)

    with pytest.raises(RuntimeError, match="LUC_INTERNAL_JWT_SECRET"):
        Settings.from_env()
