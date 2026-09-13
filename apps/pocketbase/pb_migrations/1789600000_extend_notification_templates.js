/// <reference path="../pb_data/types.d.ts" />

// Task #14 — Reminder Engine. Extends the EXISTING notification_templates /
// notification_delivery_log collections instead of creating a new
// "reminder_rules" table:
//  - notification_templates gets a `channels` JSON field (per-type
//    email/in_app/whatsapp/sms/push enablement, admin-editable) and 3 new
//    `type` values (cheque_due, document_expiry, custom_reminder) so every
//    alerts-engine event type (payment/rent/service_fee/contract_expiry/
//    handover/cheque/document_expiry/custom) has a matching, customizable
//    template.
//  - notification_delivery_log's `channel` select gains email/whatsapp/sms/
//    webhook values (it previously only recognized push/in_app/sound, so a
//    real email or a "requires_adapter" whatsapp/sms attempt could never be
//    logged there before this).

migrate(
  (app) => {
    const templates = app.findCollectionByNameOrId("notification_templates");

    if (!templates.fields.getByName("channels")) {
      templates.fields.add(
        new JSONField({
          name: "channels",
          maxSize: 2000,
        }),
      );
    }

    const typeField = templates.fields.getByName("type");
    const newTypeValues = ["cheque_due", "document_expiry", "custom_reminder"];
    const mergedTypes = Array.from(new Set([...(typeField.values || []), ...newTypeValues]));
    typeField.values = mergedTypes;

    app.save(templates);

    // Backfill `channels` on every existing template row + seed the 3 new
    // template types (idempotent — only inserts rows that don't exist yet).
    try {
      const defaultChannels = JSON.stringify({ email: true, in_app: true, whatsapp: false, sms: false, push: false });
      const rows = app.findRecordsByFilter("notification_templates", "1=1", "", 0, 0);
      rows.forEach((r) => {
        // `r.get("channels")` on a JSON field returns a bridge object even
        // when the underlying value is null/empty, so it is always truthy —
        // a plain `!r.get(...)` check can never detect "unset" here. Parse
        // it back to a real JS value instead (the same String()->JSON.parse
        // workaround documented in plan-entitlement.pb.js / lib-monthly-
        // reports.js for reading JSON fields in this PocketBase JSVM build).
        let hasReal = false;
        try {
          const parsed = JSON.parse(String(r.get("channels")));
          hasReal = !!(parsed && typeof parsed === "object" && Object.keys(parsed).length > 0);
        } catch (_) { hasReal = false; }
        if (!hasReal) {
          r.set("channels", defaultChannels);
          app.save(r);
        }
      });

      const newDefaults = [
        { type: "cheque_due", title_ar: "شيك مستحق", message_ar: "لديك شيك بقيمة {{amount}} مستحق بتاريخ {{due_date}} لعقار {{property_name}}.", title_en: "Cheque Due", message_en: "You have a cheque of {{amount}} due on {{due_date}} for {{property_name}}.", enabled: true, channels: defaultChannels },
        { type: "document_expiry", title_ar: "مستند على وشك الانتهاء", message_ar: "مستند متعلق بعقار {{property_name}} على وشك الانتهاء بتاريخ {{due_date}}.", title_en: "Document Expiring", message_en: "A document for {{property_name}} is expiring on {{due_date}}.", enabled: true, channels: defaultChannels },
        { type: "custom_reminder", title_ar: "تذكير", message_ar: "{{property_name}} — {{days_text}}.", title_en: "Reminder", message_en: "{{property_name}} — {{days_text}}.", enabled: true, channels: defaultChannels },
      ];
      for (const d of newDefaults) {
        // findFirstRecordByFilter throws "sql: no rows in result set" (not a
        // null return) when nothing matches — must be caught per-call, same
        // as this codebase's established safeFirst() helper pattern
        // elsewhere (alerts.pb.js), otherwise one missing type aborts the
        // whole seed loop for every type after it.
        let exists = null;
        try { exists = app.findFirstRecordByFilter("notification_templates", `type = "${d.type}"`); }
        catch (_) { exists = null; }
        if (!exists) {
          const r = new Record(templates);
          r.load(d);
          app.save(r);
        }
      }
    } catch (err) {
      app.logger().error("notification_templates backfill/seed failed", "err", String(err));
    }

    const delivery = app.findCollectionByNameOrId("notification_delivery_log");
    const channelField = delivery.fields.getByName("channel");
    const mergedChannels = Array.from(
      new Set([...(channelField.values || []), "email", "whatsapp", "sms", "webhook"]),
    );
    channelField.values = mergedChannels;
    app.save(delivery);
  },
  (app) => {
    try {
      const templates = app.findCollectionByNameOrId("notification_templates");
      templates.fields.removeByName("channels");
      const typeField = templates.fields.getByName("type");
      typeField.values = typeField.values.filter(
        (v) => !["cheque_due", "document_expiry", "custom_reminder"].includes(v),
      );
      app.save(templates);
    } catch (_) { /* ignore */ }

    try {
      const delivery = app.findCollectionByNameOrId("notification_delivery_log");
      const channelField = delivery.fields.getByName("channel");
      channelField.values = channelField.values.filter(
        (v) => !["email", "whatsapp", "sms", "webhook"].includes(v),
      );
      app.save(delivery);
    } catch (_) { /* ignore */ }
  },
);
