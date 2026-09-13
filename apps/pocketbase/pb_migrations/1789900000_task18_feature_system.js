/// <reference path="../pb_data/types.d.ts" />

// Task #18 — 5 more Feature Management features, built on Task #17's
// central `feature_entitlements` system (same admin control pattern: each
// row independently gets enabled/visible/allowed account types/allowed
// plans/limits/pricing — zero new admin UI needed).
//
// Anti-duplication decisions:
//   - Custom Reports: NO new collection/route — the frontend composes
//     Task #17's existing /ef/features/net-profit + /cash-flow-forecast +
//     owner_expenses list with owner-chosen filters (date range,
//     properties, categories) and exports client-side. A second
//     server-side reporting engine would just re-implement what already
//     exists.
//   - What-if Simulator: NO new collection/route — purely a client-side
//     projection over the REAL baseline numbers /ef/features/net-profit
//     already returns (adjust rent/vacancy/expense % and see the
//     recomputed total) — never a second source of truth, and always
//     labeled as a simulation, never presented as fact.
//   - Tax/Accounting Export: ONE new route (GET /ef/features/tax-export),
//     zero new collections — assembles a CSV from the SAME payments +
//     owner_expenses rows Net Profit already reads.
//   - Portfolio Goals: ONE new collection (`owner_goals`) — a real target
//     an owner sets (net profit / property count / occupancy rate) with
//     progress computed from the SAME live routes (net-profit, occupancy,
//     properties count), never a duplicated calculation.
//   - Command Center: NO new collection/route — the frontend panel calls
//     the existing net-profit/occupancy/tasks/expenses endpoints and shows
//     them together as one glance-able summary. Nothing new to compute.

migrate(
  (app) => {
    const features = app.findCollectionByNameOrId("feature_entitlements");
    const users = app.findCollectionByNameOrId("users");

    // ---- owner_goals ---------------------------------------------------------
    let goals;
    try {
      goals = app.findCollectionByNameOrId("owner_goals");
    } catch (_) {
      goals = new Collection({
        type: "base",
        name: "owner_goals",
        listRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        viewRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        deleteRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        fields: [
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          {
            name: "goal_type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["net_profit", "property_count", "occupancy_rate"],
          },
          { name: "target_value", type: "number", required: true, min: 0 },
          { name: "target_date", type: "date" },
          { name: "notes", type: "text", max: 1000 },
          {
            name: "status",
            type: "select",
            maxSelect: 1,
            values: ["active", "achieved", "abandoned"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_owner_goals_owner ON owner_goals (owner)",
        ],
      });
      app.save(goals);
    }

    // ---- Seed the 5 new feature_entitlements rows (disabled by default,
    // same "never silently switch on" rule Task #17 established) ----------
    let existingFeatures = [];
    try {
      existingFeatures = app.findRecordsByFilter("feature_entitlements", "id != ''", "", 200, 0);
    } catch (_) {}
    const existingKeys = existingFeatures.map((r) => r.get("feature_key"));

    const newFeatures = [
      { key: "custom_reports", name: "Custom Reports", name_ar: "تقارير مخصصة", route: "/dashboard/custom-reports", icon: "FileSpreadsheet", sort_order: 40,
        description: "Build and export a custom report over your own properties/income/expenses data.",
        description_ar: "إنشاء وتصدير تقرير مخصص من بيانات عقاراتك ودخلك ومصاريفك الفعلية." },
      { key: "whatif_simulator", name: "What-if Simulator", name_ar: "محاكي ماذا-لو", route: "/dashboard/whatif", icon: "SlidersHorizontal", sort_order: 41,
        description: "A projection over your real net-profit baseline (rent/vacancy/expense change) — clearly labeled as a simulation, never a stored fact.",
        description_ar: "توقّع مبني على صافي ربحك الحقيقي الحالي (تغيّر الإيجار/الشغور/المصاريف) — محاكاة واضحة، وليست حقيقة مخزّنة." },
      { key: "tax_accounting_export", name: "Tax / Accounting Export", name_ar: "تصدير ضريبي / محاسبي", route: "/dashboard/tax-export", icon: "FileDown", sort_order: 42,
        description: "Export a CSV of real income and expenses for a selected year, ready for an accountant.",
        description_ar: "تصدير ملف CSV بالدخل والمصاريف الحقيقية لسنة محددة، جاهز للمحاسب." },
      { key: "portfolio_goals", name: "Portfolio Goals", name_ar: "أهداف المحفظة", route: "/dashboard/goals", icon: "Target", sort_order: 43,
        description: "Set a real target (net profit, property count, occupancy) and track progress against your live data.",
        description_ar: "تحديد هدف حقيقي (صافي ربح، عدد عقارات، معدل إشغال) ومتابعة التقدّم مقابل بياناتك الحيّة." },
      { key: "command_center", name: "Command Center", name_ar: "مركز القيادة", route: "/dashboard/command-center", icon: "LayoutDashboard", sort_order: 44,
        description: "One glance-able summary combining net profit, occupancy, open tasks and recent expenses — no new data, just assembled together.",
        description_ar: "ملخص سريع يجمع صافي الربح والإشغال والمهام المفتوحة والمصاريف الأخيرة في مكان واحد." },
    ];

    newFeatures.forEach((def) => {
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
    try {
      app.delete(app.findCollectionByNameOrId("owner_goals"));
    } catch (_) {}
    // Feature rows and shared feature_entitlements fields are intentionally
    // left in place on rollback (removing them here would also be
    // rolling back Task #17's fields, which this migration does not own).
  },
);
