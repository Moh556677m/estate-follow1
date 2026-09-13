// Auth-token refresh + 401-retry helpers for PocketBase SDK calls.
//
// WHY THIS EXISTS:
// PocketBase returns HTTP 401 "The request requires valid record
// authorization token." when the auth token in pb.authStore is missing or
// expired/invalid. The boot authRefresh in AuthContext can fail silently
// (its catch keeps a stale token so the user is not logged out on a
// transient blip), which leaves the user appearing signed-in while the
// token is actually expired. The next authenticated write — e.g. saving
// the owner profile — then 401s with that exact message.
//
// These helpers make any PocketBase SDK write resilient to a stale token
// WITHOUT changing the OTP / login / session flow:
//   - ensureFreshToken(): proactively refresh the token before a write.
//   - withAuthRetry(fn):  run fn; on a 401, refresh the token once and retry.
//
// They never clear the auth store themselves — a refresh failure is surfaced
// to the caller so the UI can show a clear "session expired, please log in
// again" message instead of silently wiping the session.

import pb from '@/lib/pocketbaseClient';

let refreshInFlight = null;

/**
 * Refresh the auth token once. Deduplicates concurrent callers so a burst of
 * writes only triggers one refresh. Returns true on success, false on failure.
 * Never clears the store — the caller decides what to do on failure.
 */
export async function ensureFreshToken() {
  if (!pb.authStore.isValid) return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      await pb.collection('users').authRefresh({
        requestKey: `ensure-fresh-${Date.now()}`,
      });
      return true;
    } catch (err) {
      // 401 here means the token is too expired to refresh — surface false so
      // the caller can prompt re-login. Do NOT clear the store here.
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Run a PocketBase SDK operation, retrying once on a 401 after refreshing the
 * token. `fn` receives no arguments and should return the SDK promise.
 *
 * Returns whatever `fn` returns. Throws the original error if the retry also
 * fails, or if the token cannot be refreshed.
 */
export async function withAuthRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    const status = err?.status || err?.response?.status;
    if (status !== 401) throw err;
    // Token missing or expired — try one refresh, then retry the write once.
    const ok = await ensureFreshToken();
    if (!ok) throw err;
    return fn();
  }
}

export default { ensureFreshToken, withAuthRetry };
