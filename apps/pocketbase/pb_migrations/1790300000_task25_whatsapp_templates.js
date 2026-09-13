/// <reference path="../pb_data/types.d.ts" />

// Task #25 — WhatsApp official notification channel. Extends the EXISTING
// notification_templates collection (already used by
// NotificationManagementPanel.jsx's "templates" tab, and by
// lib-notification-templates.js's resolveTemplate()) instead of creating a
// new collection:
//   - whatsapp_template_name: the exact template name Mohamed created and
//     got APPROVED in Meta Business Manager for this reminder type. Meta
//     requires business-initiated messages to use a pre-approved template
//     (see lib-whatsapp-provider.js's header comment) — this field is how
//     Admin tells the engine which real template to use per event type.
//   - whatsapp_template_lang: the template's language code (e.g. "ar",
//     "ar_EG", "en_US") as registered in Meta Business Manager. Defaults to
//     "ar" since this platform's default UI language is Arabic.
// Both fields are plain text and optional — a template row with no
// whatsapp_template_name simply cannot dispatch on the whatsapp channel
// yet (lib-notification-providers.js reports "no_template_configured",
// never a fake send).

migrate(
  (app) => {
    const templates = app.findCollectionByNameOrId("notification_templates");

    if (!templates.fields.getByName("whatsapp_template_name")) {
      templates.fields.add(
        new TextField({
          name: "whatsapp_template_name",
          max: 200,
        }),
      );
    }
    if (!templates.fields.getByName("whatsapp_template_lang")) {
      templates.fields.add(
        new TextField({
          name: "whatsapp_template_lang",
          max: 20,
        }),
      );
    }

    app.save(templates);

    // Backfill a sane default language on existing rows so a template row
    // an admin fills in immediately works without also having to remember
    // to set the language code separately.
    try {
      const rows = app.findRecordsByFilter("notification_templates", "1=1", "", 0, 0);
      rows.forEach((r) => {
        if (!String(r.get("whatsapp_template_lang") || "").trim()) {
          r.set("whatsapp_template_lang", "ar");
          app.save(r);
        }
      });
    } catch (err) {
      app.logger().error("whatsapp_template_lang backfill failed", "err", String(err));
    }
  },
  (app) => {
    try {
      const templates = app.findCollectionByNameOrId("notification_templates");
      templates.fields.removeByName("whatsapp_template_name");
      templates.fields.removeByName("whatsapp_template_lang");
      app.save(templates);
    } catch (_) { /* ignore */ }
  },
);
