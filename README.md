# Estate Follow — Full Project Export

This is a complete, current copy of the Estate Follow monorepo: Frontend (`apps/web`),
Backend API (`apps/api`), and PocketBase (`apps/pocketbase` — database, custom API
routes, migrations). It reflects the project's live state, including all completed
Feature Management features.

## 1. What's in this export, and what's deliberately left out

Included: all source code for `apps/web`, `apps/api`, and `apps/pocketbase`
(`pb_hooks`, `pb_migrations`, config), root config files (`package.json`,
`package-lock.json`, `knip.json`, `.nvmrc`, `.version`).

Deliberately excluded, and why:

- **`apps/api/.env`** — contained real secrets (Anthropic, Resend, Cloudinary,
  reCAPTCHA, etc. API keys). Replaced with `apps/api/.env.example`, which lists
  every required variable name with a placeholder/empty value. Copy it to
  `apps/api/.env` and fill in your own real values before running the API.
- **`apps/pocketbase/pb_data/`** — the live runtime SQLite database and
  real uploaded user files (title deeds, images, etc.). This is runtime state,
  not project source, and shipping it would leak real user data. PocketBase
  recreates an empty `pb_data/` automatically the first time it runs the
  migrations in `pb_migrations/`.
- **`apps/pocketbase/pocketbase`** (the compiled PocketBase binary) — the one
  used on the original server is a Linux x86-64 executable and will not run on
  Windows. See section 3 below for how to get the right binary for your
  machine.
- **`app.tar.gz`** — a stale internal backup snapshot from earlier in
  development, superseded by this export.

No API keys or secrets of any kind are present anywhere in this export. Every
sensitive value has been replaced with an empty placeholder and the
corresponding environment-variable **name** only.

## 2. Monorepo layout

```
.
├── apps/
│   ├── web/          Frontend — Vite + React 18 + react-router-dom v7
│   ├── api/           Backend — Express 5 (Node, ESM)
│   └── pocketbase/    Database + custom API routes (PocketBase v0.39.8)
├── package.json        Root workspace scripts (npm workspaces)
└── README.md            This file
```

Node version: **22** (see `.nvmrc`). Use `nvm use` if you have nvm installed.

## 3. PocketBase binary

This export does **not** include the `pocketbase` executable itself (the
original is Linux-only — see section 1). Before you can run
`apps/pocketbase`, download the matching binary for your operating system:

1. Go to https://pocketbase.io/docs/ (or the GitHub releases page:
   https://github.com/pocketbase/pocketbase/releases).
2. Download **version 0.39.8** for your OS/architecture (e.g.
   `pocketbase_0.39.8_windows_amd64.zip` for Windows).
3. Extract the `pocketbase` (or `pocketbase.exe`) binary directly into the
   `apps/pocketbase/` folder, next to `package.json`.

Using a different PocketBase version than 0.39.8 is not recommended — the
migrations in `pb_migrations/` were written and tested against 0.39.8's schema
API.

## 4. Environment variables

### `apps/api/.env`

Copy `apps/api/.env.example` to `apps/api/.env` and fill in real values. The
API is started with `node --env-file=.env`, so this file must exist for the
API to run at all. Variables:

| Variable | Purpose |
|---|---|
| `PORT` | Port the Express server listens on (default `3001`). |
| `CORS_ORIGIN` | Allowed CORS origin(s) for the API. |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key — powers the Smart Payment Plan Reader. |
| `ANTHROPIC_MODEL` | Claude vision model for reading payment-plan documents. |
| `ANTHROPIC_PLAN_MODEL` | Model used specifically for payment-plan extraction. |
| `RESEND_API_KEY` | Resend — transactional email delivery. |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary — file/image storage (title deeds, documents, photos). |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA v3 secret — verifies login/signup/forgot-password forms. |
| `TEST_INSIGHTS_KEY` / `TEST_CHAT_KEY` | Optional — internal test routes only. |
| `OPENAI_API_KEY` | Optional — only needed if an OpenAI-backed feature is enabled. |

### PocketBase (`apps/pocketbase`)

PocketBase does **not** read a `.env` file — it is launched directly with
`--encryptionEnv=PB_ENCRYPTION_KEY`, which reads a real **OS-level**
environment variable. Set these as actual environment variables on your
machine or host (see `apps/pocketbase/.env.example` for details), not as a
checked-in file:

| Variable | Purpose |
|---|---|
| `PB_ENCRYPTION_KEY` | Encrypts PocketBase's local settings at rest. Required for `pocketbase serve` to start. |
| `PB_SUPERUSER_EMAIL` | Email for the initial PocketBase superuser account, created by `pb_migrations/1764579159_create_superuser.js`. |
| `PB_SUPERUSER_PASSWORD` | Password for that superuser. The API server (`apps/api`) also authenticates to PocketBase as this superuser. |

### `apps/web`

No environment variables are required. The frontend has no `.env` file and no
build-time `import.meta.env.VITE_*` usage — it talks to the backend via
relative paths (see section 6).

## 5. Install, run, build

From the project root (after `nvm use`, if applicable):

```bash
npm run setup      # npm install, installs all three workspaces
npm run dev         # runs web + api + pocketbase together, in dev mode
npm run build       # builds apps/web for production (outputs apps/web/dist)
npm run start       # runs api + pocketbase in production mode (web must be served separately, see below)
```

Individually, from each app's own folder:

```bash
# apps/web
npm run dev          # Vite dev server, http://localhost:3000
npm run build        # production build → apps/web/dist
npm run start         # serves the built dist via `vite preview`

# apps/api
npm run dev           # node --env-file=.env src/main.js (with deprecation tracing)
npm run start          # node --env-file=.env src/main.js

# apps/pocketbase
npm run dev            # ./pocketbase serve --http=0.0.0.0:8090 --encryptionEnv=PB_ENCRYPTION_KEY --hooksWatch=false
npm run start           # same, with explicit --dir/--migrationsDir/--hooksDir flags
npm run migrations:up    # apply pending pb_migrations
```

PocketBase migrations require a full server **restart** to take effect;
`pb_hooks/*.pb.js` files hot-reload without a restart while `--hooksWatch` is
enabled (it is disabled in the `start` script above for production).

## 6. Important: this project was built for Hostinger Horizons hosting

`apps/web`'s frontend calls the backend and PocketBase through relative paths
like `/hcgi/platform/...` and `/hcgi/api/...` (see
`apps/web/src/lib/pocketbaseClient.js` and the API client files under
`apps/web/src/lib/`). `apps/web/vite.config.js` also contains
Hostinger-Horizons-specific configuration (its dev-only inline editor, edit
mode, and CORS allowlist for `horizons.hostinger.com`).

**This routing is provided automatically by Hostinger Horizons' hosting
platform** — it is not something self-contained in this exported source.
There is no Docker, nginx, Vercel, or Netlify config anywhere in this
repository that reproduces it.

If you deploy on Hostinger Horizons, no extra routing setup is needed — it
works as-is. If you want to self-host this project generically (your own
server, a different host, etc.), you will need to set up your own reverse
proxy so that:

- `/hcgi/platform/*` requests are routed to PocketBase (`apps/pocketbase`,
  default port `8090`).
- `/hcgi/api/*` (and any other `/hcgi/*` API paths used under
  `apps/web/src/lib/`) are routed to the Express API (`apps/api`, default
  port from `PORT` in its `.env`, `3001` by default).
- Everything else is served from the built frontend (`apps/web/dist` after
  `npm run build`).

Common options for this are nginx, Caddy, or a platform-specific
reverse-proxy/rewrite configuration — none of these are included here because
the original project never needed one (Hostinger Horizons handles it), so
there was no existing configuration to export.

## 7. Android

There is **no native Android app** in this project. The only Android-related
files are two PWA icons used for "Add to Home Screen" support:
`apps/web/public/android-chrome-192x192.png` and
`apps/web/public/android-chrome-512x512.png`. There is no Android Studio
project, no Gradle files, and no Capacitor/Cordova wrapper anywhere in the
repository.

## 8. Verifying this export

Before this export was delivered, the following checks were performed against
this exact copy:

- `node --check` was run against all 254 backend JavaScript files — every
  file in `apps/api/src` and every migration/hook file in
  `apps/pocketbase/pb_migrations` and `apps/pocketbase/pb_hooks` — all passed
  with no syntax errors.
- All 273 frontend files (`.js`/`.jsx`) in `apps/web/src` were parsed with the
  TypeScript/JSX parser to confirm there are no syntax errors anywhere in the
  frontend source.
- Every `.json` file in the export (all `package.json` files, `knip.json`,
  etc.) was checked to be valid, parseable JSON.
- The scrubbed `apps/api/.env.example` and `apps/pocketbase/.env.example`
  were checked against the real variable names actually read by the code
  (`apps/api/src` and PocketBase's `--encryptionEnv` flag) to make sure
  nothing required was left out.
- The full export was scanned for common secret patterns (API key prefixes,
  private-key headers, etc.), and separately for the exact secret values that
  were in the original `apps/api/.env`, to confirm no real secret remains
  anywhere in this export outside the two `.env.example` files (which contain
  only placeholders).

**One honest limitation:** this export was assembled in a sandboxed
environment whose network policy blocks direct access to the npm package
registry, so a full `npm install` + `npm run build` of `apps/web` could not
be executed here to prove the production bundle compiles end-to-end. The
syntax-level checks above passed cleanly and nothing about the dependency
list changed from the working project, but you should still run
`npm run setup && npm run build` yourself once, right after extracting this
export, as your own first confirmation that everything installs and builds
in your environment.
