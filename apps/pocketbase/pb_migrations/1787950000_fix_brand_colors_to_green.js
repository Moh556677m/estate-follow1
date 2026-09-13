/// <reference path="../pb_data/types.d.ts" />

// Brand color fix (source-level).
// The original settings seed stored accent_color / email_header_color as
// "#0F766E" (teal/turquoise). The BrandLoader applied that teal to the
// --accent / --ring / --gold CSS variables, so the old turquoise kept
// reappearing after login, refresh, or language change.
//
// The approved brand identity is green (#22C55E). This migration rewrites any
// platform_settings row still holding the old teal defaults to the brand green
// so the stored source matches the design tokens. Existing custom colors chosen
// by an admin are preserved (only the exact old default is corrected).
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("platform_settings");
    } catch (_) {
      // platform_settings not provisioned yet — nothing to fix.
      return;
    }

    const rows = app.findAllRecords(collection);
    rows.forEach((row) => {
      let changed = false;
      if ((row.get("accent_color") || "").toLowerCase() === "#0f766e") {
        row.set("accent_color", "#22C55E");
        changed = true;
      }
      if ((row.get("email_header_color") || "").toLowerCase() === "#0f766e") {
        row.set("email_header_color", "#22C55E");
        changed = true;
      }
      if (changed) app.save(row);
    });
  },
  (app) => {
    // Non-destructive revert: restore the original teal default on rows we
    // changed, so the down migration is a true inverse.
    let collection;
    try {
      collection = app.findCollectionByNameOrId("platform_settings");
    } catch (_) {
      return;
    }
    const rows = app.findAllRecords(collection);
    rows.forEach((row) => {
      let changed = false;
      if ((row.get("accent_color") || "").toLowerCase() === "#22c55e") {
        row.set("accent_color", "#0F766E");
        changed = true;
      }
      if ((row.get("email_header_color") || "").toLowerCase() === "#22c55e") {
        row.set("email_header_color", "#0F766E");
        changed = true;
      }
      if (changed) app.save(row);
    });
  },
);
