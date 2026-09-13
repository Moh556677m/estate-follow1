/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #10: Portfolio Distribution. Read-only,
// ZERO new collections — groups `properties` by usage_type/type/country,
// both by count and by the same cost/equity basis computeEquity() uses for
// Portfolio Net Worth (never a market valuation — see that helper).
routerAdd('GET', '/ef/features/portfolio-distribution', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList, computeEquity } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'portfolio_distribution');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });

  function bucket(groupFn) {
    const out = {};
    properties.forEach((p) => {
      const key = groupFn(p) || '—';
      const eq = computeEquity(p);
      if (!out[key]) out[key] = { count: 0, value: 0 };
      out[key].count += 1;
      if (eq.hasPrice) out[key].value += eq.equity;
    });
    return out;
  }

  return e.json(200, {
    basis: 'cost_equity_not_market_value',
    totalProperties: properties.length,
    byUsageType: bucket((p) => p.get('usage_type')),
    byPaymentType: bucket((p) => p.get('type')),
    byCountry: bucket((p) => p.get('country')),
    byStatus: bucket((p) => p.get('status')),
  });
});
