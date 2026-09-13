/// <reference path="../pb_data/types.d.ts" />

/**
 * Add the OpenAI provider to the Estate AI extraction engine.
 *
 * 1. Ensures "openai" is present in the `provider` select field on
 *    `ai_provider_keys` (it was already in the original seed values, but this
 *    is idempotent and keeps the migration self-contained).
 * 2. Seeds a default OpenAI key record assigned to the single supported
 *    section ("add_property"), enabled, pointing at the server-side env var
 *    OPENAI_API_KEY. The real key value is NEVER stored here — it lives only
 *    in apps/api/.env, written by the Express /ai-providers routes when the
 *    admin pastes the secret in the Estate AI Management panel. Until
 *    OPENAI_API_KEY is set, resolveProviderKey() skips this record (not
 *    configured) and the engine falls back to the legacy ANTHROPIC_API_KEY
 *    env var, so Estate AI keeps working.
 * 3. Disables the pre-existing Gemini key record (sets enabled = false) so
 *    that, once OPENAI_API_KEY is configured, OpenAI becomes the active
 *    provider for the add_property section. The Gemini record stays in the
 *    list (masked, disabled) so the admin can re-enable and reassign it
 *    later if they want to switch back.
 *
 * OpenAI is used ONLY inside Estate AI (the /extract-property route resolves
 * the active provider for the "add_property" section). No other site section
 * consumes AI provider keys, so this change is fully isolated to Estate AI.
 *
 * Note: OpenAI's vision API supports images only. PDF inputs surface a clear
 * PLAN_OPENAI_PDF_ONLY error so the admin knows to switch the section back to
 * Claude/Gemini for PDF contracts.
 *
 * Idempotent: re-running adds "openai" only if missing, and creates the
 * OpenAI seed record only if no openai record exists yet.
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

    // 1. Ensure "openai" is in the provider select values (idempotent).
    const providerField = collection.fields.getByName("provider");
    if (providerField) {
      let vals = providerField.values;
      let valsArr = [];
      if (Array.isArray(vals)) {
        valsArr = vals;
      } else if (vals && typeof vals.length === "number") {
        valsArr = Array.prototype.slice.call(vals);
      }
      if (!valsArr.includes("openai")) {
        const customIdx = valsArr.indexOf("custom");
        if (customIdx >= 0) {
          valsArr = valsArr.slice(0, customIdx).concat("openai", valsArr.slice(customIdx));
        } else {
          valsArr.push("openai");
        }
        providerField.values = valsArr;
        app.save(collection);
      }
    }

    // 2. Seed the default OpenAI key record (only if none exists yet).
    let records = [];
    try {
      records = app.findAllRecords("ai_provider_keys");
    } catch (_) {
      records = [];
    }
    const hasOpenai = (records || []).some((r) => {
      const p = r.get("provider");
      return p === "openai";
    });
    if (!hasOpenai) {
      const row = new Record(collection);
      row.set("name", "OpenAI — Estate AI");
      row.set("provider", "openai");
      row.set("env_var", "OPENAI_API_KEY");
      row.set("sections", JSON.stringify(["add_property"]));
      row.set("enabled", true);
      row.set("masked_key", "");
      row.set("notes", "Default OpenAI provider for Estate AI (add_property). Set OPENAI_API_KEY via the Estate AI Management panel to activate. Supports images only — PDFs return PLAN_OPENAI_PDF_ONLY.");
      app.save(row);
    }

    // 3. Disable the pre-existing Gemini key record(s) so OpenAI takes
    //    precedence once configured. Idempotent: only flips enabled=true ->
    //    false on gemini records; leaves already-disabled records untouched.
    for (const r of records || []) {
      const p = r.get("provider");
      if (p === "gemini" && r.get("enabled") === true) {
        r.set("enabled", false);
        app.save(r);
      }
    }
  },
  (app) => {
    // Revert: remove the seeded OpenAI record and re-enable the Gemini record
    // so the engine falls back to Gemini (or ANTHROPIC_API_KEY) as before.
    try {
      const collection = app.findCollectionByNameOrId("ai_provider_keys");
      let records = [];
      try {
        records = app.findAllRecords("ai_provider_keys");
      } catch (_) {
        records = [];
      }
      for (const r of records || []) {
        if (r.get("provider") === "openai") {
          app.delete(r);
        } else if (r.get("provider") === "gemini") {
          r.set("enabled", true);
          app.save(r);
        }
      }
    } catch (_) {
      // collection gone — nothing to revert
    }
  },
);
