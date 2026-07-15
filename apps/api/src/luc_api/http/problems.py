"""Central problem+json handlers: semantic categories become HTTP statuses here.

The HTTP number is born only at this edge (ADR-0003); routes never invent statuses.
Responses follow RFC 7807 (application/problem+json). `detail` carries the semantic
English message — pt-BR product copy is assembled by the BFF (ADR-0016).
"""

from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from luc_api.http.identity import AuthenticationError
from luc_api.shared.domain.errors import (
    ConflictError,
    DomainError,
    InvalidInputError,
    NotFoundError,
    ValidationError,
)

__all__ = ["PROBLEM_MEDIA_TYPE", "register_problem_handlers"]

PROBLEM_MEDIA_TYPE = "application/problem+json"
_TYPE_BASE = "https://luc.panlabs.tech/problems"

# The single category → status table; a bare DomainError is a mapping bug → 500.
_BY_CATEGORY: dict[type[DomainError], tuple[int, str, str]] = {
    NotFoundError: (404, "not-found", "Not Found"),
    ConflictError: (409, "conflict", "Conflict"),
    ValidationError: (422, "validation", "Validation Failed"),
    InvalidInputError: (400, "invalid-input", "Invalid Input"),
}


def _problem(
    *, status: int, slug: str, title: str, detail: str, headers: dict[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        media_type=PROBLEM_MEDIA_TYPE,
        headers=headers,
        content={
            "type": f"{_TYPE_BASE}/{slug}",
            "title": title,
            "status": status,
            "detail": detail,
        },
    )


async def _domain_error_to_problem(_: Request, exc: Exception) -> JSONResponse:
    status, slug, title = 500, "internal", "Internal Server Error"
    for cls in type(exc).__mro__:
        if cls in _BY_CATEGORY:
            status, slug, title = _BY_CATEGORY[cls]
            break
    return _problem(status=status, slug=slug, title=title, detail=str(exc))


async def _authentication_to_problem(_: Request, exc: Exception) -> JSONResponse:
    return _problem(
        status=401,
        slug="unauthorized",
        title="Unauthorized",
        detail=str(exc),
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _request_validation_to_problem(_: Request, exc: Exception) -> JSONResponse:
    return _problem(
        status=422,
        slug="request-validation",
        title="Request Validation Failed",
        detail=str(exc),
    )


async def _http_exception_to_problem(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):  # pragma: no cover — registration-bound
        raise exc
    return _problem(
        status=exc.status_code,
        slug="http",
        title=HTTPStatus(exc.status_code).phrase,
        detail=str(exc.detail),
        headers=dict(exc.headers) if exc.headers else None,
    )


def register_problem_handlers(app: FastAPI) -> None:
    """Registers the central translators from semantic errors to problem+json.

    Args:
        app: The application receiving the handlers.
    """
    handlers: dict[type[Exception], Any] = {
        DomainError: _domain_error_to_problem,
        AuthenticationError: _authentication_to_problem,
        RequestValidationError: _request_validation_to_problem,
        StarletteHTTPException: _http_exception_to_problem,
    }
    for exception_class, handler in handlers.items():
        app.add_exception_handler(exception_class, handler)
