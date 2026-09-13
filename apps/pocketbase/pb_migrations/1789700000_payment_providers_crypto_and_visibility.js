/// <reference path="../pb_data/types.d.ts" />

// Task #16 — Payment Gateways Provider-based rebuild.
//
// Adds the schema needed for two real, honest additions on top of the
// existing Stripe flow (which is left untouched — its routes/behavior are
// already tested and working, see Task #15's verification report):
//
//  1) Country/currency-based gateway visibility: `allowed_countries` /
//     `allowed_currencies` on payment_gateways. Empty array (the default) =
//     no restriction, so every existing gateway keeps behaving exactly as
//     before this migration. Stored as real top-level JSON fields (not
//     inside the encrypted `config` blob) because they are plain visibility
//     rules, not secrets.
//
//  2) A genuinely-functional Crypto payment provider — manual/custodial
//     verification (the owner submits an on-chain tx hash + optional proof
//     file for an admin-configured wallet address per asset+network; a
//     Super Admin manually confirms or rejects after checking the chain).
//     No new "crypto_orders" collection is created — this deliberately
//     reuses the EXISTING subscription_orders collection (same anti-
//     duplication principle already applied throughout this project: one
//     order model, multiple gateway types) by adding crypto-specific fields
//     that stay empty/unused for every non-crypto order.

migrate(
  (app) => {
    // ---- payment_gateways: country/currency visibility -------------------
    const gateways = app.findCollectionByNameOrId("payment_gateways");
    if (!gateways.fields.getByName("allowed_countries")) {
      gateways.fields.add(
        new JSONField({ name: "allowed_countries", maxSize: 5000 }),
      );
    }
    if (!gateways.fields.getByName("allowed_currencies")) {
      gateways.fields.add(
        new JSONField({ name: "allowed_currencies", maxSize: 5000 }),
      );
    }
    app.save(gateways);

    // ---- subscription_orders: crypto submission fields --------------------
    const orders = app.findCollectionByNameOrId("subscription_orders");
    const users = app.findCollectionByNameOrId("users");

    if (!orders.fields.getByName("crypto_asset")) {
      orders.fields.add(new TextField({ name: "crypto_asset", max: 20 }));
    }
    if (!orders.fields.getByName("crypto_network")) {
      orders.fields.add(new TextField({ name: "crypto_network", max: 40 }));
    }
    if (!orders.fields.getByName("crypto_tx_hash")) {
      orders.fields.add(new TextField({ name: "crypto_tx_hash", max: 200 }));
    }
    if (!orders.fields.getByName("crypto_notes")) {
      orders.fields.add(new TextField({ name: "crypto_notes", max: 1000 }));
    }
    if (!orders.fields.getByName("crypto_proof")) {
      orders.fields.add(
        new FileField({
          name: "crypto_proof",
          maxSelect: 1,
          maxSize: 20 * 1024 * 1024,
          mimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "application/pdf",
          ],
          // Payment proof is a sensitive financial document — never
          // publicly fetchable by a guessed URL; requires a short-lived
          // file token (same pattern already used elsewhere in this
          // project for protected files).
          protected: true,
        }),
      );
    }
    if (!orders.fields.getByName("crypto_reviewed_by")) {
      orders.fields.add(
        new RelationField({
          name: "crypto_reviewed_by",
          maxSelect: 1,
          collectionId: users.id,
        }),
      );
    }
    if (!orders.fields.getByName("crypto_reviewed_at")) {
      orders.fields.add(new DateField({ name: "crypto_reviewed_at" }));
    }
    app.save(orders);
  },
  (app) => {
    try {
      const gateways = app.findCollectionByNameOrId("payment_gateways");
      ["allowed_countries", "allowed_currencies"].forEach((n) => {
        try { gateways.fields.removeByName(n); } catch (_) {}
      });
      app.save(gateways);
    } catch (_) {}

    try {
      const orders = app.findCollectionByNameOrId("subscription_orders");
      [
        "crypto_asset",
        "crypto_network",
        "crypto_tx_hash",
        "crypto_notes",
        "crypto_proof",
        "crypto_reviewed_by",
        "crypto_reviewed_at",
      ].forEach((n) => {
        try { orders.fields.removeByName(n); } catch (_) {}
      });
      app.save(orders);
    } catch (_) {}
  },
);
