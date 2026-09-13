/// <reference path="../pb_data/types.d.ts" />

// Task #18 — 5 more Feature Management features. Only 2 need a server
// route (tax-export needs a real CSV assembled server-side; command-center
// is a single combined summary so the frontend does not have to make 4
// separate calls). Custom Reports and What-if Simulator are pure frontend
// compositions over Task #17's existing routes (see the migration's header
// comment) — nothing to add here for those two.
//
// PB JSVM scope note: same as task17-features.pb.js — shared helpers are
// require()'d fresh inside every handler, never declared at file scope.

// ---------------------------------------------------------------------------
// GET /ef/features/tax-export?year=YYYY
// Real income/expense rows for the given year, as CSV text — the exact same
// `payments`/`owner_expenses` rows Net Property Profit already reads, just
// laid out for an accountant instead of aggregated into one number.
//
// Feature Management batch — feature #14 extension: this route now ALSO
// reads the current rental flow's `rent_payments` "checks" (status =
// 'collected'), not just the legacy `payments` collection — the same gap
// already found and fixed for the Property Calendar (#8), Property
// Statements (#9) and Lifetime Return (#11) was still open here and is
// closed the same way. A `country` column (from each property) was added
// so an accountant can filter/group the CSV by country themselves; see
// GET /ef/features/tax-summary below for a ready-made per-country total.
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/tax-export', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { isoDate, safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'tax_accounting_export');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const yearParam = parseInt(e.request.url.query().get('year'), 10);
  const year = Number.isFinite(yearParam) && yearParam > 2000 ? yearParam : new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  function inYear(dateVal) {
    const d = isoDate(dateVal);
    return d && d >= yearStart && d < yearEnd;
  }
  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });
  const propById = {};
  properties.forEach((p) => { propById[p.id] = p; });

  const paidPayments = safeList($app, 'payments', "owner = {:oid} && status = 'paid'", { oid: auth.id })
    .filter((r) => inYear(r.get('paid_at') || r.get('due_date')));
  const checksCollected = safeList($app, 'rent_payments', "owner = {:oid} && status = 'collected'", { oid: auth.id })
    .filter((r) => inYear(r.get('collected_at') || r.get('due_date')));
  const expenses = safeList($app, 'owner_expenses', 'owner = {:oid}', { oid: auth.id })
    .filter((r) => inYear(r.get('date')));

  const rows = [['type', 'category_or_kind', 'property', 'country', 'date', 'amount', 'currency']];
  paidPayments.forEach((r) => {
    const p = propById[r.get('property')];
    rows.push([
      'income',
      r.get('kind') || '',
      p ? `${p.get('building')}/${p.get('unit_number')}` : '',
      p ? (p.get('country') || '') : '',
      String(r.get('paid_at') || r.get('due_date') || '').slice(0, 10),
      Number(r.get('amount')) || 0,
      r.get('currency') || '',
    ]);
  });
  checksCollected.forEach((r) => {
    const p = propById[r.get('property')];
    rows.push([
      'income',
      'rent',
      p ? `${p.get('building')}/${p.get('unit_number')}` : '',
      p ? (p.get('country') || '') : '',
      String(r.get('collected_at') || r.get('due_date') || '').slice(0, 10),
      Number(r.get('amount')) || 0,
      r.get('currency') || '',
    ]);
  });
  expenses.forEach((r) => {
    const p = propById[r.get('property')];
    rows.push([
      'expense',
      r.get('category') || '',
      p ? `${p.get('building')}/${p.get('unit_number')}` : '',
      p ? (p.get('country') || '') : '',
      String(r.get('date') || '').slice(0, 10),
      Number(r.get('amount')) || 0,
      r.get('currency') || '',
    ]);
  });

  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');

  e.response.header().set('Content-Type', 'text/csv; charset=utf-8');
  e.response.header().set('Content-Disposition', `attachment; filename="tax-export-${year}.csv"`);
  return e.string(200, csv);
});

// ---------------------------------------------------------------------------
// GET /ef/features/tax-summary?year=YYYY
// Feature Management batch — feature #14: "Tax / Country Accounting
// Center" extension. A per-country breakdown (income, expenses, net) of
// the exact same rows tax-export downloads — for owners with properties
// in more than one country, so each country's figures can be reviewed or
// handed to a local accountant separately. Same two income sources as
// tax-export (legacy `payments` + current `rent_payments`).
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/tax-summary', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { isoDate, safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'tax_accounting_export');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const yearParam = parseInt(e.request.url.query().get('year'), 10);
  const year = Number.isFinite(yearParam) && yearParam > 2000 ? yearParam : new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  function inYear(dateVal) {
    const d = isoDate(dateVal);
    return d && d >= yearStart && d < yearEnd;
  }

  const properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });
  const propById = {};
  properties.forEach((p) => { propById[p.id] = p; });

  const paidPayments = safeList($app, 'payments', "owner = {:oid} && status = 'paid'", { oid: auth.id })
    .filter((r) => inYear(r.get('paid_at') || r.get('due_date')));
  const checksCollected = safeList($app, 'rent_payments', "owner = {:oid} && status = 'collected'", { oid: auth.id })
    .filter((r) => inYear(r.get('collected_at') || r.get('due_date')));
  const expenses = safeList($app, 'owner_expenses', 'owner = {:oid}', { oid: auth.id })
    .filter((r) => inYear(r.get('date')));

  const byCountry = {};
  function bucket(countryKey) {
    const key = countryKey || '—';
    if (!byCountry[key]) byCountry[key] = { income: 0, expenses: 0 };
    return byCountry[key];
  }
  paidPayments.forEach((r) => {
    const p = propById[r.get('property')];
    bucket(p ? p.get('country') : null).income += Number(r.get('amount')) || 0;
  });
  checksCollected.forEach((r) => {
    const p = propById[r.get('property')];
    bucket(p ? p.get('country') : null).income += Number(r.get('amount')) || 0;
  });
  expenses.forEach((r) => {
    const p = propById[r.get('property')];
    bucket(p ? p.get('country') : null).expenses += Number(r.get('amount')) || 0;
  });
  Object.keys(byCountry).forEach((k) => { byCountry[k].net = byCountry[k].income - byCountry[k].expenses; });

  const totals = Object.values(byCountry).reduce(
    (acc, c) => ({ income: acc.income + c.income, expenses: acc.expenses + c.expenses, net: acc.net + c.net }),
    { income: 0, expenses: 0, net: 0 },
  );

  return e.json(200, { year, byCountry, totals });
});

// ---------------------------------------------------------------------------
// GET /ef/features/command-center
// One combined summary (net profit totals, occupancy rate, open task count,
// this-month expense total) so the frontend makes ONE call instead of four
// separate ones. Every number here is recomputed the same way the
// individual features already compute it — never a second formula.
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/command-center', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { isoDate, safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'command_center');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });
  const approvedProperties = properties.filter((p) => p.get('status') === 'approved');
  const activeTenancies = safeList($app, 'tenancies', "owner = {:oid} && status = 'active'", { oid: auth.id });
  const activePropIds = {};
  activeTenancies.forEach((t) => { activePropIds[t.get('property')] = true; });
  let rented = 0;
  approvedProperties.forEach((p) => { if (activePropIds[p.id] || p.get('type') === 'rented') rented++; });
  const occupancyRate = approvedProperties.length > 0 ? Math.round((rented / approvedProperties.length) * 1000) / 10 : 0;

  const rentPayments = safeList($app, 'payments', "owner = {:oid} && kind = 'rent' && status = 'paid'", { oid: auth.id });
  const installmentPayments = safeList($app, 'payments', "owner = {:oid} && kind = 'installment' && status = 'paid'", { oid: auth.id });
  const allExpenses = safeList($app, 'owner_expenses', 'owner = {:oid}', { oid: auth.id });

  function inRange(dateVal, start, end) {
    const d = isoDate(dateVal);
    return d && d >= start && d < end;
  }

  const yearRentIncome = rentPayments.filter((r) => inRange(r.get('paid_at') || r.get('due_date'), yearStart, yearEnd)).reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
  const yearInstallments = installmentPayments.filter((r) => inRange(r.get('paid_at') || r.get('due_date'), yearStart, yearEnd)).reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
  const yearExpenses = allExpenses.filter((r) => inRange(r.get('date'), yearStart, yearEnd)).reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
  const netProfitYtd = yearRentIncome - yearInstallments - yearExpenses;

  const monthExpenses = allExpenses.filter((r) => inRange(r.get('date'), monthStart, monthEnd)).reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);

  const openTasks = safeList($app, 'owner_tasks', "owner = {:oid} && status != 'done'", { oid: auth.id });
  const overduePayments = safeList($app, 'payments', "owner = {:oid} && status = 'overdue'", { oid: auth.id });

  return e.json(200, {
    property_count: properties.length,
    occupancy_rate: occupancyRate,
    net_profit_ytd: netProfitYtd,
    month_expenses: monthExpenses,
    open_task_count: openTasks.length,
    overdue_payment_count: overduePayments.length,
    generated_at: new Date().toISOString(),
  });
});
