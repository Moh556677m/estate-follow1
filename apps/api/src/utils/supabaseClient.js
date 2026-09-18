// Server-side Supabase client. NEVER import this file from anything that
// ships to the browser (apps/web) — it holds the secret/service-role key,
// which must only ever exist on the server.
//
// Credentials come ONLY from environment variables — nothing is hardcoded
// here, and nothing here is ever logged (see the guards below).
//
//   SUPABASE_URL         — the project's REST/Auth URL (not secret, but
//                          also fine to keep server-side only here).
//   SUPABASE_SECRET_KEY  — the service-role / secret key. Bypasses Row
//                          Level Security — treat exactly like a database
//                          superuser password. Must never reach the
//                          frontend bundle, browser, logs, or API responses.
//
// This module intentionally does NOT throw if the variables are unset —
// Supabase is being wired in ALONGSIDE the existing PocketBase backend
// (per the current migration plan), so the rest of the app must keep
// working normally even before/without Supabase configured. Callers should
// check `isSupabaseConfigured` (or that `supabaseAdmin` is non-null) before
// using it.
import { createClient } from '@supabase/supabase-js';
import logger from './logger.js';

// Same defensive cleanup as apps/web/src/lib/supabaseClient.js (see that
// file's comments for the full story) — a value pasted into Hostinger's
// env-var panel often carries surrounding quotes, trailing whitespace/
// newlines, or an invisible Unicode character from a copy-paste, and any of
// those makes supabase-js fail deep inside its own request-path building
// with something like "Invalid path specified in request URL" or an opaque
// auth failure, on every single call, with no visible clue why. That fix was
// previously applied ONLY to the frontend's anon client — this server-side
// admin client (used by admin.createUser() during signup/OTP verification,
// among others) read the same two env vars completely raw, so the exact
// same class of Hostinger-panel contamination here would silently break
// account creation while showing "already exists" nowhere in the error,
// producing a generic 500 instead. Fixed here too, for real, not just on
// the browser side.
const INVISIBLE_CODE_POINTS = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
const INVISIBLE_CHARS_PATTERN = new RegExp(
  '[' + INVISIBLE_CODE_POINTS.map((cp) => String.fromCharCode(cp)).join('') + ']',
  'g',
);

function cleanEnvValue(raw) {
  let value = String(raw || '');
  value = value.replace(INVISIBLE_CHARS_PATTERN, '').trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

// A Supabase "Project URL" must be an origin with no path/query/hash — see
// apps/web/src/lib/supabaseClient.js's toOriginOnly() for the full
// explanation (the single most common real mistake: pasting the "JWT
// issuer" URL from Supabase's JWT Settings page, which ends in "/auth/v1",
// into the Project URL field instead of the plain project URL).
function toOriginOnly(value) {
  if (!value) return value;
  try {
    const parsed = new URL(value);
    const hasExtra = (parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash;
    if (hasExtra) {
      logger.error(
        '[Supabase config] SUPABASE_URL has a path/query after the domain ("' + value + '") — ' +
          'Supabase Project URLs must be just the origin, e.g. "https://xxxxx.supabase.co" with ' +
          'nothing after it. Using "' + parsed.origin + '" instead so account creation/reset keeps ' +
          'working, but the env var should be corrected to remove the extra path.',
      );
    }
    return parsed.origin;
  } catch {
    return value;
  }
}

const SUPABASE_URL = toOriginOnly(cleanEnvValue(process.env.SUPABASE_URL));
const SUPABASE_SECRET_KEY = cleanEnvValue(process.env.SUPABASE_SECRET_KEY);
// Not secret (it's the same key the browser bundle ships), but still worth
// exporting pre-cleaned so anything else that needs it (e.g.
// supabase-diagnostics.js) never has to re-read+re-sanitize process.env
// itself and risk drifting out of sync with this file's own cleanup.
export const SUPABASE_PUBLISHABLE_KEY = cleanEnvValue(process.env.SUPABASE_PUBLISHABLE_KEY);

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_SECRET_KEY);
// Safe to export — it's the project's public URL, not a secret.
export { SUPABASE_URL };

if (!isSupabaseConfigured && (process.env.SUPABASE_URL || process.env.SUPABASE_SECRET_KEY)) {
  // Only warn when a value was actually provided but rejected — an
  // intentionally unconfigured deployment (neither var set) stays silent.
  logger.error(
    'Supabase is misconfigured: SUPABASE_URL and SUPABASE_SECRET_KEY must both be set for regular-user ' +
      'signup/login/OTP/reset to work. (Lengths after cleanup — url:', SUPABASE_URL.length, 'key:', SUPABASE_SECRET_KEY.length, ')',
  );
}

export const supabaseAdmin = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        // This is a server-side service-role client used for one-off admin
        // operations, not a per-user session — never persist or auto-refresh
        // a session on it.
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Defense-in-depth: guarantee the secret key can never leak through an
// accidental console.log(supabaseAdmin) / JSON.stringify(supabaseAdmin) or
// similar in some other file. Node's util.inspect / JSON.stringify will
// call these instead of dumping internal client fields.
if (supabaseAdmin) {
  Object.defineProperty(supabaseAdmin, 'toJSON', {
    value: () => '[supabaseAdmin client — redacted]',
    enumerable: false,
  });
  Object.defineProperty(supabaseAdmin, Symbol.for('nodejs.util.inspect.custom'), {
    value: () => '[supabaseAdmin client — redacted]',
    enumerable: false,
  });
}
