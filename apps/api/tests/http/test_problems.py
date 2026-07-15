"""Server edge: the central handler translates semantic categories to problem+json."""

import pytest
from fastapi import APIRouter, FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient, Response

from luc_api.main import create_app
from luc_api.settings import Settings
from luc_api.shared.domain.errors import (
    ConflictError,
    DomainError,
    InvalidInputError,
    NotFoundError,
    ValidationError,
)

router = APIRouter()


class PaymentGoneError(NotFoundError):
    pass


@router.get("/boom/not-found")
async def boom_not_found() -> None:
    raise NotFoundError("Payment not found")


@router.get("/boom/conflict")
async def boom_conflict() -> None:
    raise ConflictError("Payment already settled")


@router.get("/boom/validation")
async def boom_validation() -> None:
    raise ValidationError("Amount must be positive")


@router.get("/boom/invalid-input")
async def boom_invalid_input() -> None:
    raise InvalidInputError("Reference period is malformed")


@router.get("/boom/bare")
async def boom_bare() -> None:
    raise DomainError("Uncategorized failure")


@router.get("/boom/derived")
async def boom_derived() -> None:
    raise PaymentGoneError("Payment not found in the Household")


@router.get("/boom/typed")
async def boom_typed(quantity: int) -> dict[str, int]:
    return {"quantity": quantity}


@router.get("/boom/non-iana")
async def boom_non_iana() -> None:
    raise HTTPException(status_code=599, detail="Upstream exploded")


@router.get("/boom/no-content")
async def boom_no_content() -> None:
    raise HTTPException(status_code=204)


@router.get("/boom/structured-detail")
async def boom_structured_detail() -> None:
    raise HTTPException(status_code=400, detail={"code": "limit", "max": 5})


def app_with_boom_routes() -> FastAPI:
    app = create_app(settings=Settings(jwt_secret="problems-test-secret-0123456789abcdef"))
    app.include_router(router)
    return app


async def get(path: str) -> Response:
    transport = ASGITransport(app=app_with_boom_routes())
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        return await http.get(path)


async def test_not_found_maps_to_404_problem_json() -> None:
    response = await get("/boom/not-found")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["type"].endswith("/not-found")
    assert body["title"] == "Not Found"
    assert body["status"] == 404
    assert body["detail"] == "Payment not found"


async def test_conflict_maps_to_409() -> None:
    response = await get("/boom/conflict")

    assert response.status_code == 409
    assert response.json()["type"].endswith("/conflict")


async def test_validation_maps_to_422() -> None:
    response = await get("/boom/validation")

    assert response.status_code == 422
    assert response.json()["type"].endswith("/validation")


async def test_invalid_input_maps_to_400() -> None:
    response = await get("/boom/invalid-input")

    assert response.status_code == 400
    assert response.json()["type"].endswith("/invalid-input")


async def test_bare_domain_error_maps_to_500(caplog: pytest.LogCaptureFixture) -> None:
    response = await get("/boom/bare")

    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/problem+json")
    # Internals never leak to the client; the traceback goes to the server log.
    assert response.json()["detail"] == "An unexpected error occurred"
    assert "Uncategorized failure" not in response.text
    assert "Unmapped domain error" in caplog.text


async def test_derived_error_inherits_the_category_status() -> None:
    # A context error deriving NotFoundError maps through the category (MRO walk).
    response = await get("/boom/derived")

    assert response.status_code == 404


async def test_request_validation_maps_to_422_problem_json() -> None:
    # FastAPI's own request validation also speaks problem+json (no edge invents a shape).
    response = await get("/boom/typed?quantity=abc")

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["detail"] == "Request did not match the expected schema"
    errors = body["errors"]
    assert isinstance(errors, list)
    assert errors[0]["loc"] == ["query", "quantity"]


async def test_non_iana_status_gets_a_fallback_title() -> None:
    # A code outside the IANA registry must not crash the handler itself.
    response = await get("/boom/non-iana")

    assert response.status_code == 599
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["title"] == "Unknown Status"
    assert body["detail"] == "Upstream exploded"


async def test_bodyless_status_sends_no_body() -> None:
    # 204/304 forbid a body; a problem+json payload would break the HTTP protocol.
    response = await get("/boom/no-content")

    assert response.status_code == 204
    assert response.content == b""


async def test_structured_http_detail_travels_in_errors_extension() -> None:
    # A non-text detail keeps its shape instead of being flattened to a Python repr.
    response = await get("/boom/structured-detail")

    assert response.status_code == 400
    body = response.json()
    assert body["detail"] == "Bad Request"
    assert body["errors"] == {"code": "limit", "max": 5}


async def test_unknown_route_returns_404_problem_json() -> None:
    response = await get("/nope")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
