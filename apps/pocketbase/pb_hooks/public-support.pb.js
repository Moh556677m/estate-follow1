/// <reference path="../pb_data/types.d.ts" />

// Public Support & Help — used by the external (pre-login) pages for
// Owner / Broker / Brokerage Company accounts.
//
// Routes (all public, no auth required):
//   GET  /ef/public-support-settings — returns the public-facing texts only
//                                     (support name, form title, success
//                                     message). NEVER returns the receiving
//                                     email.
//   POST /ef/public-support          — validates the request and emails the
//                                     support team internally. Never exposes
//                                     the receiving email to the caller.
//
// Email delivery uses the platform mailer ($app.newMailClient().send()).
//
// IMPORTANT: PocketBase recompiles each routerAdd handler in a separate pooled
// VM, so handlers CANNOT access variables/helpers declared in the file's outer
// scope. Every handler is fully self-contained — all helpers are defined
// INSIDE the handler.

// GET — public texts only (never the receiving email).
routerAdd('GET', '/ef/public-support-settings', function (e) {
  function readSupportSettings() {
    var ss = {};
    try {
      var rows = $app.findAllRecords('platform_settings');
      if (rows && rows.length > 0) {
        var rec = rows[0];
        var cms = rec.get('cms') || {};
        ss = cms.support_settings || {};
      }
    } catch (_) {
      /* use defaults */
    }
    return ss;
  }

  var ss = readSupportSettings();
  return e.json(200, {
    support_name_en: ss.support_name_en || 'Support & Help',
    support_name_ar: ss.support_name_ar || 'الدعم والمساعدة',
    form_title_en: ss.form_title_en || 'Send Support Request',
    form_title_ar: ss.form_title_ar || 'إرسال طلب دعم',
    success_message_en:
      ss.success_message_en ||
      'Your support request has been sent successfully. Our support team will get back to you as soon as possible.',
    success_message_ar:
      ss.success_message_ar ||
      'تم إرسال طلبك بنجاح. سيتواصل معك فريق الدعم في أقرب وقت.',
  });
});

// POST — receive a public support request and email the team internally.
routerAdd('POST', '/ef/public-support', function (e) {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var DEFAULT_RECEIVING = 'support@estatefollow.com';

  function normalizeEmail(v) {
    return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function readSupportSettings() {
    var ss = {};
    try {
      var rows = $app.findAllRecords('platform_settings');
      if (rows && rows.length > 0) {
        var rec = rows[0];
        var cms = rec.get('cms') || {};
        ss = cms.support_settings || {};
      }
    } catch (_) {
      /* use defaults */
    }
    return ss;
  }

  var body = e.requestInfo().body || {};
  var name = String(body.name || '').trim();
  var email = normalizeEmail(body.email || '');
  var subject = String(body.subject || '').trim();
  var message = String(body.message || '').trim();
  var accountType = String(body.account_type || '').trim();
  var page = String(body.page || '').trim();
  var language = String(body.language || '').trim();

  // Always return the same generic shape — never leak validation details.
  function fail() {
    return e.json(200, { status: 'error' });
  }

  if (!name || !email || !EMAIL_RE.test(email) || !subject || !message) {
    return fail();
  }

  var ss = readSupportSettings();
  var receiving = normalizeEmail(ss.receiving_email || '') || DEFAULT_RECEIVING;

  var now = new Date();
  var iso = now.toISOString();
  var dateStr = iso.slice(0, 10);
  var timeStr = iso.slice(11, 19);

  var html =
    "<div style='font-family:sans-serif;max-width:560px;margin:auto'>" +
    "<h2 style='color:#1a2e4f'>New public support request / طلب دعم جديد</h2>" +
    "<table style='width:100%;border-collapse:collapse;font-size:14px'>" +
    "<tr><td style='padding:6px 0;color:#888;width:160px'>Name / الاسم</td><td style='padding:6px 0;font-weight:600'>" +
    esc(name) + "</td></tr>" +
    "<tr><td style='padding:6px 0;color:#888'>Email / البريد</td><td style='padding:6px 0;font-weight:600'>" +
    esc(email) + "</td></tr>" +
    "<tr><td style='padding:6px 0;color:#888'>Account type / نوع الحساب</td><td style='padding:6px 0;font-weight:600'>" +
    esc(accountType) + "</td></tr>" +
    "<tr><td style='padding:6px 0;color:#888'>Page / الصفحة</td><td style='padding:6px 0;font-weight:600'>" +
    esc(page) + "</td></tr>" +
    "<tr><td style='padding:6px 0;color:#888'>Subject / الموضوع</td><td style='padding:6px 0;font-weight:600'>" +
    esc(subject) + "</td></tr>" +
    "<tr><td style='padding:6px 0;color:#888'>Language / اللغة</td><td style='padding:6px 0;font-weight:600'>" +
    esc(language) + "</td></tr>" +
    "<tr><td style='padding:6px 0;color:#888'>Date / التاريخ</td><td style='padding:6px 0;font-weight:600'>" +
    esc(dateStr) + "</td></tr>" +
    "<tr><td style='padding:6px 0;color:#888'>Time / الوقت</td><td style='padding:6px 0;font-weight:600'>" +
    esc(timeStr) + " (UTC)</td></tr>" +
    "</table>" +
    "<hr style='border:none;border-top:1px solid #eee;margin:12px 0'/>" +
    "<p style='white-space:pre-wrap;font-size:14px'>" + esc(message) + "</p>" +
    "<p style='color:#888;font-size:12px;margin-top:18px'>Estate Follow — إستيت فولو</p></div>";

  try {
    $app.newMailClient().send(
      new MailerMessage({
        from: { name: 'Estate Follow Support' },
        to: [{ address: receiving }],
        replyTo: [{ address: email }],
        subject: '[Public Support] ' + subject,
        html: html,
      }),
    );
  } catch (err) {
    $app.logger().error('public support email failed', 'err', String(err));
    return fail();
  }

  return e.json(200, { status: 'ok' });
});
