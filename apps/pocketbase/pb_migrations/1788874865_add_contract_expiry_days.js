/// <reference path="../pb_data/types.d.ts" />

// Adds a configurable `contract_expiry_days` field (default 30) to the
// notification_config collection. This drives both the "expiring lease
// contracts" dashboard card window and the contract_expiring notification
// engine window, so the two stay in sync and Super Admin can tune the range
// later without code changes.

migrate(
  (app) => {
    const config = app.findCollectionByNameOrId("notification_config");

    if (!config.fields.getByName("contract_expiry_days")) {
      config.fields.add(
        new NumberField({
          name: "contract_expiry_days",
          min: 1,
          required: false,
        }),
      );
    }
    app.save(config);

    // Backfill existing config rows with the default (30 days) so the
    // dashboard card and notification engine have a concrete value from day one.
    try {
      const rows = app.findRecordsByFilter("notification_config", "1 = 1", "", 100);
      (rows || []).forEach((r) => {
        if (r.get("contract_expiry_days") == null || r.get("contract_expiry_days") === "") {
          r.set("contract_expiry_days", 30);
          app.save(r);
        }
      });
    } catch (_) {
      /* ignore backfill errors */
    }
  },
  (app) => {
    const config = app.findCollectionByNameOrId("notification_config");
    try {
      config.fields.removeByName("contract_expiry_days");
    } catch (_) {
      /* ignore */
    }
    app.save(config);
  },
);
