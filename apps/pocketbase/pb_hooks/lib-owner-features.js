// Shared helpers for Task #17's read-only aggregation routes
// (task17-features.pb.js). Extracted into a require()'d module — NOT
// defined at that file's top level — because every routerAdd handler in
// this PocketBase JSVM build compiles in its OWN isolated VM (same
// constraint documented in lib-feature-gate.js's header comment): a plain
// top-level function in a .pb.js file is invisible inside a routerAdd
// callback defined later in that same file (confirmed empirically — see
// the "safeList is not defined" runtime error this file fixes). require()
// is the one sharing mechanism that actually works across handlers here.
//
// ---------------------------------------------------------------------------
// ANTI-DUPLICATION RULES for adding a new Feature Management feature
// (written down as feature #15 of the Sept-2026 batch, at Mohamed's
// request — this is the design rule that batch of 15 features actually
// followed, formalized here for whoever adds feature #16+):
//
//  1. Before creating a new PocketBase collection, ask: can this be
//     COMPUTED from data that already exists (properties, payments,
//     rent_payments, tenancies, owner_expenses, tenant_claims, etc.)? If
//     yes, add a read-only routerAdd route here instead of a collection —
//     this is what Property Health Score, Tenant Score, Portfolio Net
//     Worth/LTV, Portfolio Distribution, Lifetime Return, Property
//     Statements and Smart Monthly Suggestions all do. Zero new
//     collections for 8 of this batch's 13 features.
//  2. Only add a new collection when the feature needs to PERSIST
//     something genuinely new that cannot be derived (a claim record, a
//     user-entered market comparable, a marketplace listing). Even then,
//     reuse existing collections for anything they already cover — e.g.
//     marketplace_listings references `properties` by relation instead of
//     re-storing building/unit/country/price.
//  3. Every new feature gets exactly ONE feature_entitlements row
//     (disabled by default), added via a migration that checks
//     findFirstRecordByFilter for the feature_key first — belt-and-
//     suspenders on top of the UNIQUE index already on feature_key (see
//     1789400000_create_plans_and_entitlements.js), so a duplicate
//     feature_key is structurally impossible, not just discouraged.
//  4. If a new idea overlaps an EXISTING feature (e.g. "country-specific
//     tax rules" over the existing tax_accounting_export), EXTEND that
//     feature's route/description instead of minting a second key for the
//     same underlying capability — see task18-features.pb.js's
//     GET /ef/features/tax-summary for how feature #14 did this.
//  5. When a feature reads rental income/activity, read BOTH data sources
//     this codebase has — the legacy `payments` collection AND the
//     current `tenancies`/`rent_payments` flow — never just one; a
//     property using the newer flow must never silently disappear from a
//     report. This gap was found and fixed for the Property Calendar,
//     then deliberately avoided from the start in every later feature.
// ---------------------------------------------------------------------------

function isoDate(v) {
  if (v == null || v === '') return null;
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeList($app, collection, filter, params) {
  try {
    return $app.findRecordsByFilter(collection, filter, '', 20000, 0, params || {}) || [];
  } catch (_) {
    return [];
  }
}

// Shared by Portfolio Net Worth / LTV / Lifetime Return (Feature Management
// batch) — a single, honest definition of "what a property is worth" from
// data this codebase actually has: the recorded purchase price and, for
// installment properties, how much of it has actually been paid. There is
// NO market-valuation/appraisal source anywhere in this repo, so this is
// deliberately a COST/EQUITY basis, never presented as a live market value.
// Returns null fields (never 0) when total_price is missing, so callers can
// exclude/flag "unknown" properties instead of silently treating them as
// worthless.
function computeEquity(p) {
  const type = p.get('type');
  const totalPrice = Number(p.get('total_price')) || 0;
  const totalPaid = Number(p.get('total_paid')) || 0;
  const hasPrice = totalPrice > 0;
  if (!hasPrice) {
    return { hasPrice: false, totalPrice: null, paid: null, outstanding: null, equity: null };
  }
  if (type === 'installment') {
    const paid = Math.min(totalPaid, totalPrice);
    const outstanding = Math.max(0, totalPrice - paid);
    return { hasPrice: true, totalPrice, paid, outstanding, equity: paid };
  }
  // cash / rented — treated as fully owned (no outstanding financing tracked).
  return { hasPrice: true, totalPrice, paid: totalPrice, outstanding: 0, equity: totalPrice };
}

module.exports = { isoDate, safeList, computeEquity };
