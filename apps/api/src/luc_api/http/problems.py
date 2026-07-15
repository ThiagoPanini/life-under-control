"""Central problem+json handlers: semantic categories become HTTP statuses here.

The HTTP number is born only at this edge (ADR-0003); routes never invent statuses.
Responses follow RFC 7807 (application/problem+json). `detail` carries the semantic
English message — pt-BR product copy is assembled by the BFF (ADR-0016). Structured
payloads (request validation issues, non-text HTTPException details) travel in the
`errors` extension member, never flattened into `detail`.
"""

import logging
from http import HTTPStatus
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.utils import is_body_allowed_for_status_code
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

logger = logging.getLogger(__name__)

PROBLEM_MEDIA_TYPE = "application/problem+json"
_TYPE_BASE = "https://luc.panlabs.tech/problems"

# The single category → status table; a bare DomainError is a mapping bug → 500.
_BY_CATEGORY: dict[type[DomainError], tuple[int, str, str]] = {
    NotFoundError: (404, "not-found", "Not Found"),
    ConflictError: (409, "conflict", "Conflict"),
    ValidationError: (422, "validation", "Validation Failed"),
    InvalidInputError: (400, "invalid-input", "Invalid Input"),
}


def _phrase(status: int) -> str:
    try:
        return HTTPStatus(status).phrase
    except ValueError:
        return "Unknown Status"


def _body(*, status: int, slug: str, title: str, detail: str) -> dict[str, Any]:
    return {
        "type": f"{_TYPE_BASE}/{slug}",
        "title": title,
        "status": status,
        "detail": detail,
    }


def _respond(body: dict[str, Any], headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=int(body["status"]),
        media_type=PROBLEM_MEDIA_TYPE,
        headers=headers,
        content=body,
    )


async def _domain_error_to_problem(_: Request, exc: Exception) -> Response:
    for cls in type(exc).__mro__:
        if cls in _BY_CATEGORY:
            status, slug, title = _BY_CATEGORY[cls]
            return _respond(_body(status=status, slug=slug, title=title, detail=str(exc)))
    # An unmapped category is a mapping bug: log the traceback, expose no internals.
    logger.error("Unmapped domain error reached the edge", exc_info=exc)
    return _respond(
        _body(
            status=500,
            slug="internal",
            title="Internal Server Error",
            detail="An unexpected error occurred",
        )
    )


async def _authentication_to_problem(_: Request, exc: Exception) -> Response:
    return _respond(
        _body(status=401, slug="unauthorized", title="Unauthorized", detail=str(exc)),
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _request_validation_to_problem(_: Request, exc: Exception) -> Response:
    if not isinstance(exc, RequestValidationError):  # pragma: no cover — registration-bound
        raise exc
    body = _body(
        status=422,
        slug="request-validation",
        title="Request Validation Failed",
        detail="Request did not match the expected schema",
    )
    body["errors"] = jsonable_encoder(exc.errors())
    return _respond(body)


async def _http_exception_to_problem(_: Request, exc: Exception) -> Response:
    if not isinstance(exc, StarletteHTTPException):  # pragma: no cover — registration-bound
        raise exc
    headers = dict(exc.headers) if exc.headers else None
    if not is_body_allowed_for_status_code(exc.status_code):
        return Response(status_code=exc.status_code, headers=headers)
    title = _phrase(exc.status_code)
    # Starlette annotates `detail` as str, but FastAPI's subclass allows any shape.
    detail = cast("object", exc.detail)
    if isinstance(detail, str):
        return _respond(
            _body(status=exc.status_code, slug="http", title=title, detail=detail),
            headers=headers,
        )
    body = _body(status=exc.status_code, slug="http", title=title, detail=title)
    body["errors"] = jsonable_encoder(detail)
    return _respond(body, headers=headers)


def register_problem_handlers(app: FastAPI) -> None:
    """Registers the central translators from semantic errors to problem+json.

    Args:
        app: The application receiving the handlers.
    """
    app.add_exception_handler(DomainError, _domain_error_to_problem)
    app.add_exception_handler(AuthenticationError, _authentication_to_problem)
    app.add_exception_handler(RequestValidationError, _request_validation_to_problem)
    app.add_exception_handler(StarletteHTTPException, _http_exception_to_problem)
