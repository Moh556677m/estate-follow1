/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch (15 queued items) — feature #1: Property Health
// Score. Built on the exact Task #17/#18 pattern: ONE new
// `feature_entitlements` row, zero new collections. Anti-duplication:
// the score is a pure computed read over EXISTING data (properties,
// payments, tenancies, owner_tasks) — see task-property-health.pb.js for
// the calculation. Seeded disabled (enabled: false), same "never silently
// switch on" rule every prior feature row in this system follows.

migrate(
  (app) => {
    const features = app.findCollectionByNameOrId("feature_entitlements");

    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'property_health_score'");
    } catch (_) {
      existing = null;
    }
    if (existing) return;

    const rec = new Record(features);
    rec.set("feature_key", "property_health_score");
    rec.set("name", "Property Health Score");
    rec.set("name_ar", "مؤشر صحة العقار");
    rec.set("enabled", false);
    rec.set("visible", true);
    rec.set("route", "/dashboard/property-health");
    rec.set("icon", "Heart");
    rec.set("sort_order", 45);
    rec.set("description", "A 0-100 score per property from real payment history, occupancy and open maintenance tasks — with the reasons behind each score.");
    rec.set("description_ar", "مؤشر من 0 إلى 100 لكل عقار مبني على تاريخ الدفعات الحقيقي، والإشغال، والمهام المفتوحة — مع أسباب واضحة لكل درجة.");
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
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'property_health_score'");
      if (rec) app.delete(rec);
    } catch (_) {}
  },
);
