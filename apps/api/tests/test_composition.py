"""Composition root: provide_* factories return port-typed adapters, no DI container."""

from datetime import date

import pytest

from luc_api.composition import provide_clock, provide_settings
from luc_api.settings import Settings


def test_provide_clock_ticks_civil_dates() -> None:
    assert isinstance(provide_clock().today(), date)


def test_provide_settings_reads_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LUC_INTERNAL_JWT_SECRET", "abc")

    assert provide_settings() == Settings(jwt_secret="abc")
