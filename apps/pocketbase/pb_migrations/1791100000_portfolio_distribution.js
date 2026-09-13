/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #10: Portfolio Distribution. ZERO new
// collections — pure aggregation over `properties` (usage_type/type/
// country) plus the same computeEquity() basis Portfolio Net Worth uses.

migrate(
  (app) => {
    const features = app.findCollectionByNameOrId("feature_entitlements");
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'portfolio_distribution'");
    } catch (_) {}
    if (!existing) {
      const rec = new Record(features);
      rec.set("feature_key", "portfolio_distribution");
      rec.set("name", "Portfolio Distribution");
      rec.set("name_ar", "توزيع المحفظة");
      rec.set("enabled", false);
      rec.set("visible", true);
      rec.set("route", "/dashboard/portfolio-distribution");
      rec.set("icon", "FolderTree");
      rec.set("sort_order", 53);
      rec.set("description", "How your portfolio breaks down by usage type, payment type, and country — by count and by recorded value.");
      rec.set("description_ar", "كيف تتوزّع محفظتك حسب نوع الاستخدام ونوع الدفع والدولة — بعدد العقارات وبالقيمة المسجّلة.");
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
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'portfolio_distribution'");
      if (rec) app.delete(rec);
    } catch (_) {}
  },
);
