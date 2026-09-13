/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #5: Market Rent Comparison.
// IMPORTANT — no external market-data source exists anywhere in this repo
// (no listings-portal API, no scraper). This route ONLY ever compares
// against comparables the owner recorded themselves in market_comparables
// — it must never be presented as a live market feed, and this response
// makes that explicit via `basis: 'user_recorded_comparables'` so the
// frontend always shows that disclosure.
routerAdd('GET', '/ef/features/market-rent-comparison', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'market_rent_comparison');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const propertyId = String(e.request.url.query().get('propertyId') || '').trim();

  const properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });
  const scopedProperties = propertyId ? properties.filter((p) => p.id === propertyId) : properties;
  const allComparables = safeList($app, 'market_comparables', 'owner = {:oid}', { oid: auth.id });

  const results = scopedProperties.map((p) => {
    const pid = p.id;
    const ownRent = Number(p.get('rent_amount')) || 0;
    // Comparables explicitly tied to this property, plus any untied
    // comparable the owner recorded for the same area (a loose text match
    // — never a fabricated geo-match).
    const comps = allComparables.filter((c) => c.get('property') === pid
      || (!c.get('property') && String(c.get('area_label') || '').trim().toLowerCase() === String(p.get('area') || '').trim().toLowerCase()));
    const amounts = comps.map((c) => Number(c.get('rent_amount')) || 0).filter((n) => n > 0);
    const avg = amounts.length > 0 ? Math.round(amounts.reduce((s, n) => s + n, 0) / amounts.length) : null;
    const min = amounts.length > 0 ? Math.min(...amounts) : null;
    const max = amounts.length > 0 ? Math.max(...amounts) : null;
    let verdict = 'no_comparables';
    let diffPct = null;
    if (avg && ownRent > 0) {
      diffPct = Math.round(((ownRent - avg) / avg) * 1000) / 10;
      if (diffPct > 5) verdict = 'above_average';
      else if (diffPct < -5) verdict = 'below_average';
      else verdict = 'in_line';
    }
    return {
      propertyId: pid,
      building: p.get('building') || '',
      unit_number: p.get('unit_number') || '',
      ownRent,
      comparableCount: comps.length,
      averageComparable: avg,
      minComparable: min,
      maxComparable: max,
      diffPct,
      verdict,
    };
  });

  return e.json(200, { basis: 'user_recorded_comparables', properties: results });
});
