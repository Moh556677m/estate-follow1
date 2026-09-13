/// <reference path="../pb_data/types.d.ts" />

// Currency-per-country system.
//
// New `country_currency_settings` collection: one row per country the admin
// has configured, holding which currency/currencies apply there. Empty
// collection (the default, day one) = every country falls back to the
// existing single global currency exactly as before this migration — fully
// backward compatible, no behavior change until an admin actually adds a
// row.
//
//   - `country`        ISO-3166 alpha-2 code, e.g. "AE", "EG", "US".
//   - `default_currency` the currency shown/charged by default for that
//                       country, e.g. "AED".
//   - `currencies`      JSON array of every currency code allowed for that
//                       country (admin may allow more than one) — always
//                       includes `default_currency`.
//
// Read access mirrors the existing `plans` collection (any authenticated
// user — they need to resolve their own currency for checkout); write is
// Super-Admin-only, same convention as every other admin-config collection
// in this project (plans, feature_entitlements, payment_gateways).
//
// Plans also get a new optional `currency_prices` JSON field: an admin can
// set a per-currency price override — e.g. { "EGP": { "price": 4500,
// "discount_price": 0 }, "AED": { "price": 400 } } — for any currency a
// country resolves to. When a currency has no override, checkout falls back
// to the plan's existing base `price`/`currency` fields exactly as before —
// no behavior change for any plan/country the admin hasn't configured.
migrate(
  (app) => {
    // ---- country_currency_settings ----
    let settings;
    try {
      settings = app.findCollectionByNameOrId("country_currency_settings");
    } catch (_) {
      settings = new Collection({
        type: "base",
        name: "country_currency_settings",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "country", type: "text", required: true, max: 10 },
          { name: "default_currency", type: "text", required: true, max: 10 },
          { name: "currencies", type: "json", maxSize: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_country_currency_settings_country ON country_currency_settings (country)",
        ],
      });
      app.save(settings);
    }

    // ---- plans.currency_prices ----
    const plans = app.findCollectionByNameOrId("plans");
    if (!plans.fields.getByName("currency_prices")) {
      plans.fields.add(new JSONField({ name: "currency_prices", maxSize: 5000 }));
      app.save(plans);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("country_currency_settings"));
    } catch (_) {}
    try {
      const plans = app.findCollectionByNameOrId("plans");
      try { plans.fields.removeByName("currency_prices"); } catch (_) {}
      app.save(plans);
    } catch (_) {}
  },
);
