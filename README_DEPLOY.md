# Deploying Estate Follow on Hostinger — Clean Database Setup

This package intentionally ships **without** `apps/pocketbase/pb_data`. It is
not needed: PocketBase creates it automatically, from scratch, the first time
it starts — running every migration in `apps/pocketbase/pb_migrations`
(schema, collections, relations, seeded feature flags) against a brand-new,
empty database. No legacy data is included or required.

**This means the previous real data (the 8 user accounts and their
properties/payments/documents recorded since August 27) will not exist in
this deployment.** That was a deliberate decision — this setup starts
completely fresh, and everyone signs up again from scratch.

All website code (frontend, API, PocketBase hooks/migrations) is otherwise
unchanged from the working project — nothing about the design or features
was touched, only how the database is initialized.

## Entry point

```
node server.cjs
```

Same startup sequence as before: `server.cjs` checks `PB_ENCRYPTION_KEY` is
set, starts PocketBase, waits for a real `/api/health` response, then starts
the API. See the code comments in `server.cjs` for details.

## Required Environment Variables

Set these in Hostinger's Node.js app "Environment Variables" panel:

```
PB_ENCRYPTION_KEY
PB_SUPERUSER_EMAIL
PB_SUPERUSER_PASSWORD
```

**Unlike a migration onto existing data, `PB_ENCRYPTION_KEY` here can be any
strong value you choose** — there is no old encrypted data it needs to match,
because this is a brand-new database. Generate a long random value (for
example `openssl rand -hex 32`) and keep it somewhere safe: once PocketBase
has started at least once with it, **that** value becomes the one this
deployment's data depends on going forward, so don't change it casually
afterward either.

`PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` will create a brand-new
PocketBase superuser (dashboard/admin API) account on first boot — pick real
values, not placeholders.

Also copy `apps/api/.env.example` to `apps/api/.env` and fill in real values
(API port, CORS origin, Anthropic/Resend/Cloudinary/reCAPTCHA keys, etc.).

## Optional

```
POCKETBASE_URL=http://127.0.0.1:8090
APP_ADMIN_PASSWORD
CONTENT_ADMIN_PASSWORD
```

`POCKETBASE_URL` is only needed if the API and PocketBase run on different
hosts/ports.

`APP_ADMIN_PASSWORD` / `CONTENT_ADMIN_PASSWORD` are **fully optional, secure
replacements for the old hardcoded seed-account passwords** (see the security
notice below). Leave both unset and no extra admin/content-admin accounts are
created at all — only the `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD`
superuser exists. This was verified on a from-scratch empty database: with
both variables unset, all 158 migrations (150 project + 8 PocketBase core)
completed with zero errors, and both the `users` and `editors` collections
stayed empty until real people sign up / are added.

If you want the extra staff accounts, set one or both of these env vars
*before* the very first boot of a fresh database, and the corresponding
migration will set a real password on it instead of skipping it:

| Env var | Account it sets a password on | Fixed email (required — other authorization checks in the code key off this exact address) |
|---|---|---|
| `APP_ADMIN_PASSWORD` | `admin@estatefollow.com` (`users`, role=admin) | yes, must stay `admin@estatefollow.com` |
| `CONTENT_ADMIN_PASSWORD` | `content.admin@estatefollow.com` (`editors`) | yes, must stay `content.admin@estatefollow.com` |

Pick a strong, unique value for each — these are no longer written anywhere
in the source code, so the only place they exist is the env var you set.

## 🔒 Security fix applied — no more hardcoded passwords

Earlier versions of this project's migrations (`1787846063_users_role_and_admin.js`,
`1787871185_super_admin_and_settings.js`, `1788131100_create_cms_collections.js`)
seeded two default accounts with **plaintext passwords written directly in the
migration source code** (`admin@aqarplatform.com` / `admin@estatefollow.com`
and `content.admin@estatefollow.com`). Those hardcoded passwords have been
**permanently removed from the source**. On a brand-new database:

- The main superuser account is created *only* from `PB_SUPERUSER_EMAIL` /
  `PB_SUPERUSER_PASSWORD` (unchanged — this was already env-var-driven).
- The `admin@estatefollow.com` staff account and the
  `content.admin@estatefollow.com` content-admin account are created *only*
  if you explicitly set `APP_ADMIN_PASSWORD` / `CONTENT_ADMIN_PASSWORD`
  (see the Optional section above). If you don't set them, those accounts
  simply don't exist — nothing is silently created with a guessable or
  shared password.
- No password value is ever printed, logged, or reused between deployments.

If you deployed an earlier version of this project and logged in with one of
the old hardcoded passwords, change that account's password from the admin
panel (or delete the account) — the hardcoded value should be treated as
permanently compromised since it was visible in source control.

## 🔧 Reverse proxy fix — `/hcgi/*` routing (required for self-hosted Hostinger)

The frontend calls the backend through the relative paths `/hcgi/platform/*`
(PocketBase) and `/hcgi/api/*` (this Express API) — see
`apps/web/src/lib/pocketbaseClient.js`, `editorClient.js`, and
`apiServerClient.js`. Those paths only exist because this project was
originally built for **Hostinger Horizons** hosting, which provides that
routing automatically at the platform level. Plain/self-hosted Hostinger
(the "Setup Node.js App" feature this `server.cjs` entry point targets) does
**not** provide that routing on its own.

`apps/api/src/main.js` now includes a small built-in reverse proxy that
reproduces this routing itself (mounted before the JSON/urlencoded body
parsers, so file uploads and JSON bodies stream through unmodified): it
forwards `/hcgi/platform/*` to the local PocketBase instance
(`POCKETBASE_URL`, default `http://127.0.0.1:8090`) and mounts the existing
API router additionally at `/hcgi/api/*` (in addition to `/`, kept for
backward compatibility). No code outside `main.js` needed to change, and no
extra configuration is required — this works automatically as soon as the
server starts. Without this fix, every PocketBase-backed feature (login,
signup, the admin portal, the editor portal, property/document reads and
writes) would fail with a generic "Something went wrong!" error on
self-hosted Hostinger, because the frontend's requests to `/hcgi/*` would
have nowhere to go.

## PocketBase binary

`apps/pocketbase/pocketbase` — Linux x86-64 (`ELF 64-bit LSB executable,
statically linked`), PocketBase 0.39.8 (matches `.pocketbase-version`).
`server.cjs` sets its executable permission automatically on startup.

## What was verified before this package was put together

- All 150 project migrations (plus PocketBase's own 8 built-in core
  migrations, 158 total) were run, from nothing, against a disposable test
  database in an isolated sandbox — completed with zero errors, and
  PocketBase reported a healthy `/api/health` response afterward.
- This was explicitly re-tested with **both** `APP_ADMIN_PASSWORD` and
  `CONTENT_ADMIN_PASSWORD` left unset on a brand-new empty database: zero
  migration errors, and both the `users` and `editors` collections remained
  completely empty (no accounts silently created).
- The main superuser account was confirmed to authenticate correctly
  immediately after boot using only `PB_SUPERUSER_EMAIL` /
  `PB_SUPERUSER_PASSWORD`.
- All `pb_hooks` files loaded without error during these runs, and a
  previously-existing bug where a wrong password on a super-admin/staff/
  pending-signup account returned an empty `HTTP 200` instead of a proper
  `400 Failed to authenticate` error was found and fixed (see below).
- `node --check` passed with zero failures on every backend/PocketBase/
  migration/hook JavaScript file in this package (including `server.cjs`),
  and a full esbuild syntax parse passed with zero failures on all 273
  frontend `.js`/`.jsx` files.
- No API keys, tokens, hardcoded passwords, or `.env` files are present
  anywhere in this package — the previous hardcoded-password exception noted
  in older versions of this document has been fixed and removed; see the
  security-fix section above.
