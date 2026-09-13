/// <reference path="../pb_data/types.d.ts" />

// Task #17 — Central Features system. Read/aggregation routes for the
// features that need ZERO new collections (Net Property Profit, Cash Flow
// Forecast, Occupancy Rate, Property Timeline). Each route is gated
// server-side via lib-feature-gate.js's requireFeature() — the SAME
// eligibility logic GET /ef/my-entitlements uses to decide what the
// frontend shows, so a direct API call can never bypass what the nav
// already hides.
//
// Property Comparison and Property Management UIs both reuse the
// net-profit route (propertyIds filter) instead of a second calculation —
// see PropertyComparisonPanel.jsx / NetProfitPanel.jsx on the frontend.
//
// PB JSVM scope note: `isoDate`/`safeList` live in lib-owner-features.js and
// are require()'d fresh inside EVERY handler below — a plain top-level
// function declared in this file would NOT be visible inside a routerAdd
// callback (each one compiles in its own isolated VM in this PocketBase
// build; confirmed empirically — an earlier version of this file defined
// them at file scope and every route failed at runtime with
// "safeList is not defined"). require() is the only sharing mechanism that
// actually works here, same as lib-feature-gate.js.

// ---------------------------------------------------------------------------
// GET /ef/features/net-profit?year=YYYY&propertyIds=id1,id2
// Per-property net profit for the given calendar year (defaults to the
// current year): rent income received - expenses recorded - installments
// paid. Never touches other owners' data.
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/net-profit', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { isoDate, safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'net_property_profit');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const yearParam = parseInt(e.request.url.query().get('year'), 10);
  const year = Number.isFinite(yearParam) && yearParam > 2000 ? yearParam : new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const idsParam = String(e.request.url.query().get('propertyIds') || '').trim();
  const wantedIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : null;

  let properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });
  if (wantedIds) properties = properties.filter((p) => wantedIds.indexOf(p.id) >= 0);

  const rentPayments = safeList($app, 'payments', "owner = {:oid} && kind = 'rent' && status = 'paid'", { oid: auth.id });
  const installmentPayments = safeList($app, 'payments', "owner = {:oid} && kind = 'installment' && status = 'paid'", { oid: auth.id });
  const expenses = safeList($app, 'owner_expenses', 'owner = {:oid}', { oid: auth.id });

  function inYear(dateVal) {
    const d = isoDate(dateVal);
    return d && d >= yearStart && d < yearEnd;
  }

  const results = properties.map((p) => {
    const pid = p.id;
    const rentIncome = rentPayments
      .filter((r) => r.get('property') === pid && inYear(r.get('paid_at') || r.get('due_date')))
      .reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
    const installmentsPaid = installmentPayments
      .filter((r) => r.get('property') === pid && inYear(r.get('paid_at') || r.get('due_date')))
      .reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
    const propExpenses = expenses
      .filter((r) => r.get('property') === pid && inYear(r.get('date')))
      .reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
    const netProfit = rentIncome - propExpenses - installmentsPaid;
    return {
      propertyId: pid,
      building: p.get('building') || '',
      unit_number: p.get('unit_number') || '',
      rentIncome,
      expenses: propExpenses,
      installmentsPaid,
      netProfit,
    };
  });

  const totals = results.reduce(
    (acc, r) => ({
      rentIncome: acc.rentIncome + r.rentIncome,
      expenses: acc.expenses + r.expenses,
      installmentsPaid: acc.installmentsPaid + r.installmentsPaid,
      netProfit: acc.netProfit + r.netProfit,
    }),
    { rentIncome: 0, expenses: 0, installmentsPaid: 0, netProfit: 0 },
  );

  return e.json(200, { year, properties: results, totals });
});

// ---------------------------------------------------------------------------
// GET /ef/features/cash-flow-forecast?months=6
// Projected inflows from ALREADY-SCHEDULED upcoming payments, bucketed by
// month. Explicitly NOT a predictive model — it only totals real `upcoming`
// payment rows, never extrapolates or invents future amounts.
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/cash-flow-forecast', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { isoDate, safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'cash_flow_forecast');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const monthsParam = parseInt(e.request.url.query().get('months'), 10);
  const months = Number.isFinite(monthsParam) && monthsParam > 0 && monthsParam <= 24 ? monthsParam : 6;

  const upcoming = safeList($app, 'payments', "owner = {:oid} && status = 'upcoming'", { oid: auth.id });
  const overdue = safeList($app, 'payments', "owner = {:oid} && status = 'overdue'", { oid: auth.id });
  const all = upcoming.concat(overdue);

  const now = new Date();
  const buckets = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    buckets.push({ month: d.toISOString().slice(0, 7), installments: 0, rent: 0, overdue: 0, total: 0 });
  }
  const bucketIndex = {};
  buckets.forEach((b, i) => { bucketIndex[b.month] = i; });

  all.forEach((r) => {
    const d = isoDate(r.get('due_date'));
    if (!d) return;
    const key = d.toISOString().slice(0, 7);
    const idx = bucketIndex[key];
    if (idx == null) return;
    const amount = Number(r.get('amount')) || 0;
    const kind = r.get('kind');
    const status = r.get('status');
    if (status === 'overdue') buckets[idx].overdue += amount;
    else if (kind === 'installment') buckets[idx].installments += amount;
    else if (kind === 'rent') buckets[idx].rent += amount;
    buckets[idx].total += amount;
  });

  return e.json(200, { months: buckets });
});

// ---------------------------------------------------------------------------
// GET /ef/features/occupancy
// Current occupancy rate + a REAL historical trend from the owner's own
// stored monthly_reports snapshots (Task #12) — never a fabricated trend.
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/occupancy', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'occupancy_rate');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const properties = safeList($app, 'properties', "owner = {:oid} && status = 'approved'", { oid: auth.id });
  const activeTenancies = safeList($app, 'tenancies', "owner = {:oid} && status = 'active'", { oid: auth.id });
  const activePropIds = {};
  activeTenancies.forEach((t) => { activePropIds[t.get('property')] = true; });

  let rented = 0;
  properties.forEach((p) => {
    if (activePropIds[p.id] || p.get('type') === 'rented') rented++;
  });
  const total = properties.length;
  const rate = total > 0 ? Math.round((rented / total) * 1000) / 10 : 0;

  let history = [];
  try {
    const rows = $app.findRecordsByFilter('monthly_reports', 'owner = {:oid}', '-period', 12, 0, { oid: auth.id });
    history = (rows || []).map((r) => {
      const approved = Number(r.get('approved_count')) || 0;
      const rentedCnt = Number(r.get('rented_count')) || 0;
      return {
        period: r.get('period'),
        rented: rentedCnt,
        approved,
        rate: approved > 0 ? Math.round((rentedCnt / approved) * 1000) / 10 : 0,
      };
    }).reverse();
  } catch (_) {}

  return e.json(200, { total, rented, vacant: total - rented, rate, history });
});

// ---------------------------------------------------------------------------
// GET /ef/features/property-timeline?propertyId=xxx
// Chronological feed for ONE property: activity_logs rows already written by
// platform.pb.js/this task (property lifecycle + payments + expenses),
// merged and sorted by date. No new log table — reads the existing one.
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/property-timeline', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'property_timeline');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const propertyId = String(e.request.url.query().get('propertyId') || '').trim();
  if (!propertyId) return e.json(400, { error: 'propertyId is required' });

  let prop;
  try {
    prop = $app.findRecordById('properties', propertyId);
  } catch (_) {
    return e.json(404, { error: 'property_not_found' });
  }
  const isStaff = (function () {
    try { if (auth.getBool('is_super_admin')) return true; } catch (_) {}
    return ['admin', 'editor', 'support', 'custom'].indexOf(String(auth.get('role') || '')) >= 0;
  })();
  if (!isStaff && prop.get('owner') !== auth.id) return e.json(403, { error: 'forbidden' });

  const directLogs = safeList($app, 'activity_logs', "entity = 'properties' && entity_id = {:pid}", { pid: propertyId });

  const propPayments = safeList($app, 'payments', 'property = {:pid}', { pid: propertyId });
  const paymentIds = propPayments.map((p) => p.id);
  let paymentLogs = [];
  if (paymentIds.length > 0) {
    const filterStr = 'entity = "payments" && (' + paymentIds.map((id) => 'entity_id = "' + id + '"').join(' || ') + ')';
    paymentLogs = safeList($app, 'activity_logs', filterStr, {});
  }

  const propExpenses = safeList($app, 'owner_expenses', 'property = {:pid}', { pid: propertyId });
  let expenseLogs = [];
  const expenseIds = propExpenses.map((x) => x.id);
  if (expenseIds.length > 0) {
    const filterStr2 = 'entity = "owner_expenses" && (' + expenseIds.map((id) => 'entity_id = "' + id + '"').join(' || ') + ')';
    expenseLogs = safeList($app, 'activity_logs', filterStr2, {});
  }

  const events = directLogs.concat(paymentLogs, expenseLogs).map((r) => ({
    action: r.get('action'),
    details: r.get('details'),
    created: r.get('created'),
  }));
  events.sort((a, b) => new Date(String(b.created)).getTime() - new Date(String(a.created)).getTime());

  return e.json(200, {
    property: { id: prop.id, building: prop.get('building'), unit_number: prop.get('unit_number') },
    events,
  });
});
