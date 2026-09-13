/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #12: Owner Marketplace. Same
// fail-closed pattern as task-claims-hooks.pb.js for create/update, PLUS —
// because a marketplace's whole point is that owners read EACH OTHER's
// listings, not just their own — onRecordsListRequest/onRecordViewRequest
// here also gate reads: while the feature is disabled, nobody can list or
// view marketplace_listings records via a raw API call, not even their own.
//
// PB JSVM scope note: each onRecord*Request callback below is its own
// isolated VM, so the small "is this staff" check is inlined separately in
// EVERY callback rather than shared via a top-level helper in this file
// (a top-level function here would be invisible inside these callbacks —
// see lib-owner-features.js's header comment for the empirically-confirmed
// constraint this avoids).

onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const gate = requireFeature($app, auth, "owner_marketplace");
  if (!gate.available) throw new BadRequestError(gate.reason || "feature_not_available");

  const isStaff = (function () {
    try { if (auth.getBool("is_super_admin")) return true; } catch (_) {}
    return ["admin", "editor", "support", "custom"].indexOf(String(auth.get("role") || "")) >= 0;
  })();
  if (!isStaff && e.record.get("owner") !== auth.id) {
    throw new BadRequestError("owner_mismatch");
  }

  const propId = e.record.get("property");
  if (!propId) throw new BadRequestError("property_required");
  let prop = null;
  try { prop = $app.findRecordById("properties", propId); } catch (_) {}
  if (!prop || (!isStaff && prop.get("owner") !== auth.id)) {
    throw new BadRequestError("property_not_owned");
  }
  e.next();
}, "marketplace_listings");

onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const gate = requireFeature($app, auth, "owner_marketplace");
  if (!gate.available) throw new BadRequestError(gate.reason || "feature_not_available");

  const isStaff = (function () {
    try { if (auth.getBool("is_super_admin")) return true; } catch (_) {}
    return ["admin", "editor", "support", "custom"].indexOf(String(auth.get("role") || "")) >= 0;
  })();
  if (!isStaff && e.record.get("owner") !== auth.id) {
    throw new BadRequestError("owner_mismatch");
  }
  e.next();
}, "marketplace_listings");

onRecordsListRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");

  const isStaff = (function () {
    try { if (auth.getBool("is_super_admin")) return true; } catch (_) {}
    return ["admin", "editor", "support", "custom"].indexOf(String(auth.get("role") || "")) >= 0;
  })();
  if (isStaff) { e.next(); return; }

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const gate = requireFeature($app, auth, "owner_marketplace");
  if (!gate.available) throw new BadRequestError(gate.reason || "feature_not_available");
  e.next();
}, "marketplace_listings");

onRecordViewRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");

  const isStaff = (function () {
    try { if (auth.getBool("is_super_admin")) return true; } catch (_) {}
    return ["admin", "editor", "support", "custom"].indexOf(String(auth.get("role") || "")) >= 0;
  })();
  if (isStaff) { e.next(); return; }

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const gate = requireFeature($app, auth, "owner_marketplace");
  if (!gate.available) throw new BadRequestError(gate.reason || "feature_not_available");
  e.next();
}, "marketplace_listings");
