/// <reference path="../pb_data/types.d.ts" />

/**
 * Add the Google Gemini provider to the Estate AI extraction engine.
 *
 * 1. Extends the `provider` select field on `ai_provider_keys` to allow
 *    "gemini" (alongside claude / openai / custom) so the admin can create
 *    and assign a Gemini key from the Estate AI Management panel.
 * 2. Seeds a default Gemini key record assigned to the single supported
 *    section ("add_property"), enabled, pointing at the server-side env var
 *    GEMINI_API_KEY. The real key value is NEVER stored here — it lives only
 *    in apps/api/.env (written by the Express /ai-providers routes). Until
 *    GEMINI_API_KEY is set, resolveProviderKey() skips this record (not
 *    configured) and the engine falls back to the legacy ANTHROPIC_API_KEY
 *    env var, so Estate AI keeps working.
 * 3. Disables the pre-existing Anthropic Claude key record (sets enabled =
 *    false) so that, once GEMINI_API_KEY is configured, Gemini becomes the
 *    active provider for the add_property section. The Claude record stays
 *    in the list (masked, unassigned-active=false) so the admin can re-enable
 *    and reassign it later if they want to switch back.
 *
 * Gemini is used ONLY inside Estate AI (the /extract-property route resolves
 * the active provider for the "add_property" section). No other site section
 * consumes AI provider keys, so this change is fully isolated to Estate AI.
 *
 * Idempotent: re-running adds "gemini" only if missing, and creates the
 * Gemini seed record only if no gemini record exists yet.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("ai_provider_keys");
    } catch (_) {
      // Collection doesn't exist yet — nothing to do; the create migration
      // will run (or has run) and its seed is Claude-only by design.
      return;
    }

    // 1. Add "gemini" to the provider select values (preserve existing order).
    const providerField = collection.fields.getByName("provider");
    if (providerField) {
      let vals = providerField.values;
      // Normalize Go slice -> JS array for the includes check.
      let valsArr = [];
      if (Array.isArray(vals)) {
        valsArr = vals;
      } else if (vals && typeof vals.length === "number") {
        valsArr = Array.prototype.slice.call(vals);
      }
      if (!valsArr.includes("gemini")) {
        // Insert gemini before "custom" if present, else append.
        const customIdx = valsArr.indexOf("custom");
        if (customIdx >= 0) {
          valsArr = valsArr.slice(0, customIdx).concat("gemini", valsArr.slice(customIdx));
        } else {
          valsArr.push("gemini");
        }
        providerField.values = valsArr;
        app.save(collection);
      }
    }

    // 2. Seed the default Gemini key record (only if none exists yet).
    let records = [];
    try {
      records = app.findAllRecords("ai_provider_keys");
    } catch (_) {
      records = [];
    }
    const hasGemini = (records || []).some((r) => {
      const p = r.get("provider");
      return p === "gemini";
    });
    if (!hasGemini) {
      const row = new Record(collection);
      row.set("name", "Google Gemini — Estate AI");
      row.set("provider", "gemini");
      row.set("env_var", "GEMINI_API_KEY");
      row.set("sections", JSON.stringify(["add_property"]));
      row.set("enabled", true);
      row.set("masked_key", "");
      row.set("notes", "Default Gemini provider for Estate AI (add_property). Set GEMINI_API_KEY in apps/api/.env to activate.");
      app.save(row);
    }

    // 3. Disable the pre-existing Anthropic Claude key record(s) so Gemini
    //    takes precedence once configured. The Claude record remains in the
    //    list for the admin to re-enable/reassign. Idempotent: only flips
    //    enabled=true -> false on claude records; leaves already-disabled
    //    records untouched.
    for (const r of records || []) {
      const p = r.get("provider");
      if (p === "claude" && r.get("enabled") === true) {
        r.set("enabled", false);
        app.save(r);
      }
    }
  },
  (app) => {
    // Revert: remove "gemini" from the provider select values and delete the
    // seeded Gemini record. Re-enable the Claude record so the engine falls
    // back to the ANTHROPIC_API_KEY env path as before.
    try {
      const collection = app.findCollectionByNameOrId("ai_provider_keys");
      const providerField = collection.fields.getByName("provider");
      if (providerField) {
        let vals = providerField.values;
        let valsArr = [];
        if (Array.isArray(vals)) {
          valsArr = vals;
        } else if (vals && typeof vals.length === "number") {
          valsArr = Array.prototype.slice.call(vals);
        }
        providerField.values = valsArr.filter((v) => v !== "gemini");
        app.save(collection);
      }
      let records = [];
      try {
        records = app.findAllRecords("ai_provider_keys");
      } catch (_) {
        records = [];
      }
      for (const r of records || []) {
        if (r.get("provider") === "gemini") {
          app.delete(r);
        } else if (r.get("provider") === "claude") {
          r.set("enabled", true);
          app.save(r);
        }
      }
    } catch (_) {
      // collection gone — nothing to revert
    }
  },
);
