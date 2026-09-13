/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #13: Smart Monthly Suggestions. Every
// suggestion below is computed from data the owner already has recorded —
// no AI provider is called and nothing is generated. Reads BOTH rental
// data sources this codebase has (legacy `payments` + current
// `tenancies`/`rent_payments`) to avoid the same gap already found and
// fixed for the Property Calendar (#8).
routerAdd('GET', '/ef/features/monthly-suggestions', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const { safeList, isoDate } = require(`${__hooks}/lib-owner-features.js`);
  const gate = requireFeature($app, auth, 'smart_monthly_suggestions');
  if (!gate.available) return e.json(403, { error: gate.reason });

  const now = new Date();
  const suggestions = [];

  const properties = safeList($app, 'properties', "owner = {:oid} && status = 'approved'", { oid: auth.id });

  // 1. Overdue legacy rent/installment payments.
  const overduePayments = safeList($app, 'payments', "owner = {:oid} && status = 'overdue'", { oid: auth.id });
  if (overduePayments.length > 0) {
    const total = overduePayments.reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
    suggestions.push({
      key: 'overdue_payments',
      severity: 'high',
      title: `${overduePayments.length} overdue payment(s) need attention`,
      title_ar: `${overduePayments.length} دفعة متأخرة تحتاج متابعة`,
      detail: `Total overdue amount: ${total}.`,
      detail_ar: `إجمالي المبلغ المتأخر: ${total}.`,
      route: null,
    });
  }

  // 2. Bounced rent checks (current rental flow).
  const bouncedChecks = safeList($app, 'rent_payments', "owner = {:oid} && status = 'bounced'", { oid: auth.id });
  if (bouncedChecks.length > 0) {
    suggestions.push({
      key: 'bounced_checks',
      severity: 'high',
      title: `${bouncedChecks.length} bounced rent check(s)`,
      title_ar: `${bouncedChecks.length} شيك إيجار مرتجع`,
      detail: 'Follow up with the tenant, or open a claim to track it.',
      detail_ar: 'تابع مع المستأجر، أو افتح مطالبة لمتابعتها.',
      route: '/dashboard/claims',
    });
  }

  // 3. Leases expiring within the next 30 days.
  const activeTenancies = safeList($app, 'tenancies', "owner = {:oid} && status = 'active'", { oid: auth.id });
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringSoon = activeTenancies.filter((t) => {
    const d = isoDate(t.get('end_date'));
    return d && d >= now && d <= in30;
  });
  if (expiringSoon.length > 0) {
    suggestions.push({
      key: 'leases_expiring_soon',
      severity: 'medium',
      title: `${expiringSoon.length} lease(s) expiring within 30 days`,
      title_ar: `${expiringSoon.length} عقد إيجار سينتهي خلال 30 يومًا`,
      detail: 'Reach out about renewal before the tenant moves out.',
      detail_ar: 'تواصل بشأن التجديد قبل خروج المستأجر.',
      route: '/dashboard/calendar',
    });
  }

  // 4. Security deposits still marked "held" after the lease already ended.
  const endedTenancies = safeList($app, 'tenancies', "owner = {:oid} && status = 'ended'", { oid: auth.id });
  const heldDeposits = endedTenancies.filter((t) => {
    const d = isoDate(t.get('end_date'));
    const depositStatus = String(t.get('deposit_status') || 'held');
    return d && d <= now && depositStatus === 'held' && Number(t.get('security_deposit')) > 0;
  });
  if (heldDeposits.length > 0) {
    suggestions.push({
      key: 'deposits_to_process',
      severity: 'medium',
      title: `${heldDeposits.length} security deposit(s) still held after lease end`,
      title_ar: `${heldDeposits.length} تأمين لا يزال محتجزًا بعد انتهاء العقد`,
      detail: 'Review and record the deposit return or any deductions.',
      detail_ar: 'راجع وسجّل رد التأمين أو أي خصومات.',
      route: '/dashboard/security-deposits',
    });
  }

  // 5. Rentable properties that appear vacant (no active tenancy, not
  //    marked 'rented' under the legacy model either).
  const rentableTypes = ['cash', 'installment'];
  const propIdsWithActiveTenancy = {};
  activeTenancies.forEach((t) => { propIdsWithActiveTenancy[t.get('property')] = true; });
  const vacant = properties.filter((p) => rentableTypes.indexOf(p.get('type')) >= 0 && !propIdsWithActiveTenancy[p.id]);
  if (vacant.length > 0) {
    suggestions.push({
      key: 'vacant_properties',
      severity: 'medium',
      title: `${vacant.length} propert${vacant.length === 1 ? 'y' : 'ies'} appear vacant`,
      title_ar: `${vacant.length} عقار يبدو شاغرًا`,
      detail: 'Compare your rent pricing, or list it for other owners to see.',
      detail_ar: 'قارن سعر الإيجار الخاص بك، أو اعرضه ليراه ملاك آخرون.',
      route: '/dashboard/market-rent',
    });
  }

  // 6. Expense spike vs. the previous month.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const allExpenses = safeList($app, 'owner_expenses', 'owner = {:oid}', { oid: auth.id });
  function sumInRange(rows, start, end) {
    return rows
      .filter((r) => { const d = isoDate(r.get('date')); return d && d >= start && d < end; })
      .reduce((s, r) => s + (Number(r.get('amount')) || 0), 0);
  }
  const thisMonthExpenses = sumInRange(allExpenses, monthStart, monthEnd);
  const prevMonthExpenses = sumInRange(allExpenses, prevMonthStart, monthStart);
  if (prevMonthExpenses > 0 && thisMonthExpenses > prevMonthExpenses * 1.4) {
    suggestions.push({
      key: 'expense_spike',
      severity: 'low',
      title: 'Expenses jumped compared to last month',
      title_ar: 'ارتفعت المصاريف هذا الشهر مقارنة بالشهر الماضي',
      detail: `This month: ${thisMonthExpenses}, last month: ${prevMonthExpenses}.`,
      detail_ar: `هذا الشهر: ${thisMonthExpenses}، الشهر الماضي: ${prevMonthExpenses}.`,
      route: '/dashboard/expenses',
    });
  }

  // 7. Claims open for more than 2 weeks with no resolution.
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const staleClaims = safeList($app, 'tenant_claims', "owner = {:oid} && (status = 'open' || status = 'under_review')", { oid: auth.id })
    .filter((c) => { const d = isoDate(c.get('created')); return d && d <= cutoff; });
  if (staleClaims.length > 0) {
    suggestions.push({
      key: 'stale_claims',
      severity: 'low',
      title: `${staleClaims.length} claim(s) open for over 2 weeks`,
      title_ar: `${staleClaims.length} مطالبة مفتوحة منذ أكثر من أسبوعين`,
      detail: 'Follow up to move them toward a resolution.',
      detail_ar: 'تابعها لدفعها نحو الحل.',
      route: '/dashboard/claims',
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9));

  return e.json(200, {
    generated_at: now.toISOString(),
    basis: 'computed_from_your_data',
    suggestions,
  });
});
