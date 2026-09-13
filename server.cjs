const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const pocketbaseDir = path.join(__dirname, 'apps', 'pocketbase');
const pocketbaseBinary = path.join(pocketbaseDir, 'pocketbase');
// PB_DATA_DIR lets the operator point PocketBase's actual data at a path
// OUTSIDE this deploy's own directory tree (e.g. a persistent volume/mount
// Hostinger's plan provides, if any) — the real fix for "user accounts
// disappear after every deploy" IF the hosting platform's deploy mechanism
// ever replaces this whole directory with a fresh checkout rather than
// updating it in place (git-based `git pull`-style deploys leave untracked
// files like pb_data alone; a fresh-clone-into-a-new-directory style deploy
// would not). Unset (the default), behavior is completely unchanged —
// pb_data stays right where it always has, inside this app's own directory.
// This is intentionally opt-in: which of those two deploy styles Hostinger
// actually uses cannot be determined from this codebase alone, and forcing
// a path change without confirming that would risk losing track of
// existing data rather than protecting it.
const pbDataPath = process.env.PB_DATA_DIR
  ? path.resolve(process.env.PB_DATA_DIR)
  : path.join(pocketbaseDir, 'pb_data');
const pbHooksPath = path.join(pocketbaseDir, 'pb_hooks');
const pbMigrationsPath = path.join(pocketbaseDir, 'pb_migrations');
const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

// --- Load apps/api/.env into process.env, BEFORE anything else runs -------
// apps/api's own package.json only ever loads that file via
// `node --env-file=.env` (its "dev"/"start" scripts) — but self-hosted
// Hostinger's "Setup Node.js App" feature runs `node server.cjs` directly,
// which never goes through that script. Without this, secrets that only
// live in apps/api/.env (RESEND_API_KEY, CLOUDINARY_*, ANTHROPIC_API_KEY,
// etc.) never reach process.env at all in production — not for the API
// module imported below (Step 2), and not for the PocketBase child process
// spawned further down (spawnPocketbase() passes it `env: process.env`).
// This was the actual root cause of OTP/verification emails silently never
// sending on self-hosted Hostinger: RESEND_API_KEY was only ever documented
// for apps/api/.env, but PocketBase's own mailer hook
// (pb_hooks/0-resend-mailer.pb.js) reads it from ITS OWN process env via
// $os.getenv(), which — same as the API's env — was never actually
// populated on this deployment path.
//
// Values already set by the host's own env-var panel take priority and are
// never overwritten here; this only fills in whatever the panel doesn't
// already provide.
const apiEnvPath = path.join(__dirname, 'apps', 'api', '.env');
try {
  const raw = fs.readFileSync(apiEnvPath, 'utf8');
  let loaded = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
      loaded += 1;
    }
  }
  console.log(`Loaded ${loaded} variable(s) from apps/api/.env into process.env (host panel vars, if any, always win).`);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('apps/api/.env not found — skipping (fine if every secret is set via the host env-var panel instead).');
  } else {
    console.error('Failed to read apps/api/.env:', error.code, error.message);
  }
}

// --- Guard: PB_ENCRYPTION_KEY must be present BEFORE PocketBase is ever
// spawned. This key must match the ORIGINAL key that was used to encrypt
// this project's existing pb_data the first time it was created — PocketBase
// uses it only to decrypt already-encrypted settings on disk, never to
// create or migrate data. A missing or mismatched key does not corrupt
// anything; PocketBase simply refuses to start. We only ever check whether
// the variable is set (and its length, since PocketBase requires EXACTLY 32
// characters) — its value is never logged or printed anywhere.
if (!process.env.PB_ENCRYPTION_KEY) {
  console.error('PB_ENCRYPTION_KEY is required and must match the original PocketBase encryption key');
  process.exit(1);
}

// --- Startup diagnostics ----------------------------------------------
// Printed unconditionally, every boot, via this process's own console.log/
// console.error — i.e. the exact same log channel that already reliably
// shows up in Hostinger's log viewer (unlike a spawned child's inherited
// stdio, which some managed Node hosts do not forward correctly — see the
// PocketBase stdout/stderr forwarding below for the actual fix for that).
console.log('--- PocketBase startup diagnostics ---');
console.log('node version:', process.version, '| platform:', process.platform, '| arch:', process.arch);
console.log('server.cjs cwd (__dirname):', __dirname);
console.log('pocketbase spawn cwd:', pocketbaseDir);
console.log('pocketbase binary path:', pocketbaseBinary);
console.log('pb_data path:', pbDataPath);
console.log('pb_hooks path:', pbHooksPath);
console.log('pb_migrations path:', pbMigrationsPath);
console.log('PB_ENCRYPTION_KEY set:', Boolean(process.env.PB_ENCRYPTION_KEY), '| length:', process.env.PB_ENCRYPTION_KEY ? process.env.PB_ENCRYPTION_KEY.length : 0, '(PocketBase requires exactly 32)');
console.log('PB_SUPERUSER_EMAIL set:', Boolean(process.env.PB_SUPERUSER_EMAIL));
console.log('PB_SUPERUSER_PASSWORD set:', Boolean(process.env.PB_SUPERUSER_PASSWORD));
console.log('PORT (assigned to this app by the host):', process.env.PORT || '(not set — API will default to 3001)');

try {
  const stat = fs.statSync(pocketbaseBinary);
  const mode = (stat.mode & 0o777).toString(8);
  console.log('pocketbase binary exists: yes | size:', stat.size, 'bytes | mode:', mode);
  if (stat.size < 1_000_000) {
    console.error('WARNING: pocketbase binary is suspiciously small (<1MB) — it may be corrupted, a Git LFS pointer file, or truncated by the upload/extract process.');
  }
} catch (error) {
  console.error('pocketbase binary exists: NO —', error.code, error.message);
}

try {
  fs.accessSync(pocketbaseBinary, fs.constants.X_OK);
  console.log('pocketbase binary executable (X_OK) check, BEFORE chmod: PASS');
} catch (error) {
  // Expected and harmless on most deploys: a fresh checkout/extract on
  // Hostinger routinely loses the executable bit, and the chmodSync() right
  // below exists specifically to restore it before PocketBase is ever
  // spawned. This line alone is NOT evidence of an unresolved problem — see
  // the AFTER-chmod re-check further down, which is the one that actually
  // matters.
  console.error('pocketbase binary executable (X_OK) check, BEFORE chmod: FAIL —', error.code, error.message);
}

// Hostinger runs Linux. Ensure the PocketBase binary is executable.
try {
  fs.chmodSync(pocketbaseBinary, 0o755);
  console.log('chmod 0755 on pocketbase binary: OK');
} catch (error) {
  console.error('Failed to set PocketBase executable permission:', error.code, error.message);
}

// Re-check AFTER the chmod attempt — this is the check that actually matters.
// If this still fails, chmod is not the fix: the most likely remaining cause
// is the hosting account mounting this directory with a `noexec` restriction
// (common on some restricted/shared plans), which no permission bits can
// override — the binary would need to live on a mount that allows execution.
try {
  fs.accessSync(pocketbaseBinary, fs.constants.X_OK);
  console.log('pocketbase binary executable (X_OK) check, AFTER chmod: PASS');
} catch (error) {
  console.error('pocketbase binary executable (X_OK) check, AFTER chmod: STILL FAILING —', error.code, error.message, '| this points to a filesystem/mount restriction (e.g. noexec) that chmod cannot fix, not a simple missing-permission-bit issue.');
}

// Prove the filesystem actually allows creating/writing pb_data at this
// exact path (some restricted hosting accounts allow reading the app
// folder but block writes outside specific directories, or enforce a disk
// quota) — this is done BEFORE spawning PocketBase so a filesystem
// permission problem is reported clearly instead of surfacing later as an
// opaque PocketBase exit code.
try {
  fs.mkdirSync(pbDataPath, { recursive: true });
  const probeFile = path.join(pbDataPath, '.write_probe');
  fs.writeFileSync(probeFile, 'ok');
  fs.unlinkSync(probeFile);
  console.log('pb_data directory writable: PASS (', pbDataPath, ')');
} catch (error) {
  console.error('pb_data directory writable: FAIL —', error.code, error.message, '| path:', pbDataPath);
}

// Loud, unmissable signal of exactly the thing "user accounts disappeared
// after deploy" reports need to distinguish: is this boot finding the SAME
// database the previous deploy was using, or starting completely fresh?
// data.db is the actual SQLite file PocketBase's auth/users table lives in
// — if PB_DATA_DIR is not set and this ever logs "NOT FOUND" right after a
// redeploy that should have had existing users, that is direct evidence the
// hosting platform's deploy mechanism is not preserving this directory
// across deploys (e.g. a fresh-checkout-into-a-new-directory style deploy
// rather than an in-place git pull) — set PB_DATA_DIR to a path outside
// this deploy's own directory tree (see its definition above) once such a
// persistent path is available.
try {
  const dbFile = path.join(pbDataPath, 'data.db');
  if (fs.existsSync(dbFile)) {
    const dbStat = fs.statSync(dbFile);
    console.log(`Existing PocketBase database FOUND at ${dbFile} (${dbStat.size} bytes) — this boot will use the SAME data the previous deploy had, not a fresh one.`);
  } else {
    console.log(`No existing PocketBase database at ${dbFile} — this boot will create a BRAND NEW, EMPTY database. If users/data were expected to already exist, this is the direct evidence: this deploy did not inherit the previous one's pb_data.`);
  }
} catch (error) {
  console.error('Could not check for an existing PocketBase database:', error.code, error.message);
}

for (const [label, dirPath] of [['pb_hooks', pbHooksPath], ['pb_migrations', pbMigrationsPath]]) {
  try {
    const entries = fs.readdirSync(dirPath);
    console.log(`${label} directory exists, ${entries.length} entries`);
  } catch (error) {
    console.error(`${label} directory missing or unreadable —`, error.code, error.message, '| path:', dirPath);
  }
}

console.log('--- end startup diagnostics ---');

let shuttingDown = false;
// Tracks the PocketBase child process ONLY IF this instance spawned it.
// If we instead detect and reuse an already-healthy PocketBase started by
// a different (e.g. not-yet-fully-terminated previous) instance of this
// same app, `pb` stays null — this instance never owns that process, and
// must never try to kill it.
let pb = null;
// The API's own HTTP server (the http.Server returned by app.listen() inside
// apps/api/src/main.js, exported specifically so this file can shut it down
// gracefully). Set once Step 2 below has imported the API module.
let apiServer = null;

// Buffer the last chunk of PocketBase's own stderr/stdout so that, even if
// a lot of output scrolled by, the exit handler below can print a final,
// unmissable summary of exactly what PocketBase itself said right before
// it stopped — not just its bare exit code.
const STDERR_TAIL_LIMIT = 8000;
let stdoutTail = '';
let stderrTail = '';
function appendTail(current, chunk) {
  const next = current + chunk;
  return next.length > STDERR_TAIL_LIMIT ? next.slice(next.length - STDERR_TAIL_LIMIT) : next;
}

// Set once the readiness module (apps/api/src/lib/pocketbaseReadiness.js) is
// dynamically imported at the very start of the IIFE below — before that,
// stays null and every checkHealth() call below just skips updating it
// (safe: the module's own default is `false`, the correct state to start
// in — the API's reverse proxy must never forward to PocketBase before it
// has actually been confirmed healthy at least once).
let setPocketbaseReadyFn = null;

// Real health check against PocketBase's own /api/health endpoint. Used
// (a) BEFORE spawning, to detect an already-running healthy instance so we
// never spawn a duplicate, (b) to decide whether a PocketBase exit (e.g.
// EADDRINUSE) is actually fatal or just means "someone else already owns
// this port and it's healthy, so we're fine", and (c) as the single source
// of truth for the shared readiness flag the API's PocketBase reverse proxy
// gates on — every call here updates it, so the proxy's view of "is
// PocketBase up" can never drift stale from what this file itself believes.
async function checkHealth(timeoutMs = 2000) {
  let healthy = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${POCKETBASE_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    healthy = res.ok;
  } catch {
    healthy = false;
  }
  if (setPocketbaseReadyFn) setPocketbaseReadyFn(healthy);
  return healthy;
}

function spawnPocketbase() {
  const child = spawn(
    pocketbaseBinary,
    [
      'serve',
      '--http=127.0.0.1:8090',
      // Always the fully-resolved path (never the literal './pb_data') so
      // this is correct whether pbDataPath is the default (inside
      // pocketbaseDir, which IS this spawn's cwd below) or overridden via
      // PB_DATA_DIR to somewhere else entirely.
      `--dir=${pbDataPath}`,
      '--hooksDir=./pb_hooks',
      '--migrationsDir=./pb_migrations',
      '--encryptionEnv=PB_ENCRYPTION_KEY'
    ],
    {
      cwd: pocketbaseDir,
      env: process.env,
      // IMPORTANT: NOT 'inherit'. Some managed Node hosts (this includes at
      // least one real case seen on Hostinger) do not reliably forward a
      // spawned child's raw inherited stdio into their own log viewer, even
      // though this parent process's OWN console.log/console.error output
      // (like the diagnostics above) shows up fine. Piping PocketBase's
      // stdout/stderr and re-emitting each line through THIS process's own
      // console.log/console.error guarantees it goes through the exact same
      // channel that is already known to work.
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutTail = appendTail(stdoutTail, text);
    process.stdout.write(`[pocketbase stdout] ${text}`);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrTail = appendTail(stderrTail, text);
    process.stderr.write(`[pocketbase stderr] ${text}`);
  });

  child.on('error', (error) => {
    // This fires when the OS itself could not even start the binary — e.g.
    // ENOENT (file not found / wrong path), EACCES (execute permission
    // denied, or the hosting sandbox blocks running local binaries at all),
    // or a wrong architecture. Printed in full, including error.code, which
    // is the single most useful field for telling these cases apart.
    console.error('PocketBase failed to start (spawn error):', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      path: error.path,
    });
  });

  child.on('exit', (code, signal) => {
    console.error(`PocketBase (spawned by this instance) stopped. code=${code} signal=${signal}`);
    if (stderrTail.trim()) {
      console.error('----- POCKETBASE STDERR (last output before exit) -----');
      console.error(stderrTail.trim());
      console.error('----- end PocketBase stderr -----');
    } else {
      console.error('(PocketBase produced no stderr output before exiting — the failure, if any, is either a spawn-level error above, or PocketBase exited cleanly.)');
    }
    if (stdoutTail.trim()) {
      console.error('----- POCKETBASE STDOUT (last output before exit) -----');
      console.error(stdoutTail.trim());
      console.error('----- end PocketBase stdout -----');
    }
    // NOTE: this handler intentionally does NOT decide fatality by itself
    // anymore (see the startup flow below). A bind conflict (EADDRINUSE)
    // here most often means a DIFFERENT, already-healthy instance of
    // PocketBase (e.g. an orphaned child from a previous app restart that
    // Hostinger has not fully torn down yet) already owns this port — that
    // is not a platform failure, it's this instance's spawn attempt losing
    // a race it didn't need to win. The startup flow re-checks health after
    // any exit and only treats this as fatal if NO healthy PocketBase is
    // reachable at all.
  });

  return child;
}

// --- Cross-process startup lock -----------------------------------------
// Why this exists: a single health check before spawning (checkHealth then
// spawnPocketbase, as used to happen here) closes most of the duplicate-spawn
// window, but not all of it — it is a classic check-then-act race. If TWO
// separate OS processes (e.g. an old app instance still finishing its own
// shutdown, and the new instance a redeploy just started — both running on
// the SAME shared filesystem/pb_data, which is what lets either of them find
// and reuse the other's PocketBase in the first place) both call checkHealth()
// in the same instant, before either has spawned anything, BOTH see "not
// healthy" and BOTH proceed to spawn PocketBase — two PocketBase processes
// then open and try to migrate the exact same SQLite files at once, which is
// exactly what "Error: failed to apply migration ... database is locked"
// is. A lock closes this race at its actual source (only one process is
// EVER allowed to spawn/migrate at a time), instead of papering over the
// symptom with a longer SQLite busy-timeout.
//
// The lock is a plain file inside pb_data itself (so it lives on the same
// shared, persistent filesystem it's protecting, and survives exactly as
// long as pb_data does): created with the 'wx' flag, which fails with
// EEXIST if the file already exists — that existence check + create is a
// single atomic filesystem operation, so it works correctly even across
// two totally separate processes with no shared memory.
const pbLockPath = path.join(pbDataPath, '.pocketbase-startup.lock');

function readLockFile() {
  try {
    return JSON.parse(fs.readFileSync(pbLockPath, 'utf8'));
  } catch {
    return null;
  }
}

// A held lock is only ever considered stale if its owning process is
// provably gone, OR it has been held implausibly long. Both checks exist
// because a redeploy on a host like Hostinger can tear down and recreate
// the whole container: a PID from the old container may not exist in the
// new one (kill(pid, 0) correctly reports ESRCH), but if the lock somehow
// survived on shared storage from an entirely different machine/namespace
// where PID numbers mean nothing at all, the age-based ceiling is the real
// safety net.
const MAX_LOCK_AGE_MS = 90_000; // spawning + first-boot migrations should never legitimately take this long
function isLockStale(lock) {
  if (!lock || typeof lock.pid !== 'number' || typeof lock.startedAt !== 'number') return true;
  if (Date.now() - lock.startedAt > MAX_LOCK_AGE_MS) return true;
  try {
    process.kill(lock.pid, 0); // signal 0: doesn't send anything, just tests the PID exists and we're allowed to signal it
    return false;
  } catch (error) {
    return error.code !== 'EPERM'; // EPERM = a process with this PID exists (owned by someone else) — still alive, not stale
  }
}

async function acquirePocketbaseLock(maxWaitMs = 60000) {
  fs.mkdirSync(pbDataPath, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + maxWaitMs;

  for (;;) {
    try {
      const fd = fs.openSync(pbLockPath, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: Date.now(), token }));
      fs.closeSync(fd);
      return { token };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    if (isLockStale(readLockFile())) {
      console.log('Found a stale PocketBase startup lock (its owner process is gone, or it is older than the maximum plausible startup time) — removing it and retrying.');
      try {
        fs.unlinkSync(pbLockPath);
      } catch {
        // another process may have already removed/replaced it — fine, just retry
      }
      continue;
    }

    if (Date.now() > deadline) {
      return null; // someone else genuinely still holds it — caller falls back to reusing/waiting instead of spawning
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function releasePocketbaseLock(lock) {
  if (!lock) return;
  try {
    const existing = readLockFile();
    // Only ever remove the lock if it is still the exact one we wrote —
    // never delete a lock a different process has since taken over (e.g.
    // after correctly identifying ours as stale, which should not normally
    // happen while we are still alive, but this guards against it anyway).
    if (existing && existing.token === lock.token) {
      fs.unlinkSync(pbLockPath);
    }
  } catch {
    // Best-effort. An orphaned lock file left behind by a hard kill (-9,
    // which skips all cleanup code including this) is still self-healed by
    // the very next acquire attempt via isLockStale() above.
  }
}

// Single funnel for every "make sure PocketBase is running" decision in this
// file (initial startup, the confirmation loop, and the ongoing watchdog all
// call this instead of ever calling spawnPocketbase() directly). Guarantees,
// via the lock above, that only one process across the whole shared
// filesystem is ever spawning PocketBase / letting it run migrations at a
// given moment — every other process waits and then reuses it instead of
// starting a competing instance against the same pb_data files.
async function ensurePocketbaseRunning() {
  if (shuttingDown) return;

  if (pb && pb.exitCode === null && !pb.killed) {
    return; // we already own a live PocketBase — nothing to do
  }

  if (await checkHealth()) {
    return; // some other process already has a healthy PocketBase up — nothing to do
  }

  const lock = await acquirePocketbaseLock();
  if (!lock) {
    // Did not get the lock within the wait window — another process is
    // still holding it (presumably itself in the middle of starting
    // PocketBase). Do NOT spawn a competing instance. Whoever called us
    // (the startup loop or the watchdog) will simply call this again shortly.
    if (await checkHealth()) {
      console.log('PocketBase became healthy while waiting for the startup lock (another instance owns it) — reusing it.');
    } else {
      console.log('Another instance is holding the PocketBase startup lock — waiting instead of starting a competing instance; will check again shortly.');
    }
    return;
  }

  try {
    // Re-check health now that we hold the lock: whoever held it right
    // before us may have already finished starting PocketBase (and released
    // the lock) in the time it took us to acquire it.
    if (await checkHealth()) {
      console.log('An existing healthy PocketBase was found (right after acquiring the startup lock) — reusing it, NOT spawning a second instance.');
      return;
    }

    if (shuttingDown) return; // don't start anything new if shutdown began while we were waiting for the lock

    console.log('Holding the PocketBase startup lock — spawning PocketBase now. No other instance can spawn one (or run migrations against the same pb_data) until this is released.');
    pb = spawnPocketbase();

    // Hold the lock until PocketBase is actually confirmed healthy (or has
    // exited/failed) — this is what actually closes the migration race:
    // for as long as we hold the lock, no other process will spawn a
    // second PocketBase against the same SQLite files while ours is still
    // applying migrations.
    const migrationWaitRetries = 60; // ~60s — generous enough to cover first-boot migrations
    for (let i = 0; i < migrationWaitRetries; i++) {
      if (await checkHealth()) break;
      if (pb.exitCode !== null) break; // it already exited — nothing left to wait for
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    releasePocketbaseLock(lock);
  }
}

function killOwnedPocketbase(signal) {
  if (pb && pb.exitCode === null && !pb.killed) {
    pb.kill(signal);
  }
}

// Handles SIGTERM/SIGINT — these arrive from the HOST's process lifecycle
// (a redeploy replacing this instance, a manual restart from the Hostinger
// panel, a scale-down, etc.), never from anything this code sends itself.
// Two things must both be true for this to be safe: (1) PocketBase is only
// ever killed here if `pb` is non-null, i.e. THIS instance actually spawned
// it — a PocketBase instance we merely detected-and-reused (see Step 1
// below) is left completely alone, since some OTHER instance owns its
// lifecycle; (2) this process must actually wait for PocketBase to finish
// exiting (bounded by a timeout) before exiting itself, so the port is
// genuinely free by the time this instance is gone — otherwise a fast
// redeploy could start a replacement instance while our own PocketBase is
// still mid-shutdown, recreating the exact EADDRINUSE race this was meant
// to fix.
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}. Shutting down... (this is the HOST asking this instance to stop — normal during a redeploy/restart, not an error)`);

  // Flip the shared readiness flag off immediately, so the reverse proxy
  // stops forwarding to PocketBase (returning a clean 503 instead) the
  // moment shutdown begins — before PocketBase is actually killed below,
  // not after.
  if (setPocketbaseReadyFn) setPocketbaseReadyFn(false);

  // Stop accepting NEW inbound connections immediately. server.close() takes
  // effect synchronously for new connections (its callback just waits for
  // in-flight ones to drain) — this is what stops the API from initiating
  // any NEW request to PocketBase (directly, or through its /hcgi/platform
  // reverse proxy) once we start tearing PocketBase down below, instead of
  // those requests failing with "connect ECONNREFUSED 127.0.0.1:8090" against
  // a PocketBase that is mid-shutdown or already gone.
  if (apiServer) {
    apiServer.close(() => {
      console.log('API server stopped accepting new connections and drained in-flight requests.');
    });
  } else {
    console.log('API server was never up (it failed to start earlier) — nothing to close there.');
  }

  const finishShutdown = () => process.exit(0);

  if (!pb) {
    console.log('This instance never spawned PocketBase (it was reusing an existing instance) — nothing to stop here.');
    finishShutdown();
    return;
  }

  if (pb.exitCode !== null || pb.killed) {
    finishShutdown();
    return;
  }

  const forceExitTimer = setTimeout(() => {
    console.log('PocketBase did not exit within the grace period — exiting anyway.');
    finishShutdown();
  }, 4000);

  pb.once('exit', () => {
    clearTimeout(forceExitTimer);
    finishShutdown();
  });

  killOwnedPocketbase('SIGTERM');
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

(async () => {
  // --- Step 0: load the shared PocketBase-readiness flag ------------------
  // Must happen before anything below ever calls checkHealth() (Step 1
  // does, immediately). server.cjs is CommonJS so this needs a dynamic
  // import(); apps/api/src/main.js imports the same path normally — Node's
  // ES module cache means both resolve to the exact same module instance.
  try {
    const readiness = await import('./apps/api/src/lib/pocketbaseReadiness.js');
    setPocketbaseReadyFn = readiness.setPocketbaseReady;
  } catch (error) {
    console.error(
      'Failed to load the PocketBase readiness module — the reverse proxy will keep returning 503 instead of forwarding to PocketBase:',
      error && error.stack ? error.stack : error,
    );
  }

  // --- Step 1: is a healthy PocketBase already running? ------------------
  // On Hostinger (and similar managed Node hosts), a redeploy or restart
  // does not always guarantee the PREVIOUS instance of this app — and the
  // PocketBase child it spawned — are fully terminated before the NEW
  // instance starts. If that previous PocketBase is still alive and
  // healthy, spawning a second one on the same port is not just wasteful,
  // it fails outright with `EADDRINUSE` ("address already in use"). And if
  // TWO instances reach this at nearly the same moment, a plain check-then-
  // spawn is a race that can start two PocketBase processes against the
  // same pb_data files at once (SQLite "database is locked" during
  // migrations) — so this goes through ensurePocketbaseRunning(), which is
  // guarded by a real cross-process lock (see above) rather than spawning
  // directly here.
  //
  // Deliberately NOT awaited here. ensurePocketbaseRunning() can legitimately
  // take up to ~60s: acquiring the cross-process lock, then (per its own
  // "Hold the lock until PocketBase is actually confirmed healthy" comment)
  // blocking for up to another 60 one-second retries while PocketBase's
  // first-boot migrations run. `await`-ing it right here — as this used to
  // do, despite Step 2's own comment already saying app.listen() must not be
  // gated on PocketBase readiness — defeated that intent completely: it made
  // Step 2 wait for the exact same up-to-60s window before ever calling
  // listen(), which is what actually produced Hostinger's "App did not call
  // listen() within 3 seconds" supervisor timeout (seen in production
  // together with a PocketBase spawn permission failure that kept it from
  // ever becoming healthy, so the wait ran the full 60s every time). The
  // lock inside ensurePocketbaseRunning() already makes concurrent callers
  // (this one, Step 3's self-healing retry, and the Step 4 watchdog) safe
  // to run independently, so nothing here needs to wait for it to finish.
  ensurePocketbaseRunning().catch((error) => {
    console.error('ensurePocketbaseRunning() failed:', error && error.stack ? error.stack : error);
  });

  // --- Step 2: start the API immediately — do not gate app.listen() on ---
  // PocketBase readiness. Hostinger's process supervisor expects this app
  // to call listen() on its assigned port within a few seconds of starting
  // (its own logs have shown "App did not call listen() within 3 seconds"
  // when that didn't happen); PocketBase's own first-boot migrations can
  // legitimately take longer than that. Blocking the API's listen() behind
  // PocketBase's health check risked exactly that timeout, which then
  // caused Hostinger to restart the app — spawning a SECOND PocketBase
  // while the first one (from the killed-but-not-yet-cleaned-up previous
  // instance) was still alive, which is the direct cause of the
  // `EADDRINUSE` seen in production. The API's own PocketBase reverse
  // proxy (apps/api/src/main.js) already replies with a clean 502 if
  // PocketBase isn't reachable yet, so it is safe to open the API's HTTP
  // port before PocketBase finishes booting.
  try {
    const apiModule = await import('./apps/api/src/main.js');
    apiServer = apiModule.server || null;
  } catch (error) {
    console.error('FATAL: the API failed to start:', error && error.stack ? error.stack : error);
    killOwnedPocketbase('SIGTERM');
    process.exit(1);
  }

  // --- Step 3: confirm PocketBase becomes healthy, in the background -----
  // Purely for logging/diagnostics and to detect a genuine PocketBase
  // failure (as opposed to a benign "someone else already owns the port"
  // exit) — this no longer blocks the API from having already started.
  const retries = 60;
  const delayMs = 1000;
  let becameHealthy = false;

  for (let i = 1; i <= retries && !becameHealthy && !shuttingDown; i++) {
    if (await checkHealth()) {
      becameHealthy = true;
      break;
    }

    // If we spawned PocketBase ourselves and it has already exited, there
    // is no point continuing to poll — but per the note above, an exit
    // does not automatically mean failure: re-check health once more
    // (a peer instance may own the port) before giving up on this retry.
    if (pb && pb.exitCode !== null) {
      if (await checkHealth()) {
        becameHealthy = true;
        break;
      }
    }

    // Self-healing handoff: if this instance reused a PEER's PocketBase
    // (pb is still null — we never spawned our own) and that peer has since
    // gone away (e.g. it was the OLD instance from a redeploy, and it has
    // now finished its own graceful SIGTERM shutdown), nothing is left
    // running PocketBase at all. Rather than wait forever for a process
    // that no longer exists, become the owner now — routed through
    // ensurePocketbaseRunning() so this, too, is protected by the
    // cross-process lock rather than spawning directly.
    if (!pb && !shuttingDown) {
      await ensurePocketbaseRunning();
    }

    console.log(`Waiting for PocketBase to become healthy (${i}/${retries})...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (becameHealthy) {
    console.log('PocketBase confirmed healthy.');
  } else if (!shuttingDown) {
    console.error(`FATAL: no healthy PocketBase reachable at ${POCKETBASE_URL} after ${retries} retries (neither one we spawned nor an existing instance). The API is running but every PocketBase-backed feature (login, signup, properties, documents, etc.) will fail until this is fixed.`);
    // Deliberately NOT calling process.exit() here: the API is already up
    // and listening (Step 2 succeeded), which is what Hostinger's process
    // supervisor needs to see to consider this deploy alive. Killing the
    // whole process now would only restart the cycle that caused the
    // duplicate-spawn bug in the first place. The proxy's own 502 responses
    // make the real failure visible to any request that needs PocketBase,
    // and this error is printed clearly for anyone watching the logs.
  }

  // --- Step 4: ongoing watchdog, for the life of this process -------------
  // Step 3 above only confirms healthiness ONCE at startup. That is not
  // enough on its own: if this instance is reusing a PEER's PocketBase
  // (pb === null — we never spawned one ourselves), that peer can legitimately
  // go away LATER — most notably, it is the OLD instance from a redeploy,
  // and it finishes its own graceful SIGTERM shutdown (see `shutdown()`)
  // some time after this instance already confirmed it healthy and moved
  // on. Without an ongoing check, this instance would be left silently
  // relying on a PocketBase that no longer exists, indefinitely. This
  // lightweight interval keeps checking for exactly that case — and ONLY
  // that case; once this instance owns its own PocketBase (`pb` is
  // non-null), there is nothing left for this watchdog to do, so it stops.
  const watchdog = setInterval(async () => {
    if (shuttingDown) {
      clearInterval(watchdog);
      return;
    }
    if (pb) {
      // We already own a PocketBase instance (either we spawned it originally,
      // or a previous watchdog tick already healed us into owning one) — its
      // own exit handler and this process's shutdown() logic cover it now.
      clearInterval(watchdog);
      return;
    }
    const healthy = await checkHealth();
    if (!healthy) {
      console.log('Ongoing check: the reused PocketBase instance is no longer reachable — spawning our own now.');
      await ensurePocketbaseRunning();
    }
  }, 10000);
})();
