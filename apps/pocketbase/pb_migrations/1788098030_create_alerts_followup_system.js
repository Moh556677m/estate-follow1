/// <reference path="../pb_data/types.d.ts" />

// Alerts & Follow-up system (التنبيهات والمتابعة) for Owner accounts.
// Creates: property_alerts, alert_types, alert_settings, alert_executions,
// alert_audit_log, alert_admin_settings — plus seeds default alert types
// and a single admin-settings row. Auto alerts are derived client-side from
// real properties/payments records (no duplication); manual alerts live in
// property_alerts. A pb_hooks custom route processes due reminders with
// idempotency and sends in-app notifications + email.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const properties = app.findCollectionByNameOrId("properties");

    const ownerRead = "@request.auth.id != '' && @request.auth.id = owner";
    const ownerWrite = "@request.auth.id != '' && @request.auth.id = owner";
    const superOrStaff =
      "@request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'";

    // 1) property_alerts — manual alerts / reminders created by the owner.
    let alerts;
    try {
      alerts = app.findCollectionByNameOrId("property_alerts");
    } catch (_) {
      alerts = new Collection({
        type: "base",
        name: "property_alerts",
        listRule: ownerRead,
        viewRule: ownerRead,
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: ownerWrite,
        deleteRule: ownerWrite,
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "property",
            type: "relation",
            maxSelect: 1,
            collectionId: properties.id,
            cascadeDelete: true,
          },
          { name: "title", type: "text", required: true, max: 300 },
          {
            name: "alert_type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: [
              "installment",
              "rent",
              "cheque",
              "contract_expiry",
              "service_fee",
              "handover",
              "document_expiry",
              "custom",
            ],
          },
          { name: "event_date", type: "date", required: true },
          { name: "event_time", type: "text", max: 10 },
          { name: "amount", type: "number", min: 0 },
          { name: "is_financial", type: "bool" },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: [
              "upcoming",
              "due_soon",
              "due_today",
              "completed",
              "paid",
              "overdue",
              "cancelled",
            ],
          },
          {
            name: "repeat",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["none", "daily", "weekly", "monthly", "quarterly", "semiannual", "yearly", "custom"],
          },
          { name: "repeat_interval", type: "number", min: 0 },
          { name: "reminders", type: "json", maxSize: 200000 },
          {
            name: "overdue_repeat",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["none", "daily", "3days", "weekly"],
          },
          { name: "notes", type: "text", max: 3000 },
          { name: "related_doc_field", type: "text", max: 120 },
          { name: "enabled", type: "bool" },
          { name: "paid_at", type: "date" },
          { name: "paid_amount", type: "number", min: 0 },
          { name: "completed_at", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_property_alerts_owner ON property_alerts (owner, event_date)",
          "CREATE INDEX idx_property_alerts_property ON property_alerts (property)",
        ],
      });
      app.save(alerts);
    }

    // 2) alert_types — admin-managed alert types.
    let types;
    try {
      types = app.findCollectionByNameOrId("alert_types");
    } catch (_) {
      types = new Collection({
        type: "base",
        name: "alert_types",
        listRule: superOrStaff,
        viewRule: superOrStaff,
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "key", type: "text", required: true, max: 60 },
          { name: "name_en", type: "text", required: true, max: 120 },
          { name: "name_ar", type: "text", required: true, max: 120 },
          { name: "icon", type: "text", max: 60 },
          { name: "is_financial", type: "bool" },
          { name: "default_reminders", type: "json", maxSize: 200000 },
          { name: "channels", type: "json", maxSize: 200000 },
          { name: "active", type: "bool" },
          { name: "order", type: "number", min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_alert_types_key ON alert_types (key)"],
      });
      app.save(types);
    }

    // 3) alert_settings — owner channel preferences + per-property overrides.
    let settings;
    try {
      settings = app.findCollectionByNameOrId("alert_settings");
    } catch (_) {
      settings = new Collection({
        type: "base",
        name: "alert_settings",
        listRule: ownerRead,
        viewRule: ownerRead,
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: ownerWrite,
        deleteRule: ownerWrite,
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "in_app_enabled", type: "bool" },
          { name: "email_enabled", type: "bool" },
          { name: "whatsapp_enabled", type: "bool" },
          { name: "sms_enabled", type: "bool" },
          { name: "push_enabled", type: "bool" },
          { name: "property_overrides", type: "json", maxSize: 200000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_alert_settings_owner ON alert_settings (owner)"],
      });
      app.save(settings);
    }

    // 4) alert_executions — idempotency for sent reminders.
    let execs;
    try {
      execs = app.findCollectionByNameOrId("alert_executions");
    } catch (_) {
      execs = new Collection({
        type: "base",
        name: "alert_executions",
        listRule: ownerRead,
        viewRule: ownerRead,
        createRule: null, // only written by server-side process route
        updateRule: null,
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "alert_ref", type: "text", required: true, max: 120 },
          { name: "execution_key", type: "text", required: true, max: 200 },
          {
            name: "channel",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["in_app", "email", "whatsapp", "sms", "push"],
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["sent", "failed"],
          },
          { name: "sent_at", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_alert_exec_key ON alert_executions (execution_key)",
          "CREATE INDEX idx_alert_exec_owner ON alert_executions (owner, sent_at)",
        ],
      });
      app.save(execs);
    }

    // 5) alert_audit_log — audit trail.
    let audit;
    try {
      audit = app.findCollectionByNameOrId("alert_audit_log");
    } catch (_) {
      audit = new Collection({
        type: "base",
        name: "alert_audit_log",
        listRule: ownerRead,
        viewRule: ownerRead,
        createRule: null, // server-side only
        updateRule: null,
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "action",
            type: "select",
            required: true,
            maxSelect: 1,
            values: [
              "alert_created",
              "alert_edited",
              "alert_deleted",
              "alert_sent",
              "marked_paid",
              "marked_completed",
              "became_overdue",
            ],
          },
          { name: "alert_ref", type: "text", max: 120 },
          { name: "property_ref", type: "text", max: 120 },
          { name: "details", type: "text", max: 1000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE INDEX idx_alert_audit_owner ON alert_audit_log (owner, created)"],
      });
      app.save(audit);
    }

    // 6) alert_admin_settings — single super-admin control record.
    let admin;
    try {
      admin = app.findCollectionByNameOrId("alert_admin_settings");
    } catch (_) {
      admin = new Collection({
        type: "base",
        name: "alert_admin_settings",
        listRule: superOrStaff,
        viewRule: superOrStaff,
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "system_enabled", type: "bool" },
          { name: "owner_alerts_enabled", type: "bool" },
          { name: "email_alerts_enabled", type: "bool" },
          { name: "in_app_enabled", type: "bool" },
          { name: "upcoming_enabled", type: "bool" },
          { name: "overdue_enabled", type: "bool" },
          { name: "repeated_overdue_enabled", type: "bool" },
          { name: "calendar_enabled", type: "bool" },
          { name: "default_reminders", type: "json", maxSize: 200000 },
          { name: "last_run", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [],
      });
      app.save(admin);
    }

    // --- Seed default alert types ---
    const defaultTypes = [
      { key: "installment", name_en: "Installment", name_ar: "قسط", icon: "CreditCard", is_financial: true, default_reminders: [30, 7, 1], channels: { in_app: true, email: true, whatsapp: false, sms: false }, active: true, order: 1 },
      { key: "rent", name_en: "Rent", name_ar: "إيجار", icon: "KeyRound", is_financial: true, default_reminders: [7, 1], channels: { in_app: true, email: true, whatsapp: false, sms: false }, active: true, order: 2 },
      { key: "cheque", name_en: "Cheque", name_ar: "شيك", icon: "Receipt", is_financial: true, default_reminders: [7, 1], channels: { in_app: true, email: true, whatsapp: false, sms: false }, active: true, order: 3 },
      { key: "contract_expiry", name_en: "Contract Expiry", name_ar: "انتهاء العقد", icon: "FileText", is_financial: false, default_reminders: [30, 14], channels: { in_app: true, email: true, whatsapp: false, sms: false }, active: true, order: 4 },
      { key: "service_fee", name_en: "Service Fee", name_ar: "رسوم خدمة", icon: "Receipt", is_financial: true, default_reminders: [30, 7], channels: { in_app: true, email: true, whatsapp: false, sms: false }, active: true, order: 5 },
      { key: "handover", name_en: "Handover", name_ar: "تسليم", icon: "HardHat", is_financial: false, default_reminders: [30, 7], channels: { in_app: true, email: true, whatsapp: false, sms: false }, active: true, order: 6 },
      { key: "document_expiry", name_en: "Document Expiry", name_ar: "انتهاء مستند", icon: "FileText", is_financial: false, default_reminders: [30, 7], channels: { in_app: true, email: true, whatsapp: false, sms: false }, active: true, order: 7 },
      { key: "custom", name_en: "Custom", name_ar: "مخصص", icon: "Bell", is_financial: false, default_reminders: [7, 1], channels: { in_app: true, email: true, whatsapp: false, sms: false }, active: true, order: 8 },
    ];
    defaultTypes.forEach((d) => {
      let exists = null;
      try {
        exists = app.findFirstRecordByFilter("alert_types", `key = "${d.key}"`);
      } catch (_) { /* not found */ }
      if (!exists) {
        const rec = new Record(types);
        rec.set("key", d.key);
        rec.set("name_en", d.name_en);
        rec.set("name_ar", d.name_ar);
        rec.set("icon", d.icon);
        rec.set("is_financial", d.is_financial);
        rec.set("default_reminders", d.default_reminders);
        rec.set("channels", d.channels);
        rec.set("active", d.active);
        rec.set("order", d.order);
        app.save(rec);
      }
    });

    // --- Seed single admin settings row ---
    let adminRow = null;
    try {
      adminRow = app.findFirstRecordByFilter("alert_admin_settings", "1=1");
    } catch (_) { /* none yet */ }
    if (!adminRow) {
      const rec = new Record(admin);
      rec.set("system_enabled", true);
      rec.set("owner_alerts_enabled", true);
      rec.set("email_alerts_enabled", true);
      rec.set("in_app_enabled", true);
      rec.set("upcoming_enabled", true);
      rec.set("overdue_enabled", true);
      rec.set("repeated_overdue_enabled", true);
      rec.set("calendar_enabled", true);
      rec.set("default_reminders", {
        installment: [30, 7, 1],
        rent: [7, 1],
        cheque: [7, 1],
        contract_expiry: [30, 14],
        service_fee: [30, 7],
        handover: [30, 7],
        document_expiry: [30, 7],
        custom: [7, 1],
      });
      app.save(rec);
    }
  },
  (app) => {
    const names = [
      "property_alerts",
      "alert_types",
      "alert_settings",
      "alert_executions",
      "alert_audit_log",
      "alert_admin_settings",
    ];
    names.forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n));
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    });
  },
);
