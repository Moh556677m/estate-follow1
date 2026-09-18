/// <reference path="../pb_data/types.d.ts" />

// Regular-user "forgot password" completion — sets a NEW password directly,
// with no oldPassword, for a caller who isn't authenticated as that user yet
// (they already proved ownership of the mailbox via our own Resend OTP
// system — see apps/api/src/utils/userOtp.js + routes/user-otp.js's
// /reset/verify, which issues a single-use ticket, and /reset/complete,
// which consumes it before ever calling this route).
//
// PocketBase's REST API refuses to update an auth record's password without
// oldPassword, regardless of caller identity — the only way around that is
// record.setPassword() from inside a JSVM hook, exactly like
// finalize-signup.pb.js already does for the equivalent signup case.
//
// Restricted to a real PocketBase _superusers token — never callable by an
// ordinary users-collection session (mirrors
// order-activation-claim.pb.js's exact same restriction pattern). The only
// caller is apps/api's own service client (utils/pocketbaseClient.js),
// which only ever reaches here after it has already verified the OTP +
// single-use reset ticket itself.
//
// Staff/admin accounts are explicitly excluded — this route is for regular
// (owner/broker/company) accounts only. Admin/staff password reset stays on
// its own completely separate flow (AdminForgotPasswordPage.jsx), never
// this one, even if a staff member's email happens to pass the OTP step.
routerAdd('POST', '/ef/auth/otp-reset-password', (e) => {
  const auth = e.requestInfo().auth;
  let isServiceCaller = false;
  try {
    isServiceCaller = !!auth && auth.collection().name === '_superusers';
  } catch (_) {
    isServiceCaller = false;
  }
  if (!isServiceCaller) return e.json(403, { error: 'forbidden' });

  const body = (e.requestInfo && e.requestInfo() ? e.requestInfo().body : null) || {};
  const email = String(body.email || '').trim().toLowerCase();
  const newPassword = String(body.newPassword || '');
  if (!email || !newPassword || newPassword.length < 10) {
    return e.json(400, { error: 'invalid_request' });
  }

  let rec = null;
  try {
    rec = $app.findFirstRecordByFilter('users', 'email = {:email}', { email });
  } catch (_) {
    rec = null;
  }
  if (!rec) return e.json(404, { error: 'not_found' });

  let isStaffAccount = false;
  try {
    isStaffAccount =
      !!rec.getBool('is_super_admin') ||
      ['admin', 'editor', 'support', 'custom'].includes(String(rec.get('role') || ''));
  } catch (_) {
    isStaffAccount = false;
  }
  if (isStaffAccount) {
    return e.json(403, { error: 'staff_account_use_admin_portal' });
  }

  try {
    rec.setPassword(newPassword);
    $app.save(rec);
  } catch (err) {
    $app.logger().error('otp-reset-password save failed', 'email', email, 'err', String(err));
    return e.json(500, { error: 'reset_failed' });
  }

  return e.json(200, { ok: true, id: rec.id });
});
