/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #12: Owner Marketplace. Read model
// only (writes go straight to marketplace_listings via ownerFeaturesClient.js,
// gated by task-marketplace-hooks.pb.js). Joins each listing to its
// (already-owned) property record so the panel does not need a second
// round trip, and marks which listings belong to the caller.
routerAdd('GET', '/ef/features/marketplace-listings', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'owner_marketplace');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const active = safeList($app, 'marketplace_listings', "status = 'active'");
  const mine = safeList($app, 'marketplace_listings', 'owner = {:oid}', { oid: auth.id });

  const byId = {};
  active.concat(mine).forEach((r) => { byId[r.id] = r; });
  const all = Object.keys(byId).map((k) => byId[k]);

  const propIds = [];
  all.forEach((r) => {
    const pid = r.get('property');
    if (pid && propIds.indexOf(pid) < 0) propIds.push(pid);
  });
  const propFilter = propIds.map((id) => `id = "${id}"`).join(' || ');
  const properties = propFilter ? safeList($app, 'properties', propFilter) : [];
  const propMap = {};
  properties.forEach((p) => { propMap[p.id] = p; });

  function toJson(r) {
    const p = propMap[r.get('property')];
    return {
      id: r.id,
      isMine: r.get('owner') === auth.id,
      listing_type: r.get('listing_type'),
      asking_price: r.get('asking_price'),
      currency: r.get('currency') || '',
      notes: r.get('notes') || '',
      contact_name: r.get('contact_name') || '',
      contact_phone: r.get('contact_phone') || '',
      status: r.get('status'),
      created: r.get('created'),
      property: p ? {
        id: p.id,
        building: p.get('building') || '',
        unit_number: p.get('unit_number') || '',
        country: p.get('country') || '',
        usage_type: p.get('usage_type') || '',
      } : null,
    };
  }

  return e.json(200, {
    listings: active.map(toJson),
    mine: mine.map(toJson),
  });
});
