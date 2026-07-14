"""Semantic domain errors: categories by meaning, no HTTP number."""

from luc_api.shared.domain.errors import (
    ConflictError,
    DomainError,
    InvalidInputError,
    NotFoundError,
    ValidationError,
)


def test_categories_descend_from_domain_error():
    for exc in (NotFoundError, ConflictError, ValidationError, InvalidInputError):
        assert issubclass(exc, DomainError)


def test_domain_error_is_an_exception():
    assert issubclass(DomainError, Exception)


def test_errors_carry_no_http_number():
    # The HTTP status is born only at the edge (router), never in the core (ADR-0003).
    err = NotFoundError("Payment not found")
    assert not hasattr(err, "status_code")
    assert not hasattr(err, "http_status")


def test_errors_preserve_the_semantic_message():
    assert str(ValidationError("Account is invalid")) == "Account is invalid"
