// Frontend Supabase client. ONLY the publishable (anon) key may ever be
// used here — it is designed to be public and safe inside a browser
// bundle, unlike the secret/service-role key (which lives only in
// apps/api/src/utils/supabaseClient.js, server-side).
//
// SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are NOT hardcoded — they are
// read from build-time environment variables. Vite only exposes
// VITE_-prefixed vars to import.meta.env by default, but the project's
// env vars are named SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY (no VITE_
// prefix), so vite.config.js explicitly forwards just these two
// (non-secret) values via `define` at build time — see the comment there.
// The secret key is never touched by vite.config.js or referenced anywhere
// in this file/folder.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.SUPABASE_PUBLISHABLE_KEY || '';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

// null when not configured — callers must check isSupabaseConfigured (or
// truthiness of this export) before using it, since Supabase is being
// wired in alongside the existing PocketBase backend, not replacing it yet.
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

export default supabase;
