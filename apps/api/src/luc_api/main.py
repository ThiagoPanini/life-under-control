"""Composition root: monta o app FastAPI do LUC (borda de servidor)."""

from fastapi import FastAPI

from luc_api.health import router as health_router


def create_app() -> FastAPI:
    """Monta o app FastAPI do LUC.

    Returns:
        A aplicação FastAPI pronta para servir.
    """
    app = FastAPI(title="LUC API", version="0.0.0")
    app.include_router(health_router)
    return app


app = create_app()
