/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #1: Property Health Score. Read-only
// aggregation route, ZERO new collections, same pattern as
// task17-features.pb.js. Gated via lib-feature-gate.js's requireFeature()
// exactly like every other /ef/features/* route.
//
// PB JSVM scope note: `isoDate`/`safeList` are require()'d fresh inside the
// handler (same reason documented in lib-owner-features.js/task17-features.
// pb.js — each routerAdd callback compiles in its own isolated VM).
//
// Scoring design (0-100 per property), each component computed only from
// real rows the owner already has:
//   - Payment health (0-50): blends the on-time-paid ratio and the
//     overdue-amount ratio from the property's own `payments` rows.
//   - Occupancy (0-25): only counted for properties with rental history
//     (a `tenancies` row ever, or type === 'rented') — active tenancy = 25,
//     lapsed = 10. Properties with no rental history are excluded from the
//     denominator entirely (never penalized for not being a rental).
//   - Maintenance/task backlog (0-25): penalizes overdue or high-priority
//     open `owner_tasks` rows tied to the property.
// Final score = round(earned / applicableMaxWeight * 100). A property with
// literally nothing recorded yet (no payments, no tenancy history, no
// tasks) still gets a neutral 100 with an explicit "no data yet" reason,
// rather than a misleading 0.
routerAdd('GET', '/ef/features/property-health', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { isoDate, safeList } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'property_health_score');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const idsParam = String(e.request.url.query().get('propertyIds') || '').trim();
  const wantedIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : null;

  let properties = safeList($app, 'properties', "owner = {:oid} && status != 'deleted' && status != 'archived'", { oid: auth.id });
  if (wantedIds) properties = properties.filter((p) => wantedIds.indexOf(p.id) >= 0);

  const payments = safeList($app, 'payments', "owner = {:oid} && kind = 'rent'", { oid: auth.id });
  const tenancies = safeList($app, 'tenancies', 'owner = {:oid}', { oid: auth.id });
  const tasks = safeList($app, 'owner_tasks', "owner = {:oid} && status != 'done'", { oid: auth.id });

  const now = new Date();

  const results = properties.map((p) => {
    const pid = p.id;
    const reasons = [];
    const reasonsAr = [];
    let earned = 0;
    let maxWeight = 0;

    // ---- Payment health (0-50) --------------------------------------------
    const propPayments = payments.filter((r) => r.get('property') === pid);
    const paidCount = propPayments.filter((r) => r.get('status') === 'paid').length;
    const overdueRows = propPayments.filter((r) => r.get('status') === 'overdue');
    const relevantCount = propPayments.filter((r) => r.get('status') === 'paid' || r.get('status') === 'overdue').length;

    if (relevantCount > 0) {
      maxWeight += 50;
      const onTimeRatio = relevantCount > 0 ? paidCount / relevantCount : 1;
      const totalDue = propPayments
        .filter((r) => r.get('status') === 'paid' || r.get('status') === 'overdue')
        .reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
      const overdueAmount = overdueRows.reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
      const overdueRatio = totalDue > 0 ? overdueAmount / totalDue : 0;
      const paymentScore = Math.max(0, Math.round(50 * onTimeRatio * (1 - overdueRatio)));
      earned += paymentScore;
      if (overdueRows.length > 0) {
        reasons.push(`${overdueRows.length} overdue payment${overdueRows.length > 1 ? 's' : ''}`);
        reasonsAr.push(`${overdueRows.length} دفعة متأخرة`);
      } else if (paidCount > 0) {
        reasons.push('All recorded rent payments on time');
        reasonsAr.push('كل دفعات الإيجار المسجّلة في موعدها');
      }
    }

    // ---- Occupancy (0-25) — only for properties with rental history ------
    const propTenancies = tenancies.filter((r) => r.get('property') === pid);
    const hasActiveTenancy = propTenancies.some((r) => r.get('status') === 'active');
    const hasAnyTenancyHistory = propTenancies.length > 0 || p.get('type') === 'rented';
    if (hasAnyTenancyHistory) {
      maxWeight += 25;
      if (hasActiveTenancy) {
        earned += 25;
      } else {
        earned += 10;
        reasons.push('No active tenant currently');
        reasonsAr.push('لا يوجد مستأجر نشط حاليًا');
      }
    }

    // ---- Maintenance / task backlog (0-25) --------------------------------
    const propTasks = tasks.filter((r) => r.get('property') === pid);
    let penaltyCount = 0;
    propTasks.forEach((r) => {
      const due = isoDate(r.get('due_date'));
      const overdue = due && due < now;
      const highPriority = r.get('priority') === 'high';
      if (overdue || highPriority) penaltyCount += 1;
    });
    if (propTasks.length > 0 || penaltyCount > 0) {
      maxWeight += 25;
      const maintenanceScore = Math.max(0, 25 - Math.min(25, penaltyCount * 6));
      earned += maintenanceScore;
      if (penaltyCount > 0) {
        reasons.push(`${penaltyCount} overdue/high-priority maintenance task${penaltyCount > 1 ? 's' : ''}`);
        reasonsAr.push(`${penaltyCount} مهمة صيانة متأخرة أو عالية الأولوية`);
      }
    }

    let score;
    if (maxWeight === 0) {
      score = 100;
      reasons.push('No data recorded yet for this property');
      reasonsAr.push('لا توجد بيانات مسجّلة لهذا العقار بعد');
    } else {
      score = Math.max(0, Math.min(100, Math.round((earned / maxWeight) * 100)));
    }

    const bucket = score >= 75 ? 'healthy' : score >= 50 ? 'watch' : 'at_risk';

    return {
      propertyId: pid,
      building: p.get('building') || '',
      unit_number: p.get('unit_number') || '',
      score,
      bucket,
      reasons,
      reasons_ar: reasonsAr,
    };
  });

  const avg = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;
  const counts = results.reduce(
    (acc, r) => { acc[r.bucket] = (acc[r.bucket] || 0) + 1; return acc; },
    { healthy: 0, watch: 0, at_risk: 0 },
  );

  return e.json(200, { properties: results, averageScore: avg, counts });
});
