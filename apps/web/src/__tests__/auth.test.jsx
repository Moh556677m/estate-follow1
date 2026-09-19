import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression tests for the auth stack — entirely PocketBase-native (no
// Supabase anywhere in this app anymore). This session's incidents were
// caused by failure modes that have already broken production before:
//   1) An error-classification bug that showed the wrong message (e.g. a
//      real signup/finalize-signup validation error reported as "invalid
//      OTP code", or a rate-limit/network blip reported as "session
//      expired") — see classifyAuthError below.
//   2) Admin auth accidentally sharing code with regular-user auth when the
//      two were meant to be completely independent (portal-login
//      separation) — see the "portal separation" describe block below.
//   3) Regular-user OTP must be generated, stored and delivered entirely by
//      apps/api's own Resend integration (routes/user-otp.js) — these tests
//      assert the exact backend routes each auth function calls.
// These are fast, dependency-free checks that run on every push (apps/web's
// `npm test`, wired into .github/workflows/ci.yml's `build` job) — they
// exist specifically so a future edit that reintroduces any of these
// failure modes fails CI immediately instead of reaching production.

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
import apiServerClient from '@/lib/apiServerClient';
import { normalizeEmail, classifyAuthError } from '@/contexts/AuthContext';

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

  it('never reports a rate limit as invalid credentials — classifies it as RATE_LIMITED', () => {
    // Regression: this used to be misreported as "wrong password" for ANY
    // unrecognized error, including a shared rate-limit 429. It now gets
    // its own distinct code so the UI can show a clear "too many requests"
    // message instead of either a confusing generic error or (worse) a
    // false "wrong password" — see LoginPage.jsx / AdminLoginPage.jsx.
    const result = classifyAuthError({ status: 429, message: 'Too many requests, please try again later' });
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.code).not.toBe('INVALID_CREDENTIALS');
  });

  it('falls back to AUTH_ERROR (never INVALID_CREDENTIALS) for a genuinely unrecognized failure', () => {
    const result = classifyAuthError({ status: 500, message: 'Something exploded' });
    expect(result.code).toBe('AUTH_ERROR');
    expect(result.code).not.toBe('INVALID_CREDENTIALS');
  });

  it('recognizes the portal-separation codes', () => {
    expect(classifyAuthError({ status: 400, message: 'STAFF_PORTAL_ONLY' }).code).toBe('STAFF_PORTAL_ONLY');
    expect(classifyAuthError({ status: 400, message: 'OWNER_PORTAL_ONLY' }).code).toBe('OWNER_PORTAL_ONLY');
  });
});

describe('login() portal separation (regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pb.authStore.clear();
  });

  it('portal="admin" calls PocketBase with X-Portal: admin', async () => {
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

    expect(pb.collection().authWithPassword).toHaveBeenCalledWith(
      'a@b.com',
      'password123',
      expect.objectContaining({ headers: { 'X-Portal': 'admin' } }),
    );
    expect(apiServerClient.fetch).not.toHaveBeenCalled();
  });

  it('portal="user" (default) calls PocketBase with X-Portal: user', async () => {
    pb.collection().authWithPassword.mockResolvedValueOnce({
      record: { id: 'owner1', role: 'owner', is_super_admin: false, email: 'o@b.com' },
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

    expect(pb.collection().authWithPassword).toHaveBeenCalledWith(
      'o@b.com',
      'password123',
      expect.objectContaining({ headers: { 'X-Portal': 'user' } }),
    );
    expect(apiServerClient.fetch).not.toHaveBeenCalled();
  });
});

describe('Signup/Forgot-Password OTP is Resend-only (regression guard)', () => {
  // Regular-user OTP must be generated, stored and delivered entirely by
  // apps/api's own Resend integration (routes/user-otp.js).
  beforeEach(() => {
    vi.clearAllMocks();
    pb.authStore.clear();
  });

  const setup = async () => {
    const { AuthProvider, useAuth } = await import('@/contexts/AuthContext');
    const React = await import('react');
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => React.createElement(AuthProvider, null, children),
    });
    return { result, act };
  };

  it('signup() calls only /user-otp/signup/start', async () => {
    apiServerClient.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const { result, act } = await setup();

    await act(async () => {
      await result.current.signup('new@user.com', 'password123!');
    });

    expect(apiServerClient.fetch).toHaveBeenCalledWith(
      '/user-otp/signup/start',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('verifySignupOtp() verifies via our backend, then authenticates directly against PocketBase', async () => {
    apiServerClient.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, userId: 'u1' }) }); // /signup/verify
    pb.collection().authWithPassword.mockResolvedValueOnce({
      record: { id: 'owner1', role: 'owner', email: 'new@user.com' },
    });
    const { result, act } = await setup();

    await act(async () => {
      await result.current.verifySignupOtp('new@user.com', '123456', 'password123!');
    });

    expect(apiServerClient.fetch).toHaveBeenCalledWith(
      '/user-otp/signup/verify',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(pb.collection().authWithPassword).toHaveBeenCalledWith('new@user.com', 'password123!');
  });

  it('resendSignupOtp() calls only /user-otp/signup/resend', async () => {
    apiServerClient.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const { result, act } = await setup();

    await act(async () => {
      await result.current.resendSignupOtp('new@user.com');
    });

    expect(apiServerClient.fetch).toHaveBeenCalledWith(
      '/user-otp/signup/resend',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('requestPasswordReset() / resendPasswordResetOtp() call only /user-otp/reset/*', async () => {
    apiServerClient.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const { result, act } = await setup();

    await act(async () => {
      await result.current.requestPasswordReset('user@x.com');
      await result.current.resendPasswordResetOtp('user@x.com');
    });

    expect(apiServerClient.fetch).toHaveBeenCalledWith(
      '/user-otp/reset/start',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(apiServerClient.fetch).toHaveBeenCalledWith(
      '/user-otp/reset/resend',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('verifyPasswordResetOtp() returns a resetTicket', async () => {
    apiServerClient.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, resetTicket: 'ticket-abc' }),
    });
    const { result, act } = await setup();

    let returned;
    await act(async () => {
      returned = await result.current.verifyPasswordResetOtp('user@x.com', '654321');
    });

    expect(returned).toEqual({ resetTicket: 'ticket-abc' });
    expect(apiServerClient.fetch).toHaveBeenCalledWith(
      '/user-otp/reset/verify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('completePasswordReset() sends the ticket to /user-otp/reset/complete', async () => {
    apiServerClient.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const { result, act } = await setup();

    await act(async () => {
      await result.current.completePasswordReset('user@x.com', 'ticket-abc', 'newPassword123!');
    });

    expect(apiServerClient.fetch).toHaveBeenCalledWith(
      '/user-otp/reset/complete',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
