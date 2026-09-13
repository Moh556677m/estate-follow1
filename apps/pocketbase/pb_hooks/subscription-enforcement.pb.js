/// <reference path="../pb_data/types.d.ts" />

// Server-side subscription enforcement.
//
// Every property create is checked against the property owner's current package
// limit BEFORE the record is saved. Super Admin and staff bypass the check.
//
// New users auto-start a trial (if enabled in settings) on account create.
//
// IMPORTANT (PB JSVM scope): PocketBase recompiles each hook callback as a
// string in an isolated VM, so file-scope helpers/vars are NOT accessible
// inside a callback. Every helper used by a callback MUST be defined INSIDE
// that callback. Do not reference top-level functions from a hook handler.

// ---------------------------------------------------------------------------
// Enforce property limit on create.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  // ---- helpers (self-contained — see scope note above) ----
  var EF_SUB_DEFAULTS = {
    trial_properties: 3,
    annual_free_properties: 2,
    premium_properties: 15,
  };

  // Plans are the real, Admin-editable, Dynamic source of truth (see
  // 1789400000_create_plans_and_entitlements.js) — replaces the old
  // hardcoded `subscription_settings` singleton. Looked up by key on every
  // request (never cached), so an Admin edit to a plan's property_limit
  // propagates to every current subscriber on that plan immediately, with no
  // redeploy. A plan is still readable here even if the Admin later
  // deactivates it (`active = false`) — deactivating a plan stops NEW
  // signups/upgrades from landing on it, it does not retroactively cut off
  // an existing subscriber's current entitlement.
  function readPlan(app, key) {
    try {
      var rows = app.findRecordsByFilter("plans", "key = {:k}", "", 1, 0, { k: key });
      if (rows && rows.length > 0) return rows[0];
    } catch (_) {}
    return null;
  }

  function num(val, fallback) {
    var n = Number(val);
    if (isNaN(n) || !isFinite(n)) return fallback;
    return n;
  }

  function packageKey(raw) {
    var k = String(raw || "none").trim().toLowerCase();
    if (k === "none" || !k) return "none";
    return k;
  }

  // Generic across ANY plan key (not just the 4 original hardcoded
  // packages) — a Super Admin can create new plans and this reads their
  // property_limit exactly the same way. -1 means unlimited.
  function packageLimit(pkg, planRow) {
    var key = packageKey(pkg);
    if (key === "none") return 0;
    if (!planRow) {
      // Fallback defaults only used if the plan row is missing entirely
      // (e.g. data drift) — never silently block a user from their first
      // property.
      if (key === "trial") return Math.max(1, EF_SUB_DEFAULTS.trial_properties);
      if (key === "annual") return EF_SUB_DEFAULTS.annual_free_properties;
      if (key === "premium") return EF_SUB_DEFAULTS.premium_properties;
      if (key === "unlimited") return -1;
      return 0;
    }
    var lim = num(planRow.get("property_limit"), key === "trial" ? EF_SUB_DEFAULTS.trial_properties : 0);
    if (key === "trial") return Math.max(1, lim);
    return lim;
  }

  function upsertUserSubscription(app, userId, planRow, patch) {
    try {
      var col = app.findCollectionByNameOrId("user_subscriptions");
      var rows = app.findRecordsByFilter("user_subscriptions", "user = {:uid}", "", 1, 0, { uid: userId });
      var rec = rows && rows.length > 0 ? rows[0] : new Record(col);
      rec.set("user", userId);
      if (planRow) rec.set("plan", planRow.id);
      Object.keys(patch || {}).forEach(function (k) {
        rec.set(k, patch[k]);
      });
      app.save(rec);
    } catch (_) {}
  }

  function parseMs(val) {
    if (val == null || val === "") return null;
    try {
      var ms = new Date(String(val)).getTime();
      if (isNaN(ms)) return null;
      return ms;
    } catch (_) {
      return null;
    }
  }

  function addFullYearMinusOneDay(startMs) {
    try {
      var end = new Date(startMs);
      end.setFullYear(end.getFullYear() + 1);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return end.getTime();
    } catch (_) {
      return null;
    }
  }

  function isPackageActive(userRec, planRow, nowMs) {
    if (!userRec) return false;
    var pkg = packageKey(userRec.get("subscription_package"));
    if (pkg === "none") return false;

    if (pkg === "trial") {
      // A trial already in progress keeps running to its own trial_end even
      // if the Admin later deactivates the trial plan entirely — matches
      // "never retroactively change an existing subscription except per the
      // chosen policy". Deactivating the trial plan only stops it being
      // offered to brand-new signups (see finalize-signup.pb.js /
      // trial-auto-assign.pb.js).
      var trialEnd = parseMs(userRec.get("trial_end"));
      if (trialEnd != null && nowMs > trialEnd) return false;
      return true;
    }

    // annual / premium / unlimited
    var endMs = parseMs(userRec.get("subscription_end"));
    if (endMs == null) {
      var startMs = parseMs(userRec.get("subscription_start"));
      if (startMs != null) endMs = addFullYearMinusOneDay(startMs);
    }
    // Legacy partial activation: paid package key set without dates → active.
    if (endMs == null) return true;
    if (nowMs > endMs) return false;
    return true;
  }

  function isStaffUser(auth) {
    if (!auth) return false;
    try {
      if (auth.getBool("is_super_admin")) return true;
    } catch (_) {}
    var role = String(auth.get("role") || "");
    return role === "admin" || role === "editor" || role === "support" || role === "custom";
  }

  function readSpecialAccess(app, userId) {
    if (!userId) return null;
    try {
      var rows = app.findRecordsByFilter(
        'manual_property_grants',
        'user = {:uid}',
        '',
        1,
        0,
        { uid: userId },
      );
      if (rows && rows.length > 0) {
        var g = rows[0];
        var isActive = true;
        try {
          var v = g.get('active');
          if (v === false || v === 0 || v === 'false') isActive = false;
        } catch (_) {}
        if (!isActive) return null;
        var type = String(g.get('grant_type') || 'limited');
        var limit = -1;
        if (type === 'limited') {
          limit = num(g.get('property_limit'), 0);
        }
        return { type: type, limit: limit };
      }
    } catch (_) {}
    return null;
  }

  function countOwnerProperties(app, ownerId) {
    if (!ownerId) return 0;
    var max = 5000;
    try {
      var filter = "owner = {:oid} && status != 'deleted' && status != 'archived'";
      var rows = app.findRecordsByFilter("properties", filter, "", max, 0, { oid: ownerId });
      return rows ? rows.length : 0;
    } catch (_) {
      try {
        var rows2 = app.findRecordsByFilter("properties", "owner = {:oid}", "", max, 0, { oid: ownerId });
        if (!rows2) return 0;
        var n = 0;
        for (var i = 0; i < rows2.length; i++) {
          var st = String(rows2[i].get("status") || "");
          if (st === "deleted" || st === "archived") continue;
          n++;
        }
        return n;
      } catch (_2) {
        return 0;
      }
    }
  }

  // ---- main logic ----
  var auth = null;
  try {
    auth = e.requestInfo().auth;
  } catch (_) {
    auth = null;
  }

  if (isStaffUser(auth)) {
    e.next();
    return;
  }

  var colName = "";
  try {
    colName = e.record.collection().name;
  } catch (_) {
    colName = "properties";
  }
  if (colName !== "properties") {
    e.next();
    return;
  }

  var nowMs = Date.now();

  var ownerId = "";
  try {
    ownerId = String(e.record.get("owner") || "");
  } catch (_) {
    ownerId = "";
  }
  if (!ownerId && auth) ownerId = auth.id;

  var ownerRec = null;
  try {
    if (ownerId) ownerRec = $app.findRecordById("users", ownerId);
  } catch (_) {
    ownerRec = null;
  }
  if (!ownerRec) ownerRec = auth;

  if (!ownerRec) {
    e.next();
    return;
  }

  // BUGFIX: e.next() must never run inside a try/catch — see the identical
  // fix + explanation in trial-auto-assign.pb.js. Only the getBool() read is
  // guarded; e.next() itself always runs unguarded, exactly once.
  var ownerIsSuper = false;
  try {
    ownerIsSuper = !!ownerRec.getBool("is_super_admin");
  } catch (_) {
    ownerIsSuper = false;
  }
  if (ownerIsSuper) {
    e.next();
    return;
  }

  var planRow = readPlan($app, packageKey(ownerRec.get("subscription_package")));

  // ---- Special Access PRIORITY (completely independent from subscriptions) ----
  // Special Access is a standalone system stored in `manual_property_grants`.
  // It NEVER interacts with the paid subscription / trial logic:
  //   - While an active Special Access grant has remaining slots, ONLY it is
  //     checked. The paid subscription / trial state is not read and not
  //     mutated. The two systems are never evaluated together.
  //   - When the Special Access limit is exhausted, we FALL THROUGH to the
  //     normal subscription / trial check below. The owner is then offered a
  //     paid package exactly like any other customer — they never see a
  //     "contact admin" dead-end. Buying a subscription enters the ordinary
  //     Stripe payment flow; Special Access is simply ignored once exhausted.
  var specialAccess = readSpecialAccess($app, ownerId);
  if (specialAccess) {
    if (specialAccess.type === 'unlimited' || specialAccess.limit === -1) {
      e.next();
      return;
    }
    var saExisting = countOwnerProperties($app, ownerId);
    if (saExisting < specialAccess.limit) {
      // Within the Special Access allowance — allow (Special Access only).
      e.next();
      return;
    }
    // Exhausted — fall through to the subscription / trial check below so the
    // owner is routed into the normal paid subscription flow.
  }

  if (!isPackageActive(ownerRec, planRow, nowMs)) {
    // ---- Safety net: auto-repair stuck 'none' accounts ----
    var stuckPkg = packageKey(ownerRec.get('subscription_package'));
    if (stuckPkg === 'none') {
      var trialPlanSnap = readPlan($app, 'trial');
      var trialOnSnap = trialPlanSnap ? trialPlanSnap.get('active') !== false : true;
      if (trialOnSnap) {
        var snapValue = trialPlanSnap ? Math.max(1, num(trialPlanSnap.get('trial_value'), 10)) : 10;
        var snapUnit = trialPlanSnap ? String(trialPlanSnap.get('trial_unit') || 'days') : 'days';
        var snapNow = new Date();
        var snapEnd = new Date(snapNow.getTime());
        if (snapUnit === 'years') {
          snapEnd.setFullYear(snapEnd.getFullYear() + snapValue);
        } else if (snapUnit === 'months') {
          snapEnd.setMonth(snapEnd.getMonth() + snapValue);
        } else if (snapUnit === 'weeks') {
          snapEnd.setTime(snapEnd.getTime() + snapValue * 7 * 24 * 60 * 60 * 1000);
        } else {
          snapEnd.setTime(snapEnd.getTime() + snapValue * 24 * 60 * 60 * 1000);
        }
        try { ownerRec.set('subscription_package', 'trial'); } catch (_) {}
        try { ownerRec.set('trial_start', snapNow.toISOString()); } catch (_) {}
        try { ownerRec.set('trial_end', snapEnd.toISOString()); } catch (_) {}
        try { ownerRec.set('extra_properties_purchased', 0); } catch (_) {}
        try { $app.save(ownerRec); } catch (_) {}
        upsertUserSubscription($app, ownerRec.id, trialPlanSnap, {
          status: 'trial',
          trial_start: snapNow.toISOString(),
          trial_end: snapEnd.toISOString(),
          extra_properties_purchased: 0,
        });
        if (isPackageActive(ownerRec, trialPlanSnap, nowMs)) {
          var snapLimit = packageLimit('trial', trialPlanSnap);
          if (snapLimit === -1) {
            e.next();
            return;
          }
          var snapExisting = countOwnerProperties($app, ownerId);
          var snapExtra = 0;
          try { snapExtra = num(ownerRec.get('extra_properties_purchased'), 0); } catch (_) {}
          if (snapExtra < 0) snapExtra = 0;
          var snapEffective = snapLimit + snapExtra;
          if (snapExisting >= snapEffective) {
            throw new BadRequestError(
              'property_limit_reached: You have reached your property limit (' +
                snapEffective +
                '). Please upgrade your package or buy an extra property to add more.',
            );
          }
          e.next();
          return;
        }
      }
    }
    throw new BadRequestError(
      "subscription_expired: Your subscription or trial has ended. Please upgrade to add more properties.",
    );
  }

  var pkg = packageKey(ownerRec.get("subscription_package"));
  var limit = packageLimit(pkg, planRow);
  if (limit === -1) {
    e.next();
    return;
  }

  var existing = countOwnerProperties($app, ownerId);
  var extra = num(ownerRec.get("extra_properties_purchased"), 0);
  if (extra < 0) extra = 0;
  var effectiveLimit = limit + extra;

  if (existing >= effectiveLimit) {
    throw new BadRequestError(
      "property_limit_reached: You have reached your property limit (" +
        effectiveLimit +
        "). Please upgrade your package or buy an extra property to add more.",
    );
  }

  e.next();
}, "properties");

// ---------------------------------------------------------------------------
// Auto-start trial for new users (if trial is enabled).
// Fires on REST API user creates (admin create, etc.). Signup placeholders
// are created programmatically inside the OTP hook (onRecordRequestOTPRequest)
// so this hook does NOT fire for them — the trial is assigned in
// finalize-signup.pb.js when the account is completed, and repaired on login
// by trial-auto-assign.pb.js.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  // ---- helpers (self-contained) ----
  function readPlan(app, key) {
    try {
      var rows = app.findRecordsByFilter("plans", "key = {:k}", "", 1, 0, { k: key });
      if (rows && rows.length > 0) return rows[0];
    } catch (_) {}
    return null;
  }
  function num(val, fallback) {
    var n = Number(val);
    if (isNaN(n) || !isFinite(n)) return fallback;
    return n;
  }
  function packageKey(raw) {
    var k = String(raw || "none").trim().toLowerCase();
    return k || "none";
  }
  function upsertUserSubscription(app, userId, planRow, patch) {
    try {
      var col = app.findCollectionByNameOrId("user_subscriptions");
      var rows = app.findRecordsByFilter("user_subscriptions", "user = {:uid}", "", 1, 0, { uid: userId });
      var rec = rows && rows.length > 0 ? rows[0] : new Record(col);
      rec.set("user", userId);
      if (planRow) rec.set("plan", planRow.id);
      Object.keys(patch || {}).forEach(function (k) { rec.set(k, patch[k]); });
      app.save(rec);
    } catch (_) {}
  }

  var trialPlan = readPlan($app, "trial");
  var trialOn = trialPlan ? trialPlan.get("active") !== false : true;
  if (!trialOn) {
    e.next();
    return;
  }

  var colName = "";
  try {
    colName = e.record.collection().name;
  } catch (_) {
    colName = "users";
  }
  if (colName !== "users") {
    e.next();
    return;
  }

  var current = packageKey(e.record.get("subscription_package"));
  if (current && current !== "none") {
    e.next();
    return;
  }

  var role = String(e.record.get("role") || "");
  // BUGFIX: e.next() must never run inside a try/catch — see the identical
  // fix + explanation in trial-auto-assign.pb.js.
  var recIsSuper = false;
  try {
    recIsSuper = !!e.record.getBool("is_super_admin");
  } catch (_) {
    recIsSuper = false;
  }
  if (recIsSuper) {
    e.next();
    return;
  }
  if (role === "admin" || role === "editor" || role === "support" || role === "custom") {
    e.next();
    return;
  }

  // Don't assign a trial to a still-pending placeholder.
  var recIsPending = false;
  try {
    recIsPending = !!e.record.getBool("pending_signup");
  } catch (_) {
    recIsPending = false;
  }
  if (recIsPending) {
    e.next();
    return;
  }

  var n = trialPlan ? Math.max(1, num(trialPlan.get("trial_value"), 10)) : 10;
  var unit = trialPlan ? String(trialPlan.get("trial_unit") || "days") : "days";
  var now = new Date();
  var end = new Date(now.getTime());
  if (unit === "years") {
    end.setFullYear(end.getFullYear() + n);
  } else if (unit === "months") {
    end.setMonth(end.getMonth() + n);
  } else if (unit === "weeks") {
    end.setTime(end.getTime() + n * 7 * 24 * 60 * 60 * 1000);
  } else {
    end.setTime(end.getTime() + n * 24 * 60 * 60 * 1000);
  }
  e.record.set("subscription_package", "trial");
  e.record.set("trial_start", now.toISOString());
  e.record.set("trial_end", end.toISOString());
  e.record.set("extra_properties_purchased", 0);
  // NOTE: the user_subscriptions dual-write happens in the separate
  // onRecordAfterCreateSuccess hook below — this callback runs BEFORE the
  // user row is actually persisted (onRecordCreateRequest = request phase),
  // so creating a relation to a user id that doesn't exist in the table yet
  // would fail. Doing it after success is the same fix used by every other
  // "create a related row" hook in this codebase (see
  // onRecordAfterCreateSuccess usage in manual-grants.pb.js, brokerage.pb.js).
  e.next();
}, "users");

// ---------------------------------------------------------------------------
// Dual-write user_subscriptions AFTER the user row genuinely exists (see
// note above). Fires for every successful user create; only acts when a
// real plan key ended up set (skips pending OTP placeholders, which are
// created with subscription_package = "").
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  // BUGFIX: e.next() must never run inside a try/catch — see the identical
  // fix + explanation in trial-auto-assign.pb.js. The dual-write logic below
  // has no early e.next() calls of its own anymore; it only sets fields and
  // saves, so a failure in it is caught and logged, and the single e.next()
  // call always happens exactly once, after the try/catch.
  var pkg = String(e.record.get("subscription_package") || "").trim().toLowerCase();
  if (pkg && pkg !== "none") {
    try {
      var planRows = $app.findRecordsByFilter("plans", "key = {:k}", "", 1, 0, { k: pkg });
      var planRow = planRows && planRows.length > 0 ? planRows[0] : null;
      if (planRow) {
        var col = $app.findCollectionByNameOrId("user_subscriptions");
        var existing = $app.findRecordsByFilter("user_subscriptions", "user = {:uid}", "", 1, 0, { uid: e.record.id });
        var subRec = existing && existing.length > 0 ? existing[0] : new Record(col);
        subRec.set("user", e.record.id);
        subRec.set("plan", planRow.id);
        subRec.set("status", pkg === "trial" ? "trial" : "active");
        subRec.set("trial_start", e.record.get("trial_start") || null);
        subRec.set("trial_end", e.record.get("trial_end") || null);
        subRec.set("subscription_start", e.record.get("subscription_start") || null);
        subRec.set("subscription_end", e.record.get("subscription_end") || null);
        subRec.set("extra_properties_purchased", Number(e.record.get("extra_properties_purchased")) || 0);
        $app.save(subRec);
      }
    } catch (_) {}
  }
  e.next();
}, "users");
