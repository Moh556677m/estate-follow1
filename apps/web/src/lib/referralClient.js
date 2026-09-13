import pb from '@/lib/pocketbaseClient';

// All referral/verification routes live on PocketBase under /ef/...
// pb.send uses the configured base URL (/hcgi/platform) and attaches the auth token.

export async function getMyReferral() {
  return pb.send('/ef/referral/me', { method: 'GET' });
}

export async function trackReferralClick(refUserId) {
  try {
    return await pb.send(`/ef/referral/track?ref=${encodeURIComponent(refUserId)}`, { method: 'GET' });
  } catch {
    /* best-effort */
  }
}

export async function getAdminReferralOverview() {
  return pb.send('/ef/referral/admin-overview', { method: 'GET' });
}

export async function saveReferralSettings(settings) {
  return pb.send('/ef/referral/admin/settings', { method: 'POST', body: settings });
}

export async function grantReward(rewardId) {
  return pb.send('/ef/referral/admin/grant-reward', { method: 'POST', body: { rewardId } });
}

export async function approveUser(userId, action, note = '') {
  return pb.send('/ef/referral/approve-user', { method: 'POST', body: { userId, action, note } });
}

// Send a referral invite email to a friend. The server builds the signup
// link with the caller's referral code embedded and delivers it via the
// platform mailer (Resend). Returns { ok: true } on success.
export async function sendReferralInvite(email) {
  return pb.send('/ef/referral/invite', {
    method: 'POST',
    body: { email },
  });
}

// ---- verification ----

export async function sendEmailCode() {
  return pb.send('/ef/verification/send-email-code', { method: 'POST' });
}

export async function verifyEmailCode(code) {
  return pb.send('/ef/verification/verify-email-code', { method: 'POST', body: { code } });
}

export async function sendPhoneCode() {
  return pb.send('/ef/verification/send-phone-code', { method: 'POST' });
}

export async function verifyPhoneCode(code) {
  return pb.send('/ef/verification/verify-phone-code', { method: 'POST', body: { code } });
}

export async function getVerificationStatus() {
  return pb.send('/ef/verification/status', { method: 'GET' });
}

export async function submitVerification() {
  return pb.send('/ef/verification/submit', { method: 'POST' });
}

// First-run "complete your profile" action (new-owner onboarding). Only
// requires date of birth + gender + one identity document — see
// pb_hooks/referrals.pb.js for the full rationale.
export async function completeBasicProfile() {
  return pb.send('/ef/profile/complete-basic', { method: 'POST' });
}

// Build the shareable referral link for the current user.
export function buildReferralLink(userId) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/signup?ref=${userId}`;
}
