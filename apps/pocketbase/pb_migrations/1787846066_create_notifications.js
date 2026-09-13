/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("notifications");
    } catch (_) {
      const users = app.findCollectionByNameOrId("users");

      collection = new Collection({
        type: "base",
        name: "notifications",
        listRule: "@request.auth.id = user",
        viewRule: "@request.auth.id = user",
        createRule: "@request.auth.role = 'admin'",
        updateRule: "@request.auth.id = user",
        deleteRule: "@request.auth.id = user || @request.auth.role = 'admin'",
        fields: [
          {
            name: "user",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "title", type: "text", required: true, max: 300 },
          { name: "body", type: "text", max: 2000 },
          {
            name: "type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["reminder", "status", "system"],
          },
          { name: "read", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE INDEX idx_notifications_user ON notifications (user, read)"],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("notifications");
      app.delete(collection);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
