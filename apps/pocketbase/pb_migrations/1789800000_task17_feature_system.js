/// <reference path="../pb_data/types.d.ts" />

// Task #17 — Central Features system linked to Plans/Admin.
//
// Extends the EXISTING generic `feature_entitlements` collection (built in
// 1789400000_create_plans_and_entitlements.js, already consumed by
// GET /ef/my-entitlements and the "portfolio_manager"/"monthly_property_
// reports" features) rather than inventing a second feature-flag system.
// Adds the fields needed to make navigation genuinely feature-driven
// (route/icon/sort_order/visible) instead of the hardcoded nav array
// OwnerDashboard.jsx currently uses — see plan-entitlement.pb.js for the
// matching read-side change.
//
// Anti-duplication decisions made for the 11 new features (documented here
// so the reasoning survives in the schema, not just the PR description):
//   - Net Property Profit, Cash Flow Forecast, Occupancy Rate, Property
//     Comparison, AI Portfolio Advisor, Property Timeline: ZERO new
//     collections — pure read/aggregation over properties/payments/
//     monthly_reports/activity_logs (which already exist).
//   - Property Timeline reuses the pre-existing `activity_logs` collection,
//     which platform.pb.js ALREADY writes real property_created/approved/
//     rejected/suspended/resubmitted/deleted and payment_marked_paid rows
//     to today — this task adds ONE more writer (expense_recorded, in a
//     new hook) and the read-side route that turns those rows into a
//     per-property timeline, instead of creating a parallel log.
//   - Expense Center + Maintenance Center: ONE new collection
//     (`owner_expenses`) — Maintenance Center is simply the
//     category='maintenance' view of the same ledger, not a separate
//     system, so a maintenance cost recorded there also appears in the
//     general Expense Center total automatically.
//   - Task Center: ONE new collection (`owner_tasks`) — a real to-do list;
//     future Property Calendar (queued later) can union this with
//     payments/reminders instead of building its own task model.
//   - Secure Sharing: ONE new collection (`document_shares`) — a real,
//     revocable, token-based share link, replacing DocumentsCenter.jsx's
//     current `navigator.share(rawFileUrl)` (which has no revocation, no
//     expiry the owner controls, and shares the underlying protected-file
//     URL directly).
//   - Digital Vault: NO new collection — it is explicitly the existing
//     DocumentsCenter.jsx / document aggregation, gated by a new feature
//     key so Admin can control its visibility/plan/pricing like every
//     other feature here; Secure Sharing is what's actually new.

migrate(
  (app) => {
    // ---- feature_entitlements: nav-driving fields --------------------------
    const features = app.findCollectionByNameOrId("feature_entitlements");
    if (!features.fields.getByName("visible")) {
      features.fields.add(new BoolField({ name: "visible" }));
    }
    if (!features.fields.getByName("route")) {
      features.fields.add(new TextField({ name: "route", max: 200 }));
    }
    if (!features.fields.getByName("icon")) {
      features.fields.add(new TextField({ name: "icon", max: 60 }));
    }
    if (!features.fields.getByName("sort_order")) {
      features.fields.add(new NumberField({ name: "sort_order", onlyInt: true }));
    }
    if (!features.fields.getByName("description")) {
      features.fields.add(new TextField({ name: "description", max: 500 }));
    }
    if (!features.fields.getByName("description_ar")) {
      features.fields.add(new TextField({ name: "description_ar", max: 500 }));
    }
    app.save(features);

    const users = app.findCollectionByNameOrId("users");
    const properties = app.findCollectionByNameOrId("properties");

    // ---- owner_expenses -----------------------------------------------------
    // Backs BOTH Expense Center and Maintenance Center (category filter).
    let expenses;
    try {
      expenses = app.findCollectionByNameOrId("owner_expenses");
    } catch (_) {
      expenses = new Collection({
        type: "base",
        name: "owner_expenses",
        listRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        viewRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        deleteRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        fields: [
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "property", type: "relation", maxSelect: 1, collectionId: properties.id },
          {
            name: "category",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["maintenance", "service_fee", "insurance", "tax", "management_fee", "utilities", "other"],
          },
          { name: "title", type: "text", required: true, max: 200 },
          { name: "amount", type: "number", required: true, min: 0 },
          { name: "currency", type: "text", max: 10 },
          { name: "date", type: "date", required: true },
          {
            name: "status",
            type: "select",
            maxSelect: 1,
            values: ["recorded", "planned", "in_progress", "done"],
          },
          { name: "notes", type: "text", max: 2000 },
          {
            name: "receipt",
            type: "file",
            maxSelect: 1,
            maxSize: 20 * 1024 * 1024,
            mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"],
            protected: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_owner_expenses_owner ON owner_expenses (owner)",
          "CREATE INDEX idx_owner_expenses_property ON owner_expenses (property)",
          "CREATE INDEX idx_owner_expenses_category ON owner_expenses (category)",
        ],
      });
      app.save(expenses);
    }

    // ---- owner_tasks ---------------------------------------------------------
    let tasks;
    try {
      tasks = app.findCollectionByNameOrId("owner_tasks");
    } catch (_) {
      tasks = new Collection({
        type: "base",
        name: "owner_tasks",
        listRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        viewRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        deleteRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        fields: [
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "property", type: "relation", maxSelect: 1, collectionId: properties.id },
          { name: "title", type: "text", required: true, max: 200 },
          { name: "notes", type: "text", max: 2000 },
          { name: "due_date", type: "date" },
          {
            name: "priority",
            type: "select",
            maxSelect: 1,
            values: ["low", "normal", "high"],
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["todo", "in_progress", "done"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_owner_tasks_owner ON owner_tasks (owner, status)",
        ],
      });
      app.save(tasks);
    }

    // ---- document_shares ------------------------------------------------------
    // Real revocable/expiring share links — replaces DocumentsCenter.jsx's
    // current navigator.share(rawFileUrl) with no revocation/expiry.
    let shares;
    try {
      shares = app.findCollectionByNameOrId("document_shares");
    } catch (_) {
      shares = new Collection({
        type: "base",
        name: "document_shares",
        listRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        viewRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        deleteRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        fields: [
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          // Mirrors DocumentsCenter.jsx's normalized doc identity: which
          // record + which file field the link points to.
          { name: "doc_source", type: "select", required: true, maxSelect: 1, values: ["property", "custom", "user", "expense"] },
          { name: "doc_ref_id", type: "text", required: true, max: 60 },
          { name: "doc_field", type: "text", required: true, max: 60 },
          { name: "label", type: "text", max: 200 },
          { name: "token", type: "text", required: true, max: 64 },
          { name: "expires_at", type: "date" },
          { name: "revoked", type: "bool" },
          { name: "view_count", type: "number", onlyInt: true, min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_document_shares_token ON document_shares (token)",
          "CREATE INDEX idx_document_shares_owner ON document_shares (owner)",
        ],
      });
      app.save(shares);
    }

    // ---- Seed the 11 new feature_entitlements rows (disabled by default —
    // a brand-new feature must never silently switch on for everyone). ----
    let existingFeatures = [];
    try {
      existingFeatures = app.findRecordsByFilter("feature_entitlements", "id != ''", "", 200, 0);
    } catch (_) {}
    const existingKeys = existingFeatures.map((r) => r.get("feature_key"));

    const newFeatures = [
      { key: "net_property_profit", name: "Net Property Profit", name_ar: "صافي ربح العقار", route: "/dashboard/net-profit", icon: "TrendingUp", sort_order: 20,
        description: "Per-property net profit for a selected period (rental income minus expenses, service charges and paid installments).",
        description_ar: "صافي ربح كل عقار لفترة محددة (دخل الإيجار ناقص المصاريف ورسوم الخدمة والأقساط المسددة)." },
      { key: "cash_flow_forecast", name: "Cash Flow Forecast", name_ar: "توقع التدفق النقدي", route: "/dashboard/cash-flow-forecast", icon: "LineChart", sort_order: 21,
        description: "Projected inflows/outflows for the next months from already-scheduled payments — not a predictive model.",
        description_ar: "التدفقات المتوقعة للأشهر القادمة بناءً على المدفوعات المجدولة فعليًا — ليس نموذج تنبؤ." },
      { key: "task_center", name: "Task Center", name_ar: "مركز المهام", route: "/dashboard/tasks", icon: "CheckSquare", sort_order: 22,
        description: "A real to-do list for property-related tasks.", description_ar: "قائمة مهام حقيقية متعلقة بالعقارات." },
      { key: "property_timeline", name: "Property Timeline", name_ar: "الخط الزمني للعقار", route: "", icon: "History", sort_order: 23,
        description: "Chronological activity feed per property (opened from the property profile).",
        description_ar: "خط زمني بالأحداث المتعلقة بالعقار (يُفتح من ملف العقار)." },
      { key: "expense_center", name: "Expense Center", name_ar: "مركز المصاريف", route: "/dashboard/expenses", icon: "Receipt", sort_order: 24,
        description: "Record and review all property-related expenses by category.", description_ar: "تسجيل ومراجعة كل مصاريف العقارات حسب الفئة." },
      // digital_vault wraps the PRE-EXISTING Documents feature (DocumentsCenter.jsx)
      // — every owner already has it today. Unlike the other 10 brand-new
      // features, it must default to ON for everyone (enabled: true,
      // limit_by_plan: {default: -1}) so simply applying this migration never
      // locks existing users out of documents they already had access to.
      // Only future Admin changes should ever restrict it.
      { key: "digital_vault", name: "Digital Vault", name_ar: "الخزنة الرقمية", route: "/dashboard/documents", icon: "ShieldCheck", sort_order: 25,
        description: "The existing Documents feature, now under central Feature Management control.",
        description_ar: "ميزة المستندات الحالية، تحت تحكم إدارة الميزات المركزية الآن.",
        enabledByDefault: true, limitByPlanDefault: { default: -1 } },
      { key: "secure_sharing", name: "Secure Sharing", name_ar: "المشاركة الآمنة", route: "/dashboard/documents", icon: "Share2", sort_order: 26,
        description: "Revocable, expiring share links for documents, replacing raw-URL sharing.",
        description_ar: "روابط مشاركة قابلة للإلغاء ومحدودة المدة للمستندات، بديلًا عن مشاركة الرابط الخام." },
      { key: "property_comparison", name: "Property Comparison", name_ar: "مقارنة العقارات", route: "/dashboard/compare", icon: "Columns3", sort_order: 27,
        description: "Compare 2+ properties side by side.", description_ar: "مقارنة عقارين أو أكثر جنبًا إلى جنب." },
      { key: "ai_portfolio_advisor", name: "AI Portfolio Advisor", name_ar: "المستشار الذكي للمحفظة", route: "/dashboard/ai-advisor", icon: "Sparkles", sort_order: 28,
        description: "AI-generated insights over the owner's own portfolio data only.", description_ar: "رؤى مولّدة بالذكاء الاصطناعي عن بيانات محفظة المالك نفسه فقط." },
      { key: "occupancy_rate", name: "Occupancy Rate", name_ar: "معدل الإشغال", route: "/dashboard/occupancy", icon: "KeyRound", sort_order: 29,
        description: "Current occupancy rate with a real historical trend from stored monthly reports.",
        description_ar: "معدل الإشغال الحالي مع اتجاه تاريخي حقيقي من التقارير الشهرية المخزّنة." },
      { key: "maintenance_center", name: "Maintenance Center", name_ar: "مركز الصيانة", route: "/dashboard/maintenance", icon: "Wrench", sort_order: 30,
        description: "The maintenance-category view of Expense Center, with a status workflow.",
        description_ar: "عرض فئة الصيانة من مركز المصاريف، مع سير حالة." },
    ];

    newFeatures.forEach((def) => {
      if (existingKeys.indexOf(def.key) >= 0) return;
      const rec = new Record(features);
      rec.set("feature_key", def.key);
      rec.set("name", def.name);
      rec.set("name_ar", def.name_ar);
      rec.set("enabled", !!def.enabledByDefault);
      rec.set("visible", true);
      rec.set("route", def.route);
      rec.set("icon", def.icon);
      rec.set("sort_order", def.sort_order);
      rec.set("description", def.description);
      rec.set("description_ar", def.description_ar);
      rec.set("min_property_count", 0);
      rec.set("allowed_account_types", []);
      rec.set("allowed_plans", []);
      rec.set("limit_by_plan", def.limitByPlanDefault || {});
      rec.set("pricing_mode", "included");
      rec.set("price", 0);
      rec.set("discount_price", 0);
      rec.set("currency", "USD");
      rec.set("billing_period", "monthly");
      rec.set("custom_billing_days", 0);
      rec.set("grace_period_days", 0);
      app.save(rec);
    });

    // Backfill visible/sort_order on the pre-existing feature row that
    // already has a real, working page. NOTE: `portfolio_manager` is
    // deliberately NOT backfilled with a route here — it is a seeded
    // entitlement row with no implemented owner-facing page anywhere in
    // this codebase yet (confirmed by search), so giving it a route would
    // make feature-driven nav render a dead link the moment an admin
    // enables it. Whichever task actually builds that page should add its
    // own route/icon/sort_order at that time.
    try {
      const mr = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'monthly_property_reports'");
      if (mr && !mr.get("route")) {
        mr.set("visible", true);
        mr.set("route", "/dashboard/monthly-reports");
        mr.set("icon", "FileBarChart");
        mr.set("sort_order", 11);
        app.save(mr);
      }
    } catch (_) {}
  },
  (app) => {
    ["document_shares", "owner_tasks", "owner_expenses"].forEach((name) => {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {}
    });
    try {
      const features = app.findCollectionByNameOrId("feature_entitlements");
      ["visible", "route", "icon", "sort_order", "description", "description_ar"].forEach((n) => {
        try { features.fields.removeByName(n); } catch (_) {}
      });
      app.save(features);
    } catch (_) {}
  },
);
