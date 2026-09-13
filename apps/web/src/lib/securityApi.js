import pb from '@/lib/pocketbaseClient';
import { getDeviceId, getDeviceInfo } from '@/lib/device';

function deviceLabel() {
  try {
    const meta = getDeviceInfo();
    return [meta.device_name, meta.browser, meta.device_type].filter(Boolean).join(' · ');
  } catch {
    return getDeviceId();
  }
}

async function securityFetch(path, { method = 'GET', body } = {}) {
  const headers = {
    Authorization: pb.authStore.token || '',
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${pb.baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify({ ...body, device: deviceLabel() }) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.data?.message ||
      (typeof data === 'object' && data?.data
        ? Object.values(data.data)
            .map((v) => v?.message)
            .filter(Boolean)
            .join(' ')
        : null) ||
      `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function getRecoveryEmail() {
  return securityFetch('/ef/security/recovery-email');
}

export async function requestPasswordChange({ currentPassword, newPassword }) {
  return securityFetch('/ef/security/request-password-change', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export async function confirmPasswordChange({ challengeId, code1, code2 }) {
  return securityFetch('/ef/security/confirm-password-change', {
    method: 'POST',
    body: { challengeId, code1, code2 },
  });
}

export async function requestRecoveryEmailChange({ newEmail }) {
  return securityFetch('/ef/security/request-recovery-email-change', {
    method: 'POST',
    body: { newEmail },
  });
}

export async function confirmRecoveryEmailChange({ challengeId, code1, code2 }) {
  return securityFetch('/ef/security/confirm-recovery-email-change', {
    method: 'POST',
    body: { challengeId, code1, code2 },
  });
}
