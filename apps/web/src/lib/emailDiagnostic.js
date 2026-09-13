import pb from '@/lib/pocketbaseClient';

// Email service diagnostic + test — calls the Super-Admin-only PocketBase
// hook routes in 0-resend-mailer.pb.js. The API key is never exposed; these
// only return booleans, domain verification status, and send outcomes.

// Returns { resend_key_set, verify_from, notifications_from, domains[], domains_error, domains_status }
export async function getEmailDiagnostic() {
  return pb.send('/ef/email/diagnostic', { method: 'GET' });
}

// Sends a real test OTP-style email via the exact Resend path used for real
// OTPs. `to` defaults to the caller's own email. Returns { ok, reason, status, to, code }.
export async function sendTestEmail(to) {
  const body = to ? { to } : {};
  return pb.send('/ef/email/test', { method: 'POST', body });
}
