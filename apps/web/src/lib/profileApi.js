import pb from '@/lib/pocketbaseClient';
import { ensureFreshToken } from '@/lib/authRefresh';

/**
 * Owner profile security API — change email and change phone with OTP
 * verification. All operations run server-side on the SAME user record:
 * the account is never deleted or recreated, and the permanent User ID is
 * preserved. The frontend keeps the session (no logout) after a change.
 */

async function profileFetch(path, { method = 'POST', body } = {}) {
  const doFetch = async () => {
    const headers = { Authorization: pb.authStore.token || '' };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(`${pb.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();
  // Stale / expired token → refresh once and retry, so an email/phone change
  // never fails with "The request requires valid record authorization token."
  // just because the session token aged out.
  if (res.status === 401) {
    const ok = await ensureFreshToken();
    if (ok) res = await doFetch();
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.data?.message ||
      (typeof data === 'object' && data?.data
        ? Object.values(data.data).map((v) => v?.message).filter(Boolean).join(' ')
        : null) ||
      `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// --- Change email (dual OTP) ---

export function requestEmailChange(newEmail) {
  return profileFetch('/ef/profile/request-email-change', { body: { newEmail } });
}

export function verifyOldEmailCode({ challengeId, code1 }) {
  return profileFetch('/ef/profile/verify-old-email', { body: { challengeId, code1 } });
}

export function confirmEmailChange({ challengeId, code2 }) {
  return profileFetch('/ef/profile/confirm-email-change', { body: { challengeId, code2 } });
}

// --- Change phone (single OTP to registered email) ---

export function requestPhoneChange(newPhone) {
  return profileFetch('/ef/profile/request-phone-change', { body: { newPhone } });
}

export function confirmPhoneChange({ challengeId, code1 }) {
  return profileFetch('/ef/profile/confirm-phone-change', { body: { challengeId, code1 } });
}
