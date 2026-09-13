/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #9: Property Statements. ZERO new
// collections — an itemized statement for a chosen date range, assembled
// from the SAME payments/rent_payments/owner_expenses rows Net Property
// Profit and Tax Export already read, just scoped per-property with a
// free date range and a full line-item list instead of a yearly total.

migrate(
  (app) => {
    const features = app.findCollectionByNameOrId("feature_entitlements");
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'property_statements'");
    } catch (_) {}
    if (!existing) {
      const rec = new Record(features);
      rec.set("feature_key", "property_statements");
      rec.set("name", "Property Statements");
      rec.set("name_ar", "كشوف حساب العقار");
      rec.set("enabled", false);
      rec.set("visible", true);
      rec.set("route", "/dashboard/property-statements");
      rec.set("icon", "FileText");
      rec.set("sort_order", 52);
      rec.set("description", "An itemized income/expense statement for one property over any date range you choose, exportable as CSV.");
      rec.set("description_ar", "كشف حساب مفصّل بالدخل والمصاريف لعقار واحد خلال أي فترة تختارها، قابل للتصدير كملف CSV.");
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
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'property_statements'");
      if (rec) app.delete(rec);
    } catch (_) {}
  },
);
