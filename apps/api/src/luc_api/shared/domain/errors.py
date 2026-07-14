"""Semantic domain errors: categories by meaning, never by HTTP status.

The HTTP number is born only at the edge (router), translating these categories;
the core knows no protocol (ADR-0003). Each Area (Área) derives its named errors
from these roots.
"""

__all__ = [
    "ConflictError",
    "DomainError",
    "InvalidInputError",
    "NotFoundError",
    "ValidationError",
]


class DomainError(Exception):
    """Root of the LUC domain errors — semantic, with no HTTP coupling."""


class NotFoundError(DomainError):
    """An expected resource does not exist in the Household (missing or another Household's id)."""


class ConflictError(DomainError):
    """The operation conflicts with the current state/invariant (duplicity, uniqueness)."""


class ValidationError(DomainError):
    """The input failed domain validation."""


class InvalidInputError(DomainError):
    """The input is malformed or unacceptable (shape, range, type)."""
