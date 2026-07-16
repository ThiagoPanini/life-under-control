"""Identity echo: lets the BFF verify the internal token wiring end to end."""

from fastapi import APIRouter

from luc_api.http.identity import CurrentIdentity

__all__ = ["router"]

router = APIRouter()


@router.get("/me")
async def read_me(identity: CurrentIdentity) -> dict[str, str]:
    """Echoes the identity resolved from the internal JWT.

    Args:
        identity: The acting identity injected by the dependency.

    Returns:
        The acting User and Household ids.
    """
    return {"user_id": identity.user_id, "household_id": identity.household_id}
