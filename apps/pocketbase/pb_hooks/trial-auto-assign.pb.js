/// <reference path="../pb_data/types.d.ts" />

// Auto-assign the free trial to owners who log in / refresh without a package.
//
// WHY THIS EXISTS:
// The trial is normally assigned in finalize-signup.pb.js the moment the
// account is completed (OTP verified + password set). But some owners slip
// through with subscription_package = "" / "none":
//   - accounts created before the finalize-signup trial fix
//   - edge cases where the finalize step didn't persist the package
//   - legacy / imported accounts
// Without a package, isPackageActive() returns false and the owner sees
// "subscription inactive" and cannot add ANY property — even though a free
// trial is the default for every new owner and the admin has it enabled.
//
// The frontend pre-check (OwnerDashboard goSection('add-property')) blocks
// the create BEFORE the property-create safety net in
// subscription-enforcement.pb.js can repair the account, so the repair MUST
// happen earlier — at auth time.
//
// Two hooks:
//   1. onRecordAuthWithPasswordRequest — fires on password login. Assigns the
//      trial before the auth token is issued, so the returned record already
//      carries subscription_package = "trial".
//   2. onRecordAuthRefreshRequest — fires on every token refresh (boot,
//      realtime sync, post-payment). Catches users holding a stale token.
//
// IMPORTANT (PB JSVM scope): PocketBase recompiles each hook callback as a
// string in an isolated VM, so file-scope helpers are NOT accessible inside a
// callback. The full trial-assignment logic is therefore duplicated inside
// each callback below — do not factor it out to the top level.
//
// The check is cheap and only mutates the record once: after the first
// assignment pkg = "trial", so every subsequent login / refresh skips
// immediately. Paid packages, manual grants, staff accounts, and still-pending
// placeholders are never touched.

// 1) Password login — assign before the token is issued so the response
//    already carries the active trial.
onRecordAuthWithPasswordRequest((e) => {
  var rec = e.record;
  if (!rec) { e.next(); return; }

  // Staff / Super Admin bypass — they get unlimited, not a trial.
  //
  // BUGFIX: e.next() (which reaches PocketBase's real credential check) must
  // NEVER be called inside a try/catch. A wrong-password login for a staff /
  // super-admin account makes e.next() throw "Failed to authenticate"; the
  // previous code wrapped that call in `try { ... e.next(); ... } catch (_)
  // {}`, which silently swallowed the auth failure and then fell through to
  // the role-check branch below, calling e.next() a SECOND time on an
  // already-completed request — the net effect was a broken empty HTTP 200
  // response instead of the correct 400 "Failed to authenticate" for every
  // admin/editor/support/custom/super-admin login attempt with a wrong
  // password. Only the (safe, non-throwing in practice) getBool() read is
  // inside try/catch now; e.next() always runs unguarded, exactly once.
  var isSuper = false;
  try {
    isSuper = !!rec.getBool("is_super_admin");
  } catch (_) {
    isSuper = false;
  }
  if (isSuper) { e.next(); return; }

  var role = String(rec.get("role") || "");
  if (role === "admin" || role === "editor" || role === "support" || role === "custom") {
    e.next();
    return;
  }

  // Only act on owners with no package yet.
  var pkg = String(rec.get("subscription_package") || "").trim().toLowerCase();
  if (pkg !== "" && pkg !== "none") { e.next(); return; }

  // Never assign a trial to a still-pending placeholder (OTP not yet
  // verified). finalize-signup.pb.js handles those when the account completes.
  // (Same e.next()-outside-try/catch rule as above — see the BUGFIX comment.)
  var isPending = false;
  try {
    isPending = !!rec.getBool("pending_signup");
  } catch (_) {
    isPending = false;
  }
  if (isPending) { e.next(); return; }

  // Read the `plans` collection (Dynamic, Admin-editable — replaces the old
  // `subscription_settings` singleton, see
  // 1789400000_create_plans_and_entitlements.js) for the trial plan's
  // current duration + unit. A plan the Admin has deactivated is treated as
  // "no trial offered" here (new accounts only) — an already-running trial
  // is never cut short by this (see subscription-enforcement.pb.js).
  var trialOn = true;
  var trialCount = 10;
  var trialUnit = "days";
  var trialPlan = null;
  try {
    var rows = $app.findRecordsByFilter("plans", "key = 'trial'", "", 1, 0);
    if (rows && rows.length > 0) {
      trialPlan = rows[0];
      trialOn = trialPlan.get("active") !== false;
      var n = Number(trialPlan.get("trial_value"));
      if (isFinite(n) && n >= 1) trialCount = Math.floor(n);
      trialUnit = String(trialPlan.get("trial_unit") || "days");
    }
  } catch (_) {}

  if (!trialOn) { e.next(); return; }

  // Compute the trial end date from the admin-configured duration + unit —
  // now supports days / weeks / months / years (requirement #1).
  var now = new Date();
  var end = new Date(now.getTime());
  if (trialUnit === "years") {
    end.setFullYear(end.getFullYear() + trialCount);
  } else if (trialUnit === "months") {
    end.setMonth(end.getMonth() + trialCount);
  } else if (trialUnit === "weeks") {
    end.setTime(end.getTime() + trialCount * 7 * 24 * 60 * 60 * 1000);
  } else {
    end.setTime(end.getTime() + trialCount * 24 * 60 * 60 * 1000);
  }

  try {
    rec.set("subscription_package", "trial");
    rec.set("trial_start", now.toISOString());
    rec.set("trial_end", end.toISOString());
    rec.set("extra_properties_purchased", 0);
    $app.save(rec);
    // Dual-write the real per-user Subscription record (requirement #4) —
    // same source, kept in sync, never a second competing source of truth.
    try {
      var subCol = $app.findCollectionByNameOrId("user_subscriptions");
      var subRows = $app.findRecordsByFilter("user_subscriptions", "user = {:uid}", "", 1, 0, { uid: rec.id });
      var subRec = subRows && subRows.length > 0 ? subRows[0] : new Record(subCol);
      subRec.set("user", rec.id);
      if (trialPlan) subRec.set("plan", trialPlan.id);
      subRec.set("status", "trial");
      subRec.set("trial_start", now.toISOString());
      subRec.set("trial_end", end.toISOString());
      subRec.set("extra_properties_purchased", 0);
      $app.save(subRec);
    } catch (_) {}
  } catch (err) {
    try { $app.logger().error("trial auto-assign (login) failed", "err", String(err)); } catch (_) {}
  }

  e.next();
}, "users");

// 2) Token refresh — catches users holding a stale token at boot / realtime
//    sync. Fires often but only mutates once per user (pkg becomes "trial").
onRecordAuthRefreshRequest((e) => {
  var rec = e.record;
  if (!rec) { e.next(); return; }

  // Same bugfix as onRecordAuthWithPasswordRequest above: e.next() must
  // never run inside a try/catch, or a downstream failure (e.g. a revoked/
  // stale token) gets silently swallowed and falls through to a second,
  // unguarded e.next() call below — producing a broken empty response
  // instead of the correct error.
  var isSuper = false;
  try {
    isSuper = !!rec.getBool("is_super_admin");
  } catch (_) {
    isSuper = false;
  }
  if (isSuper) { e.next(); return; }

  var role = String(rec.get("role") || "");
  if (role === "admin" || role === "editor" || role === "support" || role === "custom") {
    e.next();
    return;
  }

  var pkg = String(rec.get("subscription_package") || "").trim().toLowerCase();
  if (pkg !== "" && pkg !== "none") { e.next(); return; }

  var isPending = false;
  try {
    isPending = !!rec.getBool("pending_signup");
  } catch (_) {
    isPending = false;
  }
  if (isPending) { e.next(); return; }

  var trialOn = true;
  var trialCount = 10;
  var trialUnit = "days";
  var trialPlan = null;
  try {
    var rows = $app.findRecordsByFilter("plans", "key = 'trial'", "", 1, 0);
    if (rows && rows.length > 0) {
      trialPlan = rows[0];
      trialOn = trialPlan.get("active") !== false;
      var n = Number(trialPlan.get("trial_value"));
      if (isFinite(n) && n >= 1) trialCount = Math.floor(n);
      trialUnit = String(trialPlan.get("trial_unit") || "days");
    }
  } catch (_) {}

  if (!trialOn) { e.next(); return; }

  var now = new Date();
  var end = new Date(now.getTime());
  if (trialUnit === "years") {
    end.setFullYear(end.getFullYear() + trialCount);
  } else if (trialUnit === "months") {
    end.setMonth(end.getMonth() + trialCount);
  } else if (trialUnit === "weeks") {
    end.setTime(end.getTime() + trialCount * 7 * 24 * 60 * 60 * 1000);
  } else {
    end.setTime(end.getTime() + trialCount * 24 * 60 * 60 * 1000);
  }

  try {
    rec.set("subscription_package", "trial");
    rec.set("trial_start", now.toISOString());
    rec.set("trial_end", end.toISOString());
    rec.set("extra_properties_purchased", 0);
    $app.save(rec);
    try {
      var subCol = $app.findCollectionByNameOrId("user_subscriptions");
      var subRows = $app.findRecordsByFilter("user_subscriptions", "user = {:uid}", "", 1, 0, { uid: rec.id });
      var subRec = subRows && subRows.length > 0 ? subRows[0] : new Record(subCol);
      subRec.set("user", rec.id);
      if (trialPlan) subRec.set("plan", trialPlan.id);
      subRec.set("status", "trial");
      subRec.set("trial_start", now.toISOString());
      subRec.set("trial_end", end.toISOString());
      subRec.set("extra_properties_purchased", 0);
      $app.save(subRec);
    } catch (_) {}
  } catch (err) {
    try { $app.logger().error("trial auto-assign (refresh) failed", "err", String(err)); } catch (_) {}
  }

  e.next();
}, "users");
