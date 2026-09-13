/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #11: Lifetime Return. ZERO new
// collections. Net Property Profit generalized to "since acquisition"
// instead of one calendar year, reading BOTH income sources this codebase
// has (legacy `payments` kind='rent' AND the current rental flow's
// `rent_payments` checks — the gap already found and fixed for the
// Property Calendar in task #8 is deliberately avoided here). ROI% is
// against the same cost/equity basis computeEquity() uses for Portfolio
// Net Worth / LTV — never a market valuation.
routerAdd('GET', '/ef/features/lifetime-return', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList, computeEquity } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'lifetime_return');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });
  const legacyRent = safeList($app, 'payments', "owner = {:oid} && kind = 'rent' && status = 'paid'", { oid: auth.id });
  const legacyInstallments = safeList($app, 'payments', "owner = {:oid} && kind = 'installment' && status = 'paid'", { oid: auth.id });
  const checksCollected = safeList($app, 'rent_payments', "owner = {:oid} && status = 'collected'", { oid: auth.id });
  const expenses = safeList($app, 'owner_expenses', 'owner = {:oid}', { oid: auth.id });

  const results = properties.map((p) => {
    const pid = p.id;
    const rentIncome = legacyRent.filter((r) => r.get('property') === pid).reduce((s, r) => s + (Number(r.get('amount')) || 0), 0)
      + checksCollected.filter((r) => r.get('property') === pid).reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
    const installmentsPaid = legacyInstallments.filter((r) => r.get('property') === pid).reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
    const propExpenses = expenses.filter((r) => r.get('property') === pid).reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
    const netCashFlow = rentIncome - installmentsPaid - propExpenses;

    const eq = computeEquity(p);
    const invested = eq.hasPrice ? eq.paid : null;
    const roiPct = invested && invested > 0 ? Math.round((netCashFlow / invested) * 1000) / 10 : null;

    return {
      propertyId: pid,
      building: p.get('building') || '',
      unit_number: p.get('unit_number') || '',
      rentIncome,
      installmentsPaid,
      expenses: propExpenses,
      netCashFlow,
      invested,
      roiPct,
    };
  });

  const totals = results.reduce(
    (acc, r) => ({
      rentIncome: acc.rentIncome + r.rentIncome,
      installmentsPaid: acc.installmentsPaid + r.installmentsPaid,
      expenses: acc.expenses + r.expenses,
      netCashFlow: acc.netCashFlow + r.netCashFlow,
      invested: acc.invested + (r.invested || 0),
    }),
    { rentIncome: 0, installmentsPaid: 0, expenses: 0, netCashFlow: 0, invested: 0 },
  );
  const portfolioRoiPct = totals.invested > 0 ? Math.round((totals.netCashFlow / totals.invested) * 1000) / 10 : null;

  return e.json(200, {
    basis: 'cost_equity_not_market_value',
    properties: results,
    totals,
    portfolioRoiPct,
  });
});
