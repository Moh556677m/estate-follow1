/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — features #6 and #7: Portfolio Net Worth and
// LTV (Loan-to-Value). ZERO new collections/fields — both are pure
// computed reads over `properties.total_price`/`total_paid`/`type`, which
// already exist. See lib-owner-features.js's computeEquity() for the
// shared, honest cost/equity basis both routes use (never a fabricated
// market valuation — there is no appraisal/market-data source in this
// repo).

migrate(
  (app) => {
    const features = app.findCollectionByNameOrId("feature_entitlements");

    const rows = [
      { key: "portfolio_net_worth", name: "Portfolio Net Worth", name_ar: "صافي ثروة المحفظة", route: "/dashboard/net-worth", icon: "Banknote", sort_order: 50,
        description: "Total equity across your portfolio — purchase price for owned properties, amount paid so far for installment properties. A cost/equity basis, not a live market valuation.",
        description_ar: "إجمالي حقوق الملكية في محفظتك — سعر الشراء للعقارات المملوكة، والمبلغ المسدد فعليًا للعقارات بالتقسيط. أساس التكلفة/حقوق الملكية، وليس تقييم سوق حي." },
      { key: "ltv_ratio", name: "Loan-to-Value (LTV)", name_ar: "نسبة القرض إلى القيمة (LTV)", route: "/dashboard/ltv", icon: "CreditCard", sort_order: 51,
        description: "Outstanding installment balance as a percentage of each property's total price, and a weighted portfolio average.",
        description_ar: "الرصيد المتبقي من الأقساط كنسبة من السعر الإجمالي لكل عقار، ومتوسط مرجّح للمحفظة بالكامل." },
    ];

    let existingKeys = [];
    try {
      existingKeys = app.findRecordsByFilter("feature_entitlements", "id != ''", "", 200, 0).map((r) => r.get("feature_key"));
    } catch (_) {}

    rows.forEach((def) => {
      if (existingKeys.indexOf(def.key) >= 0) return;
      const rec = new Record(features);
      rec.set("feature_key", def.key);
      rec.set("name", def.name);
      rec.set("name_ar", def.name_ar);
      rec.set("enabled", false);
      rec.set("visible", true);
      rec.set("route", def.route);
      rec.set("icon", def.icon);
      rec.set("sort_order", def.sort_order);
      rec.set("description", def.description);
      rec.set("description_ar", def.description_ar);
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
    });
  },
  (app) => {
    ["portfolio_net_worth", "ltv_ratio"].forEach((key) => {
      try {
        const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = {:k}", { k: key });
        if (rec) app.delete(rec);
      } catch (_) {}
    });
  },
);
