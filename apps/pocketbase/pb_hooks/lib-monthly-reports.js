// Monthly Reports engine (Task #12 — "التقارير الشهرية").
//
// Computes and stores one snapshot per owner per calendar month in the
// `monthly_reports` collection, then emails a summary via the centralized
// EmailService (lib-email.js). Required from both the manual admin-trigger
// route and the monthly cron job in monthly-reports.pb.js — same
// require()'d-local-CommonJS-module pattern already proven for
// lib-email.js / lib-marketing-send.js ($app, MailerMessage etc. ARE
// reachable from a required file).
//
// IMPORTANT — the numbers here intentionally mirror the exact calculation
// already used by the live owner dashboard
// (apps/web/src/components/SummaryCards.jsx), so a report never shows a
// number that disagrees with what the same owner would see live: if the
// dashboard says 3 rented properties, that month's report says 3 too. Two
// kinds of fields exist:
//   - "run-rate" fields (monthly_income, yearly_charges, approved/rented/
//     vacant counts) are a snapshot AT GENERATION TIME — matching the
//     dashboard's own live-recurring-value semantics, not a historical
//     ledger of what was actually collected that month (this app has no
//     separate bookkeeping/expense-ledger collection to reconstruct that
//     from — see Errors/Problem Solving note in the delivered report).
//   - "period-scoped" fields (monthly_installments, expiring_contracts) are
//     scoped to the specific calendar month the report covers.
//   - upcoming_payments / due_payments are a portfolio-wide snapshot at
//     generation time (matches the dashboard's own "upcoming"/"overdue"
//     cards, which are not month-scoped either).

const FEATURE_KEY = 'monthly_property_reports';

function readStr(rec, key) {
  try { const v = rec.getString(key); if (v) return v; } catch (_) {}
  try { const g = rec.get(key); if (g) return String(g); } catch (_) {}
  return '';
}
function readNum(rec, key) {
  try { const v = rec.get(key); const n = Number(v); return isNaN(n) ? 0 : n; } catch (_) { return 0; }
}
function norm(v) { return String(v || '').trim().toLowerCase(); }

/** "YYYY-MM" for the calendar month before `d` (defaults to now). */
function previousPeriod(d) {
  const ref = d instanceof Date ? d : new Date();
  const y = ref.getFullYear();
  const m = ref.getMonth(); // 0-based; m-1 == previous month, handles Jan->prev Dec via Date rollover
  const prev = new Date(y, m - 1, 1);
  return prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
}

function parsePeriod(period) {
  const m = String(period || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

function inPeriod(dateStr, year, month) {
  if (!dateStr) return false;
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() === month;
}

/**
 * Is the current owner/plan combination entitled to monthly_property_reports?
 * Mirrors the exact resolution logic in plan-entitlement.pb.js's
 * GET /ef/my-entitlements (kept here as its own small inline copy since that
 * file computes it per-request for the CURRENT auth user, while report
 * generation runs server-side for an arbitrary owner with no request/auth
 * context at all).
 */
function isEntitled(app, ownerRecord) {
  let featureRow = null;
  try {
    const rows = app.findRecordsByFilter('feature_entitlements', "feature_key = {:k}", '', 1, 0, { k: FEATURE_KEY });
    if (rows && rows.length > 0) featureRow = rows[0];
  } catch (_) {}
  if (!featureRow) return { available: false, reason: 'feature_not_configured' };

  const enabled = featureRow.get('enabled') !== false;
  if (!enabled) return { available: false, reason: 'disabled_by_admin' };

  function asArray(v) {
    try { const p = JSON.parse(String(v == null ? '[]' : v)); return Array.isArray(p) ? p : []; }
    catch (_) { return []; }
  }
  function asObject(v) {
    try { const p = JSON.parse(String(v == null ? '{}' : v)); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; }
    catch (_) { return {}; }
  }

  const allowedTypes = asArray(featureRow.get('allowed_account_types'));
  const allowedPlans = asArray(featureRow.get('allowed_plans'));
  const limitByPlan = asObject(featureRow.get('limit_by_plan'));
  const minProps = readNum(featureRow, 'min_property_count');

  const accountType = String(ownerRecord.get('account_type') || 'owner');
  if (allowedTypes.length > 0 && allowedTypes.indexOf(accountType) < 0) {
    return { available: false, reason: 'account_type_not_eligible' };
  }

  const pkgKey = String(ownerRecord.get('subscription_package') || 'none').trim().toLowerCase() || 'none';
  if (allowedPlans.length > 0 && allowedPlans.indexOf(pkgKey) < 0) {
    return { available: false, reason: 'plan_not_eligible' };
  }

  let used = 0;
  try {
    const rows = app.findRecordsByFilter(
      'properties',
      "owner = {:oid} && status != 'deleted' && status != 'archived'",
      '', 5000, 0, { oid: ownerRecord.id },
    );
    used = rows ? rows.length : 0;
  } catch (_) {}
  if (used < minProps) return { available: false, reason: 'min_property_count_not_met' };

  const limit = limitByPlan[pkgKey] != null ? limitByPlan[pkgKey] : (limitByPlan.default != null ? limitByPlan.default : 0);
  if (limit === 0) return { available: false, reason: 'not_included_in_plan' };

  return { available: true, reason: '' };
}

/** Every distinct owner id with at least one non-deleted/archived property. */
function listReportableOwnerIds(app) {
  let rows = [];
  try { rows = app.findRecordsByFilter('properties', "status != 'deleted' && status != 'archived'", '', 100000, 0, {}); }
  catch (_) { rows = []; }
  const seen = {};
  const out = [];
  rows.forEach((p) => {
    const oid = p.get('owner');
    const id = typeof oid === 'string' ? oid : (oid && oid.id) || '';
    if (id && !seen[id]) { seen[id] = true; out.push(id); }
  });
  return out;
}

/**
 * Compute the SummaryCards-equivalent stats for one owner, for `period`
 * ("YYYY-MM"). Read-only — never writes anything.
 */
function computeOwnerStats(app, ownerId, period) {
  const pp = parsePeriod(period);
  if (!pp) throw new Error('invalid period: ' + period);

  let properties = [];
  try { properties = app.findRecordsByFilter('properties', "owner = {:oid} && status = 'approved'", '', 100000, 0, { oid: ownerId }); } catch (_) {}

  const ready = properties.filter((p) => readStr(p, 'handover_status') === 'handover_completed').length;
  const underConstruction = properties.filter((p) => readStr(p, 'handover_status') === 'under_construction').length;
  const rentedProps = properties.filter((p) => readStr(p, 'type') === 'rented');
  const rentableProps = properties.filter((p) => ['cash', 'installment'].indexOf(readStr(p, 'type')) >= 0);

  const isVacant = (p) => !rentedProps.some(
    (r) => norm(readStr(r, 'building')) === norm(readStr(p, 'building')) &&
      norm(readStr(r, 'unit_number')) === norm(readStr(p, 'unit_number')),
  );
  const vacantProps = rentableProps.filter(isVacant);

  // Expiring contracts SCOPED TO THIS MONTH (a monthly report's own period),
  // unlike the live dashboard's rolling "next N days" window — a fixed past
  // or future calendar month is the more meaningful frame for a report.
  const expiringProps = rentedProps.filter((p) => inPeriod(readStr(p, 'contract_end_date'), pp.year, pp.month));

  const yearlyCharges = properties
    .filter((p) => readStr(p, 'service_charge_frequency') === 'yearly')
    .reduce((s, p) => s + readNum(p, 'service_charge_amount'), 0);

  const monthlyIncome = rentedProps.reduce((s, p) => s + readNum(p, 'rent_amount') / 12, 0);

  let payments = [];
  try { payments = app.findRecordsByFilter('payments', "owner = {:oid}", '', 100000, 0, { oid: ownerId }); } catch (_) {}
  const approvedIds = {};
  properties.forEach((p) => { approvedIds[p.id] = true; });
  const approvedPayments = payments.filter((p) => {
    const propId = p.get('property');
    const pid = typeof propId === 'string' ? propId : (propId && propId.id) || '';
    return approvedIds[pid];
  });

  const monthlyInstallments = approvedPayments
    .filter((p) => readStr(p, 'kind') === 'installment' && readStr(p, 'status') !== 'paid' && inPeriod(readStr(p, 'due_date'), pp.year, pp.month))
    .reduce((s, p) => s + readNum(p, 'amount'), 0);

  const upcomingPayments = approvedPayments.filter((p) => readStr(p, 'status') === 'upcoming').length;
  const duePayments = approvedPayments.filter((p) => readStr(p, 'status') === 'overdue').length;

  const propertyBreakdown = properties.map((p) => ({
    id: p.id,
    building: readStr(p, 'building'),
    unit_number: readStr(p, 'unit_number'),
    type: readStr(p, 'type'),
    usage_type: readStr(p, 'usage_type'),
    vacant: vacantProps.some((v) => v.id === p.id),
  }));

  return {
    period,
    approved_count: properties.length,
    rented_count: rentedProps.length,
    vacant_count: vacantProps.length,
    ready_count: ready,
    under_construction_count: underConstruction,
    expiring_contracts: expiringProps.length,
    monthly_income: monthlyIncome,
    yearly_charges: yearlyCharges,
    monthly_installments: monthlyInstallments,
    upcoming_payments: upcomingPayments,
    due_payments: duePayments,
    property_breakdown: propertyBreakdown,
    expiring_property_ids: expiringProps.map((p) => p.id),
    vacant_property_ids: vacantProps.map((p) => p.id),
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// IMPORTANT: do NOT use Number.prototype.toLocaleString() here — verified
// empirically that this PocketBase JSVM (goja) build does not implement it
// properly with a locale+options argument; it throws "RangeError:
// toString() radix argument must be between 2 and 36" (consistent with a
// minimal-engine shim that aliases toLocaleString to toString and then
// mis-forwards the locale string where a radix integer is expected). Format
// manually instead — a plain thousands-separator with no locale/Intl calls.
function money(n) {
  const v = Math.round(Number(n) || 0);
  const neg = v < 0;
  const s = String(Math.abs(v));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return (neg ? '-' : '') + out;
}

function buildReportEmailHtml(ownerName, stats) {
  const row = (label, value) =>
    '<tr><td style="padding:8px 0;color:#555">' + escapeHtml(label) + '</td>' +
    '<td style="padding:8px 0;text-align:end;font-weight:700;color:#1a2e4f" dir="ltr">' + escapeHtml(value) + '</td></tr>';
  return (
    '<div style="font-family:sans-serif;max-width:560px;margin:auto;background:#fff;border:1px solid #eee;border-radius:10px;padding:24px">' +
    '<h2 style="margin:0 0 4px;color:#1a2e4f">Monthly Report — ' + escapeHtml(stats.period) + '</h2>' +
    '<p style="margin:0 0 18px;color:#888;font-size:13px">' + escapeHtml(ownerName || '') + '</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
    row('Approved properties', String(stats.approved_count)) +
    row('Rented', String(stats.rented_count)) +
    row('Vacant', String(stats.vacant_count)) +
    row('Contracts expiring this month', String(stats.expiring_contracts)) +
    row('Monthly rental income', money(stats.monthly_income)) +
    row('Yearly service charges', money(stats.yearly_charges)) +
    row('Installments due this month', money(stats.monthly_installments)) +
    row('Upcoming payments', String(stats.upcoming_payments)) +
    row('Overdue payments', String(stats.due_payments)) +
    '</table>' +
    '<p style="margin-top:20px;color:#999;font-size:11px">Estate Follow — automated monthly summary</p>' +
    '</div>'
  );
}

/**
 * Generate (idempotently) the monthly report for one owner+period, and email
 * it if entitled. Returns { status: 'created'|'exists'|'not_entitled'|'error', report?, reason? }
 */
function generateReportForOwner(app, ownerId, period) {
  let existing = [];
  try { existing = app.findRecordsByFilter('monthly_reports', "owner = {:o} && period = {:p}", '', 1, 0, { o: ownerId, p: period }); } catch (_) {}
  if (existing && existing.length > 0) return { status: 'exists', report: existing[0] };

  let owner;
  try { owner = app.findRecordById('users', ownerId); }
  catch (_) { return { status: 'error', reason: 'owner_not_found' }; }

  const entitlement = isEntitled(app, owner);
  if (!entitlement.available) return { status: 'not_entitled', reason: entitlement.reason };

  let stats;
  try { stats = computeOwnerStats(app, ownerId, period); }
  catch (e) { return { status: 'error', reason: String(e) }; }

  const reportsCol = app.findCollectionByNameOrId('monthly_reports');
  const rec = new Record(reportsCol);
  rec.set('owner', ownerId);
  rec.set('period', period);
  rec.set('generated_at', new Date().toISOString());
  rec.set('approved_count', stats.approved_count);
  rec.set('rented_count', stats.rented_count);
  rec.set('vacant_count', stats.vacant_count);
  rec.set('expiring_contracts', stats.expiring_contracts);
  rec.set('monthly_income', stats.monthly_income);
  rec.set('yearly_charges', stats.yearly_charges);
  rec.set('monthly_installments', stats.monthly_installments);
  rec.set('upcoming_payments', stats.upcoming_payments);
  rec.set('due_payments', stats.due_payments);
  rec.set('summary_json', stats);
  rec.set('status', 'generated');
  rec.set('emailed', false);
  rec.set('email_error', '');

  try {
    app.save(rec);
  } catch (e) {
    // Most likely the unique (owner, period) index caught a race against a
    // concurrent generation (e.g. cron + manual trigger overlapping) —
    // re-check rather than surface a false failure.
    let raced = [];
    try { raced = app.findRecordsByFilter('monthly_reports', "owner = {:o} && period = {:p}", '', 1, 0, { o: ownerId, p: period }); } catch (_) {}
    if (raced && raced.length > 0) return { status: 'exists', report: raced[0] };
    return { status: 'error', reason: String(e) };
  }

  try {
    const { sendMail } = require(`${__hooks}/lib-email.js`);
    const ownerEmail = readStr(owner, 'email');
    const ownerName = readStr(owner, 'name');
    if (ownerEmail) {
      const html = buildReportEmailHtml(ownerName, stats);
      const ok = sendMail({
        to: ownerEmail,
        subject: 'Estate Follow — Monthly Report (' + period + ')',
        html,
        logContext: 'monthly-report-' + period,
      });
      rec.set('emailed', !!ok);
      if (!ok) rec.set('email_error', 'sendMail returned false');
      app.save(rec);
    }
  } catch (e) {
    try {
      rec.set('emailed', false);
      rec.set('email_error', String(e).slice(0, 500));
      app.save(rec);
    } catch (_) {}
  }

  return { status: 'created', report: rec };
}

/** Generate reports for every reportable owner for `period` (idempotent). */
function generateAllForPeriod(app, period) {
  const ownerIds = listReportableOwnerIds(app);
  const summary = { period, created: 0, exists: 0, not_entitled: 0, error: 0, details: [] };
  ownerIds.forEach((ownerId) => {
    let result;
    try { result = generateReportForOwner(app, ownerId, period); }
    catch (e) { result = { status: 'error', reason: String(e) }; }
    summary[result.status] = (summary[result.status] || 0) + 1;
    summary.details.push({ ownerId, status: result.status, reason: result.reason || '' });
  });
  return summary;
}

module.exports = {
  FEATURE_KEY,
  previousPeriod,
  parsePeriod,
  isEntitled,
  listReportableOwnerIds,
  computeOwnerStats,
  generateReportForOwner,
  generateAllForPeriod,
};
