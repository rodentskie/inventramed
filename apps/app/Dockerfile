# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f apps/app/Dockerfile -t inventramed-app .
# Env vars are server-only and read at runtime, so no values are baked in.
# Pass them at run time: docker run --env-file apps/app/.env ...

ARG NODE_VERSION=24-alpine

# ─── target: install dependencies ───────────────────────────────────────
FROM node:${NODE_VERSION} AS target
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/package.json
COPY libs/components/package.json libs/components/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ─── build: generate the Prisma client and build the app ────────────────
FROM node:${NODE_VERSION} AS build
WORKDIR /repo

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NX_DAEMON=false \
    NX_NO_CLOUD=true

COPY --from=target /repo/node_modules ./node_modules
COPY . .

# src/lib/prisma.ts requires DATABASE_URL when imported, and `next build`
# imports route modules. Nothing connects at build time, so a placeholder
# scoped to this RUN is enough. It is not kept in the image.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    npx nx build app --skip-nx-cache

# ─── migrate: apply migrations and seed, then exit ──────────────────────
# One-off job for setup/compose.yml. Reuses the build stage, which already
# has the Prisma CLI, tsx and the generated client. The seed is safe to re-run.
FROM build AS migrate
WORKDIR /repo/apps/app

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# ─── runner: run the standalone server ──────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /repo/apps/app/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/app/.next/static ./apps/app/.next/static
COPY --from=build --chown=node:node /repo/apps/app/public ./apps/app/public

USER node
EXPOSE 3000

CMD ["node", "apps/app/server.js"]
