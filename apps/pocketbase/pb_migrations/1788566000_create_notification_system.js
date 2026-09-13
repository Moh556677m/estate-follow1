/// <reference path="../pb_data/types.d.ts" />

// Notification system — settings, sounds, templates, announcements,
// delivery analytics, global config. Also extends the existing
// `notifications` collection with category/link/relations/data so the
// Notification Center can filter and deep-link into property records.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // ---- 1. Extend the existing `notifications` collection ----
    let notifs;
    try {
      notifs = app.findCollectionByNameOrId("notifications");
    } catch (_) {
      notifs = new Collection({
        type: "base",
        name: "notifications",
        listRule: "@request.auth.id = user",
        viewRule: "@request.auth.id = user",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id = user",
        deleteRule: "@request.auth.id = user || @request.auth.role = 'admin'",
        fields: [
          {
            name: "user",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "title", type: "text", required: true, max: 300 },
          { name: "body", type: "text", max: 2000 },
          {
            name: "type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["reminder", "status", "system"],
          },
          { name: "read", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE INDEX idx_notifications_user ON notifications (user, read)"],
      });
      app.save(notifs);
    }

    // Add new fields only if missing (idempotent).
    const addField = (field) => {
      if (!notifs.fields.getByName(field.name)) {
        notifs.fields.add(field);
      }
    };
    addField(
      new SelectField({
        name: "category",
        maxSelect: 1,
        values: [
          "installment",
          "rent",
          "service",
          "contract",
          "handover",
          "platform",
          "inactivity",
          "security",
        ],
      }),
    );
    addField(
      new SelectField({
        name: "priority",
        maxSelect: 1,
        values: ["low", "normal", "high", "critical"],
      }),
    );
    addField(new TextField({ name: "link", max: 300 }));
    addField(
      new RelationField({
        name: "property",
        maxSelect: 1,
        collectionId: "_pb_users_auth_",
        cascadeDelete: false,
      }),
    );
    // property relation should point at properties collection if it exists.
    try {
      const propsCol = app.findCollectionByNameOrId("properties");
      const propField = notifs.fields.getByName("property");
      if (propField && propField.collectionId !== propsCol.id) {
        notifs.fields.removeByName("property");
        notifs.fields.add(
          new RelationField({
            name: "property",
            maxSelect: 1,
            collectionId: propsCol.id,
            cascadeDelete: false,
          }),
        );
      }
    } catch (_) {
      /* properties collection missing — leave relation generic */
    }
    addField(
      new RelationField({
        name: "payment",
        maxSelect: 1,
        collectionId: users.id,
        cascadeDelete: false,
      }),
    );
    try {
      const paysCol = app.findCollectionByNameOrId("payments");
      const payField = notifs.fields.getByName("payment");
      if (payField && payField.collectionId !== paysCol.id) {
        notifs.fields.removeByName("payment");
        notifs.fields.add(
          new RelationField({
            name: "payment",
            maxSelect: 1,
            collectionId: paysCol.id,
            cascadeDelete: false,
          }),
        );
      }
    } catch (_) {
      /* ignore */
    }
    addField(new TextField({ name: "dedup_key", max: 120 }));
    addField(new JSONField({ name: "data", maxSize: 200000 }));
    addField(new BoolField({ name: "sound_played" }));
    addField(new BoolField({ name: "push_sent" }));
    // Loosen create rule so the owner's own browser (and admin) can create.
    notifs.createRule = "@request.auth.id != '' && @request.auth.id = user";
    notifs.listRule = "@request.auth.id = user";
    notifs.viewRule = "@request.auth.id = user";
    app.save(notifs);

    // Unique dedup index (partial — only when dedup_key present)
    try {
      notifs.indexes = notifs.indexes || [];
      const hasDedup = (notifs.indexes || []).some((i) => i.includes("idx_notif_dedup"));
      if (!hasDedup) {
        notifs.indexes.push(
          "CREATE UNIQUE INDEX idx_notif_dedup ON notifications (user, dedup_key) WHERE dedup_key != ''",
        );
        app.save(notifs);
      }
    } catch (_) {
      /* ignore index errors */
    }

    // ---- 2. notification_settings (per-user preferences) ----
    let settings;
    try {
      settings = app.findCollectionByNameOrId("notification_settings");
    } catch (_) {
      settings = new Collection({
        type: "base",
        name: "notification_settings",
        listRule: "@request.auth.id = user",
        viewRule: "@request.auth.id = user",
        createRule: "@request.auth.id != '' && @request.auth.id = user",
        updateRule: "@request.auth.id = user",
        deleteRule: "@request.auth.id = user",
        fields: [
          {
            name: "user",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "push_enabled", type: "bool" },
          { name: "in_app_enabled", type: "bool" },
          { name: "sound_enabled", type: "bool" },
          { name: "vibration_enabled", type: "bool" },
          { name: "silent", type: "bool" },
          { name: "mute_all", type: "bool" },
          { name: "selected_sound", type: "text", max: 60 },
          { name: "hide_amount_lock", type: "bool" },
          {
            name: "reminder_days",
            type: "json",
            maxSize: 20000,
          },
          {
            name: "categories",
            type: "json",
            maxSize: 20000,
          },
          { name: "last_active_at", type: "date" },
          { name: "inactivity_last_sent", type: "date" },
          { name: "push_permission", type: "text", max: 20 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_notif_settings_user ON notification_settings (user)"],
      });
      app.save(settings);
    }

    // ---- 3. notification_sounds (admin-managed tones) ----
    let sounds;
    try {
      sounds = app.findCollectionByNameOrId("notification_sounds");
    } catch (_) {
      sounds = new Collection({
        type: "base",
        name: "notification_sounds",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "key", type: "text", required: true, max: 60 },
          { name: "name_ar", type: "text", required: true, max: 80 },
          { name: "name_en", type: "text", required: true, max: 80 },
          { name: "waveform", type: "text", max: 20 },
          { name: "frequency", type: "number" },
          { name: "duration", type: "number" },
          { name: "is_default", type: "bool" },
          { name: "is_builtin", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_notif_sounds_key ON notification_sounds (key)"],
      });
      app.save(sounds);
    }

    // Seed built-in tones (idempotent — skip if any already exist).
    try {
      const existing = app.findRecordsByFilter(
        "notification_sounds",
        "is_builtin = true",
        "",
        100,
      );
      if (!existing || existing.length === 0) {
        const builtin = [
          { key: "estate_default", name_ar: "Estate Default", name_en: "Estate Default", waveform: "sine", frequency: 880, duration: 0.25, is_default: true, is_builtin: true },
          { key: "soft_bell", name_ar: "Soft Bell", name_en: "Soft Bell", waveform: "triangle", frequency: 660, duration: 0.35, is_default: false, is_builtin: true },
          { key: "clear_chime", name_ar: "Clear Chime", name_en: "Clear Chime", waveform: "sine", frequency: 988, duration: 0.3, is_default: false, is_builtin: true },
          { key: "gentle_alert", name_ar: "Gentle Alert", name_en: "Gentle Alert", waveform: "sine", frequency: 523, duration: 0.4, is_default: false, is_builtin: true },
          { key: "modern_ping", name_ar: "Modern Ping", name_en: "Modern Ping", waveform: "square", frequency: 740, duration: 0.18, is_default: false, is_builtin: true },
          { key: "minimal_tone", name_ar: "Minimal Tone", name_en: "Minimal Tone", waveform: "sine", frequency: 440, duration: 0.22, is_default: false, is_builtin: true },
        ];
        for (const s of builtin) {
          const r = new Record(sounds);
          r.load(s);
          app.save(r);
        }
      }
    } catch (_) {
      /* ignore seed errors */
    }

    // ---- 4. notification_templates (admin-managed AR/EN templates) ----
    let templates;
    try {
      templates = app.findCollectionByNameOrId("notification_templates");
    } catch (_) {
      templates = new Collection({
        type: "base",
        name: "notification_templates",
        listRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        viewRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          {
            name: "type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: [
              "installment_upcoming",
              "installment_due",
              "installment_overdue",
              "rent_upcoming",
              "rent_overdue",
              "service_upcoming",
              "service_due",
              "contract_expiring",
              "handover_upcoming",
              "platform_announcement",
              "platform_update",
              "inactivity_reminder",
            ],
          },
          { name: "title_ar", type: "text", required: true, max: 200 },
          { name: "message_ar", type: "text", required: true, max: 1000 },
          { name: "title_en", type: "text", required: true, max: 200 },
          { name: "message_en", type: "text", required: true, max: 1000 },
          { name: "enabled", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_notif_tpl_type ON notification_templates (type)"],
      });
      app.save(templates);
    }

    // Seed default templates (idempotent).
    try {
      const existingTpl = app.findRecordsByFilter(
        "notification_templates",
        "1 = 1",
        "",
        1,
      );
      if (!existingTpl || existingTpl.length === 0) {
        const defaults = [
          { type: "installment_upcoming", title_ar: "قسط قادم", message_ar: "لديك قسط بقيمة {{amount}} يستحق بتاريخ {{due_date}} لعقار {{property_name}}.", title_en: "Upcoming Installment", message_en: "You have an installment of {{amount}} due on {{due_date}} for {{property_name}}.", enabled: true },
          { type: "installment_due", title_ar: "قسط مستحق اليوم", message_ar: "لديك قسط بقيمة {{amount}} مستحق اليوم لعقار {{property_name}}.", title_en: "Installment Due Today", message_en: "You have an installment of {{amount}} due today for {{property_name}}.", enabled: true },
          { type: "installment_overdue", title_ar: "قسط متأخر", message_ar: "لديك قسط متأخر بقيمة {{amount}} منذ {{days_overdue}} يوم لعقار {{property_name}}.", title_en: "Overdue Installment", message_en: "You have an overdue installment of {{amount}} ({{days_overdue}} days) for {{property_name}}.", enabled: true },
          { type: "rent_upcoming", title_ar: "دفعة إيجار قادمة", message_ar: "لديك دفعة إيجار بقيمة {{amount}} تستحق بتاريخ {{due_date}} لعقار {{property_name}}.", title_en: "Upcoming Rent Payment", message_en: "You have a rent payment of {{amount}} due on {{due_date}} for {{property_name}}.", enabled: true },
          { type: "rent_overdue", title_ar: "دفعة إيجار متأخرة", message_ar: "لديك دفعة إيجار متأخرة بقيمة {{amount}} منذ {{days_overdue}} يوم لعقار {{property_name}}.", title_en: "Overdue Rent Payment", message_en: "You have an overdue rent payment of {{amount}} ({{days_overdue}} days) for {{property_name}}.", enabled: true },
          { type: "service_upcoming", title_ar: "رسوم صيانة قادمة", message_ar: "لديك رسوم صيانة بقيمة {{amount}} تستحق بتاريخ {{due_date}} لعقار {{property_name}}.", title_en: "Upcoming Service Fee", message_en: "You have a service fee of {{amount}} due on {{due_date}} for {{property_name}}.", enabled: true },
          { type: "service_due", title_ar: "رسوم مستحقة", message_ar: "لديك رسوم خدمات بقيمة {{amount}} مستحقة لعقار {{property_name}}.", title_en: "Service Fee Due", message_en: "You have a service fee of {{amount}} due for {{property_name}}.", enabled: true },
          { type: "contract_expiring", title_ar: "عقد إيجار يقترب من الانتهاء", message_ar: "عقد إيجار لعقار {{property_name}} ينتهي بتاريخ {{due_date}}.", title_en: "Lease Contract Expiring", message_en: "The lease for {{property_name}} expires on {{due_date}}.", enabled: true },
          { type: "handover_upcoming", title_ar: "تاريخ استلام عقار يقترب", message_ar: "استلام عقار {{property_name}} يقترب بتاريخ {{due_date}}.", title_en: "Property Handover Approaching", message_en: "Handover for {{property_name}} is approaching on {{due_date}}.", enabled: true },
          { type: "platform_announcement", title_ar: "إعلان من المنصة", message_ar: "{{message}}", title_en: "Platform Announcement", message_en: "{{message}}", enabled: true },
          { type: "platform_update", title_ar: "تحديث جديد في Estate Follow", message_ar: "{{message}}", title_en: "New Estate Follow Update", message_en: "{{message}}", enabled: true },
          { type: "inactivity_reminder", title_ar: "تذكير بالعودة", message_ar: "مر وقت منذ آخر متابعة لمحفظتك. راجع مدفوعاتك والتزاماتك القادمة في Estate Follow.", title_en: "We Missed You", message_en: "It's been a while since you checked your portfolio. Review your upcoming payments and commitments in Estate Follow.", enabled: true },
        ];
        for (const d of defaults) {
          const r = new Record(templates);
          r.load(d);
          app.save(r);
        }
      }
    } catch (_) {
      /* ignore */
    }

    // ---- 5. notification_announcements (admin broadcasts) ----
    let announcements;
    try {
      announcements = app.findCollectionByNameOrId("notification_announcements");
    } catch (_) {
      announcements = new Collection({
        type: "base",
        name: "notification_announcements",
        listRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        viewRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "title_ar", type: "text", required: true, max: 200 },
          { name: "title_en", type: "text", required: true, max: 200 },
          { name: "message_ar", type: "text", required: true, max: 2000 },
          { name: "message_en", type: "text", required: true, max: 2000 },
          {
            name: "image",
            type: "file",
            maxSelect: 1,
            maxSize: 536870912,
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          },
          { name: "link_url", type: "url" },
          {
            name: "category",
            type: "select",
            maxSelect: 1,
            values: ["platform", "update", "service", "alert"],
          },
          {
            name: "target",
            type: "select",
            maxSelect: 1,
            values: ["owners", "all"],
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["draft", "scheduled", "sent"],
          },
          { name: "scheduled_at", type: "date" },
          { name: "sent_at", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE INDEX idx_notif_ann_status ON notification_announcements (status, scheduled_at)"],
      });
      app.save(announcements);
    }

    // ---- 6. notification_delivery_log (analytics) ----
    let delivery;
    try {
      delivery = app.findCollectionByNameOrId("notification_delivery_log");
    } catch (_) {
      delivery = new Collection({
        type: "base",
        name: "notification_delivery_log",
        listRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        viewRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          {
            name: "user",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "notification", type: "relation", maxSelect: 1, collectionId: notifs.id, cascadeDelete: true },
          { name: "category", type: "text", max: 40 },
          {
            name: "channel",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["push", "in_app", "sound"],
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["sent", "delivered", "opened", "clicked", "failed", "denied"],
          },
          { name: "detail", type: "text", max: 300 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
        indexes: [
          "CREATE INDEX idx_notif_delivery_user ON notification_delivery_log (user, created)",
          "CREATE INDEX idx_notif_delivery_status ON notification_delivery_log (status, channel)",
        ],
      });
      app.save(delivery);
    }

    // ---- 7. notification_config (super admin global config) ----
    let config;
    try {
      config = app.findCollectionByNameOrId("notification_config");
    } catch (_) {
      config = new Collection({
        type: "base",
        name: "notification_config",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "system_enabled", type: "bool" },
          { name: "push_configured", type: "bool" },
          { name: "inactivity_days", type: "number" },
          { name: "inactivity_cooldown_days", type: "number" },
          { name: "reminder_defaults", type: "json", maxSize: 20000 },
          { name: "critical_types", type: "json", maxSize: 20000 },
          { name: "default_sound", type: "text", max: 60 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [],
      });
      app.save(config);
    }

    // Seed a single config row with sensible defaults (idempotent).
    try {
      const existingCfg = app.findRecordsByFilter("notification_config", "1 = 1", "", 1);
      if (!existingCfg || existingCfg.length === 0) {
        const r = new Record(config);
        r.load({
          system_enabled: true,
          push_configured: false,
          inactivity_days: 7,
          inactivity_cooldown_days: 30,
          reminder_defaults: JSON.stringify([7, 1, 0]),
          critical_types: JSON.stringify(["security"]),
          default_sound: "estate_default",
        });
        app.save(r);
      }
    } catch (_) {
      /* ignore */
    }
  },
  (app) => {
    // Best-effort teardown — only drop collections this migration created.
    const drop = (name) => {
      try {
        const c = app.findCollectionByNameOrId(name);
        app.delete(c);
      } catch (e) {
        if (!e.message.includes("no rows in result set")) throw e;
      }
    };
    drop("notification_config");
    drop("notification_delivery_log");
    drop("notification_announcements");
    drop("notification_templates");
    drop("notification_sounds");
    drop("notification_settings");
    // Note: `notifications` extension fields are left in place on revert to
    // avoid destroying existing user notifications.
  },
);
