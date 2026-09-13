/// <reference path="../pb_data/types.d.ts" />

// Extend platform_settings with full platform-control options for the Super
// Admin: site/app icon, fonts, custom navigation labels, custom button labels,
// and editable email/notification templates.
migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId("platform_settings");

    const add = (name, field) => {
      if (!settings.fields.getByName(name)) {
        settings.fields.add(field);
      }
    };

    add("site_icon_url", new TextField({ name: "site_icon_url", max: 500 }));
    add("font_family", new TextField({ name: "font_family", max: 100 }));
    add("font_arabic", new TextField({ name: "font_arabic", max: 100 }));
    add("nav_labels", new JSONField({ name: "nav_labels" }));
    add("button_labels", new JSONField({ name: "button_labels" }));
    add("email_templates", new JSONField({ name: "email_templates" }));

    app.save(settings);
  },
  (app) => {
    const settings = app.findCollectionByNameOrId("platform_settings");
    ["site_icon_url", "font_family", "font_arabic", "nav_labels", "button_labels", "email_templates"]
      .forEach((name) => {
        try { settings.fields.removeByName(name); } catch (_) {}
      });
    app.save(settings);
  },
);
