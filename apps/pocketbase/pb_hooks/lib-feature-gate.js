// Shared feature-entitlement gate — Task #17.
//
// Mirrors the exact eligibility logic in plan-entitlement.pb.js's
// GET /ef/my-entitlements (enabled / account_type / plan / min_property_count
// / limit) so a real, server-side "is this owner actually allowed to use
// this feature right now" check is available to every route/hook that needs
// one — not just the read-only entitlements summary the frontend polls.
// Used by: onRecordBeforeCreateRequest hooks for owner_expenses/owner_tasks,
// and every new custom route this task adds (net-profit, cash-flow-
// forecast, occupancy, ai-advisor, property-timeline, document shares).
//
// PB JSVM scope note: this file is `require()`d from inside each handler
// (same pattern as lib-alerts-engine.js / lib-email.js elsewhere in this
// repo), so it is safe to share across files despite each routerAdd handler
// running in its own isolated VM.

function asArray(v) {
  try {
    const parsed = JSON.parse(String(v == null ? '[]' : v));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function asObject(v) {
  try {
    const parsed = JSON.parse(String(v == null ? '{}' : v));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function num(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

/**
 * requireFeature($app, auth, featureKey) -> { available, reason }
 * Never throws — a missing feature_entitlements row or a lookup error is
 * treated as "not available" (fail closed), never "allow by default".
 */
function requireFeature($app, auth, featureKey) {
  if (!auth) return { available: false, reason: 'unauthorized' };

  const isStaff = (function () {
    try {
      if (auth.getBool('is_super_admin')) return true;
    } catch (_) {}
    const role = String(auth.get('role') || '');
    return ['admin', 'editor', 'support', 'custom'].indexOf(role) >= 0;
  })();
  if (isStaff) return { available: true, reason: '' };

  let row = null;
  try {
    row = $app.findFirstRecordByFilter('feature_entitlements', 'feature_key = {:k}', { k: featureKey });
  } catch (_) {
    row = null;
  }
  if (!row) return { available: false, reason: 'feature_not_configured' };

  const enabled = row.get('enabled') !== false;
  if (!enabled) return { available: false, reason: 'disabled_by_admin' };

  const accountType = String(auth.get('account_type') || 'owner');
  const allowedTypes = asArray(row.get('allowed_account_types'));
  if (allowedTypes.length > 0 && allowedTypes.indexOf(accountType) < 0) {
    return { available: false, reason: 'account_type_not_eligible' };
  }

  const pkgKey = String(auth.get('subscription_package') || 'none').trim().toLowerCase() || 'none';
  const allowedPlans = asArray(row.get('allowed_plans'));
  if (allowedPlans.length > 0 && allowedPlans.indexOf(pkgKey) < 0) {
    return { available: false, reason: 'plan_not_eligible' };
  }

  const minProps = num(row.get('min_property_count'), 0);
  if (minProps > 0) {
    let used = 0;
    try {
      const rows = $app.findRecordsByFilter(
        'properties',
        "owner = {:oid} && status != 'deleted' && status != 'archived'",
        '', 5000, 0, { oid: auth.id },
      );
      used = rows ? rows.length : 0;
    } catch (_) {}
    if (used < minProps) return { available: false, reason: 'min_property_count_not_met' };
  }

  // Matches plan-entitlement.pb.js exactly: an empty limit_by_plan means the
  // Admin has not explicitly unlocked this feature for any plan yet, so it
  // stays blocked even when `enabled` is on — enabled + per-plan limit are
  // two separate switches an Admin must both set, same as the pre-existing
  // portfolio_manager feature.
  const limitByPlan = asObject(row.get('limit_by_plan'));
  const limit = limitByPlan[pkgKey] != null ? limitByPlan[pkgKey] : (limitByPlan.default != null ? limitByPlan.default : 0);
  if (limit === 0) {
    return { available: false, reason: 'not_included_in_plan' };
  }

  return { available: true, reason: '' };
}

module.exports = { requireFeature };
