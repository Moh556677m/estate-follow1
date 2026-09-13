/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #5: Market Rent Comparison. ONE new
// collection (`market_comparables`) — genuinely new data that cannot come
// from anywhere else in this codebase: there is NO external market-data
// integration (no Bayut/Dubizzle/Property Finder API, no scraping service)
// anywhere in this repo, so a "market average" can only ever be honest if
// it is built from comparable listings the OWNER themselves records (what
// they found, and where) — never a fabricated or simulated market number.
// The read route (task-market-rent.pb.js) always labels the comparison
// this way, never as a live market feed.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const properties = app.findCollectionByNameOrId("properties");

    let comparables;
    try {
      comparables = app.findCollectionByNameOrId("market_comparables");
    } catch (_) {
      comparables = new Collection({
        type: "base",
        name: "market_comparables",
        listRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        viewRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        deleteRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        fields: [
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "property", type: "relation", maxSelect: 1, collectionId: properties.id },
          { name: "area_label", type: "text", required: true, max: 200 },
          { name: "bedrooms", type: "number", min: 0 },
          { name: "rent_amount", type: "number", required: true, min: 0 },
          { name: "currency", type: "text", max: 10 },
          { name: "source", type: "text", max: 300 },
          { name: "date_recorded", type: "date" },
          { name: "notes", type: "text", max: 1000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_market_comparables_owner ON market_comparables (owner)",
          "CREATE INDEX idx_market_comparables_property ON market_comparables (property)",
        ],
      });
      app.save(comparables);
    }

    const features = app.findCollectionByNameOrId("feature_entitlements");
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'market_rent_comparison'");
    } catch (_) {}
    if (!existing) {
      const rec = new Record(features);
      rec.set("feature_key", "market_rent_comparison");
      rec.set("name", "Market Rent Comparison");
      rec.set("name_ar", "مقارنة الإيجار بالسوق");
      rec.set("enabled", false);
      rec.set("visible", true);
      rec.set("route", "/dashboard/market-rent");
      rec.set("icon", "Columns3");
      rec.set("sort_order", 49);
      rec.set("description", "Compare your property's rent against comparable listings you record yourself — never a live market feed.");
      rec.set("description_ar", "مقارنة إيجار عقارك بإعلانات مشابهة تسجّلها بنفسك — وليس بيانات سوق حيّة.");
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
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'market_rent_comparison'");
      if (rec) app.delete(rec);
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("market_comparables"));
    } catch (_) {}
  },
);
