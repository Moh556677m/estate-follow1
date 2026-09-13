/// <reference path="../pb_data/types.d.ts" />

/**
 * Ensure every ai_provider_keys record is assigned to the single allowed
 * section, "add_property".
 *
 * The previous trim migration (1789133663) removed the retired sections
 * (estate_ai_chat, plan_reader, insights) but, due to a JSVM json-field
 * read/serialize mismatch, also dropped "add_property" — leaving keys with
 * sections = []. That still works at runtime via the ANTHROPIC_API_KEY env
 * fallback, but the admin panel showed "No sections assigned". This delta
 * restores the explicit assignment using the ARRAY form (the same form the
 * SDK create route uses), which PocketBase stores as a proper JSON array.
 *
 * "add_property" is now the ONLY section in the catalog, so every key is
 * assigned to exactly that section. Idempotent.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("ai_provider_keys");
    } catch (_) {
      return;
    }
    let records = [];
    try {
      records = app.findAllRecords("ai_provider_keys");
    } catch (_) {
      return;
    }

    const desired = ["add_property"];
    const desiredJson = JSON.stringify(desired);

    for (const r of records) {
      let current = r.get("sections");
      if (typeof current === "string") {
        try {
          current = JSON.parse(current);
        } catch (_) {
          current = [];
        }
      }
      // Normalize to a plain JS array for comparison.
      let currentArr = [];
      if (Array.isArray(current)) {
        currentArr = current;
      } else if (current && typeof current.length === "number") {
        // Go slice: copy into a JS array.
        currentArr = Array.prototype.slice.call(current);
      }
      const currentJson = JSON.stringify(currentArr);
      if (currentJson !== desiredJson) {
        // Set as a real array (not a stringified one) so PocketBase stores a
        // proper JSON array — matches how the SDK create route persists it.
        r.set("sections", desired);
        app.save(r);
      }
    }
  },
  (app) => {
    // One-way normalization; no meaningful rollback.
  },
);
