# Estate Follow — single-container production image.
#
# This mirrors exactly what already runs on Hostinger today: one Node
# process (server.cjs, see that file's own extensive comments) that
# in-process-imports apps/api/src/main.js (the Express API, which ALSO
# serves the built apps/web/dist as static files) and spawns the real
# PocketBase binary as a child process. Nothing about that architecture is
# changed here — this just packages the exact same three pieces
# (apps/web/dist, apps/api, apps/pocketbase) the same way, relative to each
# other, inside an image instead of a bare VM checkout.
#
# node:22 to match .nvmrc (this repo's tests already caught a real
# production bug from a Node-version mismatch — see CI history). The
# "-bookworm-slim" (Debian, glibc) variant is used deliberately instead of
# an Alpine/musl image: apps/api depends on native-binding packages
# (@napi-rs/canvas, pdfjs-dist, heic-convert) that are safest on glibc.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install dependencies first (better layer caching — this only re-runs when
# a package.json/lockfile actually changes, not on every source edit).
# npm workspaces (see the root package.json) needs every workspace's
# package.json present before `npm ci` to resolve/link them correctly.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/pocketbase/package.json apps/pocketbase/package.json
RUN npm ci

# Now bring in the real source and build the frontend. The PocketBase
# binary itself (apps/pocketbase/pocketbase) is a large static Go binary
# checked into the repo, not an npm artifact — it is copied here too so it
# rides along into the runtime stage below.
COPY . .
RUN npm run build --workspace=apps/web

# Drop devDependencies (vite, eslint, playwright, knip, ...) now that the
# build output already exists — nothing past this line needs them. npm
# prune understands the workspace tree, so this correctly cleans every
# apps/*/node_modules too, not just the root one.
RUN npm prune --omit=dev


FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# curl is only for the HEALTHCHECK below.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# --- The exact three pieces server.cjs expects, in the exact same layout
#     it already expects them in (see apps/api/src/main.js's
#     `path.resolve(__dirname, '../../web/dist')` and server.cjs's own
#     `path.join(__dirname, 'apps', 'pocketbase')`) ------------------------
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.cjs ./server.cjs

COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/src ./apps/api/src

COPY --from=builder /app/apps/web/dist ./apps/web/dist

COPY --from=builder /app/apps/pocketbase/package.json ./apps/pocketbase/package.json
COPY --from=builder /app/apps/pocketbase/pocketbase ./apps/pocketbase/pocketbase
COPY --from=builder /app/apps/pocketbase/pb_hooks ./apps/pocketbase/pb_hooks
COPY --from=builder /app/apps/pocketbase/pb_migrations ./apps/pocketbase/pb_migrations
# Deliberately NOT copying apps/pocketbase/pb_data — that is real user data
# and lives ONLY on the persistent volume mounted at runtime (PB_DATA_DIR /
# docker-compose.yml). It is also excluded from the build context entirely
# by .dockerignore, so there is nothing here to accidentally bake in.

RUN chmod +x ./apps/pocketbase/pocketbase

# Informational only — the actual published/bound port is decided by
# docker-compose.yml (via $PORT), not by this line.
EXPOSE 3001

# Matches the real readiness signal server.cjs's own reverse proxy and
# scripts/smoke-test.sh already use in CI — never a raw ECONNREFUSED, and
# never "ready" before PocketBase itself is actually healthy through it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3001}/hcgi/api/health" || exit 1

# This is the exact same entrypoint scripts/smoke-test.sh already exercises
# in CI as "the ACTUAL production entrypoint" — not `npm start` (the root
# package.json's own "start" script is a different, unused-in-production
# dev convenience that starts apps/api and apps/pocketbase as two
# independent processes instead of server.cjs's single coordinated one).
CMD ["node", "server.cjs"]
