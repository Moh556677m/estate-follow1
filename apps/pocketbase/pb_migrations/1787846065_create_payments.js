/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("payments");
    } catch (_) {
      const users = app.findCollectionByNameOrId("users");
      const properties = app.findCollectionByNameOrId("properties");

      collection = new Collection({
        type: "base",
        name: "payments",
        listRule: "@request.auth.id = owner || @request.auth.role = 'admin'",
        viewRule: "@request.auth.id = owner || @request.auth.role = 'admin'",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id = owner || @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id = owner || @request.auth.role = 'admin'",
        fields: [
          {
            name: "property",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: properties.id,
            cascadeDelete: true,
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "kind",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["installment", "rent"],
          },
          { name: "label", type: "text", max: 120 },
          { name: "amount", type: "number", required: true, min: 0 },
          { name: "due_date", type: "date", required: true },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["upcoming", "paid", "overdue"],
          },
          { name: "reminder_sent", type: "bool" },
          { name: "paid_at", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_payments_owner ON payments (owner)",
          "CREATE INDEX idx_payments_property ON payments (property)",
          "CREATE INDEX idx_payments_due ON payments (due_date, status)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("payments");
      app.delete(collection);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
