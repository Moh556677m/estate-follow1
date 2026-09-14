import { createClient } from '@supabase/supabase-js';

// Frontend Supabase client. ONLY the publishable (anon) key may ever be
// used here — it is designed to be public and safe inside a browser
// bundle, unlike the secret/service-role key (which lives only in
// apps/api/src/utils/supabaseClient.js, server-side).
//
// Regular-user identity now lives in Supabase Auth (signup, login, logout,
// forgot/reset password, session) — see contexts/AuthContext.jsx. Admin/
// staff accounts are untouched and still authenticate against PocketBase
// directly (AdminLoginPage.jsx).
//
// SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are NOT hardcoded — they are read
// from build-time environment variables. Vite only exposes VITE_-prefixed
// vars to import.meta.env by default, but this project's env vars are named
// SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY (no VITE_ prefix, matching the
// server-side names in apps/api/.env), so vite.config.js explicitly
// forwards just these two (non-secret) values via `define` at build time —
// see the comment there. The secret key is never touched by vite.config.js
// or referenced anywhere in this file/folder.

// Zero-width / formatting Unicode characters a copy-paste from a web page
// can silently carry along — invisible to the eye, NOT removed by a plain
// .trim() (they are not "whitespace" per the JS spec), and enough on their
// own to make Supabase's internal request-path building fail with
// something like "Invalid path specified in request URL" on every single
// auth call, with no visible clue why. Built from explicit numeric code
// points (never literal invisible characters in this source file) so this
// is reviewable and can never itself become a source of the exact class of
// invisible-character bug it exists to strip: U+200B zero width space,
// U+200C zero width non-joiner, U+200D zero width joiner, U+2060 word
// joiner, U+FEFF BOM / zero width no-break space.
const INVISIBLE_CODE_POINTS = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
const INVISIBLE_CHARS_PATTERN = new RegExp(
  '[' + INVISIBLE_CODE_POINTS.map((cp) => String.fromCharCode(cp)).join('') + ']',
  'g',
);

/**
 * Defensive cleanup: a value pasted into a hosting panel's env-var field
 * often carries surrounding quotes ("https://xxx.supabase.co"), trailing
 * whitespace/newline, or an invisible Unicode character from a copy-paste
 * — any of these passes straight through to createClient() unless stripped
 * here. Trimmed and unquoted once, here, for both SUPABASE_URL and
 * SUPABASE_PUBLISHABLE_KEY.
 */
export function cleanEnvValue(raw) {
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

/**
 * A Supabase "Project URL" must be an origin with NO path/query/hash —
 * exactly "https://<ref>.supabase.co", nothing after it. supabase-js
 * appends its own suffix on top of whatever is configured here
 * (GoTrueClient uses `${url}/auth/v1`, PostgrestClient uses `${url}/rest/v1`,
 * etc.) — if a path is already present (the single most common real-world
 * mistake: pasting the "JWT issuer" value shown on Supabase's JWT Settings
 * page, `https://<ref>.supabase.co/auth/v1`, into the Project URL field
 * instead of the plain project URL), every request ends up with that
 * segment duplicated, e.g. ".../auth/v1/auth/v1/token?grant_type=password".
 * Supabase's edge gateway rejects a request shaped like that with exactly
 * "Invalid path specified in request URL" — on EVERY auth call, since every
 * one of them goes through this same `${url}/auth/v1/...` construction,
 * which matches this exact, previously unexplained production symptom.
 * Rather than only detecting this, normalize it away: keep just the origin
 * and warn loudly if anything else was present, so a pasted "JWT issuer"
 * URL (or any other URL-with-a-path) self-heals instead of silently
 * breaking every single signup/login/forgot/reset call.
 */
export function toOriginOnly(value) {
  if (!value) return value;
  try {
    const parsed = new URL(value);
    const hasExtra = (parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash;
    if (hasExtra) {
      console.error(
        '[Supabase config] SUPABASE_URL has a path/query after the domain ' +
          '("' + value + '") — Supabase Project URLs must be just the origin, ' +
          'e.g. "https://xxxxx.supabase.co" with nothing after it. A common ' +
          'cause: pasting the "JWT issuer" URL from Supabase\'s JWT Settings ' +
          'page (which ends in "/auth/v1") instead of the plain Project URL. ' +
          'Using "' + parsed.origin + '" instead so auth keeps working, but ' +
          'the env var should be corrected to remove the extra path.',
      );
    }
    return parsed.origin;
  } catch {
    return value;
  }
}

const SUPABASE_URL = toOriginOnly(cleanEnvValue(import.meta.env.SUPABASE_URL));
const SUPABASE_PUBLISHABLE_KEY = cleanEnvValue(import.meta.env.SUPABASE_PUBLISHABLE_KEY);

// Beyond "is it set", the URL must actually be a valid, absolute
// http(s) URL — a bare domain (missing "https://"), a relative path, or
// any other malformed value would otherwise reach Supabase's internal
// request building and fail deep inside the SDK on every single auth call
// with a cryptic path error, instead of failing cleanly and visibly here.
export function isValidSupabaseUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured =
  isValidSupabaseUrl(SUPABASE_URL) && !!SUPABASE_PUBLISHABLE_KEY;

if (!isSupabaseConfigured && (import.meta.env.SUPABASE_URL || import.meta.env.SUPABASE_PUBLISHABLE_KEY)) {
  // Only warn when a value was actually provided but rejected — an
  // intentionally unconfigured deployment (neither var set) stays silent.
  console.error(
    'Supabase is misconfigured: SUPABASE_URL must be a full http(s) URL and SUPABASE_PUBLISHABLE_KEY must be set. ' +
      'Regular-user signup/login/session will not work until this is fixed.',
  );
}

// Self-diagnosing on every page load (not just on failure): the URL itself
// is not secret (only the key would be), so it's safe to print in full.
// JSON.stringify (not a plain template string) is deliberate — it makes an
// invisible character or unexpected quoting visible in the printed value
// itself (e.g. "​" or an embedded escaped quote), and reports the raw
// character length so a copy-paste artifact shows up as a length mismatch
// even if it renders identically to the real value. This is what should be
// pasted back for diagnosis instead of re-guessing blind: open DevTools
// Console on any page load and read this line.
console.info(
  '[Supabase config]',
  JSON.stringify({
    configured: isSupabaseConfigured,
    url: SUPABASE_URL || null,
    urlLength: SUPABASE_URL.length,
    publishableKeyLength: SUPABASE_PUBLISHABLE_KEY.length,
  }),
);

// A no-op stub when unconfigured (rather than throwing) so the rest of the
// app can still boot and show a clear error from AuthContext instead of a
// blank white screen if the env vars are ever missing/malformed on a given
// deploy.
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Best-effort mirror of the core profile fields onto Supabase's `profiles`
 * table (public.profiles, id = auth.users.id) — Supabase is the durable,
 * deploy-independent copy of a user's identity; PocketBase remains the
 * operational record every other feature (properties, payments, documents,
 * subscriptions) actually reads/writes, via the auth bridge (see
 * AuthContext.jsx). Only ever called for a Supabase-bridged PocketBase
 * record (one that carries a supabase_uid); a no-op otherwise, and NEVER
 * throws — a failed mirror must never block or fail a profile save whose
 * PocketBase write already succeeded.
 */
export async function mirrorProfileToSupabase(pbRecord) {
  if (!supabase || !pbRecord?.supabase_uid) return;
  try {
    await supabase.from('profiles').upsert({
      id: pbRecord.supabase_uid,
      email: pbRecord.email || '',
      name: pbRecord.name || '',
      nationality: pbRecord.nationality || '',
      gender: pbRecord.gender || '',
      phone: pbRecord.phone || '',
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* best-effort only */
  }
}

export default supabase;
