/// <reference path="../pb_data/types.d.ts" />

// Central Plan / Entitlement Service (requirement #6) — the SOLE place that
// answers "what plan is this user on, has their trial ended, how many
// properties can they add, is <feature> unlocked for them". Both the
// frontend (via GET /ef/my-entitlements) and any other server-side code that
// needs an entitlement decision should call into this file's logic rather
// than re-deriving plan/limit/feature rules inline — the property-limit
// check itself stays in subscription-enforcement.pb.js (it must run
// synchronously inside the property create request), but it resolves the
// same `plans` row this file does, so the two can never disagree.
//
// IMPORTANT (PB JSVM scope): every routerAdd handler is compiled in its own
// isolated VM — helpers must be defined INSIDE each handler, not shared at
// file scope (same constraint as the onRecord* hooks elsewhere in this repo).

// ---------------------------------------------------------------------------
// GET /ef/my-entitlements — the current user's full plan/trial/limits/
// features bundle. Used by the account-facing UI (SubscriptionPanel and any
// future "Portfolio Manager" entry point) instead of hardcoding conditions
// per page (requirement #9, #16, #17).
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/my-entitlements', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });

  function num(v, fb) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }
  function daysBetween(nowMs, endMs) {
    if (endMs == null) return null;
    return Math.ceil((endMs - nowMs) / (24 * 60 * 60 * 1000));
  }
  function parseMs(v) {
    if (v == null || v === '') return null;
    const ms = new Date(String(v)).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  const nowMs = Date.now();
  const isStaff =
    (function () {
      try {
        if (auth.getBool('is_super_admin')) return true;
      } catch (_) {}
      const role = String(auth.get('role') || '');
      return ['admin', 'editor', 'support', 'custom'].indexOf(role) >= 0;
    })();

  // `users.subscription_package` stays the authoritative "which plan key is
  // this user on right now" field (it's dual-written by every mutation path
  // — trial-auto-assign, finalize-signup, Stripe activation — alongside
  // `user_subscriptions`), so read it directly rather than through the
  // relation to avoid an extra lookup.
  const pkgKey = String(auth.get('subscription_package') || 'none').trim().toLowerCase() || 'none';

  let planRow = null;
  try {
    const rows = $app.findRecordsByFilter('plans', 'key = {:k}', '', 1, 0, { k: pkgKey });
    if (rows && rows.length > 0) planRow = rows[0];
  } catch (_) {}

  const trialEnd = parseMs(auth.get('trial_end'));
  const subEnd = parseMs(auth.get('subscription_end'));
  let status = 'none';
  let daysRemaining = null;
  if (isStaff) {
    status = 'staff';
  } else if (pkgKey === 'trial') {
    status = trialEnd != null && nowMs > trialEnd ? 'expired' : 'trial';
    daysRemaining = daysBetween(nowMs, trialEnd);
  } else if (pkgKey !== 'none') {
    status = subEnd != null && nowMs > subEnd ? 'expired' : 'active';
    daysRemaining = daysBetween(nowMs, subEnd);
  }

  // ---- property usage ----
  let used = 0;
  try {
    const rows = $app.findRecordsByFilter(
      'properties',
      "owner = {:oid} && status != 'deleted' && status != 'archived'",
      '',
      5000,
      0,
      { oid: auth.id },
    );
    used = rows ? rows.length : 0;
  } catch (_) {}

  let propertyLimit = isStaff ? -1 : 0;
  if (!isStaff) {
    propertyLimit = planRow ? num(planRow.get('property_limit'), 0) : 0;
    let extra = 0;
    try { extra = num(auth.get('extra_properties_purchased'), 0); } catch (_) {}
    if (propertyLimit !== -1) propertyLimit = propertyLimit + Math.max(0, extra);
  }

  // ---- feature entitlements (generic — portfolio_manager is the first real consumer) ----
  const accountType = String(auth.get('account_type') || 'owner');
  const features = {};
  try {
    const rows = $app.findRecordsByFilter('feature_entitlements', "id != ''", '', 200, 0);
    (rows || []).forEach((f) => {
      const key = f.get('feature_key');
      const enabled = f.get('enabled') !== false;
      // IMPORTANT: in this PocketBase JSVM build, Record.get() on a `json`
      // field does NOT return a usable parsed JS value — it returns a raw
      // byte-buffer bridge object that LOOKS like an array (Array.isArray
      // returns true, typeof is "object") but whose elements are the raw
      // UTF-8 byte codes of the underlying JSON text (e.g. an empty json
      // array field comes back as [91, 93], the char codes for "[" and
      // "]"). String(v) reliably reconstructs the real JSON text regardless
      // of content — verified empirically (empty and non-empty cases both
      // round-trip correctly) — so always go through String()+JSON.parse
      // rather than trusting typeof/Array.isArray for a json field here.
      function asArray(v) {
        try {
          var parsed = JSON.parse(String(v == null ? '[]' : v));
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
      function asObject(v) {
        try {
          var parsed = JSON.parse(String(v == null ? '{}' : v));
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
          return {};
        }
      }
      let allowedTypes = [];
      let allowedPlans = [];
      let limitByPlan = {};
      try { allowedTypes = asArray(f.get('allowed_account_types')); } catch (_) {}
      try { allowedPlans = asArray(f.get('allowed_plans')); } catch (_) {}
      try { limitByPlan = asObject(f.get('limit_by_plan')); } catch (_) {}
      const minProps = num(f.get('min_property_count'), 0);

      let available = enabled;
      let reason = enabled ? '' : 'disabled_by_admin';
      if (available && allowedTypes.length > 0 && allowedTypes.indexOf(accountType) < 0) {
        available = false;
        reason = 'account_type_not_eligible';
      }
      if (available && allowedPlans.length > 0 && allowedPlans.indexOf(pkgKey) < 0) {
        available = false;
        reason = 'plan_not_eligible';
      }
      if (available && used < minProps && !isStaff) {
        available = false;
        reason = 'min_property_count_not_met';
      }
      const limit = limitByPlan[pkgKey] != null ? limitByPlan[pkgKey] : (limitByPlan.default != null ? limitByPlan.default : 0);
      if (available && !isStaff && limit === 0) {
        available = false;
        reason = 'not_included_in_plan';
      }

      // Nav/dashboard-driving metadata (Task #17): `visible` is a SEPARATE
      // switch from `enabled` — a feature can be enabled (usable via direct
      // link/API for grandfathered users) but hidden from nav, or visible
      // but not yet enabled (a "coming soon" nav entry). Both default true
      // when unset so pre-existing rows (portfolio_manager,
      // monthly_property_reports) keep behaving exactly as before this
      // field existed.
      let visible = true;
      try { visible = f.get('visible') !== false; } catch (_) {}

      features[key] = {
        available: isStaff ? enabled : available,
        reason: isStaff ? '' : reason,
        min_property_count: minProps,
        properties_used: used,
        limit: isStaff ? -1 : limit,
        pricing_mode: f.get('pricing_mode') || 'included',
        price: num(f.get('price'), 0),
        discount_price: num(f.get('discount_price'), 0),
        currency: f.get('currency') || 'USD',
        billing_period: f.get('billing_period') || 'monthly',
        // nav/dashboard-driving fields — see Task #17 migration
        name: f.get('name') || key,
        name_ar: f.get('name_ar') || f.get('name') || key,
        description: f.get('description') || '',
        description_ar: f.get('description_ar') || '',
        visible,
        route: f.get('route') || '',
        icon: f.get('icon') || '',
        sort_order: num(f.get('sort_order'), 0),
      };
    });
  } catch (_) {}

  return e.json(200, {
    plan: planRow
      ? {
          key: planRow.get('key'),
          name: planRow.get('name'),
          name_ar: planRow.get('name_ar'),
          price: planRow.get('price'),
          discount_price: planRow.get('discount_price'),
          currency: planRow.get('currency'),
        }
      : { key: pkgKey, name: pkgKey, name_ar: pkgKey },
    status,
    is_staff: isStaff,
    days_remaining: daysRemaining,
    trial_end: auth.get('trial_end') || null,
    subscription_end: auth.get('subscription_end') || null,
    properties: { used, limit: propertyLimit },
    account_type: accountType,
    features,
  });
});

// ---------------------------------------------------------------------------
// POST /ef/admin/plans/{id}/apply-trial-change — explicit, Admin-triggered
// propagation of a trial length change to CURRENTLY TRIALING subscribers on
// that plan (requirement #1/#7: `apply_to_new_only` is the default/implicit
// behavior — a plan edit alone never touches an existing trial_end — this
// route is the explicit `apply_to_existing_subscribers` action). Recomputes
// each affected user's trial_end from THEIR OWN trial_start using the
// plan's CURRENT trial_value/trial_unit. Never touches paid subscribers,
// never touches users whose trial already expired (that is a policy
// decision for the Admin to make separately, not an automatic side effect).
// ---------------------------------------------------------------------------
routerAdd('POST', '/ef/admin/plans/{id}/apply-trial-change', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth || !auth.getBool('is_super_admin')) return e.json(403, { error: 'forbidden' });

  const planId = e.request.pathValue('id');
  let plan;
  try {
    plan = $app.findRecordById('plans', planId);
  } catch (_) {
    return e.json(404, { error: 'plan_not_found' });
  }

  const trialValue = Math.max(0, Number(plan.get('trial_value')) || 0);
  const trialUnit = String(plan.get('trial_unit') || 'days');

  function computeEnd(startMs) {
    const end = new Date(startMs);
    if (trialUnit === 'years') end.setFullYear(end.getFullYear() + trialValue);
    else if (trialUnit === 'months') end.setMonth(end.getMonth() + trialValue);
    else if (trialUnit === 'weeks') end.setTime(end.getTime() + trialValue * 7 * 24 * 60 * 60 * 1000);
    else end.setTime(end.getTime() + trialValue * 24 * 60 * 60 * 1000);
    return end;
  }

  let updated = 0;
  let failed = 0;
  try {
    const subs = $app.findRecordsByFilter(
      'user_subscriptions',
      "plan = {:pid} && status = 'trial'",
      '',
      5000,
      0,
      { pid: planId },
    );
    (subs || []).forEach((subRec) => {
      const startRaw = subRec.get('trial_start');
      if (!startRaw) return;
      const startMs = new Date(String(startRaw)).getTime();
      if (Number.isNaN(startMs)) return;
      const newEnd = computeEnd(startMs);
      try {
        subRec.set('trial_end', newEnd.toISOString());
        $app.save(subRec);
        // Mirror onto the legacy users.trial_end field too (requirement:
        // dual-write, never a second disagreeing source of truth).
        try {
          const userRec = $app.findRecordById('users', subRec.get('user'));
          userRec.set('trial_end', newEnd.toISOString());
          $app.save(userRec);
        } catch (_) {}
        updated++;
      } catch (_) {
        failed++;
      }
    });
  } catch (err) {
    return e.json(500, { error: 'apply_failed', message: String(err) });
  }

  return e.json(200, { status: 'ok', updated, failed });
});
