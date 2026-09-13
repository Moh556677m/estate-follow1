/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #11: Lifetime Return. ZERO new
// collections — Net Property Profit generalized from "this calendar year"
// to "since acquisition" (all-time), plus an ROI% against the same
// cost/equity basis computeEquity() uses for Portfolio Net Worth / LTV.

migrate(
  (app) => {
    const features = app.findCollectionByNameOrId("feature_entitlements");
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'lifetime_return'");
    } catch (_) {}
    if (!existing) {
      const rec = new Record(features);
      rec.set("feature_key", "lifetime_return");
      rec.set("name", "Lifetime Return");
      rec.set("name_ar", "العائد مدى الحياة");
      rec.set("enabled", false);
      rec.set("visible", true);
      rec.set("route", "/dashboard/lifetime-return");
      rec.set("icon", "History");
      rec.set("sort_order", 54);
      rec.set("description", "Total net cash generated since acquisition per property, and a cash-on-cash return % against the recorded purchase cost.");
      rec.set("description_ar", "إجمالي صافي التدفق النقدي منذ الشراء لكل عقار، ونسبة عائد نقدي مقابل تكلفة الشراء المسجّلة.");
      rec.set("min_property_count", 0);
      rec.set("allowed_account_types", []);
      rec.set("allowed_plans", []);
      rec.set("limit_by_plan", {});
      rec.set("pricing_mode", "included");
      rec.set("price", 0);
      rec.set("discount_price", 0);
      rec.set("currency", "USD");
      rec.set("billing_period", "monthly");
      rec.set("custom_billing_days", 0);
      rec.set("grace_period_days", 0);
      app.save(rec);
    }
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'lifetime_return'");
      if (rec) app.delete(rec);
    } catch (_) {}
  },
);
