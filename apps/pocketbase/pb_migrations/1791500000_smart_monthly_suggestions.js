/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #13: Smart Monthly Suggestions. Per
// Mohamed's explicit clarification: suggestions computed from the owner's
// ACTUAL recorded data (overdue payments, bounced checks, leases expiring
// soon, deposits still held after lease end, vacant properties, an
// expense spike vs last month, stale open claims) — NOT an AI-generated
// narrative. ZERO new collections; everything is derived on read from
// properties/payments/rent_payments/tenancies/owner_expenses/tenant_claims,
// which already exist.

migrate(
  (app) => {
    const features = app.findCollectionByNameOrId("feature_entitlements");
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'smart_monthly_suggestions'");
    } catch (_) {}
    if (!existing) {
      const rec = new Record(features);
      rec.set("feature_key", "smart_monthly_suggestions");
      rec.set("name", "Smart Monthly Suggestions");
      rec.set("name_ar", "الاقتراحات الشهرية الذكية");
      rec.set("enabled", false);
      rec.set("visible", true);
      rec.set("route", "/dashboard/smart-suggestions");
      rec.set("icon", "Lightbulb");
      rec.set("sort_order", 56);
      rec.set("description", "Actionable suggestions computed from your actual data: overdue payments, bounced checks, leases expiring soon, deposits still held, vacant properties, expense spikes, and stale claims.");
      rec.set("description_ar", "اقتراحات عملية مبنية على بياناتك الفعلية: دفعات متأخرة، شيكات مرتجعة، عقود ستنتهي قريبًا، تأمينات لا تزال محتجزة، عقارات شاغرة، ارتفاع في المصاريف، ومطالبات متوقفة.");
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
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'smart_monthly_suggestions'");
      if (rec) app.delete(rec);
    } catch (_) {}
  },
);
