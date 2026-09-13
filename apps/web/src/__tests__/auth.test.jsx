import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression tests for the auth stack. This session's incidents were caused
// by two failure modes, both of which have already broken production once:
//   1) An error-classification bug that showed the wrong message (e.g. a
//      real signup/finalize-signup validation error reported as "invalid
//      OTP code", or a rate-limit/network blip reported as "session
//      expired") — see classifyAuthError/classifySupabaseError below.
//   2) Admin auth accidentally sharing code with regular-user auth when the
//      two were meant to be completely independent (portal-login
//      separation, then again with the Supabase migration for regular
//      users only) — see the "portal separation" describe block below.
// These are fast, dependency-free checks that run on every push (apps/web's
// `npm test`, wired into .github/workflows/ci.yml's `build` job) — they
// exist specifically so a future edit that reintroduces either failure mode
// fails CI immediately instead of reaching production.

vi.mock('@/lib/pocketbaseClient', () => {
  const authStore = {
    isValid: false,
    record: null,
    token: '',
    save(token, record) {
      this.token = token;
      this.record = record;
      this.isValid = true;
    },
    clear() {
      this.token = '';
      this.record = null;
      this.isValid = false;
    },
    onChange: () => () => {},
  };
  const collectionApi = {
    authWithPassword: vi.fn(),
    authRefresh: vi.fn().mockRejectedValue(new Error('no session')),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: {
      authStore,
      collection: () => collectionApi,
    },
  };
});

vi.mock('@/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/lib/apiServerClient', () => ({
  default: { fetch: vi.fn() },
}));

vi.mock('@/lib/sessions', () => ({
  registerSession: vi.fn().mockResolvedValue(undefined),
  checkSessionState: vi.fn().mockResolvedValue('active'),
  logoutCurrentDevice: vi.fn().mockResolvedValue(undefined),
  logoutAllSessions: vi.fn().mockResolvedValue(undefined),
  heartbeatSession: vi.fn().mockResolvedValue(undefined),
  mapSessionError: vi.fn((e) => e),
}));

vi.mock('@/lib/onesignal', () => ({
  loginOnesignalUser: vi.fn(),
  logoutOnesignalUser: vi.fn(),
}));

import pb from '@/lib/pocketbaseClient';
import { supabase } from '@/lib/supabaseClient';
import apiServerClient from '@/lib/apiServerClient';
import {
  normalizeEmail,
  classifyAuthError,
  classifySupabaseError,
} from '@/contexts/AuthContext';

describe('normalizeEmail', () => {
  it('trims, lowercases, and strips internal whitespace', () => {
    expect(normalizeEmail('  User@Example.com ')).toBe('user@example.com');
    expect(normalizeEmail('a b@c.com')).toBe('ab@c.com');
    expect(normalizeEmail(null)).toBe('');
  });
});

describe('classifyAuthError (PocketBase)', () => {
  it('never reports account-status errors as invalid credentials', () => {
    expect(classifyAuthError({ status: 400, message: 'ACCOUNT_SUSPENDED' }).code).toBe('ACCOUNT_SUSPENDED');
    expect(classifyAuthError({ status: 400, message: 'account_pending' }).code).toBe('ACCOUNT_PENDING');
    expect(classifyAuthError({ status: 400, message: 'max_sessions' }).code).toBe('MAX_SESSIONS');
  });

  it('classifies a genuine bad-password response as INVALID_CREDENTIALS', () => {
    expect(classifyAuthError({ status: 400, message: 'Failed to authenticate.' }).code).toBe(
      'INVALID_CREDENTIALS',
    );
  });

  it('falls back to AUTH_ERROR (never INVALID_CREDENTIALS) for an unrecognized failure', () => {
    // Regression: this used to be misreported as "wrong password" for ANY
    // unrecognized error, including a shared rate-limit 429 — see the
    // AdminLoginPage.jsx / LoginPage.jsx fix this session.
    const result = classifyAuthError({ status: 429, message: 'Too many requests, please try again later' });
    expect(result.code).toBe('AUTH_ERROR');
    expect(result.code).not.toBe('INVALID_CREDENTIALS');
  });

  it('recognizes the portal-separation codes', () => {
    expect(classifyAuthError({ status: 400, message: 'STAFF_PORTAL_ONLY' }).code).toBe('STAFF_PORTAL_ONLY');
    expect(classifyAuthError({ status: 400, message: 'OWNER_PORTAL_ONLY' }).code).toBe('OWNER_PORTAL_ONLY');
  });
});

describe('classifySupabaseError', () => {
  it('maps known Supabase Auth messages to stable codes', () => {
    expect(classifySupabaseError({ message: 'Invalid login credentials' }).code).toBe('INVALID_CREDENTIALS');
    expect(classifySupabaseError({ message: 'Email not confirmed' }).code).toBe('ACCOUNT_PENDING');
    expect(classifySupabaseError({ message: 'User already registered' }).code).toBe('ACCOUNT_EXISTS');
  });

  it('falls back to AUTH_ERROR for anything unrecognized, never a fabricated specific code', () => {
    expect(classifySupabaseError({ message: 'some new Supabase error text' }).code).toBe('AUTH_ERROR');
    expect(classifySupabaseError(null).code).toBe('AUTH_ERROR');
  });
});

describe('login() portal separation (regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pb.authStore.clear();
  });

  it('portal="admin" only ever calls PocketBase, never Supabase', async () => {
    pb.collection().authWithPassword.mockResolvedValueOnce({
      record: { id: 'admin1', role: 'admin', is_super_admin: false, email: 'a@b.com' },
    });
    const { AuthProvider, useAuth } = await import('@/contexts/AuthContext');
    const React = await import('react');
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => React.createElement(AuthProvider, null, children),
    });

    await act(async () => {
      await result.current.login('a@b.com', 'password123', { portal: 'admin' });
    });

    expect(pb.collection().authWithPassword).toHaveBeenCalled();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('portal="user" (default) only ever calls Supabase, then bridges — never PocketBase authWithPassword directly', async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 'fake-supabase-token' } },
      error: null,
    });
    apiServerClient.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'fake-pb-token',
        record: { id: 'owner1', role: 'owner', is_super_admin: false, email: 'o@b.com' },
      }),
    });
    const { AuthProvider, useAuth } = await import('@/contexts/AuthContext');
    const React = await import('react');
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => React.createElement(AuthProvider, null, children),
    });

    await act(async () => {
      await result.current.login('o@b.com', 'password123');
    });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'o@b.com',
      password: 'password123',
    });
    expect(pb.collection().authWithPassword).not.toHaveBeenCalled();
    expect(apiServerClient.fetch).toHaveBeenCalledWith(
      '/auth/bridge',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
