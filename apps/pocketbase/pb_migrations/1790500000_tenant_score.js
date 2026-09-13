/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #2: Tenant Score. Same pattern as
// 1790400000_property_health_score.js: ONE new `feature_entitlements` row,
// zero new collections. The score is a pure computed read over the EXISTING
// rental model (tenants / tenancies / rent_payments — the newer "checks"
// tables the current rental flow actually writes to, not the legacy
// payments.kind='rent' rows) — see task-tenant-score.pb.js for the
// calculation. Seeded disabled (enabled: false).

migrate(
  (app) => {
    const features = app.findCollectionByNameOrId("feature_entitlements");

    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'tenant_score'");
    } catch (_) {
      existing = null;
    }
    if (existing) return;

    const rec = new Record(features);
    rec.set("feature_key", "tenant_score");
    rec.set("name", "Tenant Score");
    rec.set("name_ar", "مؤشر تقييم المستأجر");
    rec.set("enabled", false);
    rec.set("visible", true);
    rec.set("route", "/dashboard/tenant-score");
    rec.set("icon", "UserRound");
    rec.set("sort_order", 46);
    rec.set("description", "A 0-100 reliability score per tenant from real rent-payment history and lease completion — with the reasons behind each score.");
    rec.set("description_ar", "مؤشر موثوقية من 0 إلى 100 لكل مستأجر مبني على تاريخ دفعات الإيجار الحقيقي واكتمال العقود — مع أسباب واضحة لكل درجة.");
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
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'tenant_score'");
      if (rec) app.delete(rec);
    } catch (_) {}
  },
);
