# syntax=docker/dockerfile:1
# Build context = raiz do monorepo (deploy.yml: context: ., file: apps/api/Dockerfile).
# As imagens uv:pythonX são construídas SOBRE python:X-slim, então o interpretador
# em /usr/local/bin bate com o runner — a .venv é copiável entre os estágios.

# --- build: resolve deps congeladas e instala o pacote (sem dev, sem editable) ---
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim AS build
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app

# Camada de deps primeiro: muda pouco → cache estável entre builds.
COPY apps/api/pyproject.toml apps/api/uv.lock apps/api/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# Camada do projeto: instala o pacote não-editável → .venv autossuficiente.
COPY apps/api/README.md ./
COPY apps/api/src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

# --- runner: imagem mínima de produção, non-root, sem uv ---
FROM python:3.14-slim-bookworm AS runner
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PORT=8000
RUN groupadd -r luc -g 1001 && useradd -r -u 1001 -g luc luc
COPY --from=build --chown=luc:luc /app/.venv /app/.venv
USER luc
EXPOSE 8000
# Sobe o servidor ASGI. (Alembic upgrade no boot entra quando a persistência chegar — ADR-0014.)
CMD ["sh", "-c", "uvicorn luc_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
