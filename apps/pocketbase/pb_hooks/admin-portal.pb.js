/// <reference path="../pb_data/types.d.ts" />

// Admin & Staff Portal — security alert on password recovery attempt.
// Fires when someone enters an email on the admin forgot-password page.
// Best-effort: never reveals whether the account exists to the caller; only
// sends an internal alert email when the account is real. Self-contained handler.

routerAdd('POST', '/ef/security-alert', (e) => {
  const normalizeEmail = (value) =>
    String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

  const body = e.requestInfo().body || {};
  const email = normalizeEmail(body.email || '');
  const info = body.info || {};

  // Always return the same generic success so the endpoint cannot be used to
  // enumerate accounts.
  const ok = () =>
    e.json(200, { status: 'ok' });

  if (!email) return ok();

  let record = null;
  try {
    record = $app.findAuthRecordByEmail('users', email);
  } catch (_) {
    // No account — silently return ok (no alert, no enumeration signal).
    return ok();
  }

  // Only alert staff / super admin accounts (this is the admin portal).
  const isSuper = !!record.getBool('is_super_admin');
  const role = String(record.get('role') || '');
  const isStaff = isSuper || ['admin', 'editor', 'support', 'custom'].includes(role);
  if (!isStaff) return ok();

  const ua = String(info.userAgent || '');
  const time = String(info.time || new Date().toISOString());

  const html =
    "<div style='font-family:sans-serif;max-width:560px;margin:auto'>" +
    "<h2 style='color:#b91c1c'>Security Alert / تنبيه أمني</h2>" +
    "<p>A password recovery attempt was started for your admin account on the " +
    "Estate Follow Admin &amp; Staff Portal.</p>" +
    "<p><b>Time:</b> " + time + "</p>" +
    "<p><b>Device / Browser:</b> " + ua + "</p>" +
    "<p>If this was you, you can safely ignore this message. If this was not you, " +
    "sign in immediately and change your password, then review your active sessions.</p>" +
    "<hr style='border:none;border-top:1px solid #eee'/>" +
    "<p dir='rtl'>تم بدء محاولة استعادة كلمة مرور لحسابك الإداري في بوابة الإدارة.</p>" +
    "<p dir='rtl'>إذا لم تكن أنت، سجّل الدخول فوراً وغيّر كلمة مرورك وراجع جلساتك النشطة.</p>" +
    "<p style='color:#888;font-size:12px'>Estate Follow — Admin Portal</p></div>";

  {
    // Delegates to the centralized EmailService (lib-email.js).
    const { sendMail } = require(`${__hooks}/lib-email.js`);
    sendMail({
      to: email,
      subject: 'Security Alert / تنبيه أمني — Estate Follow Admin Portal',
      html: html,
      fromName: 'Estate Follow Security',
      logContext: 'admin-portal-security-alert',
    });
  }

  return ok();
});

// Public Admin Portal branding — returns only the admin_portal cms blob so the
// unauthenticated /admin/login page can render the portal name/slogan/logo.
// Never exposes the rest of platform_settings.
routerAdd('GET', '/ef/admin-portal-branding', (e) => {
  const DEFAULT_PORTAL = {
    name_en: 'Admin & Staff Portal',
    name_ar: 'بوابة الإدارة والموظفين',
    slogan_en:
      'Administration & staff portal — secure access for authorized personnel only.',
    slogan_ar: 'بوابة الإدارة والموظفين — وصول آمن للمخوّلين فقط.',
    logo_url: '',
    background_url: '',
    show_remember: true,
    show_forgot: true,
  };
  let portal = DEFAULT_PORTAL;
  try {
    const rows = $app.findAllRecords('platform_settings');
    if (rows && rows.length > 0) {
      const rec = rows[0];
      const cms = rec.get('cms') || {};
      const ap = cms.admin_portal || {};
      portal = {};
      Object.keys(DEFAULT_PORTAL).forEach((k) => {
        portal[k] = ap[k] !== undefined && ap[k] !== '' ? ap[k] : DEFAULT_PORTAL[k];
      });
    }
  } catch (_) {
    /* use defaults */
  }
  return e.json(200, { portal });
});
