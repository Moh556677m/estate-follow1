/// <reference path="../pb_data/types.d.ts" />

/**
 * AI Provider Keys — multi-provider, multi-key management.
 *
 * Stores metadata for each admin-managed AI provider key (name, provider type,
 * the env var name that holds the real secret, assigned site sections, enabled
 * flag, masked preview). The actual secret value is NEVER stored here — it
 * lives only in apps/api/.env (written by the Express /ai-providers routes).
 * This collection is super-admin only on every operation, and the masked_key
 * field is the only key-related value it ever holds (a server-computed preview
 * like "sk-ant-…AB12"), so the raw key is never readable via REST.
 *
 * A default record is seeded for the existing Anthropic Claude key
 * (ANTHROPIC_API_KEY) so the current Estate AI / Add Property / Plan Reader
 * flows keep working unchanged and appear in the new admin panel.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("ai_provider_keys");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "ai_provider_keys",
        // Super-admin only on every operation. The raw key is never stored
        // here, but the metadata (env var name, sections, enabled) is still
        // admin-sensitive, so lock it down completely.
        listRule: "@request.auth.is_super_admin = true",
        viewRule: "@request.auth.is_super_admin = true",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "name", type: "text", required: true, max: 120 },
          {
            name: "provider",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["claude", "openai", "custom"],
          },
          { name: "env_var", type: "text", required: true, max: 80 },
          { name: "sections", type: "json", maxSize: 20000 },
          { name: "enabled", type: "bool" },
          { name: "masked_key", type: "text", max: 60 },
          { name: "notes", type: "text", max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(collection);
    }

    // Seed a default record for the existing Anthropic Claude key so the
    // current flows (Estate AI chat context, AI Add Property, Smart Payment
    // Plan Reader) keep working and show up in the new admin panel. The real
    // key value stays in apps/api/.env — only a masked preview is stored, and
    // even that is recomputed by the Express list endpoint on every read.
    const existing = app.findAllRecords("ai_provider_keys");
    if (!existing || existing.length === 0) {
      const row = new Record(collection);
      row.set("name", "Anthropic Claude — Estate AI");
      row.set("provider", "claude");
      row.set("env_var", "ANTHROPIC_API_KEY");
      row.set(
        "sections",
        JSON.stringify(["estate_ai_chat", "add_property", "plan_reader"]),
      );
      row.set("enabled", true);
      row.set("masked_key", "");
      row.set("notes", "");
      app.save(row);
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("ai_provider_keys");
      app.delete(c);
    } catch (_) {}
  },
);
