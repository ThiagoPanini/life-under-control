"""Validation outcome shared by the finance registration rules.

Field errors carry pt-BR product copy (`message`) and the edge form field id
(`field`, camelCase — the contract the web edge highlights inputs by).
"""

from dataclasses import dataclass, field
from typing import Literal

__all__ = ["FieldError", "Invalid", "Valid"]


@dataclass(frozen=True)
class FieldError:
    """A validation error tied to a form field, so the edge highlights the right input."""

    field: str
    message: str


@dataclass(frozen=True)
class Valid[T]:
    """The input passed validation; `value` is the normalized domain shape."""

    value: T
    ok: Literal[True] = field(default=True, init=False)


@dataclass(frozen=True)
class Invalid:
    """The input failed validation; `errors` lists every offending field."""

    errors: list[FieldError]
    ok: Literal[False] = field(default=False, init=False)
