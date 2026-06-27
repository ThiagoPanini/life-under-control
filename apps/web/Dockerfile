# syntax=docker/dockerfile:1
# Build context = raiz do monorepo (deploy.yml: context: ., file: apps/web/Dockerfile).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- deps: instala com o lockfile congelado ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# --- build: gera a saída standalone do Next ---
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm --filter @luc/web build

# --- runner: imagem mínima de produção ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
# Migração + seed rodam no boot (usam o `pg` traçado no standalone).
COPY --from=build --chown=nextjs:nodejs /app/apps/web/drizzle ./apps/web/drizzle
COPY --from=build --chown=nextjs:nodejs /app/apps/web/migrate.mjs ./apps/web/migrate.mjs
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "node apps/web/migrate.mjs && node apps/web/server.js"]
