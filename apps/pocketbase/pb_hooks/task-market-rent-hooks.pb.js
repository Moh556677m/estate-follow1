/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #5: Market Rent Comparison. Same guard
// pattern as task17-hooks.pb.js's owner_expenses/owner_tasks.
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");

  const { requireFeature } = require(`${__hooks}/lib-feature-gate.js`);
  const gate = requireFeature($app, auth, "market_rent_comparison");
  if (!gate.available) throw new BadRequestError(gate.reason || "feature_not_available");

  const isStaff = (function () {
    try { if (auth.getBool("is_super_admin")) return true; } catch (_) {}
    return ["admin", "editor", "support", "custom"].indexOf(String(auth.get("role") || "")) >= 0;
  })();
  if (!isStaff && e.record.get("owner") !== auth.id) {
    throw new BadRequestError("owner_mismatch");
  }
  e.next();
}, "market_comparables");
