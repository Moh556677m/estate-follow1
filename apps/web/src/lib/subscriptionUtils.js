// Subscription & packages helpers — shared by the owner SubscriptionPanel and
// the admin SubscriptionManagementPanel. All logic mirrors the server-side
// enforcement hook in pb_hooks/subscription-enforcement.pb.js.

import pb from '@/lib/pocketbaseClient';

export const PACKAGE_KEYS = ['trial', 'annual', 'premium', 'unlimited'];

export const PACKAGE_NONE = 'none';

// Default settings used before the first settings record loads / if fetch
// fails. Mirrors the migration seed defaults.
export const DEFAULT_SETTINGS = {
  trial_enabled: true,
  trial_days: 10,
  trial_unit: 'days',
  trial_properties: 3,
  annual_enabled: true,
  annual_price: 100,
  annual_discount_amount: 0,
  annual_discount_percent: 0, // legacy — read-only fallback
  annual_free_properties: 2,
  annual_extra_enabled: true,
  annual_extra_type: 'percent',
  annual_extra_value: 10,
  premium_enabled: true,
  premium_price: 200,
  premium_discount_amount: 0,
  premium_discount_percent: 0,
  premium_properties: 15,
  unlimited_enabled: true,
  unlimited_price: 300,
  unlimited_discount_amount: 0,
  unlimited_discount_percent: 0,
  currency: 'USD',
};

/** Normalize a settings row so price/discount fields are always numbers. */
export function normalizeSubscriptionSettings(row) {
  const base = { ...DEFAULT_SETTINGS, ...(row && typeof row === 'object' ? row : {}) };
  const numKeys = [
    'trial_days',
    'trial_properties',
    'annual_price',
    'annual_discount_amount',
    'annual_discount_percent',
    'annual_free_properties',
    'annual_extra_value',
    'premium_price',
    'premium_discount_amount',
    'premium_discount_percent',
    'premium_properties',
    'unlimited_price',
    'unlimited_discount_amount',
    'unlimited_discount_percent',
  ];
  numKeys.forEach((k) => {
    const n = Number(base[k]);
    base[k] = Number.isFinite(n) ? n : Number(DEFAULT_SETTINGS[k] ?? 0);
  });
  base.trial_enabled = base.trial_enabled !== false && base.trial_enabled !== 0;
  base.annual_enabled = base.annual_enabled !== false && base.annual_enabled !== 0;
  base.premium_enabled = base.premium_enabled !== false && base.premium_enabled !== 0;
  base.unlimited_enabled = base.unlimited_enabled !== false && base.unlimited_enabled !== 0;
  base.annual_extra_enabled =
    base.annual_extra_enabled !== false && base.annual_extra_enabled !== 0;
  base.currency = String(base.currency || DEFAULT_SETTINGS.currency || 'USD');
  const unit = String(base.trial_unit || 'days').toLowerCase();
  base.trial_unit = unit === 'months' ? 'months' : 'days';
  // Prefer fixed amount; if only legacy percent exists, derive amount once.
  [
    ['annual_price', 'annual_discount_percent', 'annual_discount_amount'],
    ['premium_price', 'premium_discount_percent', 'premium_discount_amount'],
    ['unlimited_price', 'unlimited_discount_percent', 'unlimited_discount_amount'],
  ].forEach(([priceKey, pctKey, amtKey]) => {
    const price = Math.max(0, Number(base[priceKey]) || 0);
    let amt = Number(base[amtKey]);
    if (!Number.isFinite(amt) || amt < 0) amt = 0;
    if (amt <= 0) {
      const pct = Math.max(0, Math.min(100, Number(base[pctKey]) || 0));
      if (pct > 0 && price > 0) {
        amt = Math.round(price * (pct / 100) * 100) / 100;
      }
    }
    base[amtKey] = Math.min(price, Math.max(0, amt));
  });
  return base;
}

/** Fixed discount amount in currency units (clamped to original price). */
export function packageDiscountAmount(pkg, s) {
  if (!s) return 0;
  const original = packageOriginalPrice(pkg, s);
  let amt = 0;
  if (pkg === 'annual') amt = Number(s.annual_discount_amount ?? 0) || 0;
  else if (pkg === 'premium') amt = Number(s.premium_discount_amount ?? 0) || 0;
  else if (pkg === 'unlimited') amt = Number(s.unlimited_discount_amount ?? 0) || 0;
  else return 0;
  if (amt <= 0) {
    // Legacy percent fallback
    let pct = 0;
    if (pkg === 'annual') pct = Number(s.annual_discount_percent ?? 0) || 0;
    else if (pkg === 'premium') pct = Number(s.premium_discount_percent ?? 0) || 0;
    else if (pkg === 'unlimited') pct = Number(s.unlimited_discount_percent ?? 0) || 0;
    if (pct > 0 && original > 0) {
      amt = Math.round(original * (pct / 100) * 100) / 100;
    }
  }
  return Math.min(original, Math.max(0, amt));
}

/** @deprecated Prefer packageDiscountAmount — kept for any leftover callers. */
export function packageDiscountPercent(pkg, s) {
  const original = packageOriginalPrice(pkg, s);
  if (original <= 0) return 0;
  const amt = packageDiscountAmount(pkg, s);
  if (amt <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((amt / original) * 10000) / 100));
}

/** True when admin configured an active discount on this package. */
export function packageHasDiscount(pkg, s) {
  if (pkg === 'trial' || pkg === 'none') return false;
  return packageDiscountAmount(pkg, s) > 0;
}

/** Compute trial end date from start + settings (days or months). */
export function computeTrialEnd(start, s) {
  const from = start instanceof Date ? new Date(start.getTime()) : new Date(start || Date.now());
  if (isNaN(from.getTime())) return null;
  const n = Math.max(1, Number(s?.trial_days ?? 10) || 10);
  const unit = String(s?.trial_unit || 'days') === 'months' ? 'months' : 'days';
  const end = new Date(from.getTime());
  if (unit === 'months') {
    end.setMonth(end.getMonth() + n);
  } else {
    end.setTime(end.getTime() + n * 24 * 60 * 60 * 1000);
  }
  return end;
}

/** Localized trial duration label, e.g. "10 days" / "1 شهر". */
export function trialDurationLabel(s, isAr) {
  const n = Math.max(1, Number(s?.trial_days ?? 10) || 10);
  const unit = String(s?.trial_unit || 'days') === 'months' ? 'months' : 'days';
  if (unit === 'months') {
    if (isAr) return n === 1 ? 'شهر واحد' : `${n} شهور`;
    return n === 1 ? '1 month' : `${n} months`;
  }
  if (isAr) return n === 1 ? 'يوم واحد' : `${n} يومًا`;
  return n === 1 ? '1 day' : `${n} days`;
}

/**
 * Load package pricing/limits — REAL Dynamic source now: the `plans`
 * collection (see 1789400000_create_plans_and_entitlements.js), not the old
 * `subscription_settings` singleton. Projected into the exact same
 * legacy-shaped object every existing caller here already expects
 * (trial_days, annual_price, ...) so SubscriptionPanel.jsx,
 * OwnerDashboard.jsx's pre-check, and every other consumer of this function
 * keep working completely unchanged and now show genuinely live data. Only
 * SubscriptionManagementPanel.jsx's SAVE path needed to change (it now
 * writes back to the 4 `plans` rows using `_planIds` below instead of a
 * single subscription_settings record).
 */
export async function loadSubscriptionSettings() {
  try {
    const rows = await pb.collection('plans').getFullList({
      sort: 'sort_order',
      requestKey: 'sub-settings-load',
    });
    const byKey = {};
    rows.forEach((r) => { byKey[r.key] = r; });
    const trial = byKey.trial;
    const annual = byKey.annual;
    const premium = byKey.premium;
    const unlimited = byKey.unlimited;
    if (!trial && !annual && !premium && !unlimited) {
      return { ...DEFAULT_SETTINGS };
    }
    const projected = {
      trial_enabled: trial ? trial.active !== false : DEFAULT_SETTINGS.trial_enabled,
      trial_days: trial ? Number(trial.trial_value) || 0 : DEFAULT_SETTINGS.trial_days,
      trial_unit: trial ? trial.trial_unit || 'days' : 'days',
      trial_properties: trial ? Number(trial.property_limit) || 0 : DEFAULT_SETTINGS.trial_properties,
      annual_enabled: annual ? annual.active !== false : DEFAULT_SETTINGS.annual_enabled,
      annual_price: annual ? Number(annual.price) || 0 : DEFAULT_SETTINGS.annual_price,
      annual_discount_amount: annual ? Number(annual.discount_price) || 0 : 0,
      annual_free_properties: annual ? Number(annual.property_limit) || 0 : DEFAULT_SETTINGS.annual_free_properties,
      annual_extra_enabled: annual ? !!annual.extra_property_enabled : DEFAULT_SETTINGS.annual_extra_enabled,
      annual_extra_type: annual ? annual.extra_property_type || 'percent' : 'percent',
      annual_extra_value: annual ? Number(annual.extra_property_value) || 0 : DEFAULT_SETTINGS.annual_extra_value,
      premium_enabled: premium ? premium.active !== false : DEFAULT_SETTINGS.premium_enabled,
      premium_price: premium ? Number(premium.price) || 0 : DEFAULT_SETTINGS.premium_price,
      premium_discount_amount: premium ? Number(premium.discount_price) || 0 : 0,
      premium_properties: premium ? Number(premium.property_limit) || 0 : DEFAULT_SETTINGS.premium_properties,
      unlimited_enabled: unlimited ? unlimited.active !== false : DEFAULT_SETTINGS.unlimited_enabled,
      unlimited_price: unlimited ? Number(unlimited.price) || 0 : DEFAULT_SETTINGS.unlimited_price,
      unlimited_discount_amount: unlimited ? Number(unlimited.discount_price) || 0 : 0,
      currency: (trial || annual || premium || unlimited)?.currency || DEFAULT_SETTINGS.currency,
      // Plan row ids, keyed by package — the admin panel's save path uses
      // these to patch each `plans` row directly. Never sent to PocketBase
      // as a field (normalizeSubscriptionSettings only touches known keys).
      _planIds: {
        trial: trial?.id || null,
        annual: annual?.id || null,
        premium: premium?.id || null,
        unlimited: unlimited?.id || null,
      },
      // Currency-per-country system (1792100000_country_currency_settings.js):
      // each plan's raw per-currency price override map, keyed by package.
      // Never sent back to PocketBase as a field — same convention as
      // _planIds above.
      _currencyPrices: {
        trial: (trial && trial.currency_prices) || {},
        annual: (annual && annual.currency_prices) || {},
        premium: (premium && premium.currency_prices) || {},
        unlimited: (unlimited && unlimited.currency_prices) || {},
      },
    };
    return normalizeSubscriptionSettings(projected);
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

/** Realtime subscribe to plan changes (so admin edits reflect instantly). */
export function subscribeSettings(callback) {
  void pb
    .collection('plans')
    .subscribe('*', () => callback())
    .catch(() => {});
  return () => {
    void pb.collection('plans').unsubscribe('*').catch(() => {});
  };
}

/** Display name for a package key, localized. */
export function packageLabel(key, t) {
  const map = {
    none: t('sub_none') || (t('lang_ar') ? 'لا باقة' : 'No package'),
    trial: t('sub_trial') || 'Trial',
    annual: t('sub_annual') || 'Annual',
    premium: t('sub_premium') || 'Premium',
    unlimited: t('sub_unlimited') || 'Unlimited',
  };
  return map[key] || key;
}

/** Normalize package key from user record (trim + lowercase). */
export function normalizePackageKey(pkg) {
  const k = String(pkg || 'none').trim().toLowerCase();
  if (PACKAGE_KEYS.includes(k) || k === PACKAGE_NONE) return k;
  return 'none';
}

/** Parse a PB/ISO date to epoch ms, or null if missing/invalid. */
export function parseSubDateMs(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  // PocketBase may return "YYYY-MM-DD HH:mm:ss.sssZ" — Date parses both forms.
  const t = new Date(String(value)).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Count properties that count toward the owner's quota.
 * - Only rows owned by this user (never other owners / demo orphans)
 * - Excludes soft-deleted / archived flags if present
 * - Does not invent ghost rows; empty list → 0
 */
export function countOwnedProperties(list, userId) {
  if (!userId || !Array.isArray(list)) return 0;
  const uid = String(userId);
  let n = 0;
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i];
    if (!p || typeof p !== 'object') continue;
    if (p.deleted === true || p.is_deleted === true || p.archived === true) continue;
    if (p.status === 'deleted' || p.status === 'archived') continue;
    const owner = p.owner;
    const ownerId =
      owner && typeof owner === 'object' ? String(owner.id || '') : String(owner || '');
    if (ownerId && ownerId === uid) n += 1;
  }
  return n;
}

/** Property limit for a package. Returns -1 for unlimited.
 *  Always falls back to DEFAULT_SETTINGS so a missing/null settings row
 *  never collapses the limit to 0 (which falsely blocks every create). */
export function packagePropertyLimit(pkg, s) {
  const cfg = s && typeof s === 'object' ? s : DEFAULT_SETTINGS;
  const key = normalizePackageKey(pkg);
  if (key === 'trial') {
    const n = Number(cfg.trial_properties);
    const v = Number.isFinite(n) && n >= 0 ? n : DEFAULT_SETTINGS.trial_properties;
    // Minimum 1 property during trial — a zero/invalid value must never
    // block a brand-new owner from adding their first property.
    return Math.max(1, v);
  }
  if (key === 'annual') {
    const n = Number(cfg.annual_free_properties);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SETTINGS.annual_free_properties;
  }
  if (key === 'premium') {
    const n = Number(cfg.premium_properties);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SETTINGS.premium_properties;
  }
  if (key === 'unlimited') return -1;
  return 0;
}

/** Final (discounted) price for a package = original − fixed discount amount. */
export function packageFinalPrice(pkg, s) {
  if (!s) return 0;
  if (pkg !== 'annual' && pkg !== 'premium' && pkg !== 'unlimited') return 0;
  const price = packageOriginalPrice(pkg, s);
  const discount = packageDiscountAmount(pkg, s);
  const final = Math.round((price - discount) * 100) / 100;
  return Math.max(0, final);
}

/** Original (pre-discount) price — only differs when discount > 0. */
export function packageOriginalPrice(pkg, s) {
  if (!s) return 0;
  if (pkg === 'annual') return Number(s.annual_price ?? 100) || 0;
  if (pkg === 'premium') return Number(s.premium_price ?? 200) || 0;
  if (pkg === 'unlimited') return Number(s.unlimited_price ?? 300) || 0;
  return 0;
}

/** Price for one extra property on the annual plan. */
export function extraPropertyPrice(s) {
  if (!s) return 0;
  const type = s.annual_extra_type || 'percent';
  const value = Number(s.annual_extra_value ?? 0);
  if (type === 'fixed') return value;
  // percent of annual price
  return (Number(s.annual_price ?? 100) * value) / 100;
}

/**
 * Whether a package is currently active for the user (not expired).
 *
 * Paid tiers:
 * - Prefer subscription_end when valid.
 * - If end is missing but subscription_start exists, derive end = start + 1y − 1d
 *   (same window as checkout / admin assign).
 * - If package is a paid key but both dates are missing (legacy/partial writes),
 *   treat as active so we never false-block owners who clearly have a package
 *   assigned in the DB / subscription UI.
 */
export function isPackageActive(user, s) {
  if (!user) return false;
  const pkg = normalizePackageKey(user.subscription_package);
  if (pkg === 'none') return false;
  const now = Date.now();
  if (pkg === 'trial') {
    if (s && s.trial_enabled === false) return false;
    const end = parseSubDateMs(user.trial_end);
    if (end != null && now > end) return false;
    return true;
  }
  // annual / premium / unlimited
  let endMs = parseSubDateMs(user.subscription_end);
  if (endMs == null) {
    const startMs = parseSubDateMs(user.subscription_start);
    if (startMs != null) {
      const derived = addFullYearMinusOneDay(new Date(startMs));
      endMs = derived ? derived.getTime() : null;
    }
  }
  // Legacy partial activation: package set, no usable dates → still active.
  if (endMs == null) return true;
  if (now > endMs) return false;
  return true;
}

/** Remaining properties the user can add (Infinity for unlimited). */
export function remainingProperties(user, s, currentCount) {
  if (!user) return 0;
  const pkg = normalizePackageKey(user.subscription_package);
  if (pkg === 'none') return 0;
  if (!isPackageActive(user, s)) return 0;
  const limit = packagePropertyLimit(pkg, s);
  if (limit === -1) return Infinity;
  const extra = Math.max(0, Number(user.extra_properties_purchased || 0) || 0);
  const used = Math.max(0, Number(currentCount) || 0);
  return Math.max(0, limit + extra - used);
}

/** Effective total allowed properties (limit + extra purchased). */
export function effectivePropertyLimit(user, s) {
  if (!user) return 0;
  const pkg = normalizePackageKey(user.subscription_package);
  const limit = packagePropertyLimit(pkg, s);
  if (limit === -1) return Infinity;
  const extra = Math.max(0, Number(user.extra_properties_purchased || 0) || 0);
  return limit + extra;
}

/** Currency symbol for display. */
export function currencySymbol(code) {
  const map = { USD: '$', EUR: '€', GBP: '£', SAR: 'ر.س', AED: 'د.إ', EGP: 'ج.م' };
  return map[code] || code || '$';
}

/** Format a price with currency.
 *  `forceDecimals` keeps two fraction digits (e.g. 99.00) for promo display. */
export function formatPrice(amount, currency, forceDecimals = false) {
  const sym = currencySymbol(currency);
  const n = Number(amount || 0);
  const rounded =
    forceDecimals || Math.abs(n % 1) > 1e-9 ? n.toFixed(2) : n.toFixed(0);
  return `${sym}${rounded}`;
}

/**
 * Full-year subscription window: start day D → end day is the day before
 * the same calendar date next year (e.g. 2026-09-20 → 2027-09-19).
 */
export function addFullYearMinusOneDay(start) {
  const d = start instanceof Date ? new Date(start.getTime()) : new Date(start);
  if (isNaN(d.getTime())) return null;
  const end = new Date(d.getTime());
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Resolve subscription start/end for display from the user record. */
export function subscriptionWindow(user) {
  if (!user) return { start: null, end: null };
  const pkg = String(user.subscription_package || 'none');
  if (pkg === 'none') return { start: null, end: null };
  if (pkg === 'trial') {
    const start = user.trial_start ? new Date(user.trial_start) : null;
    const end = user.trial_end ? new Date(user.trial_end) : null;
    return {
      start: start && !isNaN(start.getTime()) ? start : null,
      end: end && !isNaN(end.getTime()) ? end : null,
    };
  }
  // Paid packages: prefer explicit start, else back-calculate from end
  // (end is start + 1y − 1d → start ≈ end − 1y + 1d).
  let start = user.subscription_start ? new Date(user.subscription_start) : null;
  let end = user.subscription_end ? new Date(user.subscription_end) : null;
  if ((!start || isNaN(start.getTime())) && end && !isNaN(end.getTime())) {
    start = new Date(end.getTime());
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
  }
  if (start && !isNaN(start.getTime()) && (!end || isNaN(end.getTime()))) {
    end = addFullYearMinusOneDay(start);
  }
  return {
    start: start && !isNaN(start.getTime()) ? start : null,
    end: end && !isNaN(end.getTime()) ? end : null,
  };
}

/** Locale-aware short date for subscription cards. */
export function formatSubDate(value, isAr) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Create a subscription order (upgrade or extra property request).
 *  `gateway` is the optional id of the payment gateway the user chose. */
export async function createOrder(packageKey, amount, currency, note = '', gateway = '') {
  const user = pb.authStore.record;
  if (!user) throw new Error('Not authenticated');
  const rec = await pb.collection('subscription_orders').create({
    user: user.id,
    package: packageKey,
    amount,
    currency,
    status: 'pending',
    requested_at: new Date().toISOString(),
    note,
    gateway,
  }, { requestKey: `sub-order-${packageKey}-${Date.now()}` });
  return rec;
}

/** Load the current user's orders. */
export async function loadUserOrders() {
  const user = pb.authStore.record;
  if (!user) return [];
  try {
    return await pb.collection('subscription_orders').getFullList({
      filter: pb.filter('user = {:uid}', { uid: user.id }),
      sort: '-created',
      requestKey: 'sub-user-orders',
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Special Access — a COMPLETELY SEPARATE system from paid subscriptions.
//
// An admin (Super Admin) can grant a specific owner a free numeric property
// limit (any number: 1, 2, 3, …) or unlimited access, independent of any
// package / Stripe payment / trial. Stored in the `manual_property_grants`
// collection (kept as the internal data source — no parallel database).
//
// SEPARATION CONTRACT (mirrors the server-side hook):
//   - While an active Special Access grant has remaining slots, ONLY it is
//     consulted. The paid subscription / trial is never read and never
//     mutated. The two systems are never evaluated together.
//   - When Special Access is exhausted (remaining = 0), we FALL THROUGH to
//     the paid subscription / trial check. The owner is then offered a paid
//     package exactly like any other customer — they enter the normal Stripe
//     flow. Special Access never changes the paid subscription state.
// ---------------------------------------------------------------------------

/** Normalize a Special Access record into { type, limit, active } or null. */
export function normalizeSpecialAccess(row) {
  if (!row || typeof row !== 'object') return null;
  const active = row.active !== false && row.active !== 0 && String(row.active) !== 'false';
  if (!active) return null;
  const type = String(row.grant_type || 'limited') === 'unlimited' ? 'unlimited' : 'limited';
  const limit = type === 'unlimited' ? -1 : Math.max(0, Math.floor(Number(row.property_limit) || 0));
  return { type, limit, active: true, id: row.id || '' };
}

/** Load the active Special Access row for a user (or null). Super Admin or the
 *  user themselves can read it (collection listRule allows owner read).
 *  Returns the RAW record so callers can pass it to resolvePropertyAccess /
 *  normalizeSpecialAccess. */
export async function loadSpecialAccess(userId) {
  if (!userId) return null;
  try {
    const rows = await pb.collection('manual_property_grants').getFullList({
      filter: pb.filter('user = {:uid}', { uid: userId }),
      requestKey: `special-access-${userId}`,
    });
    if (rows && rows.length > 0) return rows[0];
  } catch {
    /* not allowed / missing — treat as no special access */
  }
  return null;
}

/**
 * Resolve the effective property access for a user, applying SPECIAL ACCESS
 * PRIORITY with clean fall-through (never mixing the two systems).
 *
 * Returns:
 *   {
 *     active:   boolean,       — may the user add a property right now?
 *     source:   'special' | 'subscription' | 'none',
 *     limit:    number | Infinity,  — total allowed (Infinity = unlimited)
 *     remaining:number | Infinity,  — remaining slots (Infinity = unlimited)
 *     packageActive?: boolean       — paid subscription current (subscription source only)
 *   }
 *
 * While Special Access has remaining slots, source = 'special' and the paid
 * subscription is ignored. When Special Access is exhausted, we fall through
 * to the subscription / trial check (source = 'subscription' | 'none'). The
 * paid subscription state is never mutated.
 */
export function resolvePropertyAccess(user, settings, currentCount, specialAccess) {
  const used = Math.max(0, Number(currentCount) || 0);

  // 1) Special Access takes priority while it still has remaining slots.
  const sa = specialAccess ? normalizeSpecialAccess(specialAccess) : null;
  if (sa) {
    if (sa.type === 'unlimited' || sa.limit === -1) {
      return { active: true, source: 'special', limit: Infinity, remaining: Infinity };
    }
    const remaining = Math.max(0, sa.limit - used);
    if (remaining > 0) {
      return { active: true, source: 'special', limit: sa.limit, remaining };
    }
    // Exhausted — fall through to the paid subscription / trial check.
  }

  // 2) Paid subscription / trial only (Special Access not active or exhausted).
  // packageActive = the subscription/trial is current (not expired, not none).
  // active = the user can add a property right now (packageActive && remaining > 0).
  // Callers use packageActive to distinguish "expired/inactive" from "limit reached".
  if (!user) return { active: false, source: 'none', limit: 0, remaining: 0, packageActive: false };
  const pkg = normalizePackageKey(user.subscription_package);
  if (pkg === 'none') return { active: false, source: 'none', limit: 0, remaining: 0, packageActive: false };
  const pkgActive = isPackageActive(user, settings);
  if (!pkgActive) {
    return { active: false, source: 'subscription', limit: 0, remaining: 0, packageActive: false };
  }
  const limit = packagePropertyLimit(pkg, settings);
  if (limit === -1) return { active: true, source: 'subscription', limit: Infinity, remaining: Infinity, packageActive: true };
  const extra = Math.max(0, Number(user.extra_properties_purchased || 0) || 0);
  const total = limit + extra;
  const remaining = Math.max(0, total - used);
  return { active: remaining > 0, source: 'subscription', limit: total, remaining, packageActive: true };
}
