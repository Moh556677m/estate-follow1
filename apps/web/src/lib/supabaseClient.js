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
// Defensive cleanup: a value pasted into a hosting panel's env-var field
// often carries surrounding quotes ("https://xxx.supabase.co") or trailing
// whitespace/newline — either passes straight through to createClient()
// unless stripped here, and Supabase's internal URL building then produces
// a malformed request path (surfacing across every auth call as something
// like "Invalid path specified in request URL") instead of a clear
// config error. Trimmed and unquoted once, here, for both values.
export function cleanEnvValue(raw) {
  let value = String(raw || '').trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

const SUPABASE_URL = cleanEnvValue(import.meta.env.SUPABASE_URL);
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
