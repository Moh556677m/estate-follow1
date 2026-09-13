import pb from '@/lib/pocketbaseClient';
import {
  getDeviceInfo,
  rotateSessionTokens,
  readStoredTokens,
  clearStoredTokens,
} from './device';

async function findMySession(userId, deviceId) {
  try {
    return await pb.collection('user_sessions').getFirstListItem(
      pb.filter('user = {:uid} && device_id = {:did}', {
        uid: userId,
        did: deviceId,
      }),
      { requestKey: `session-find-${deviceId}-${Date.now()}` },
    );
  } catch (err) {
    if (err?.status === 404) return null;
    // Auto-cancel / network blip — treat as missing so login can retry create.
    if (err?.status === 0) return null;
    throw err;
  }
}

function sessionLimitError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/**
 * Map session-layer failures. Never collapses into INVALID_CREDENTIALS.
 */
export function mapSessionError(err) {
  if (!err) return sessionLimitError('SESSION_ERROR');
  if (err.code === 'MAX_SESSIONS' || err.code === 'MAX_DEVICES' || err.code === 'DEVICE_EXISTS') {
    return err;
  }
  const msg = String(
    err?.response?.message || err?.data?.message || err?.message || err || '',
  );
  const blob = msg.toLowerCase();
  if (
    blob.includes('max_sessions') ||
    blob.includes('max_devices') ||
    blob.includes('max sessions')
  ) {
    return sessionLimitError('MAX_SESSIONS');
  }
  if (blob.includes('device_exists')) {
    return sessionLimitError('DEVICE_EXISTS');
  }
  const out = new Error(msg || 'SESSION_ERROR');
  out.code = 'SESSION_ERROR';
  out.cause = err;
  out.status = err?.status;
  return out;
}

function tokenPayload() {
  // Rotate on every successful login registration so each sign-in gets fresh ids.
  return rotateSessionTokens();
}

/**
 * Register or reactivate this browser profile as an active session.
 * Does NOT deactivate any other session. Throws .code = "MAX_SESSIONS" only
 * when 5 other fresh sessions are already active.
 */
export async function registerSession() {
  const userId = pb.authStore.record?.id;
  if (!userId) return null;

  const info = getDeviceInfo();
  const now = new Date().toISOString();
  const tokens = tokenPayload();
  const base = {
    device_name: info.device_name,
    device_type: info.device_type,
    browser: info.browser,
    last_active: now,
    last_seen_ms: Date.now(),
    session_token: tokens.session_token,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  };

  const existing = await findMySession(userId, info.device_id);

  try {
    if (existing) {
      // Same browser profile — refresh tokens + heartbeat / reactivate.
      // Never touches other sessions.
      return await pb.collection('user_sessions').update(
        existing.id,
        { ...base, active: true },
        { requestKey: `session-upsert-${existing.id}-${Date.now()}` },
      );
    }

    try {
      return await pb.collection('user_sessions').create(
        {
          device_id: info.device_id,
          ...base,
          active: true,
          user: userId,
        },
        { requestKey: `session-create-${info.device_id}-${Date.now()}` },
      );
    } catch (createErr) {
      const mapped = mapSessionError(createErr);
      // Race: another tab created the same device row — update instead.
      if (mapped?.code === 'DEVICE_EXISTS') {
        const again = await findMySession(userId, info.device_id);
        if (again) {
          return await pb.collection('user_sessions').update(
            again.id,
            { ...base, active: true },
            { requestKey: `session-race-${again.id}-${Date.now()}` },
          );
        }
      }
      throw mapped;
    }
  } catch (err) {
    throw mapSessionError(err);
  }
}

/**
 * Lightweight heartbeat — keeps this session from being marked stale.
 * Does not rotate tokens and never affects other sessions.
 */
export async function heartbeatSession() {
  const userId = pb.authStore.record?.id;
  if (!userId || !pb.authStore.isValid) return null;
  const info = getDeviceInfo();
  try {
    const existing = await findMySession(userId, info.device_id);
    if (!existing) return null;
    if (!existing.active) return existing;
    return await pb.collection('user_sessions').update(
      existing.id,
      {
        last_active: new Date().toISOString(),
        last_seen_ms: Date.now(),
      },
      { requestKey: `session-hb-${existing.id}` },
    );
  } catch {
    return null;
  }
}

/**
 * "active" | "inactive" | "missing"
 * Network errors return "active" so a blip never force-logs the user out.
 */
export async function checkSessionState() {
  const userId = pb.authStore.record?.id;
  if (!userId) return 'missing';
  const info = getDeviceInfo();
  try {
    const existing = await findMySession(userId, info.device_id);
    if (!existing) return 'missing';
    if (!existing.active) return 'inactive';
    // Fire-and-forget pulse
    pb.collection('user_sessions')
      .update(
        existing.id,
        {
          last_active: new Date().toISOString(),
          last_seen_ms: Date.now(),
        },
        { requestKey: `session-pulse-${existing.id}` },
      )
      .catch(() => {});
    return 'active';
  } catch {
    return 'active';
  }
}

export async function listSessions() {
  return pb.collection('user_sessions').getFullList({ sort: '-last_active' });
}

export function currentDeviceId() {
  return getDeviceInfo().device_id;
}

export function currentSessionToken() {
  return readStoredTokens().session_token;
}

export async function logoutSession(id) {
  return pb.collection('user_sessions').update(id, { active: false });
}

export async function logoutCurrentDevice() {
  const userId = pb.authStore.record?.id;
  if (!userId) {
    clearStoredTokens();
    return;
  }
  const info = getDeviceInfo();
  try {
    const existing = await findMySession(userId, info.device_id);
    if (existing && existing.active) {
      await pb.collection('user_sessions').update(
        existing.id,
        { active: false },
        { requestKey: `session-logout-self-${existing.id}` },
      );
    }
  } catch {
    /* ignore */
  }
  clearStoredTokens();
}

/** Log out every OTHER active session; keep the current browser profile. */
export async function logoutOtherSessions(deviceId) {
  const all = await listSessions();
  const did = deviceId || currentDeviceId();
  const others = all.filter((s) => s.active && s.device_id !== did);
  await Promise.all(
    others.map((s, i) =>
      pb
        .collection('user_sessions')
        .update(s.id, { active: false }, { requestKey: `logout-other-${i}` }),
    ),
  );
  return others.length;
}

/** Log out ALL sessions including current (caller should clear auth store). */
export async function logoutAllSessions() {
  const all = await listSessions();
  const active = all.filter((s) => s.active);
  await Promise.all(
    active.map((s, i) =>
      pb
        .collection('user_sessions')
        .update(s.id, { active: false }, { requestKey: `logout-all-${i}` }),
    ),
  );
  clearStoredTokens();
  return active.length;
}

export async function removeSession(id) {
  return pb.collection('user_sessions').delete(id);
}
