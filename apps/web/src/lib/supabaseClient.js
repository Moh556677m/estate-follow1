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
const SUPABASE_URL = import.meta.env.SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.SUPABASE_PUBLISHABLE_KEY || '';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

// A no-op stub when unconfigured (rather than throwing) so the rest of the
// app can still boot and show a clear error from AuthContext instead of a
// blank white screen if the env vars are ever missing on a given deploy.
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
