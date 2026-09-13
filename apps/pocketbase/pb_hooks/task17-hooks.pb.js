/// <reference path="../pb_data/types.d.ts" />

// Task #17 — record hooks for the 3 new collections + the public secure-share
// resolution route. Kept in its own file (separate from task17-features.pb.js,
// which only holds read-side aggregation routerAdd handlers) so create/update
// guards are easy to find together.
//
// PB JSVM scope note: every hook callback runs in its own isolated VM, so
// lib-feature-gate.js is require()'d fresh inside each one (same pattern used
// throughout this repo for lib-alerts-engine.js / lib-email.js).

// ---------------------------------------------------------------------------
// owner_expenses — server-side entitlement guard on create (a disabled
// feature must be un-bypassable even via a raw API call, not just hidden
// from nav) + an activity_logs writer so Property Timeline picks up expenses
// automatically (no separate log table).
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const category = String(e.record.get("category") || "");
  let gate = requireFeature($app, auth, "expense_center");
  if (!gate.available && category === "maintenance") {
    // A deployment may license Maintenance Center without the general
    // Expense Center — the maintenance-category slice still works then.
    gate = requireFeature($app, auth, "maintenance_center");
  }
  if (!gate.available) throw new BadRequestError(gate.reason || "feature_not_available");

  // Owners can only ever create rows for themselves (createRule already
  // enforces this at the DB level; this is the same check surfaced as a
  // clear error rather than a generic rule-violation).
  const isStaff = (function () {
    try { if (auth.getBool("is_super_admin")) return true; } catch (_) {}
    return ["admin", "editor", "support", "custom"].indexOf(String(auth.get("role") || "")) >= 0;
  })();
  if (!isStaff && e.record.get("owner") !== auth.id) {
    throw new BadRequestError("owner_mismatch");
  }
  e.next();
}, "owner_expenses");

onRecordAfterCreateSuccess((e) => {
  try {
    const col = $app.findCollectionByNameOrId("activity_logs");
    const rec = new Record(col);
    const owner = e.record.get("owner") || "";
    if (owner) rec.set("user", owner);
    rec.set("action", "expense_recorded");
    rec.set("entity", "owner_expenses");
    rec.set("entity_id", e.record.id);
    rec.set("details", (e.record.get("category") || "") + " / " + (e.record.get("title") || "") + " / " + (e.record.get("amount") || 0));
    $app.save(rec);
  } catch (err) {
    $app.logger().error("expense activity log failed", "err", String(err));
  }
  e.next();
}, "owner_expenses");

onRecordAfterUpdateSuccess((e) => {
  try {
    const col = $app.findCollectionByNameOrId("activity_logs");
    const rec = new Record(col);
    const owner = e.record.get("owner") || "";
    if (owner) rec.set("user", owner);
    rec.set("action", "expense_updated");
    rec.set("entity", "owner_expenses");
    rec.set("entity_id", e.record.id);
    rec.set("details", (e.record.get("category") || "") + " / " + (e.record.get("title") || "") + " / " + (e.record.get("amount") || 0));
    $app.save(rec);
  } catch (err) {
    $app.logger().error("expense update log failed", "err", String(err));
  }
  e.next();
}, "owner_expenses");

// ---------------------------------------------------------------------------
// owner_tasks — entitlement guard only (a to-do list has no financial
// history worth logging to the property timeline).
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const gate = requireFeature($app, auth, "task_center");
  if (!gate.available) throw new BadRequestError(gate.reason || "feature_not_available");

  const isStaff = (function () {
    try { if (auth.getBool("is_super_admin")) return true; } catch (_) {}
    return ["admin", "editor", "support", "custom"].indexOf(String(auth.get("role") || "")) >= 0;
  })();
  if (!isStaff && e.record.get("owner") !== auth.id) {
    throw new BadRequestError("owner_mismatch");
  }
  e.next();
}, "owner_tasks");

// ---------------------------------------------------------------------------
// document_shares — entitlement guard + a server-generated, unguessable
// token (never trust a client-supplied token: it would let anyone predict
// or collide another owner's share link).
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const gate = requireFeature($app, auth, "secure_sharing");
  if (!gate.available) throw new BadRequestError(gate.reason || "feature_not_available");

  const isStaff = (function () {
    try { if (auth.getBool("is_super_admin")) return true; } catch (_) {}
    return ["admin", "editor", "support", "custom"].indexOf(String(auth.get("role") || "")) >= 0;
  })();
  if (!isStaff && e.record.get("owner") !== auth.id) {
    throw new BadRequestError("owner_mismatch");
  }

  // Server-generated token (never trust a client-supplied value — that would
  // let anyone predict or collide another owner's share link). $security.
  // randomString() is the same PB JSVM helper already used in this repo for
  // generating a random password in signup-otp.pb.js.
  try {
    e.record.set("token", $security.randomString(48));
  } catch (_) {
    e.record.set("token", String(Date.now()) + String(Math.random()).slice(2) + String(Math.random()).slice(2));
  }
  e.record.set("view_count", 0);
  e.record.set("revoked", false);
  e.next();
}, "document_shares");

// NOTE: the PUBLIC share-resolution endpoint (token -> a short-lived
// protected-file token) is intentionally NOT implemented here. This PB JSVM
// build has no documented helper to mint a files.getToken()-equivalent from
// inside a routerAdd handler, whereas the Express layer already has a
// tested, working pattern for exactly this (see crypto proof review in
// payment-gateways.js: `await pocketbaseClient.files.getToken()` via the
// superuser-authenticated JS SDK client). So resolution lives in
// apps/api/src/routes/document-shares.js instead, reusing that same
// pattern rather than inventing an untested PB-side equivalent.
