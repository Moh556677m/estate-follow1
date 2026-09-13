import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import pb from '@/lib/pocketbaseClient';
import {
  registerSession,
  checkSessionState,
  logoutCurrentDevice,
  logoutAllSessions,
  heartbeatSession,
  mapSessionError,
} from '@/lib/sessions';
import { loginOnesignalUser, logoutOnesignalUser } from '@/lib/onesignal';

const AuthContext = createContext(null);

const HEARTBEAT_MS = 4 * 60 * 1000; // keep session fresh while the app is open

/** Lowercase + trim — single source of truth for login/signup identity. */
export function normalizeEmail(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function authError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

/**
 * Map PocketBase / hook failures to stable client codes.
 * NEVER collapse suspended / inactive / session-limit into "invalid credentials".
 * NEVER treat session-layer 400s as bad password.
 */
export function classifyAuthError(err) {
  if (!err) return authError('AUTH_ERROR', 'auth_error');

  // Preserve already-classified errors (including session mapper output).
  if (err.code && typeof err.code === 'string' && !String(err.code).startsWith('validation')) {
    const known = [
      'INVALID_CREDENTIALS',
      'ACCOUNT_SUSPENDED',
      'ACCOUNT_INACTIVE',
      'ACCOUNT_PENDING',
      'MAX_SESSIONS',
      'MAX_DEVICES',
      'DEVICE_EXISTS',
      'SESSION_ERROR',
      'AUTH_ERROR',
      'STAFF_PORTAL_ONLY',
      'OWNER_PORTAL_ONLY',
    ];
    if (known.includes(err.code)) return err;
  }

  const msg = String(
    err?.response?.message || err?.data?.message || err?.message || '',
  );
  const data = err?.response?.data || err?.data || {};
  const blob = `${msg} ${JSON.stringify(data)}`.toLowerCase();

  if (
    blob.includes('account_suspended') ||
    blob.includes('account suspended') ||
    blob.includes('"suspended"')
  ) {
    return authError('ACCOUNT_SUSPENDED', msg);
  }
  if (blob.includes('account_inactive') || blob.includes('account inactive')) {
    return authError('ACCOUNT_INACTIVE', msg);
  }
  if (blob.includes('account_pending') || blob.includes('pending_signup')) {
    return authError('ACCOUNT_PENDING', msg);
  }
  if (
    blob.includes('max_sessions') ||
    blob.includes('max_devices') ||
    blob.includes('max sessions')
  ) {
    return authError('MAX_SESSIONS', msg);
  }
  if (blob.includes('device_exists')) {
    return authError('DEVICE_EXISTS', msg);
  }
  if (blob.includes('staff_portal_only')) {
    return authError('STAFF_PORTAL_ONLY', msg);
  }
  if (blob.includes('owner_portal_only')) {
    return authError('OWNER_PORTAL_ONLY', msg);
  }

  // Only pure credential failures — do NOT use bare status===400 (session
  // create/update also returns 400 and must not look like a wrong password).
  if (
    blob.includes('invalid login') ||
    blob.includes('invalid credentials') ||
    blob.includes('failed to authenticate') ||
    blob.includes('invalid email or password')
  ) {
    return authError('INVALID_CREDENTIALS', msg);
  }

  // PB auth-with-password with unknown identity is typically 400 + that message.
  if (
    err?.status === 400 &&
    (blob.includes('auth') || blob.includes('password') || blob.includes('identity'))
  ) {
    return authError('INVALID_CREDENTIALS', msg);
  }

  return authError('AUTH_ERROR', msg || 'auth_error');
}

function assertAccountAllowed(record) {
  if (!record) {
    throw authError('INVALID_CREDENTIALS');
  }
  // Super Admin can never be locked out by stale flags.
  const email = normalizeEmail(record.email);
  const isSuper =
    !!record.is_super_admin || email === 'admin@estatefollow.com';
  if (isSuper) return;

  if (record.pending_signup) {
    throw authError('ACCOUNT_PENDING');
  }
  const state = String(record.account_state || '').toLowerCase();
  if (record.suspended || state === 'suspended') {
    throw authError('ACCOUNT_SUSPENDED');
  }
  if (state === 'inactive') {
    throw authError('ACCOUNT_INACTIVE');
  }
}

/**
 * If account_type is missing on an older account, recover it from an owned
 * broker/company profile so the correct dashboard loads. Never overwrites an
 * explicit owner/broker/company value. Non-destructive.
 */
async function ensureAccountType(record) {
  if (!record?.id) return record;
  // Staff accounts stay on the admin surface.
  if (
    record.is_super_admin ||
    ['admin', 'editor', 'support', 'custom'].includes(record.role)
  ) {
    return record;
  }

  // This site is owner-only. Ensure every non-staff account is typed 'owner'.
  const current = String(record.account_type || '').toLowerCase();
  if (current === 'owner') return record;
  try {
    const updated = await pb.collection('users').update(
      record.id,
      { account_type: 'owner' },
      { requestKey: `at-fix-owner-${record.id}` },
    );
    return updated;
  } catch {
    return record;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(pb.authStore.record);
  const [bootstrapped, setBootstrapped] = useState(!pb.authStore.isValid);
  const heartbeatRef = useRef(null);

  useEffect(() => pb.authStore.onChange((_token, record) => setUser(record)), []);

  // Refresh token + verify this device session. Never treat refresh failure as
  // "wrong password" — only clear when the server says the session was revoked.
  useEffect(() => {
    if (!pb.authStore.isValid) {
      setBootstrapped(true);
      return;
    }

    let cancelled = false;

    const refreshUser = async () => {
      try {
        const result = await pb.collection('users').authRefresh({
          requestKey: `auth-refresh-boot-${Date.now()}`,
        });
        return result?.record || null;
      } catch (err) {
        // A cold-start / transient blip can fail the first refresh. Retry
        // once before giving up so the user never lands on stale localStorage.
        if (err?.status === 0) {
          try {
            const result = await pb.collection('users').authRefresh({
              requestKey: `auth-refresh-boot-retry-${Date.now()}`,
            });
            return result?.record || null;
          } catch {
            /* fall through */
          }
        }
        throw err;
      }
    };

    (async () => {
      try {
        const record = await refreshUser();
        if (!cancelled && record) {
          try {
            assertAccountAllowed(record);
            const fixed = await ensureAccountType(record);
            if (!cancelled) setUser(fixed || record);
          } catch {
            pb.authStore.clear();
            setUser(null);
            setBootstrapped(true);
            return;
          }
        }
      } catch {
        // Expired/revoked token — clear quietly. Network errors: keep store.
        if (!pb.authStore.isValid) {
          setUser(null);
        }
      }

      try {
        const state = await checkSessionState();
        if (cancelled) return;
        if (state === 'inactive') {
          // Explicitly revoked on this browser profile only.
          pb.authStore.clear();
          setUser(null);
        } else if (state === 'missing' && pb.authStore.isValid) {
          // Legacy session or new storage partition — register without failing boot.
          try {
            await registerSession();
          } catch (err) {
            const mapped = mapSessionError(err);
            if (mapped?.code === 'MAX_SESSIONS' || mapped?.code === 'MAX_DEVICES') {
              pb.authStore.clear();
              setUser(null);
            }
            // Other session errors: keep JWT so a transient glitch never locks out.
          }
        }
      } catch {
        /* keep session on transient errors */
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Heartbeat while signed in — prevents false "stale" recycling of live sessions.
  useEffect(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (!(user && pb.authStore.isValid)) return undefined;

    heartbeatRef.current = setInterval(() => {
      heartbeatSession().catch(() => {});
    }, HEARTBEAT_MS);

    // One immediate pulse after mount/login.
    heartbeatSession().catch(() => {});

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [user]);

  // Realtime: keep the signed-in user's own record in sync with the backend.
  // When admin approves/rejects/suspends the account, or any profile field
  // changes server-side, refresh the auth store so the UI reflects the real
  // state immediately — no stale "approved" badge that vanishes on refresh,
  // and no stale "incomplete" gate that lingers after approval. Debounced so
  // a burst of changes triggers one refresh, not many. Never clears the
  // session on transient network errors.
  useEffect(() => {
    if (!user?.id || !pb.authStore.isValid) return undefined;
    let debounce = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(async () => {
        try {
          const result = await pb.collection('users').authRefresh({
            requestKey: `rt-user-sync-${user.id}-${Date.now()}`,
          });
          if (result?.record) {
            try {
              assertAccountAllowed(result.record);
              setUser(result.record);
            } catch {
              // Account suspended/inactive server-side — honor it.
              pb.authStore.clear();
              setUser(null);
            }
          }
        } catch {
          /* keep session on transient errors */
        }
      }, 400);
    };
    void pb
      .collection('users')
      .subscribe('*', schedule)
      .catch(() => {});
    return () => {
      if (debounce) clearTimeout(debounce);
      void pb.collection('users').unsubscribe('*').catch(() => {});
    };
  }, [user?.id]);

  // OneSignal: link the push subscription to the signed-in user's backend id
  // (external id) + role tag so notifications can be targeted per user/role.
  // On sign-out the external-id association is removed. All OneSignal calls
  // are queued + try/catch wrapped in @/lib/onesignal, so a SDK outage or
  // blocked permission can never affect auth or the SPA.
  useEffect(() => {
    if (user?.id && pb.authStore.isValid) {
      loginOnesignalUser(user);
    } else {
      logoutOnesignalUser();
    }
  }, [user?.id, pb.authStore.isValid]);

  const value = useMemo(
    () => ({
      user,
      isAuthed: !!(user && pb.authStore.isValid),
      bootstrapped,
      // `portal` tells the PocketBase-side login hook (see
      // pb_hooks/portal-login-separation.pb.js) which login page this
      // request came from, so staff/admin accounts and regular owner
      // accounts can be rejected server-side for using the wrong one —
      // not just via the client-side isStaff() check each page also does.
      login: async (email, password, { portal = 'user' } = {}) => {
        const normalized = normalizeEmail(email);
        const pass = String(password ?? '');

        if (!normalized || !pass) {
          throw authError('INVALID_CREDENTIALS');
        }

        let result;
        try {
          result = await pb.collection('users').authWithPassword(normalized, pass, {
            requestKey: `login-${normalized}-${Date.now()}`,
            headers: { 'X-Portal': portal },
          });
        } catch (err) {
          throw classifyAuthError(err);
        }

        let record = result?.record || pb.authStore.record;
        try {
          assertAccountAllowed(record);
        } catch (statusErr) {
          pb.authStore.clear();
          setUser(null);
          throw statusErr;
        }

        try {
          record = (await ensureAccountType(record)) || record;
        } catch {
          /* keep record */
        }

        setUser(record);

        // Session registration is independent of credential validity.
        // Only MAX_SESSIONS may undo a successful password login.
        try {
          await registerSession();
        } catch (err) {
          const mapped = mapSessionError(err);
          if (mapped?.code === 'MAX_SESSIONS' || mapped?.code === 'MAX_DEVICES') {
            pb.authStore.clear();
            setUser(null);
            throw authError('MAX_SESSIONS', mapped.message);
          }
          // Soft-fail everything else (network, validation, race) — user stays in.
          console.warn('session register soft-fail', mapped);
        }

        return result;
      },
      signup: async (email, password, extraFields = {}) => {
        const normalized = normalizeEmail(email);
        const body =
          extraFields instanceof FormData
            ? extraFields
            : {
                email: normalized,
                password,
                passwordConfirm: password,
                ...extraFields,
              };
        if (body instanceof FormData) {
          body.set('email', normalized);
        }
        await pb.collection('users').create(body);
        return pb.collection('users').authWithPassword(normalized, password);
      },
      logout: async () => {
        try {
          await logoutCurrentDevice();
        } catch {
          /* ignore */
        }
        pb.authStore.clear();
        setUser(null);
      },
      logoutAll: async () => {
        try {
          await logoutAllSessions();
        } catch {
          /* ignore */
        }
        pb.authStore.clear();
        setUser(null);
      },
    }),
    [user, bootstrapped],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
