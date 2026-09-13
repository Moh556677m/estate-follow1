/// <reference path="../pb_data/types.d.ts" />

// Payment methods audit: `allowed_countries` (added in
// 1789700000_payment_providers_crypto_and_visibility.js) is an ALLOW-list —
// it can restrict a gateway to only show in specific countries, but it has
// no way to express "show everywhere EXCEPT these countries" without the
// admin manually listing every other country. Adding a separate
// `blocked_countries` DENY-list field covers that case cleanly:
//   - empty allowed_countries + empty blocked_countries = show everywhere
//     (unchanged default behavior for every existing gateway)
//   - non-empty allowed_countries = show ONLY in those countries
//   - non-empty blocked_countries = show everywhere EXCEPT those countries
//   - both set = allowed_countries narrows first, then blocked_countries
//     removes any of those that are also blocked (blocked always wins)
migrate(
  (app) => {
    const gateways = app.findCollectionByNameOrId("payment_gateways");
    if (!gateways.fields.getByName("blocked_countries")) {
      gateways.fields.add(
        new JSONField({ name: "blocked_countries", maxSize: 5000 }),
      );
    }
    app.save(gateways);
  },
  (app) => {
    try {
      const gateways = app.findCollectionByNameOrId("payment_gateways");
      try { gateways.fields.removeByName("blocked_countries"); } catch (_) {}
      app.save(gateways);
    } catch (_) {}
  },
);
