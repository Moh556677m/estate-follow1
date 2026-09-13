/// <reference path="../pb_data/types.d.ts" />

// ============================================================================
// Email / OTP delivery diagnostics — admin-only, non-secret.
//
// Surfaces the ACTUAL delivery configuration so an admin can see, from inside
// the app, which path an OTP/verification email will take:
//
//   GET /ef/email/status      → key-presence + SMTP summary (see below)
//   GET /ef/email/diagnostic  → the above PLUS live Resend domain-verification
//                                status (apps/web/src/lib/emailDiagnostic.js
//                                already calls this; the route did not exist
//                                until now, so that admin UI always 404'd)
//   POST /ef/email/test       → sends one real test email through the exact
//                                Resend path OTPs use, so an admin can see the
//                                precise failure (bad key vs unverified
//                                domain vs something else) instead of
//                                guessing from a user's "I never got the code"
//
// The RESEND_API_KEY value is NEVER returned — only whether it is set (and,
// for /status and /diagnostic, its length and whether it has stray
// whitespace — see the "resend_key_has_stray_whitespace" note below).
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

  const rawApiKey = String($os.getenv('RESEND_API_KEY') || '');
  const trimmedApiKey = rawApiKey.trim();
  const resendConfigured = trimmedApiKey !== '';
  // Never return the key itself — only enough shape info to tell a real
  // "not set" apart from "set but corrupted" (e.g. the panel value has a
  // stray leading/trailing space or newline pasted in, which used to pass
  // as "configured" everywhere yet still send an invalid Authorization
  // header to Resend and get a silent-looking 401).
  const resendKeyLooksTrimmed = rawApiKey === trimmedApiKey;

  let smtpEnabled = false;
  let appUrl = '';
  try {
    const s = $app.settings();
    smtpEnabled = !!s.smtp.enabled;
    appUrl = s.meta.appURL || '';
  } catch (_) {}

  return e.json(200, {
    resend_configured: resendConfigured,
    resend_key_length: trimmedApiKey.length,
    resend_key_has_stray_whitespace: resendConfigured && !resendKeyLooksTrimmed,
    verify_from: 'verify@estatefollow.com',
    notifications_from: 'notifications@estatefollow.com',
    smtp_enabled: smtpEnabled,
    app_url: appUrl,
    timestamp: new Date().toISOString(),
  });
}, $apis.requireAuth('users'));

routerAdd('GET', '/ef/email/diagnostic', (e) => {
  const auth = e.requestInfo().auth;
  const isSuper = !!auth && auth.getBool('is_super_admin');
  const role = auth ? String(auth.get('role') || '') : '';
  if (!isSuper && role !== 'admin' && role !== 'editor' && role !== 'support' && role !== 'custom') {
    throw new UnauthorizedError('Admin access required.');
  }

  const rawApiKey = String($os.getenv('RESEND_API_KEY') || '');
  const trimmedApiKey = rawApiKey.trim();
  const resendKeySet = trimmedApiKey !== '';

  let domains = [];
  let domainsError = '';
  let domainsStatus = 0;
  if (resendKeySet) {
    // Resend's own account-level domain list — this is what actually
    // determines whether verify@/notifications@estatefollow.com can send at
    // all (see 0-resend-mailer.pb.js's header comment on domain
    // verification). A domain missing here, or present with a
    // non-"verified" status, is the direct cause of every send failing with
    // HTTP 422 regardless of how correct the API key is.
    try {
      const res = $http.send({
        url: 'https://api.resend.com/domains',
        method: 'GET',
        headers: { Authorization: 'Bearer ' + trimmedApiKey },
      });
      domainsStatus = res.statusCode;
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const parsed = JSON.parse(res.body || '{}');
          domains = (parsed.data || []).map((d) => ({
            name: d.name,
            status: d.status,
            region: d.region,
          }));
        } catch (parseErr) {
          domainsError = 'parse-error: ' + String(parseErr);
        }
      } else {
        domainsError = 'http-' + res.statusCode + ': ' + String(res.body || '').slice(0, 300);
      }
    } catch (err) {
      domainsError = 'exception: ' + String(err);
    }
  }

  return e.json(200, {
    resend_key_set: resendKeySet,
    resend_key_length: trimmedApiKey.length,
    resend_key_has_stray_whitespace: resendKeySet && rawApiKey !== trimmedApiKey,
    verify_from: 'verify@estatefollow.com',
    notifications_from: 'notifications@estatefollow.com',
    domains,
    domains_error: domainsError,
    domains_status: domainsStatus,
  });
}, $apis.requireAuth('users'));

routerAdd('POST', '/ef/email/test', (e) => {
  const auth = e.requestInfo().auth;
  const isSuper = !!auth && auth.getBool('is_super_admin');
  const role = auth ? String(auth.get('role') || '') : '';
  if (!isSuper && role !== 'admin' && role !== 'editor' && role !== 'support' && role !== 'custom') {
    throw new UnauthorizedError('Admin access required.');
  }

  const body = e.requestInfo().body || {};
  const authEmail = auth ? String(auth.get('email') || '') : '';
  const to = String(body.to || authEmail || '').trim();
  if (!to) {
    throw new BadRequestError('A recipient email is required.');
  }

  const apiKey = String($os.getenv('RESEND_API_KEY') || '').trim();
  if (!apiKey) {
    return e.json(200, { ok: false, reason: 'no-key', status: 0, to });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const payload = {
    from: 'Estate Follow <verify@estatefollow.com>',
    to: [to],
    subject: 'Estate Follow — test email',
    html:
      '<p>This is a test email sent from the Estate Follow admin email-diagnostics panel, ' +
      'using the exact same Resend path real OTP emails use. Test code: <b>' + code + '</b></p>',
    text:
      'This is a test email sent from the Estate Follow admin email-diagnostics panel, ' +
      'using the exact same Resend path real OTP emails use. Test code: ' + code,
  };

  try {
    const res = $http.send({
      url: 'https://api.resend.com/emails',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return e.json(200, { ok: true, status: res.statusCode, to, code });
    }
    const responseBody = String(res.body || '').slice(0, 300);
    $app.logger().error(
      'Email diagnostics test-send rejected by Resend',
      'status', res.statusCode, 'body', responseBody,
    );
    return e.json(200, {
      ok: false,
      reason: 'http-' + res.statusCode,
      status: res.statusCode,
      to,
      body: responseBody,
    });
  } catch (err) {
    $app.logger().error('Email diagnostics test-send threw', 'err', String(err));
    return e.json(200, { ok: false, reason: 'exception', status: 0, to });
  }
}, $apis.requireAuth('users'));
