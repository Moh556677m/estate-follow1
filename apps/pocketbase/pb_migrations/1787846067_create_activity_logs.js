/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("activity_logs");
    } catch (_) {
      const users = app.findCollectionByNameOrId("users");

      collection = new Collection({
        type: "base",
        name: "activity_logs",
        listRule: "@request.auth.role = 'admin' || @request.auth.id = user",
        viewRule: "@request.auth.role = 'admin' || @request.auth.id = user",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: "user",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "action", type: "text", required: true, max: 120 },
          { name: "entity", type: "text", max: 60 },
          { name: "entity_id", type: "text", max: 60 },
          { name: "details", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE INDEX idx_activity_user ON activity_logs (user, created)"],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("activity_logs");
      app.delete(collection);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
