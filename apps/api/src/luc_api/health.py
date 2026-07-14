"""Server edge: healthcheck (public liveness probe)."""

from fastapi import APIRouter

__all__ = ["router"]

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Responds while the process is up.

    Returns:
        Process status.
    """
    return {"status": "ok"}
