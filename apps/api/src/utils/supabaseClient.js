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

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_SECRET_KEY);

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
