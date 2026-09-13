/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #9: Property Statements. ZERO new
// collections. Reads BOTH income sources that exist in this codebase for a
// single property over a free date range: the legacy `payments` collection
// (kind='rent', still used by cash/installment-era rentals) AND the
// current rental flow's `rent_payments` "checks" (status='collected') —
// the same oversight already found and fixed for the Property Calendar
// (task #8) is deliberately avoided here from the start.
//
// PB JSVM scope note: each routerAdd handler below repeats the same
// line-item assembly inline (rather than a shared top-level function) —
// a plain function declared at this file's top level is NOT visible
// inside a routerAdd callback in this PocketBase build (every callback
// compiles in its own isolated VM; see lib-owner-features.js's header
// comment for the empirically-confirmed reason). require()'d helpers are
// the only thing that reliably crosses that boundary.

// ---------------------------------------------------------------------------
// GET /ef/features/property-statement?propertyId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/property-statement', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { isoDate, safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'property_statements');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const propertyId = String(e.request.url.query().get('propertyId') || '').trim();
  if (!propertyId) return e.json(400, { error: 'propertyId is required' });

  let prop;
  try {
    prop = $app.findRecordById('properties', propertyId);
  } catch (_) {
    return e.json(404, { error: 'property_not_found' });
  }
  if (prop.get('owner') !== auth.id) return e.json(403, { error: 'forbidden' });

  const now = new Date();
  const fromParam = isoDate(e.request.url.query().get('from'));
  const toParam = isoDate(e.request.url.query().get('to'));
  const from = fromParam || new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const to = toParam || now;

  function inRange(d) { return d && d >= from && d <= to; }

  const legacyRent = safeList($app, 'payments', "property = {:pid} && kind = 'rent' && status = 'paid'", { pid: propertyId })
    .filter((r) => inRange(isoDate(r.get('paid_at') || r.get('due_date'))));
  const legacyInstallments = safeList($app, 'payments', "property = {:pid} && kind = 'installment' && status = 'paid'", { pid: propertyId })
    .filter((r) => inRange(isoDate(r.get('paid_at') || r.get('due_date'))));
  const checksCollected = safeList($app, 'rent_payments', "property = {:pid} && status = 'collected'", { pid: propertyId })
    .filter((r) => inRange(isoDate(r.get('collected_at') || r.get('due_date'))));
  const expenses = safeList($app, 'owner_expenses', 'property = {:pid}', { pid: propertyId })
    .filter((r) => inRange(isoDate(r.get('date'))));

  const lines = [];
  legacyRent.forEach((r) => lines.push({ type: 'income', label: r.get('label') || 'Rent', date: String(r.get('paid_at') || r.get('due_date') || '').slice(0, 10), amount: Number(r.get('amount')) || 0 }));
  checksCollected.forEach((r) => lines.push({ type: 'income', label: r.get('check_number') ? `Check #${r.get('check_number')}` : 'Rent check', date: String(r.get('collected_at') || r.get('due_date') || '').slice(0, 10), amount: Number(r.get('amount')) || 0 }));
  legacyInstallments.forEach((r) => lines.push({ type: 'installment', label: r.get('label') || 'Installment', date: String(r.get('paid_at') || r.get('due_date') || '').slice(0, 10), amount: Number(r.get('amount')) || 0 }));
  expenses.forEach((r) => lines.push({ type: 'expense', label: `${r.get('category') || ''} — ${r.get('title') || ''}`.trim(), date: String(r.get('date') || '').slice(0, 10), amount: Number(r.get('amount')) || 0 }));
  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const totalIncome = legacyRent.reduce((s, r) => s + (Number(r.get('amount')) || 0), 0) + checksCollected.reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
  const totalInstallments = legacyInstallments.reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
  const totalExpenses = expenses.reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
  const netProfit = totalIncome - totalInstallments - totalExpenses;

  return e.json(200, {
    property: { id: prop.id, building: prop.get('building'), unit_number: prop.get('unit_number') },
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    lines,
    totals: { totalIncome, totalInstallments, totalExpenses, netProfit },
  });
});

// ---------------------------------------------------------------------------
// GET /ef/features/property-statement-csv?propertyId=X&from=...&to=...
// Same data as above, laid out as downloadable CSV.
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/property-statement-csv', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { isoDate, safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'property_statements');
  if (!gate.available) return e.json(403, { error: gate.reason });

  // Locally scoped — a top-level function in this file would NOT be
  // visible inside this routerAdd callback (same isolated-VM-per-handler
  // constraint documented in lib-owner-features.js).
  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const propertyId = String(e.request.url.query().get('propertyId') || '').trim();
  if (!propertyId) return e.json(400, { error: 'propertyId is required' });

  let prop;
  try {
    prop = $app.findRecordById('properties', propertyId);
  } catch (_) {
    return e.json(404, { error: 'property_not_found' });
  }
  if (prop.get('owner') !== auth.id) return e.json(403, { error: 'forbidden' });

  const now = new Date();
  const fromParam = isoDate(e.request.url.query().get('from'));
  const toParam = isoDate(e.request.url.query().get('to'));
  const from = fromParam || new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const to = toParam || now;
  function inRange(d) { return d && d >= from && d <= to; }

  const legacyRent = safeList($app, 'payments', "property = {:pid} && kind = 'rent' && status = 'paid'", { pid: propertyId })
    .filter((r) => inRange(isoDate(r.get('paid_at') || r.get('due_date'))));
  const legacyInstallments = safeList($app, 'payments', "property = {:pid} && kind = 'installment' && status = 'paid'", { pid: propertyId })
    .filter((r) => inRange(isoDate(r.get('paid_at') || r.get('due_date'))));
  const checksCollected = safeList($app, 'rent_payments', "property = {:pid} && status = 'collected'", { pid: propertyId })
    .filter((r) => inRange(isoDate(r.get('collected_at') || r.get('due_date'))));
  const expenses = safeList($app, 'owner_expenses', 'property = {:pid}', { pid: propertyId })
    .filter((r) => inRange(isoDate(r.get('date'))));

  const rows = [['type', 'label', 'date', 'amount']];
  legacyRent.forEach((r) => rows.push(['income', r.get('label') || 'Rent', String(r.get('paid_at') || r.get('due_date') || '').slice(0, 10), Number(r.get('amount')) || 0]));
  checksCollected.forEach((r) => rows.push(['income', r.get('check_number') ? `Check #${r.get('check_number')}` : 'Rent check', String(r.get('collected_at') || r.get('due_date') || '').slice(0, 10), Number(r.get('amount')) || 0]));
  legacyInstallments.forEach((r) => rows.push(['installment', r.get('label') || 'Installment', String(r.get('paid_at') || r.get('due_date') || '').slice(0, 10), Number(r.get('amount')) || 0]));
  expenses.forEach((r) => rows.push(['expense', `${r.get('category') || ''} - ${r.get('title') || ''}`.trim(), String(r.get('date') || '').slice(0, 10), Number(r.get('amount')) || 0]));

  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const filename = `statement-${prop.get('unit_number') || prop.id}-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv`;
  e.response.header().set('Content-Type', 'text/csv; charset=utf-8');
  e.response.header().set('Content-Disposition', `attachment; filename="${filename}"`);
  return e.string(200, csv);
});
