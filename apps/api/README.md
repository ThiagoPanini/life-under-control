# @luc/api

Backend do **Life Under Control** — Python 3.14 / FastAPI / uv. Dono do domínio, dos ports/adapters e das bordas de servidor (webhook WhatsApp, cron do digest, API interna). O Next vira borda de UI/BFF ([ADR-0014](../../docs/adr/0014-backend-python-fastapi.md)).

Esqueleto da fase F0a: FastAPI servindo `/health`, régua de tooling (ruff, pyright strict, pytest-asyncio, import-linter) e imagem Docker multi-stage.

## Comandos

```bash
uv sync                       # instala deps (inclui dev)
uv run pytest                 # testes
uv run ruff format --check .  # formatação
uv run ruff check .           # lint
uv run pyright                # tipos (strict)
uv run lint-imports           # fronteiras (import-linter)
uv run uvicorn luc_api.main:app --reload   # server em :8000
```

## Layout

`src/luc_api/` — pacote (src layout). Contextos feature-first (`shared/`, e adiante `identidade/`, `financas/`, `whatsapp/`), cada um com `domain/`, `application/`, `adapters/`. Fronteiras validadas por import-linter no CI.

## Smoke Docker

Imagem multi-stage (build com `uv`, runner `python:3.14-slim` non-root). O context do build é a **raiz do repo** (igual à prod). Da raiz:

```bash
docker buildx build -f apps/api/Dockerfile -t luc-api:smoke .
docker run --rm -p 8099:8000 luc-api:smoke
curl -s localhost:8099/health          # {"status":"ok"}
```

Evidência do esqueleto (F0a): imagem ~161 MB, roda como `uid=1001(luc)`, `GET /health` → `200 {"status":"ok"}`.
