import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import pb from '@/lib/pocketbaseClient';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import apiServerClient from '@/lib/apiServerClient';
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

/**
 * Map a Supabase Auth error to the same stable client codes classifyAuthError
 * produces, so every existing caller (LoginPage/SignupPage/ForgotPasswordPage)
 * keeps working against one consistent set of `.code` values regardless of
 * which backend actually handled the request.
 */
export function classifySupabaseError(err) {
  if (!err) return authError('AUTH_ERROR', 'auth_error');
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return authError('INVALID_CREDENTIALS', err.message);
  if (msg.includes('email not confirmed')) return authError('ACCOUNT_PENDING', err.message);
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return authError('ACCOUNT_EXISTS', err.message);
  }
  if (msg.includes('rate limit')) return authError('AUTH_ERROR', err.message);
  if (msg.includes('token has expired') || msg.includes('invalid') && msg.includes('otp')) {
    return authError('OTP_INVALID', err.message);
  }
  return authError('AUTH_ERROR', err.message || 'auth_error');
}

/**
 * Exchange a Supabase access token for a real PocketBase session (see
 * apps/api/src/routes/supabase-auth-bridge.js for the full explanation of
 * why this exists). On success, populates pb.authStore directly — every
 * OTHER piece of this app that reads pb.authStore/useAuth().user keeps
 * working completely unchanged, because as far as PocketBase is concerned
 * this is a completely normal auth session.
 */
async function bridgeToPocketbase(supabaseAccessToken) {
  const res = await apiServerClient.fetch('/auth/bridge', {
    method: 'POST',
    headers: { Authorization: `Bearer ${supabaseAccessToken}` },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data?.token || !data?.record) {
    const err = new Error(data?.message || 'Could not start your session.');
    err.status = res.status;
    err.code = data?.message === 'ACCOUNT_SUSPENDED' ? 'ACCOUNT_SUSPENDED' : undefined;
    throw err;
  }
  pb.authStore.save(data.token, data.record);
  return data.record;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(pb.authStore.record);
  const [bootstrapped, setBootstrapped] = useState(!pb.authStore.isValid);
  const heartbeatRef = useRef(null);

  useEffect(() => pb.authStore.onChange((_token, record) => setUser(record)), []);

  // Refresh token + verify this device session. Never treat refresh failure as
  // "wrong password" — only clear when the server says the session was revoked.
  useEffect(() => {
    let cancelled = false;

    // Regular users now authenticate via Supabase (see login() below) — its
    // own session lives in its own storage, separate from pb.authStore. On a
    // fresh page load with no PocketBase token yet (or one that has since
    // expired), a still-valid Supabase session is the real signal that this
    // browser is actually signed in — re-bridge it to get a fresh PocketBase
    // token instead of treating this as "logged out". Skipped entirely when
    // pb.authStore is ALREADY valid (an admin/staff session — pure
    // PocketBase, no Supabase involved at all — or a regular user whose
    // bridged token from earlier this tab session is still fresh), so this
    // never disturbs that existing, working path.
    const restoreFromSupabase = async () => {
      if (pb.authStore.isValid || !isSupabaseConfigured) return false;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return false;
        const record = await bridgeToPocketbase(token);
        if (cancelled) return true;
        assertAccountAllowed(record);
        setUser(record);
        setBootstrapped(true);
        return true;
      } catch {
        // No valid Supabase session, or bridging failed — fall through to
        // the plain "not signed in" path below exactly as before.
        return false;
      }
    };

    if (!pb.authStore.isValid) {
      restoreFromSupabase().then((restored) => {
        if (!restored && !cancelled) setBootstrapped(true);
      });
      return () => {
        cancelled = true;
      };
    }

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
      // Slide the real auth token forward too, not just the user_sessions
      // "last_active" marker — heartbeatSession() only ever touched the
      // latter, so a long but continuously active session (tab left open
      // for hours) could still eventually hit the underlying PocketBase
      // token's own expiry with nothing renewing it in between. Best-effort:
      // a failure here is never surfaced or treated as a sign-out — the
      // existing per-write ensureFreshToken()/withAuthRetry() safety net
      // (apps/web/src/lib/authRefresh.js) still covers the case where this
      // happens to fail right before a save.
      pb.collection('users').authRefresh({ requestKey: `heartbeat-refresh-${Date.now()}` }).catch(() => {});
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
      // `portal` tells this function (and, for the admin path, the
      // PocketBase-side login hook — pb_hooks/portal-login-separation.pb.js)
      // which login page this request came from. Admin/staff auth is
      // completely untouched: pure PocketBase, exactly as before. Regular
      // users ('user', the default) now authenticate via Supabase Auth
      // directly — PocketBase still powers everything else (properties,
      // payments, documents, ...), reached via the auth bridge below.
      login: async (email, password, { portal = 'user' } = {}) => {
        const normalized = normalizeEmail(email);
        const pass = String(password ?? '');

        if (!normalized || !pass) {
          throw authError('INVALID_CREDENTIALS');
        }

        if (portal === 'admin') {
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

          try {
            await registerSession();
          } catch (err) {
            const mapped = mapSessionError(err);
            if (mapped?.code === 'MAX_SESSIONS' || mapped?.code === 'MAX_DEVICES') {
              pb.authStore.clear();
              setUser(null);
              throw authError('MAX_SESSIONS', mapped.message);
            }
            console.warn('session register soft-fail', mapped);
          }

          return result;
        }

        // --- Regular user: Supabase Auth, bridged to a real PocketBase
        // session so the rest of the app needs no other changes. ---
        if (!isSupabaseConfigured) {
          throw authError('AUTH_ERROR', 'Supabase is not configured on this deployment.');
        }
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalized,
          password: pass,
        });
        if (error) throw classifySupabaseError(error);

        let record;
        try {
          record = await bridgeToPocketbase(data.session.access_token);
        } catch (bridgeErr) {
          await supabase.auth.signOut().catch(() => {});
          throw bridgeErr?.code ? bridgeErr : authError('AUTH_ERROR', bridgeErr?.message);
        }

        try {
          assertAccountAllowed(record);
        } catch (statusErr) {
          pb.authStore.clear();
          await supabase.auth.signOut().catch(() => {});
          setUser(null);
          throw statusErr;
        }

        setUser(record);

        try {
          await registerSession();
        } catch (err) {
          const mapped = mapSessionError(err);
          if (mapped?.code === 'MAX_SESSIONS' || mapped?.code === 'MAX_DEVICES') {
            pb.authStore.clear();
            await supabase.auth.signOut().catch(() => {});
            setUser(null);
            throw authError('MAX_SESSIONS', mapped.message);
          }
          console.warn('session register soft-fail', mapped);
        }

        return { record };
      },
      // Regular-user signup only (admin/staff accounts are created from the
      // admin panel directly against PocketBase — unrelated to this). Sends
      // Supabase's own signup confirmation email (configure that project's
      // "Confirm signup" email template to send a {{ .Token }} OTP code to
      // keep the existing 6-digit-code UI in SignupPage.jsx working, or a
      // {{ .ConfirmationURL }} link if the OTP screen is dropped instead).
      signup: async (email, password) => {
        if (!isSupabaseConfigured) {
          throw authError('AUTH_ERROR', 'Supabase is not configured on this deployment.');
        }
        const normalized = normalizeEmail(email);
        const pass = String(password ?? '');
        if (!normalized || !pass) throw authError('INVALID_CREDENTIALS');
        const { data, error } = await supabase.auth.signUp({ email: normalized, password: pass });
        if (error) throw classifySupabaseError(error);
        return data;
      },
      // Verifies the signup confirmation code and completes sign-in in one
      // step (Supabase returns a real session from a successful verifyOtp).
      verifySignupOtp: async (email, token) => {
        if (!isSupabaseConfigured) {
          throw authError('AUTH_ERROR', 'Supabase is not configured on this deployment.');
        }
        const normalized = normalizeEmail(email);
        const { data, error } = await supabase.auth.verifyOtp({
          email: normalized,
          token: String(token || '').trim(),
          type: 'signup',
        });
        if (error) throw classifySupabaseError(error);
        const record = await bridgeToPocketbase(data.session.access_token);
        setUser(record);
        try {
          await registerSession();
        } catch (err) {
          console.warn('session register soft-fail', mapSessionError(err));
        }
        return record;
      },
      resendSignupOtp: async (email) => {
        if (!isSupabaseConfigured) {
          throw authError('AUTH_ERROR', 'Supabase is not configured on this deployment.');
        }
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: normalizeEmail(email),
        });
        if (error) throw classifySupabaseError(error);
      },
      // Forgot / reset password — regular users only, entirely via Supabase.
      requestPasswordReset: async (email) => {
        if (!isSupabaseConfigured) {
          throw authError('AUTH_ERROR', 'Supabase is not configured on this deployment.');
        }
        const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
        if (error) throw classifySupabaseError(error);
      },
      resendPasswordResetOtp: async (email) => {
        if (!isSupabaseConfigured) {
          throw authError('AUTH_ERROR', 'Supabase is not configured on this deployment.');
        }
        const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
        if (error) throw classifySupabaseError(error);
      },
      // Verifies the reset code — this opens a temporary Supabase "recovery"
      // session (not bridged/signed-in yet) just enough to allow setting a
      // new password next.
      verifyPasswordResetOtp: async (email, token) => {
        if (!isSupabaseConfigured) {
          throw authError('AUTH_ERROR', 'Supabase is not configured on this deployment.');
        }
        const normalized = normalizeEmail(email);
        const { data, error } = await supabase.auth.verifyOtp({
          email: normalized,
          token: String(token || '').trim(),
          type: 'recovery',
        });
        if (error) throw classifySupabaseError(error);
        return data;
      },
      // Sets the new password on the temporary recovery session opened by
      // verifyPasswordResetOtp, then signs it out — the user signs in fresh
      // afterwards with their new password, exactly like the old PocketBase
      // OTP-reset flow did.
      completePasswordReset: async (newPassword) => {
        if (!isSupabaseConfigured) {
          throw authError('AUTH_ERROR', 'Supabase is not configured on this deployment.');
        }
        const { error } = await supabase.auth.updateUser({ password: String(newPassword || '') });
        if (error) throw classifySupabaseError(error);
        await supabase.auth.signOut().catch(() => {});
      },
      logout: async () => {
        try {
          await logoutCurrentDevice();
        } catch {
          /* ignore */
        }
        pb.authStore.clear();
        if (isSupabaseConfigured) {
          try {
            await supabase.auth.signOut();
          } catch {
            /* ignore — a failed remote sign-out never blocks a local logout */
          }
        }
        setUser(null);
      },
      logoutAll: async () => {
        try {
          await logoutAllSessions();
        } catch {
          /* ignore */
        }
        pb.authStore.clear();
        if (isSupabaseConfigured) {
          try {
            await supabase.auth.signOut();
          } catch {
            /* ignore */
          }
        }
        setUser(null);
      },
    }),
    [user, bootstrapped],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
