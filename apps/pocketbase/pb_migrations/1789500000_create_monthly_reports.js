/// <reference path="../pb_data/types.d.ts" />

// Monthly Reports (Task #12 — "التقارير الشهرية").
//
// Creates the `monthly_reports` collection that stores one generated
// financial/operational snapshot per owner per calendar month, and seeds the
// `feature_entitlements` row for `monthly_property_reports` — the exact
// feature_key already anticipated by SubscriptionManagementPanel.jsx's
// FEATURE_LABELS map and its generic FeatureEntitlementCard editor (see the
// comments there: "a future feature — e.g. monthly_property_reports —
// needs no new UI code, only a new seeded row"). No new admin UI is needed
// for the on/off/plan/pricing controls — only this seed row.
//
// Seeded DISABLED by default, same reasoning as the existing
// portfolio_manager seed a few lines below it in
// 1789400000_create_plans_and_entitlements.js: a brand-new feature must
// never silently switch on for everyone — the Admin explicitly turns it on.

migrate(
  (app) => {
    // ---- monthly_reports ----
    let reports;
    try {
      reports = app.findCollectionByNameOrId("monthly_reports");
    } catch (_) {
      let usersCol;
      try {
        usersCol = app.findCollectionByNameOrId("users");
      } catch (__) {
        usersCol = null;
      }

      reports = new Collection({
        type: "base",
        name: "monthly_reports",
        // Owners see only their own reports; staff see everything. Actual
        // generation always goes through $app (superuser context) inside
        // pb_hooks, so create/update/delete never need to be open to
        // regular users — they are server-only, the same posture used for
        // alert_executions / marketing_sends elsewhere in this repo.
        listRule: "owner = @request.auth.id || @request.auth.is_super_admin = true",
        viewRule: "owner = @request.auth.id || @request.auth.is_super_admin = true",
        createRule: null,
        updateRule: null,
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            collectionId: usersCol ? usersCol.id : "",
            cascadeDelete: true,
            maxSelect: 1,
          },
          // "YYYY-MM" — the calendar month this report summarizes.
          { name: "period", type: "text", required: true, max: 7 },
          { name: "generated_at", type: "date" },
          // ---- snapshot fields (see lib-monthly-reports.js for exact
          // definitions — mirrors apps/web/src/components/SummaryCards.jsx's
          // calculation so the number an owner sees in a report always
          // matches what the same math would show live on their dashboard).
          { name: "approved_count", type: "number", onlyInt: true, min: 0 },
          { name: "rented_count", type: "number", onlyInt: true, min: 0 },
          { name: "vacant_count", type: "number", onlyInt: true, min: 0 },
          { name: "expiring_contracts", type: "number", onlyInt: true, min: 0 },
          { name: "monthly_income", type: "number", min: 0 },
          { name: "yearly_charges", type: "number", min: 0 },
          { name: "monthly_installments", type: "number", min: 0 },
          { name: "upcoming_payments", type: "number", onlyInt: true, min: 0 },
          { name: "due_payments", type: "number", onlyInt: true, min: 0 },
          // Full snapshot (incl. lightweight per-property breakdown) for
          // drill-down in the owner-facing report page without re-deriving
          // anything — never re-computed after generation, so a report
          // always shows exactly what was true when it was generated.
          { name: "summary_json", type: "json", maxSize: 20000 },
          { name: "emailed", type: "bool" },
          { name: "email_error", type: "text", max: 500 },
          {
            name: "status",
            type: "select",
            maxSelect: 1,
            values: ["generated", "failed"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          // Idempotency at the DB level: generation logic also checks first,
          // but this guarantees a duplicate INSERT can never slip through a
          // race (e.g. the manual admin trigger and the monthly cron firing
          // in the same window).
          "CREATE UNIQUE INDEX idx_monthly_reports_owner_period ON monthly_reports (owner, period)",
        ],
      });
      app.save(reports);
    }

    // ---- seed the monthly_property_reports feature entitlement ----
    let features;
    try {
      features = app.findCollectionByNameOrId("feature_entitlements");
    } catch (_) {
      features = null;
    }
    if (features) {
      let existingFeatures = [];
      try {
        existingFeatures = app.findRecordsByFilter("feature_entitlements", "id != ''", "", 200, 0);
      } catch (_) {}
      const hasMonthlyReports = existingFeatures.some((r) => r.get("feature_key") === "monthly_property_reports");
      if (!hasMonthlyReports) {
        const rec = new Record(features);
        rec.set("feature_key", "monthly_property_reports");
        rec.set("name", "Monthly Reports");
        rec.set("name_ar", "التقارير الشهرية");
        rec.set("enabled", false);
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
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("monthly_reports"));
    } catch (_) {}
    try {
      const rows = app.findRecordsByFilter("feature_entitlements", "feature_key = 'monthly_property_reports'", "", 1, 0);
      rows.forEach((r) => app.delete(r));
    } catch (_) {}
  },
);
