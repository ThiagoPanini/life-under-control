"""HTTP server edge: identity dependency, problem+json translation and edge routers.

Map: identity (internal JWT validation + Identity), problems (central RFC 7807
handlers), me (identity echo router).
"""

from luc_api.http.identity import (
    AuthenticationError,
    CurrentIdentity,
    Identity,
    current_identity,
)
from luc_api.http.me import router as me_router
from luc_api.http.problems import register_problem_handlers

__all__ = [
    "AuthenticationError",
    "CurrentIdentity",
    "Identity",
    "current_identity",
    "me_router",
    "register_problem_handlers",
]
