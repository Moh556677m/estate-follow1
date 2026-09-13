import { describe, it, expect } from 'vitest';
import { cleanEnvValue, isValidSupabaseUrl } from '@/lib/supabaseClient';

// Regression guard for "Invalid path specified in request URL" appearing
// across every Auth flow (signup/login/forgot/reset) — the most likely
// cause is a malformed SUPABASE_URL build-time env var (surrounding quotes
// pasted into a hosting panel field, a trailing newline, or a bare domain
// missing "https://"), which used to reach Supabase's SDK unvalidated and
// fail deep inside it on every single auth call instead of failing
// cleanly and visibly at startup.
describe('cleanEnvValue', () => {
  it('strips wrapping double or single quotes pasted into an env var field', () => {
    expect(cleanEnvValue('"https://xxx.supabase.co"')).toBe('https://xxx.supabase.co');
    expect(cleanEnvValue("'https://xxx.supabase.co'")).toBe('https://xxx.supabase.co');
  });

  it('trims surrounding whitespace/newlines', () => {
    expect(cleanEnvValue('  https://xxx.supabase.co  \n')).toBe('https://xxx.supabase.co');
  });

  it('returns an empty string for null/undefined', () => {
    expect(cleanEnvValue(undefined)).toBe('');
    expect(cleanEnvValue(null)).toBe('');
  });
});

describe('isValidSupabaseUrl', () => {
  it('accepts a real http(s) URL', () => {
    expect(isValidSupabaseUrl('https://xxx.supabase.co')).toBe(true);
    expect(isValidSupabaseUrl('http://localhost:54321')).toBe(true);
  });

  it('rejects a bare domain missing the protocol', () => {
    expect(isValidSupabaseUrl('xxx.supabase.co')).toBe(false);
  });

  it('rejects an empty or non-URL value', () => {
    expect(isValidSupabaseUrl('')).toBe(false);
    expect(isValidSupabaseUrl('not a url')).toBe(false);
  });
});
