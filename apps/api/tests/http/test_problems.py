"""Server edge: the central handler translates semantic categories to problem+json."""

from fastapi import APIRouter, FastAPI
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


async def test_bare_domain_error_maps_to_500() -> None:
    response = await get("/boom/bare")

    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/problem+json")


async def test_derived_error_inherits_the_category_status() -> None:
    # A context error deriving NotFoundError maps through the category (MRO walk).
    response = await get("/boom/derived")

    assert response.status_code == 404


async def test_request_validation_maps_to_422_problem_json() -> None:
    # FastAPI's own request validation also speaks problem+json (no edge invents a shape).
    response = await get("/boom/typed?quantity=abc")

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")


async def test_unknown_route_returns_404_problem_json() -> None:
    response = await get("/nope")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
