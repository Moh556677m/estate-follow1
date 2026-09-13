/// <reference path="../pb_data/types.d.ts" />

// Payment Gateways — flexible, multi-gateway payment configuration.
// Stores encrypted secrets inside a `config` json blob. The Express API
// (apps/api/src/routes/payment-gateways.js) handles encryption/decryption and
// only ever returns MASKED secrets to the browser. Direct REST access is
// Super-Admin-only; the Express superuser client bypasses rules.
//
// `type` is a plain text field (not a select) so new gateway types can be
// added in the future by simply extending the frontend GATEWAY_TYPES registry
// — no schema migration required to support a new provider.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // ---- payment_gateways collection ----
    let gateways;
    try {
      gateways = app.findCollectionByNameOrId("payment_gateways");
    } catch (_) {
      gateways = new Collection({
        type: "base",
        name: "payment_gateways",
        // Super Admin only via REST. Express superuser bypasses rules.
        listRule: "@request.auth.is_super_admin = true",
        viewRule: "@request.auth.is_super_admin = true",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "type", type: "text", required: true, max: 40 },
          { name: "label", type: "text", required: true, max: 120 },
          {
            name: "mode",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["test", "live"],
          },
          { name: "active", type: "bool" },
          { name: "config", type: "json", maxSize: 200000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_payment_gateways_type ON payment_gateways (type)",
          "CREATE INDEX idx_payment_gateways_active ON payment_gateways (active)",
        ],
      });
      app.save(gateways);
    }

    // ---- add optional `gateway` field to subscription_orders ----
    // Records which payment gateway the user chose for an upgrade request.
    try {
      const orders = app.findCollectionByNameOrId("subscription_orders");
      let hasGateway = false;
      try {
        hasGateway = !!orders.fields.getByName("gateway");
      } catch (_) {
        hasGateway = false;
      }
      if (!hasGateway) {
        orders.fields.add(new TextField({ name: "gateway", max: 40 }));
        app.save(orders);
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("payment_gateways");
      app.delete(col);
    } catch (_) {}
    try {
      const orders = app.findCollectionByNameOrId("subscription_orders");
      orders.fields.removeByName("gateway");
      app.save(orders);
    } catch (_) {}
  },
);
