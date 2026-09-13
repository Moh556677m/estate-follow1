/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #15 (final, 15 of 15): Feature
// Management page updates + anti-duplication rules.
//
// This app has NO bespoke "Feature Management" React admin page —
// feature_entitlements rows are managed directly through PocketBase's own
// built-in Admin UI (createRule/updateRule/deleteRule on this collection
// are already `@request.auth.is_super_admin = true` only, set back in
// 1789400000_create_plans_and_entitlements.js). The most meaningful, safe
// improvement to THAT admin experience — now that this batch alone added
// 13 new rows on top of the ~14 that already existed — is a `category`
// field so the growing list can be grouped/sorted at a glance, instead of
// one flat, uncategorized table.
//
// Anti-duplication at the DATA level is already solid: feature_key has had
// a UNIQUE index since day one (`idx_feature_entitlements_key` in
// 1789400000_create_plans_and_entitlements.js), so two rows with the same
// key are already impossible even if a future migration's own
// findFirstRecordByFilter guard were ever skipped. What was still
// undocumented was the DESIGN-level anti-duplication rule this whole batch
// followed (create zero new collections when the data can be computed from
// what already exists) — that is now written down in lib-owner-features.js
// so the next feature added to this system starts from the same rule
// instead of re-deriving it from scratch. See that file's header comment.

migrate(
  (app) => {
    const features = app.findCollectionByNameOrId("feature_entitlements");
    if (!features.fields.getByName("category")) {
      features.fields.add(new SelectField({
        name: "category",
        maxSelect: 1,
        values: ["core", "financial", "tenant_management", "insights", "marketplace", "reporting"],
      }));
      app.save(features);
    }

    // Backfill category for every feature_key this batch introduced (or, for
    // tax_accounting_export, extended) — never touching enabled/pricing/plan
    // fields, so no Admin configuration is altered.
    const categoryByKey = {
      property_health_score: "insights",
      tenant_score: "tenant_management",
      security_deposit_management: "tenant_management",
      claims_center: "tenant_management",
      market_rent_comparison: "financial",
      portfolio_net_worth: "financial",
      ltv_ratio: "financial",
      property_statements: "financial",
      portfolio_distribution: "insights",
      lifetime_return: "financial",
      owner_marketplace: "marketplace",
      tax_accounting_export: "financial",
      smart_monthly_suggestions: "insights",
    };
    Object.keys(categoryByKey).forEach((key) => {
      try {
        const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = {:k}", { k: key });
        if (rec && !rec.get("category")) {
          rec.set("category", categoryByKey[key]);
          app.save(rec);
        }
      } catch (_) {}
    });
  },
  (_app) => {
    // Intentional no-op: dropping the `category` field on rollback risks
    // clobbering values an Admin may have set by hand in the meantime for
    // OTHER (pre-existing) features, which this migration never touched.
  },
);
