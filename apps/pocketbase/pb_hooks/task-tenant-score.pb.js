/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #2: Tenant Score. Read-only
// aggregation route, ZERO new collections, same pattern as
// task-property-health.pb.js / task17-features.pb.js. Gated via
// lib-feature-gate.js's requireFeature().
//
// Reads the CURRENT rental model (tenants + tenancies + rent_payments —
// the "checks" tables the active rental flow writes to today), not the
// legacy `payments` collection with kind='rent', which Net Property Profit
// / Cash Flow Forecast still read for the older cash/installment ledger.
//
// PB JSVM scope note: `isoDate`/`safeList` are require()'d fresh inside the
// handler — same isolated-VM-per-callback constraint documented in
// lib-owner-features.js.
//
// Scoring design (0-100 per tenant):
//   - Payment reliability (0-70): blends the collected-on-time ratio and an
//     amount-weighted "bad" ratio (bounced + overdue-still-pending checks)
//     from the tenant's own rent_payments rows, across all their tenancies
//     with this owner.
//   - Lease compliance (0-30): ratio of leases completed to their natural
//     end_date vs. leases marked `ended` before that date (early
//     termination). A tenant with only an in-progress active lease and no
//     completed/early-ended history yet gets full credit here (benefit of
//     the doubt — never penalized for a lease simply not being over yet).
// A tenant with literally no rent_payments rows AND no ended lease yet
// (brand-new active tenancy) gets a neutral 100, same "no data yet, don't
// guess low" rule Property Health Score uses.
routerAdd('GET', '/ef/features/tenant-score', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { isoDate, safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'tenant_score');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const propertyId = String(e.request.url.query().get('propertyId') || '').trim();

  const tenants = safeList($app, 'tenants', 'owner = {:oid}', { oid: auth.id });
  const tenancies = safeList($app, 'tenancies', 'owner = {:oid}', { oid: auth.id });
  const rentPayments = safeList($app, 'rent_payments', 'owner = {:oid}', { oid: auth.id });

  const now = new Date();

  const rentPaymentsByTenancy = {};
  rentPayments.forEach((r) => {
    const tid = r.get('tenancy');
    if (!rentPaymentsByTenancy[tid]) rentPaymentsByTenancy[tid] = [];
    rentPaymentsByTenancy[tid].push(r);
  });

  let scopedTenants = tenants;
  if (propertyId) {
    const tenancyForProperty = tenancies.filter((t) => t.get('property') === propertyId);
    const tenantIdsForProperty = {};
    tenancyForProperty.forEach((t) => { const tid = t.get('tenant'); if (tid) tenantIdsForProperty[tid] = true; });
    scopedTenants = tenants.filter((t) => tenantIdsForProperty[t.id]);
  }

  const results = scopedTenants.map((tenant) => {
    const tid = tenant.id;
    const ownTenancies = tenancies.filter((t) => t.get('tenant') === tid);
    const reasons = [];
    const reasonsAr = [];
    let earned = 0;
    let maxWeight = 0;

    // ---- Payment reliability (0-70) ---------------------------------------
    let collectedCount = 0;
    let bouncedCount = 0;
    let overdueCount = 0;
    let totalAmount = 0;
    let badAmount = 0;
    ownTenancies.forEach((tcy) => {
      const rows = rentPaymentsByTenancy[tcy.id] || [];
      rows.forEach((r) => {
        const status = r.get('status');
        const amount = Number(r.get('amount')) || 0;
        const due = isoDate(r.get('due_date'));
        const isOverduePending = status === 'pending' && due && due < now;
        if (status === 'collected' || status === 'bounced' || isOverduePending) {
          totalAmount += amount;
          if (status === 'collected') collectedCount += 1;
          if (status === 'bounced') { bouncedCount += 1; badAmount += amount; }
          if (isOverduePending) { overdueCount += 1; badAmount += amount; }
        }
      });
    });
    const relevantCount = collectedCount + bouncedCount + overdueCount;
    if (relevantCount > 0) {
      maxWeight += 70;
      const onTimeRatio = collectedCount / relevantCount;
      const badRatio = totalAmount > 0 ? badAmount / totalAmount : 0;
      const paymentScore = Math.max(0, Math.round(70 * onTimeRatio * (1 - badRatio)));
      earned += paymentScore;
      if (bouncedCount > 0) {
        reasons.push(`${bouncedCount} bounced payment${bouncedCount > 1 ? 's' : ''}`);
        reasonsAr.push(`${bouncedCount} دفعة مرتجعة (بدون رصيد)`);
      }
      if (overdueCount > 0) {
        reasons.push(`${overdueCount} overdue unpaid check${overdueCount > 1 ? 's' : ''}`);
        reasonsAr.push(`${overdueCount} شيك متأخر لم يُحصَّل`);
      }
      if (bouncedCount === 0 && overdueCount === 0 && collectedCount > 0) {
        reasons.push('All rent payments collected on time');
        reasonsAr.push('كل دفعات الإيجار تم تحصيلها في موعدها');
      }
    }

    // ---- Lease compliance (0-30) ------------------------------------------
    const endedTenancies = ownTenancies.filter((t) => t.get('status') === 'ended');
    let completedCount = 0;
    let earlyEndedCount = 0;
    endedTenancies.forEach((t) => {
      const endDate = isoDate(t.get('end_date'));
      if (endDate && endDate > now) earlyEndedCount += 1;
      else completedCount += 1;
    });
    if (ownTenancies.length > 0) {
      maxWeight += 30;
      if (endedTenancies.length > 0) {
        const leaseScore = Math.round(30 * (completedCount / endedTenancies.length));
        earned += leaseScore;
        if (earlyEndedCount > 0) {
          reasons.push(`${earlyEndedCount} lease${earlyEndedCount > 1 ? 's' : ''} ended before term`);
          reasonsAr.push(`${earlyEndedCount} عقد انتهى قبل نهاية مدته`);
        }
      } else {
        // Only an active (still-running) lease on record — never penalized
        // for a lease simply not being over yet.
        earned += 30;
      }
    }

    let score;
    if (maxWeight === 0) {
      score = 100;
      reasons.push('No payment or lease history recorded yet');
      reasonsAr.push('لا يوجد تاريخ دفعات أو عقود مسجّل بعد');
    } else {
      score = Math.max(0, Math.min(100, Math.round((earned / maxWeight) * 100)));
    }
    const bucket = score >= 75 ? 'reliable' : score >= 50 ? 'watch' : 'risky';

    const activeTenancy = ownTenancies.find((t) => t.get('status') === 'active') || null;

    return {
      tenantId: tid,
      name: tenant.get('name') || '',
      phone: tenant.get('phone') || '',
      score,
      bucket,
      reasons,
      reasons_ar: reasonsAr,
      tenancyCount: ownTenancies.length,
      activePropertyId: activeTenancy ? activeTenancy.get('property') : null,
    };
  });

  results.sort((a, b) => a.score - b.score);

  const avg = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;
  const counts = results.reduce(
    (acc, r) => { acc[r.bucket] = (acc[r.bucket] || 0) + 1; return acc; },
    { reliable: 0, watch: 0, risky: 0 },
  );

  return e.json(200, { tenants: results, averageScore: avg, counts });
});
