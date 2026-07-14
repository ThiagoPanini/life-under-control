"""Shared domain layer: pure domain language, stdlib-only.

Map: `money` (exact BRL amounts as integer cents), `civil_date` (civil dates
and the reference period), `errors` (semantic error categories). Nothing here
may import application, adapters or any framework.
"""

from luc_api.shared.domain.civil_date import (
    WEEKDAYS_ABBREV_PT,
    format_br_date,
    is_valid_reference_period,
    parse_br_date,
    parse_iso_date,
    weekday_abbrev,
)
from luc_api.shared.domain.errors import (
    ConflictError,
    DomainError,
    InvalidInputError,
    NotFoundError,
    ValidationError,
)
from luc_api.shared.domain.money import (
    cents_to_input_text,
    format_brl,
    format_brl_no_cents,
    parse_brl,
)

__all__ = [
    "WEEKDAYS_ABBREV_PT",
    "ConflictError",
    "DomainError",
    "InvalidInputError",
    "NotFoundError",
    "ValidationError",
    "cents_to_input_text",
    "format_br_date",
    "format_brl",
    "format_brl_no_cents",
    "is_valid_reference_period",
    "parse_br_date",
    "parse_brl",
    "parse_iso_date",
    "weekday_abbrev",
]
