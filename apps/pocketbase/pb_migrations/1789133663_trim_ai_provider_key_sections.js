/// <reference path="../pb_data/types.d.ts" />

/**
 * Trim ai_provider_keys.sections to the single allowed section.
 *
 * Estate AI was simplified to power ONLY the "add_property" section. The
 * retired sections (estate_ai_chat, plan_reader, insights) are removed from
 * every existing key record's `sections` array so:
 *   - the admin panel no longer lists stale section badges on a key,
 *   - resolveProviderKey() can never match a retired section even before
 *     its own catalog guard runs.
 *
 * The raw key value is never touched (it lives in apps/api/.env, not here).
 * Idempotent: records already containing only allowed sections are skipped.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("ai_provider_keys");
    } catch (_) {
      // Collection does not exist yet (created by 1789114342). Nothing to trim.
      return;
    }

    const ALLOWED = ["add_property"];
    let records = [];
    try {
      records = app.findAllRecords("ai_provider_keys");
    } catch (_) {
      return;
    }

    for (const r of records) {
      let sections = r.get("sections");
      if (typeof sections === "string") {
        try {
          sections = JSON.parse(sections);
        } catch (_) {
          sections = [];
        }
      }
      if (!Array.isArray(sections)) sections = [];

      const filtered = sections.filter((s) => ALLOWED.includes(s));
      const before = JSON.stringify(sections);
      const after = JSON.stringify(filtered);
      if (before !== after) {
        r.set("sections", JSON.stringify(filtered));
        app.save(r);
      }
    }
  },
  (app) => {
    // One-way trim: restoring stale retired-section assignments is not
    // desirable, so the down migration is a deliberate no-op.
  },
);
