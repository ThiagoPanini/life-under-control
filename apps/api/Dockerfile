# syntax=docker/dockerfile:1
# Build context = monorepo root (deploy.yml: context: ., file: apps/api/Dockerfile).
# The uv:pythonX images are built ON TOP OF python:X-slim, so the interpreter at
# /usr/local/bin matches the runner — the .venv is copyable across stages.

# --- build: resolves frozen deps and installs the package (no dev, no editable) ---
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS build
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app

# Deps layer first: changes rarely -> stable cache across builds.
COPY apps/api/pyproject.toml apps/api/uv.lock apps/api/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# Project layer: installs the package non-editable -> self-sufficient .venv.
COPY apps/api/README.md ./
COPY apps/api/src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

# --- runner: minimal production image, non-root, no uv ---
FROM python:3.14-slim-bookworm AS runner
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PORT=8000
RUN groupadd -r luc -g 1001 && useradd -r -u 1001 -g luc luc
COPY --from=build --chown=luc:luc /app/.venv /app/.venv
USER luc
EXPOSE 8000
# Container-native healthcheck: uses python (already present) against /health —
# avoids depending on curl/wget (absent in the slim image) and lets Coolify/Docker
# read the health directly. Reads $PORT at runtime to match the CMD.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/health').read()"
# Starts the ASGI server. (Alembic upgrade at boot arrives with persistence — ADR-0014.)
CMD ["sh", "-c", "uvicorn luc_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
