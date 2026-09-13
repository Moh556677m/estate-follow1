/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #3: Security Deposit Management.
// Read-only aggregation route — ZERO new collections, just the 4 fields
// 1790600000_security_deposit_management.js added to `tenancies`. Writes
// (marking a deposit returned/partially returned/forfeited) go straight
// through pb.collection('tenancies').update(...) from the frontend — the
// owner already has that update right via tenancies' own PB rules, same
// pattern as owner_expenses/owner_tasks — so no custom write route is
// needed here, only this summary/list read.
routerAdd('GET', '/ef/features/security-deposits', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'security_deposit_management');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const tenancies = safeList($app, 'tenancies', 'owner = {:oid} && security_deposit > 0', { oid: auth.id });
  const properties = safeList($app, 'properties', 'owner = {:oid}', { oid: auth.id });
  const propById = {};
  properties.forEach((p) => { propById[p.id] = p; });

  const rows = tenancies.map((t) => {
    const deposit = Number(t.get('security_deposit')) || 0;
    const returned = Number(t.get('deposit_returned_amount')) || 0;
    const status = t.get('deposit_status') || 'held';
    const outstanding = status === 'forfeited' ? 0 : Math.max(0, deposit - returned);
    const prop = propById[t.get('property')];
    return {
      tenancyId: t.id,
      propertyId: t.get('property'),
      building: prop ? (prop.get('building') || '') : '',
      unit_number: prop ? (prop.get('unit_number') || '') : '',
      tenantName: t.get('tenant_name') || '',
      tenancyStatus: t.get('status'),
      deposit,
      status,
      returnedAmount: returned,
      returnDate: t.get('deposit_return_date') || null,
      notes: t.get('deposit_deduction_notes') || '',
      outstanding,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalDeposits += r.deposit;
      acc.totalReturned += r.returnedAmount;
      acc.totalOutstanding += r.outstanding;
      return acc;
    },
    { totalDeposits: 0, totalReturned: 0, totalOutstanding: 0 },
  );
  const counts = rows.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; },
    { held: 0, partially_returned: 0, returned: 0, forfeited: 0 },
  );

  return e.json(200, { deposits: rows, totals, counts });
});
