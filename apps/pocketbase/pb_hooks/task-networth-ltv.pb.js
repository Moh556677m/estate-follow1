/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — features #6 and #7: Portfolio Net Worth and
// LTV. Both read-only, ZERO new collections. See lib-owner-features.js's
// computeEquity() for the shared cost/equity basis (never a market
// valuation — no such data source exists in this repo).

// ---------------------------------------------------------------------------
// GET /ef/features/net-worth
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/net-worth', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList, computeEquity } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'portfolio_net_worth');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });

  let totalNetWorth = 0;
  let unknownCount = 0;
  const byCountry = {};
  const perProperty = properties.map((p) => {
    const eq = computeEquity(p);
    const country = p.get('country') || '—';
    if (!eq.hasPrice) {
      unknownCount += 1;
    } else {
      totalNetWorth += eq.equity;
      byCountry[country] = (byCountry[country] || 0) + eq.equity;
    }
    return {
      propertyId: p.id,
      building: p.get('building') || '',
      unit_number: p.get('unit_number') || '',
      country,
      type: p.get('type'),
      hasPrice: eq.hasPrice,
      totalPrice: eq.totalPrice,
      equity: eq.equity,
      outstanding: eq.outstanding,
    };
  });

  return e.json(200, {
    basis: 'cost_equity_not_market_value',
    totalNetWorth,
    unknownPriceCount: unknownCount,
    byCountry,
    properties: perProperty,
  });
});

// ---------------------------------------------------------------------------
// GET /ef/features/ltv
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/features/ltv', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList, computeEquity } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'ltv_ratio');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });

  let totalOutstanding = 0;
  let totalPriceFinanced = 0;
  const perProperty = properties
    .filter((p) => p.get('type') === 'installment')
    .map((p) => {
      const eq = computeEquity(p);
      if (eq.hasPrice) {
        totalOutstanding += eq.outstanding;
        totalPriceFinanced += eq.totalPrice;
      }
      const ltvPct = eq.hasPrice && eq.totalPrice > 0 ? Math.round((eq.outstanding / eq.totalPrice) * 1000) / 10 : null;
      return {
        propertyId: p.id,
        building: p.get('building') || '',
        unit_number: p.get('unit_number') || '',
        hasPrice: eq.hasPrice,
        totalPrice: eq.totalPrice,
        outstanding: eq.outstanding,
        ltvPct,
        bucket: ltvPct == null ? 'unknown' : ltvPct <= 50 ? 'healthy' : ltvPct <= 75 ? 'moderate' : 'high',
      };
    });

  const portfolioLtvPct = totalPriceFinanced > 0 ? Math.round((totalOutstanding / totalPriceFinanced) * 1000) / 10 : null;

  return e.json(200, {
    basis: 'cost_equity_not_market_value',
    portfolioLtvPct,
    totalOutstanding,
    totalPriceFinanced,
    properties: perProperty,
  });
});
