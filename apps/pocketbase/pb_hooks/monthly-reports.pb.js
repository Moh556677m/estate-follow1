/// <reference path="../pb_data/types.d.ts" />

// Monthly Reports (Task #12 — "التقارير الشهرية").
//
// Real scheduler, not a "runs only when a browser is open" workaround: this
// repo's existing due-reminder sweep (alerts.pb.js) is explicitly
// pull-based ("the platform does not run cron, so due reminders are
// processed when the owner uses the app" — see alerts.pb.js's own header
// comment) because reminders only need to be *seen* the next time the
// owner opens the app. A monthly report is different — it must be
// generated and EMAILED even if the owner never opens the app that month —
// so this is the first real use of PocketBase's built-in `cronAdd()` in
// this codebase (confirmed available: pb_data/types.d.ts declares it,
// "available only in pb_hooks context").
//
// Runs daily at 03:00 server time rather than only on day 1, so a server
// restart/outage on the 1st doesn't silently skip the month —
// generateAllForPeriod() is idempotent (unique owner+period index in
// lib-monthly-reports.js / the monthly_reports migration), so re-running on
// day 2 or 3 is a harmless no-op for owners already generated.
cronAdd('monthly-property-reports', '0 3 * * *', () => {
  const { previousPeriod, generateAllForPeriod } = require(`${__hooks}/lib-monthly-reports.js`);
  const now = new Date();
  if (now.getDate() > 3) return; // only the first few days of the month
  const period = previousPeriod(now);
  try {
    const summary = generateAllForPeriod($app, period);
    $app.logger().info(
      'monthly reports cron run',
      'period', period,
      'created', summary.created,
      'exists', summary.exists,
      'not_entitled', summary.not_entitled,
      'error', summary.error,
    );
  } catch (e) {
    $app.logger().error('monthly reports cron failed', 'period', period, 'err', String(e));
  }
});

// ---------------------------------------------------------------------------
// POST /ef/monthly-reports/generate — super admin only.
// Body: { period?: "YYYY-MM" (defaults to previous calendar month),
//         ownerId?: string (defaults to every reportable owner) }
// Idempotent — safe to call repeatedly (used for manual "Generate Now"
// testing from Admin, and as a manual catch-up if the cron was ever
// disabled/missed).
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/monthly-reports/generate',
  (e) => {
    const { previousPeriod, parsePeriod, generateReportForOwner, generateAllForPeriod } = require(`${__hooks}/lib-monthly-reports.js`);

    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool('is_super_admin')) {
      return e.json(403, { error: 'Super Admin only' });
    }

    const body = info.body || {};
    let period = String(body.period || '').trim();
    if (!period) period = previousPeriod(new Date());
    if (!parsePeriod(period)) return e.json(400, { error: 'period must be "YYYY-MM"' });

    const ownerId = String(body.ownerId || '').trim();
    if (ownerId) {
      const result = generateReportForOwner($app, ownerId, period);
      if (result.status === 'error') return e.json(500, { error: result.reason || 'generation failed' });
      return e.json(200, {
        period,
        status: result.status,
        reason: result.reason || '',
        report: result.report
          ? {
              id: result.report.id,
              period: result.report.get('period'),
              status: result.report.get('status'),
              emailed: result.report.get('emailed'),
            }
          : null,
      });
    }

    const summary = generateAllForPeriod($app, period);
    return e.json(200, summary);
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// POST /ef/monthly-reports/resend-email — super admin only. Re-sends the
// email for an EXISTING report row without regenerating its numbers (a
// report is a frozen snapshot — only the delivery attempt is retried).
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/monthly-reports/resend-email',
  (e) => {
    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool('is_super_admin')) {
      return e.json(403, { error: 'Super Admin only' });
    }
    const body = info.body || {};
    const reportId = String(body.reportId || '').trim();
    if (!reportId) return e.json(400, { error: 'reportId required' });

    let report;
    try { report = $app.findRecordById('monthly_reports', reportId); }
    catch (_) { return e.json(404, { error: 'Report not found' }); }

    let owner;
    try { owner = $app.findRecordById('users', report.get('owner')); }
    catch (_) { return e.json(404, { error: 'Owner not found' }); }

    const ownerEmail = (() => { try { const v = owner.getString('email'); return v || ''; } catch (_) { return ''; } })();
    if (!ownerEmail) return e.json(400, { error: 'Owner has no email on file' });

    let stats;
    try { stats = report.get('summary_json'); } catch (_) { stats = null; }
    // json field read-back needs the same String()->JSON.parse workaround
    // documented in plan-entitlement.pb.js / lib-monthly-reports.js.
    try { stats = JSON.parse(String(stats)); } catch (_) {}
    if (!stats || typeof stats !== 'object') return e.json(500, { error: 'Report has no stored summary to re-send' });

    try {
      const { sendMail } = require(`${__hooks}/lib-email.js`);
      // See the identical note in lib-monthly-reports.js: toLocaleString()
      // is not safe in this PocketBase JSVM build — plain manual formatting
      // instead of Number.prototype.toLocaleString().
      const money = (n) => {
        const v = Math.round(Number(n) || 0);
        const neg = v < 0;
        const s = String(Math.abs(v));
        let out = '';
        for (let i = 0; i < s.length; i++) {
          if (i > 0 && (s.length - i) % 3 === 0) out += ',';
          out += s[i];
        }
        return (neg ? '-' : '') + out;
      };
      const row = (label, value) =>
        '<tr><td style="padding:8px 0;color:#555">' + label + '</td><td style="padding:8px 0;text-align:end;font-weight:700;color:#1a2e4f" dir="ltr">' + value + '</td></tr>';
      const html =
        '<div style="font-family:sans-serif;max-width:560px;margin:auto;background:#fff;border:1px solid #eee;border-radius:10px;padding:24px">' +
        '<h2 style="margin:0 0 4px;color:#1a2e4f">Monthly Report — ' + report.get('period') + '</h2>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
        row('Approved properties', String(stats.approved_count || 0)) +
        row('Rented', String(stats.rented_count || 0)) +
        row('Vacant', String(stats.vacant_count || 0)) +
        row('Monthly rental income', money(stats.monthly_income)) +
        row('Yearly service charges', money(stats.yearly_charges)) +
        row('Installments due this month', money(stats.monthly_installments)) +
        row('Upcoming payments', String(stats.upcoming_payments || 0)) +
        row('Overdue payments', String(stats.due_payments || 0)) +
        '</table></div>';
      const ok = sendMail({
        to: ownerEmail,
        subject: 'Estate Follow — Monthly Report (' + report.get('period') + ')',
        html,
        logContext: 'monthly-report-resend-' + report.get('period'),
      });
      report.set('emailed', !!ok);
      report.set('email_error', ok ? '' : 'sendMail returned false');
      $app.save(report);
      return e.json(200, { ok, emailed: !!ok });
    } catch (err) {
      report.set('emailed', false);
      report.set('email_error', String(err).slice(0, 500));
      try { $app.save(report); } catch (_) {}
      return e.json(500, { error: String(err).slice(0, 300) });
    }
  },
  $apis.requireAuth(),
);
