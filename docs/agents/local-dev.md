# Execução local

O LUC roda 100% local sem depender de produção (sem Google OAuth, sem Postgres remoto, sem R2 real). As dependências com estado — Postgres e MinIO (S3-compatível para os comprovantes) — sobem em Docker; o app roda nativo com `next dev`. Duas camadas, com coberturas complementares.

## Camada 1 — loop diário (rápido, autenticado)

O que você usa 99% do tempo. Postgres + MinIO em container, `next dev` nativo no host (HMR), auth pulada via `LUC_LOCAL_AUTH_BYPASS=true`. É aqui que se validam os fluxos autenticados (Painel, Agenda, Finanças, anexos).

```bash
# 1. Suba as dependências (Postgres :5432, MinIO :9000 + console :9001).
pnpm dev:up

# 2. Aplique migrações + seed no Postgres local (primeira vez e após mudar o schema).
pnpm --filter @luc/web db:migrate

# 3. Rode o app nativo.
pnpm --filter @luc/web dev            # http://localhost:3000
```

O `db:migrate` fixa a URL local (`postgres://luc:luc@127.0.0.1:5432/luc`) e roda `migrate.mjs` — o mesmo runner idempotente do boot do container e dos testes de integração. O seed cria o Lar "Casa Panini" (Thiago e Jakeline); com o bypass ligado, é esse Lar que a UI exibe.

Config lida em `apps/web/.env.local` (já commitado, valores de dev): DB local, `LUC_LOCAL_AUTH_BYPASS=true`, MinIO em `127.0.0.1:9000`.

## Camada 2 — smoke fiel à produção (pré-merge)

Builda e roda a **mesma imagem** que vai pro Coolify (`apps/web/Dockerfile`): migração+seed no boot, servidor Next `standalone`, `NODE_ENV=production`. Pega a classe de bug que o `next dev` e o typecheck não pegam — quebra de fronteira RSC × módulo cliente, middleware não edge-safe, erro de tracing do standalone — tudo que só aparece 500 em runtime de produção.

```bash
pnpm dev:smoke                        # docker compose --profile full up --build
# valide: http://localhost:3000/ (landing) e /login respondem 200
```

Cobertura e limite: como `NODE_ENV=production` desabilita o bypass **por design**, este alvo valida build, migração-no-boot e a superfície pública — **não** a navegação autenticada (isso exigiria OAuth Google real). Fluxo autenticado → Camada 1. Anexos também ficam na Camada 1: aqui o app fala com o MinIO pelo nome de serviço (`minio:9000`), e as URLs assinadas não abrem no navegador do host.

## Ciclo de vida da stack

```bash
pnpm dev:up        # sobe db + minio + cria o bucket
pnpm dev:down      # para os containers (mantém os dados no volume)
pnpm dev:reset     # para e APAGA os volumes (Postgres e MinIO zerados)
pnpm dev:smoke     # camada 2 (buila a imagem de prod)
```

Após `dev:reset`, refaça `pnpm dev:up && pnpm --filter @luc/web db:migrate`.

## Schema e migrações

`db:generate` (drizzle-kit) emite o SQL a partir de `src/adapters/db/schema.ts` para `apps/web/drizzle/`; `db:migrate` aplica os `.sql` pendentes + o seed no Postgres local.

```bash
# Depois de editar o schema:
pnpm --filter @luc/web db:generate    # gera o novo NNNN_*.sql
pnpm --filter @luc/web db:migrate     # aplica no banco local
```

O projeto **não usa** `drizzle-kit migrate`/`push` para aplicar — a fonte única é `migrate.mjs`. Evite `drizzle-kit push`: ele lê o `.env` da raiz (ver hazard abaixo) e conectaria no alvo errado.

## Hazard: o `.env` da raiz aponta pra produção

O `.env` da raiz (e o symlink `apps/web/.env → ../../.env`) guarda **segredos de produção reais** — `DATABASE_URL` do Coolify, credenciais Google e R2. O fluxo local acima é imune a ele: `next dev` deixa o `.env.local` sobrepor tudo que importa, e o `db:migrate` fixa a URL local na própria linha de comando (o `--env-file` do Node não sobrepõe env já exportado — por isso a atribuição inline). Ainda assim:

- **Nunca** rode `drizzle-kit push`/`migrate` nem `node migrate.mjs` cru contra o `.env` da raiz.
- Se você mantém um **túnel SSH ao Postgres de produção** na porta 5432, ele colide com o Postgres local — derrube o túnel antes do `pnpm dev:up` (ou o container não sobe na 5432). A porta 5432 local pertence ao banco de dev.

## Referência de portas e credenciais (dev)

| Serviço | Porta host | Credencial |
| --- | --- | --- |
| Postgres | 5432 | `luc` / `luc`, db `luc` |
| MinIO (API S3) | 9000 | `lucminio` / `lucminio123` |
| MinIO (console) | 9001 | idem |
| App (nativo ou smoke) | 3000 | bypass no nativo; OAuth no smoke |

São as mesmas credenciais do `.env.example` e do serviço `postgres` do CI (`pr-checks.yml`) — o banco local espelha exatamente o do gate.
