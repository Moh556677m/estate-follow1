/// <reference path="../pb_data/types.d.ts" />

// Manual payment methods (InstaPay, Vodafone Cash, Orange Cash, Etisalat
// Cash/e&, WE Pay, and any future manual wallet type) — generalized version
// of the existing crypto submission flow (1789700000_...js), reused for
// every gateway `type` whose INTEGRATION_TYPE is 'manual' other than crypto
// (crypto keeps its own dedicated crypto_* fields, untouched by this
// migration).
//
// Deliberately generic field names (manual_* rather than one field set per
// wallet type) — a single set of columns serves InstaPay/Vodafone
// Cash/Orange Cash/Etisalat Cash/WE Pay/any future manual method, because
// `manual_method` records which gateway `type` the submission was for. No
// new collection is created — same anti-duplication principle already
// applied throughout this project (one order model, multiple gateway
// types), and no changes to payment_gateways schema are needed at all: the
// per-method configurable fields (identifier, beneficiary name,
// instructions, notes, min/max amount, display order) all flow through the
// EXISTING generic, non-secret `config` JSON blob (see registry.js's
// manualWalletFields()) — no secrets involved, so no encryption needed.
migrate(
  (app) => {
    const orders = app.findCollectionByNameOrId("subscription_orders");
    const users = app.findCollectionByNameOrId("users");

    if (!orders.fields.getByName("manual_method")) {
      orders.fields.add(new TextField({ name: "manual_method", max: 40 }));
    }
    if (!orders.fields.getByName("manual_reference")) {
      orders.fields.add(new TextField({ name: "manual_reference", max: 200 }));
    }
    if (!orders.fields.getByName("manual_notes")) {
      orders.fields.add(new TextField({ name: "manual_notes", max: 1000 }));
    }
    if (!orders.fields.getByName("manual_rejection_reason")) {
      orders.fields.add(new TextField({ name: "manual_rejection_reason", max: 1000 }));
    }
    if (!orders.fields.getByName("manual_proof")) {
      orders.fields.add(
        new FileField({
          name: "manual_proof",
          maxSelect: 1,
          maxSize: 20 * 1024 * 1024,
          mimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "application/pdf",
          ],
          // Payment proof is a sensitive financial document — never publicly
          // fetchable by a guessed URL; requires a short-lived file token
          // (same pattern already used for crypto_proof).
          protected: true,
        }),
      );
    }
    if (!orders.fields.getByName("manual_reviewed_by")) {
      orders.fields.add(
        new RelationField({
          name: "manual_reviewed_by",
          maxSelect: 1,
          collectionId: users.id,
        }),
      );
    }
    if (!orders.fields.getByName("manual_reviewed_at")) {
      orders.fields.add(new DateField({ name: "manual_reviewed_at" }));
    }
    app.save(orders);
  },
  (app) => {
    try {
      const orders = app.findCollectionByNameOrId("subscription_orders");
      [
        "manual_method",
        "manual_reference",
        "manual_notes",
        "manual_rejection_reason",
        "manual_proof",
        "manual_reviewed_by",
        "manual_reviewed_at",
      ].forEach((n) => {
        try { orders.fields.removeByName(n); } catch (_) {}
      });
      app.save(orders);
    } catch (_) {}
  },
);
