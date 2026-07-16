"""Composition root: assembles the LUC FastAPI app (server edge)."""

from fastapi import FastAPI

from luc_api.composition import provide_settings
from luc_api.health import router as health_router
from luc_api.http import me_router, register_problem_handlers
from luc_api.settings import Settings

__all__ = ["app", "create_app"]


def create_app(settings: Settings | None = None) -> FastAPI:
    """Assembles the LUC FastAPI app.

    Args:
        settings: Overrides the environment-backed settings (tests only).

    Returns:
        The FastAPI application, ready to serve.
    """
    app = FastAPI(title="LUC API", version="0.0.0")
    app.state.settings = settings if settings is not None else provide_settings()
    app.include_router(health_router)
    app.include_router(me_router)
    register_problem_handlers(app)
    return app


app = create_app()
