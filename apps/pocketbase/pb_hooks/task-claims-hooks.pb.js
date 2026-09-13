/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #4: Claims Center. Same guard pattern
// as task17-hooks.pb.js's owner_expenses/owner_tasks: a disabled feature
// must be un-bypassable even via a raw API call, not just hidden from nav.
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const gate = requireFeature($app, auth, "claims_center");
  if (!gate.available) throw new BadRequestError(gate.reason || "feature_not_available");

  const isStaff = (function () {
    try { if (auth.getBool("is_super_admin")) return true; } catch (_) {}
    return ["admin", "editor", "support", "custom"].indexOf(String(auth.get("role") || "")) >= 0;
  })();
  if (!isStaff && e.record.get("owner") !== auth.id) {
    throw new BadRequestError("owner_mismatch");
  }
  e.next();
}, "tenant_claims");
