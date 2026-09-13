/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // ---- estate_ai_settings (single record, Super Admin controlled) ----
    let settings;
    try {
      settings = app.findCollectionByNameOrId("estate_ai_settings");
    } catch (_) {
      settings = new Collection({
        type: "base",
        name: "estate_ai_settings",
        // Public read so the owner UI can check enabled/permissions without a
        // superuser call; writes are super-admin only.
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "enabled", type: "bool" },
          { name: "name_ar", type: "text", max: 80 },
          { name: "name_en", type: "text", max: 80 },
          { name: "icon", type: "text", max: 60 },
          { name: "subtitle_ar", type: "text", max: 200 },
          { name: "subtitle_en", type: "text", max: 200 },
          { name: "suggested_questions", type: "json", maxSize: 200000 },
          { name: "quick_actions", type: "json", maxSize: 200000 },
          {
            name: "read_permissions",
            type: "json",
            maxSize: 100000,
          },
          {
            name: "write_permissions",
            type: "json",
            maxSize: 100000,
          },
          { name: "confirmation_actions", type: "json", maxSize: 100000 },
          { name: "max_file_size", type: "number", min: 1 },
          { name: "ai_provider", type: "text", max: 60 },
          { name: "usage_limits", type: "json", maxSize: 100000 },
          { name: "logging", type: "bool" },
          { name: "feature_permissions", type: "json", maxSize: 100000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(settings);
    }

    // ---- estate_ai_audit_log ----
    let audit;
    try {
      audit = app.findCollectionByNameOrId("estate_ai_audit_log");
    } catch (_) {
      audit = new Collection({
        type: "base",
        name: "estate_ai_audit_log",
        // Any signed-in user can create a log entry for their own action;
        // only super admins / staff can list/view the full trail.
        listRule:
          "@request.auth.is_super_admin = true || @request.auth.role != ''",
        viewRule:
          "@request.auth.is_super_admin = true || @request.auth.role != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          {
            name: "user",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: "action", type: "text", required: true, max: 80 },
          { name: "entity", type: "text", max: 80 },
          { name: "entity_id", type: "text", max: 30 },
          { name: "property", type: "text", max: 120 },
          { name: "old_value", type: "json", maxSize: 200000 },
          { name: "new_value", type: "json", maxSize: 200000 },
          { name: "source", type: "text", max: 40 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
      });
      app.save(audit);
    }

    // ---- Seed a single default settings row if none exists ----
    const existing = app.findAllRecords("estate_ai_settings");
    if (!existing || existing.length === 0) {
      const row = new Record(settings);
      row.set("enabled", true);
      row.set("name_ar", "Estate AI");
      row.set("name_en", "Estate AI");
      row.set("icon", "Sparkles");
      row.set("subtitle_ar", "مساعدك الشخصي لإدارة عقاراتك داخل Estate Follow");
      row.set(
        "subtitle_en",
        "Your personal assistant for managing your properties inside Estate Follow",
      );
      row.set(
        "suggested_questions",
        JSON.stringify([
          { ar: "ما أقرب دفعة مستحقة؟", en: "What is my next due payment?" },
          { ar: "اعرض العقارات المؤجرة", en: "Show my rented properties" },
          {
            ar: "ما العقارات التي تحتاج متابعة؟",
            en: "Which properties need follow-up?",
          },
          { ar: "اعرض مستنداتي", en: "Show my documents" },
          { ar: "أضف عقار", en: "Add a property" },
          { ar: "أنشئ تذكير", en: "Create a reminder" },
        ]),
      );
      row.set(
        "quick_actions",
        JSON.stringify([
          { key: "add_property", ar: "إضافة عقار", en: "Add Property" },
          { key: "add_installment", ar: "إضافة قسط", en: "Add Installment" },
          { key: "add_rental", ar: "إضافة إيجار", en: "Add Rental" },
          { key: "add_document", ar: "إضافة مستند", en: "Add Document" },
          { key: "create_reminder", ar: "إنشاء تذكير", en: "Create Reminder" },
          {
            key: "upcoming_payments",
            ar: "عرض المدفوعات القادمة",
            en: "Upcoming Payments",
          },
        ]),
      );
      row.set(
        "read_permissions",
        JSON.stringify({
          properties: true,
          documents: true,
          rentals: true,
          installments: true,
          payments: true,
          reminders: true,
        }),
      );
      row.set(
        "write_permissions",
        JSON.stringify({
          create_property: true,
          update_property: true,
          create_rental: true,
          create_installment: true,
          create_reminder: true,
          upload_document: true,
        }),
      );
      row.set(
        "confirmation_actions",
        JSON.stringify([
          "create_property",
          "update_property",
          "create_rental",
          "create_installment",
          "create_reminder",
          "upload_document",
          "delete_document",
          "change_property_status",
          "update_tenant",
        ]),
      );
      row.set("max_file_size", 10);
      row.set("ai_provider", "platform-default");
      row.set(
        "usage_limits",
        JSON.stringify({ daily_messages: 100, monthly_messages: 2000 }),
      );
      row.set("logging", true);
      row.set(
        "feature_permissions",
        JSON.stringify({
          file_upload: true,
          action_proposals: true,
          portfolio_summary: true,
          document_search: true,
        }),
      );
      app.save(row);
    }
  },
  (app) => {
    try {
      const s = app.findCollectionByNameOrId("estate_ai_settings");
      app.delete(s);
    } catch (_) {}
    try {
      const a = app.findCollectionByNameOrId("estate_ai_audit_log");
      app.delete(a);
    } catch (_) {}
  },
);
