import pb from '@/lib/pocketbaseClient';

/**
 * Finalize a signup server-side.
 *
 * After OTP verification the client is authenticated as a placeholder user
 * (pending_signup = true, random password). PocketBase refuses to change an
 * auth record's password via the REST API without `oldPassword`, and the
 * client never knows the placeholder's random password — so the final commit
 * (real password + profile + clear pending_signup) MUST happen inside
 * PocketBase via the /ef/auth/finalize-signup route. This helper calls it.
 *
 * Non-destructive: only updates the authenticated user's own record. The
 * stable User ID is never recreated or lost.
 *
 * @param {object} fields { name, nationality, gender, phone, password, passwordConfirm }
 * @returns {Promise<{ ok: boolean, id: string }>}
 */
export async function finalizeSignup(fields) {
  const headers = {
    Authorization: pb.authStore.token || '',
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${pb.baseUrl}/ef/auth/finalize-signup`, {
    method: 'POST',
    headers,
    body: JSON.stringify(fields),
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
