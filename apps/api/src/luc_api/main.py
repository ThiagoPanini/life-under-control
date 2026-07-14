"""Composition root: assembles the LUC FastAPI app (server edge)."""

from fastapi import FastAPI

from luc_api.health import router as health_router

__all__ = ["app", "create_app"]


def create_app() -> FastAPI:
    """Assembles the LUC FastAPI app.

    Returns:
        The FastAPI application, ready to serve.
    """
    app = FastAPI(title="LUC API", version="0.0.0")
    app.include_router(health_router)
    return app


app = create_app()
