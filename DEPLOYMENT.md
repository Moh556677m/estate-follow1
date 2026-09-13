# Estate Follow — Git Workflow & Deployment Policy

This document is the permanent process for how code moves from a local
change to production, and how production is protected while that happens.
It does not change anything about the application itself — no design, no
feature, no database record — only how changes reach it safely.

## 1. Branches

- **`main`** — production only. Nothing is committed to `main` directly.
  Every change reaches it through a pull request from `dev` that has passed
  CI (see §3).
- **`dev`** — the only place new work happens. Every feature/fix branch
  merges into `dev` first; `dev` is what CI runs on continuously.
- Optional for larger changes: `feature/<name>` branches off `dev`, merged
  back into `dev` via PR, then `dev` → `main` when ready.

```
feature/xyz ──▶ dev ──(CI must pass)──▶ main (production)
```

**One-time manual step required from you** (cannot be done from here — it
needs GitHub's own settings UI, and a GitHub token this session does not
have access to): once this workflow is pushed, open the repository's
**Settings → Branches → Add branch protection rule** for `main` and enable
*"Require status checks to pass before merging"*, selecting the `build`,
`smoke-test`, and `responsive-smoke` jobs from the `CI` workflow below.
Until that box is checked, GitHub will not actually block a merge on CI
failing — everything else in this document is ready and working the moment
it's pushed.

## 2. What CI runs on every push to `dev` or `main`

Defined in `.github/workflows/ci.yml`:

| Job | What it checks | Blocking? |
|---|---|---|
| `build` | `npm install` (root, web, api), `vite build`, `apps/web`'s unit tests (`vitest`), and a full `node --check` syntax sweep of every API route and PocketBase migration/hook | Yes |
| `lint` | ESLint on web + api | Advisory only for now (see the comment in the workflow file for how to make it blocking once the existing lint backlog is clear) |
| `smoke-test` | Boots the **real** `server.cjs` (the exact file Hostinger runs) against a **throwaway, ephemeral** PocketBase data directory with freshly generated random credentials, then checks: every key route (`/`, `/login`, `/signup`, `/admin/login`, `/dashboard`, a nonexistent nested dashboard route) returns the actual HTML page — never JSON, never blank, never a 404 for a route the SPA itself owns; PocketBase's auth endpoint correctly rejects a bad login with 400; a Super-Admin-only API route correctly refuses an unauthenticated request with 401/403. These are exactly the classes of regression this project has hit before (an unscoped auth middleware, an API catch-all swallowing a frontend route) | Yes |
| `responsive-smoke` | Loads a few key pages with a real headless Chromium at phone (375px, 412px), tablet (768px) and desktop (1440px) widths and fails if the page overflows horizontally — the most common responsive regression | Yes |

None of this was runnable inside the sandbox this document was written in
(its own package registry access is restricted), so it has been
syntax-checked and reviewed line by line, but **its first real, live
execution will be the first push to `dev` on GitHub**. Treat that first run
as part of validating this workflow itself, not as a guarantee — watch it,
and fix anything it surfaces before relying on it for future merges.

Run the same checks locally before pushing, if you want:

```
npm run build --prefix apps/web
npm run smoke-test          # scripts/smoke-test.sh
npm run responsive-smoke    # scripts/responsive-smoke.mjs (needs the server already running)
```

## 3. Merging dev → main

Only after every required job above is green on `dev`. Open a PR from
`dev` into `main`; once branch protection (§1) is enabled, GitHub itself
will not offer the merge button until CI passes.

## 4. Staging (recommended setup — needs one manual step on Hostinger)

Staging must never touch production's database, files, or real users. The
cleanest way to guarantee that with this project's architecture (a single
Node process that owns its own PocketBase instance and `pb_data` folder) is
a **second, separate Hostinger application**, entirely independent from the
production one:

1. Create a second Node.js application in Hostinger (e.g. `estate-follow-staging`).
2. Point its deploy source at the `dev` branch (production stays on `main`).
3. Give it its **own** `PB_ENCRYPTION_KEY` / `PB_SUPERUSER_EMAIL` /
   `PB_SUPERUSER_PASSWORD` — different from production's — so it gets its
   own, separate `pb_data` the first time it boots. It starts empty; that is
   correct and expected for a staging environment.
4. Use **test-mode** credentials for any payment gateway configured there
   (Stripe test keys, test wallet numbers for the manual payment methods) —
   never the live ones — so testing Payments on staging can never move real
   money or touch a real customer's subscription.
5. Before promoting `dev` → `main`, exercise on staging: Login, Signup (+
   OTP delivery, if email sending is configured there too), Admin login and
   dashboard, a document upload, a Stripe test-mode checkout and a manual
   payment-method submission end to end, and Estate AI's document analysis.

This is the one piece of this task that cannot be finished from inside this
sandbox — it needs a second application created in your Hostinger panel.
Everything else (the CI workflow, the branches, this document) works
without it; staging simply is not provisioned yet.

## 5. Database & files are independent of deploy

This was already true of this project's design before this document existed
— stated here so it stays a documented guarantee, not an accident:

- `apps/pocketbase/pb_data` is **not** part of the git repository (already
  gitignored / stripped from every delivered package) and is **never**
  recreated, reset, or overwritten by a deploy. PocketBase creates it once,
  the first time it ever starts on a given host, and every subsequent
  deploy of new code reuses the SAME `pb_data` directory already sitting on
  that host's persistent storage.
- A code deploy therefore **never** deletes or replaces: users, properties,
  documents, payments, settings, or any uploaded file. Redeploying code and
  wiping the database are two entirely separate actions in this
  architecture — there is no single "reset" step that does both.
- **Never**, for any deploy, staging included: manually delete
  `apps/pocketbase/pb_data` on a host that has real data, run a fresh
  install script against a host with existing data, or copy a `pb_data`
  folder from one environment on top of another's.

## 6. Rollback

Because `main` only ever moves forward via a merged, CI-passed PR, rolling
back a bad production release is a plain git operation — it never touches
the database (§5 already keeps those independent):

```bash
# Find the last known-good commit on main (before the bad merge)
git log --oneline main

# Option A — revert the bad merge commit (keeps history, safest, preferred)
git revert -m 1 <bad-merge-commit-sha>
git push origin main

# Option B — hard reset main to the last good commit (only if the bad
# commit has not been built on by anything else yet, and only after
# confirming with whoever owns this repo — it rewrites history)
git reset --hard <last-good-sha>
git push --force-with-lease origin main
```

Then redeploy `main` on Hostinger as usual (whatever redeploy mechanism is
already configured there — a git-push-triggered deploy or a manual
"redeploy" click). Because PocketBase migrations in this project are
additive/idempotent (see §7), a rollback to an older commit is safe even if
the bad release had already added new migration files — the old code simply
doesn't know about the newer fields/collections and ignores them.

## 7. Deploy versioning — knowing what's actually live

- Tag every production release on `main` right after it deploys
  successfully: `git tag deploy-$(date +%Y%m%d-%H%M)-$(git rev-parse --short HEAD) && git push origin --tags`.
  This gives a permanent, timestamped record of exactly which commit was
  live at any point, without touching any application code.
- `server.cjs` already prints a startup diagnostics block to the log on
  every boot (Node version, PocketBase binary checks, env-var presence).
  Hostinger's own deploy log (which commit/branch it built from, and
  whether the build succeeded) is the source of truth for "did this deploy
  succeed" — combine it with the git tag above for "which commit, when".

## 8. Migration policy

Already the established convention in `apps/pocketbase/pb_migrations`
throughout this project, restated here as a permanent rule:

- **Incremental**: every migration is a new, timestamped file. An existing,
  already-shipped migration file is never edited after it has run anywhere
  — PocketBase records a migration as applied the first time it runs and
  never re-runs it, so editing it retroactively does nothing on any host
  that already ran it (and creates drift between hosts that have and
  haven't). A correction always ships as a new migration file.
- **Non-destructive**: a migration adds fields/collections/indexes; it does
  not drop a column or table that could hold real data, and every `up`
  guards with `if (!collection.fields.getByName(...))` so it is safe to run
  more than once. Every migration in this project also ships a `down` that
  only removes what that same migration added.
- **Tested**: exercised against a real, throwaway PocketBase instance
  before being committed (copy `apps/pocketbase` into a scratch directory,
  run the real `pocketbase serve` binary, apply migrations, verify with
  real REST calls, then discard the scratch copy) — the same method used
  for every schema change earlier in this project's history.
- **Reversible where realistic**: the `down` migration is the rollback path
  for schema; it is intentionally conservative (only removes what it added)
  rather than attempting to reconstruct data that existed before the `up`
  ran.

## 9. Secrets

Already true of this codebase (verified, not changed by this task): every
secret — PocketBase superuser password, encryption key, Stripe secret key,
webhook signing secret, Supabase service-role key, AI provider keys — is
read from `process.env` / Hostinger's Environment Variables panel only.
None are hardcoded in source, none are committed to `.gitignore`d files
like `.env`, and `.gitignore` already excludes `.env`, `.env.*`,
`pb_data/`, `node_modules/`, and build output directories. This document
does not change any of that; it is stated here as a standing rule for every
future change: a secret is an Environment Variable or it does not exist in
this project.

---

**Summary of what is ready now vs. what needs one action from you:**

| Item | Status |
|---|---|
| `dev` branch | Created locally — pushes with `main` once GitHub access is authorized (see the separate push report) |
| CI workflow (build/tests/route/auth/db/responsive checks) | Written and committed, ready to run on first push |
| Merge-gated on CI passing | Workflow ready; **you must** enable branch protection on `main` in GitHub settings (§1) |
| Staging | Documented and ready to configure; **you must** create the second Hostinger application (§4) |
| Database/files independent of deploy | Already true of this project's architecture; documented, not changed |
| Rollback | Documented git-level procedure (§6); no code change needed |
| Deploy versioning | Documented tagging convention (§7); no code change needed |
| Migration policy | Already the project's convention; formalized here (§8) |
| Secrets | Already environment-variable-only; verified, not changed |
