"""Borda de servidor: healthcheck (liveness probe público)."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Responde enquanto o processo está de pé.

    Returns:
        Estado do processo.
    """
    return {"status": "ok"}
