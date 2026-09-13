/// <reference path="../pb_data/types.d.ts" />

// ============================================================================
// Email / OTP delivery diagnostics — admin-only, non-secret.
//
// Surfaces the ACTUAL delivery configuration so an admin can see, from inside
// the app, which path an OTP/verification email will take:
//
//   GET /ef/email/status  →  {
//     resend_configured: bool,   // RESEND_API_KEY present in PB process env?
//     verify_from:        "verify@estatefollow.com",
//     notifications_from: "notifications@estatefollow.com",
//     smtp_enabled:       bool,  // custom SMTP enabled in settings?
//     app_url:            string,
//     timestamp:          string
//   }
//
// The RESEND_API_KEY value is NEVER returned — only whether it is set.
// Requires an authenticated Super Admin (or admin/staff role).
//
// Self-contained handler: PocketBase recompiles each routerAdd handler in an
// isolated JSVM scope, so no outer-scope variables are used.
// ============================================================================

routerAdd('GET', '/ef/email/status', (e) => {
  const auth = e.requestInfo().auth;
  const isSuper = !!auth && auth.getBool('is_super_admin');
  const role = auth ? String(auth.get('role') || '') : '';
  if (!isSuper && role !== 'admin' && role !== 'editor' && role !== 'support' && role !== 'custom') {
    throw new UnauthorizedError('Admin access required.');
  }

  const apiKey = $os.getenv('RESEND_API_KEY');
  const resendConfigured = !!(apiKey && String(apiKey).trim() !== '');

  let smtpEnabled = false;
  let appUrl = '';
  try {
    const s = $app.settings();
    smtpEnabled = !!s.smtp.enabled;
    appUrl = s.meta.appURL || '';
  } catch (_) {}

  return e.json(200, {
    resend_configured: resendConfigured,
    verify_from: 'verify@estatefollow.com',
    notifications_from: 'notifications@estatefollow.com',
    smtp_enabled: smtpEnabled,
    app_url: appUrl,
    timestamp: new Date().toISOString(),
  });
}, $apis.requireAuth('users'));
