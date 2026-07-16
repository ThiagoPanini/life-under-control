"""Test-wide defaults: the app boots fail-closed on the internal JWT secret."""

import os

os.environ.setdefault("LUC_INTERNAL_JWT_SECRET", "test-only-secret-0123456789abcdef")

pytest_plugins = ["tests.support.postgres"]
