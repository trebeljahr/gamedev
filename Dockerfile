# syntax=docker/dockerfile:1
#
# Next.js + Coolify image for gamedev (3d-assets-showcase).
#
# Monorepo layout:
#   /                  pnpm workspace root (this Dockerfile)
#   /showcase          Next.js app — packages/3d-assets-showcase
#   /.env.production   dotenvx-encrypted, decrypted in-memory at build + runtime
#
# Built by .github/workflows/deploy.yml, pushed to GHCR, pulled by
# Coolify via docker-compose.yml.
#
# Differs from the stock hatchkit Next.js template in three ways:
#   1. `pnpm install` happens at the workspace root with showcase/'s
#      package.json plus pnpm-workspace.yaml, so workspace linking
#      resolves correctly.
#   2. `pnpm build` is filtered to the showcase package
#      (`pnpm --filter 3d-assets-showcase build`).
#   3. Runtime stage WORKDIRs into /app/showcase so `next start` finds
#      next.config.js + .next/ where it expects them.
#
# dotenvx availability:
#   - Build stage uses `pnpm dlx @dotenvx/dotenvx` (no install needed).
#   - Runtime installs dotenvx globally via npm — neither the root nor
#     showcase package.json depends on it directly, so we can't rely on
#     ./node_modules/.bin/dotenvx existing.
ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

# Install deps first (layer cache) before copying source. Workspace
# manifests must all be present so pnpm can resolve the workspace graph.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY showcase/package.json ./showcase/package.json

RUN pnpm install --frozen-lockfile

# Source
COPY . .

# Validate that the BuildKit secret was supplied. Split into its own
# RUN step so a missing-secret failure doesn't get drowned out by a
# later `next build` echo.
RUN --mount=type=secret,id=dotenvx_private_key,env=DOTENV_PRIVATE_KEY_PRODUCTION \
    test -n "$DOTENV_PRIVATE_KEY_PRODUCTION" || { \
      echo "ERROR: dotenvx_private_key build secret not supplied. The workflow at .github/workflows/deploy.yml should pass it via 'secrets:' from the GH Actions secret DOTENV_PRIVATE_KEY_PRODUCTION." >&2; \
      exit 1; \
    }

# Decrypt .env.production in memory, re-export each KEY=VALUE for
# `pnpm build`. next build bakes NEXT_PUBLIC_* into the client bundle.
RUN --mount=type=secret,id=dotenvx_private_key,env=DOTENV_PRIVATE_KEY_PRODUCTION \
    pnpm dlx @dotenvx/dotenvx run -- pnpm --filter 3d-assets-showcase build

# ---------------------------------------------------------------------------
# Runtime — `next start` on PORT=3000.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# dotenvx isn't in package.json — install it globally so the CMD can
# decrypt .env.production at startup.
RUN npm install -g @dotenvx/dotenvx@latest \
    && npm cache clean --force

# Workspace metadata + hoisted deps. pnpm symlinks showcase's
# node_modules into the workspace store at install time, so we have
# to copy both the root node_modules (where the .pnpm store lives)
# and showcase/node_modules (the symlink farm next start resolves
# imports through).
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.env.production ./

COPY --from=build /app/showcase/package.json ./showcase/package.json
COPY --from=build /app/showcase/next.config.js ./showcase/next.config.js
COPY --from=build /app/showcase/node_modules ./showcase/node_modules
COPY --from=build /app/showcase/.next ./showcase/.next
# showcase/ has no public/ today — add a `COPY --from=build /app/showcase/public ./showcase/public`
# line above if you add one. `next start` tolerates its absence.

WORKDIR /app/showcase

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>{process.exit(r.statusCode<400?0:1)}).on('error',()=>process.exit(1))"

# dotenvx reads /app/.env.production (one level up — `-f` makes the
# path explicit so the working-directory move doesn't break it).
# `next` resolves out of showcase/node_modules via pnpm's symlink farm.
CMD ["dotenvx", "run", "-f", "/app/.env.production", "--", "./node_modules/.bin/next", "start", "--port", "3000"]
