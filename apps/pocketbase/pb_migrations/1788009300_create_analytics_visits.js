/// <reference path="../pb_data/types.d.ts" />

// Creates the analytics_visits collection to record platform page visits.
// Each visit captures the user, page/section, device type, browser and OS.
// Auto-recorded from the frontend on route changes (from this migration onward).
// Only Super Admin can read visits; any signed-in user can record their own.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "analytics_visits",
      listRule: "@request.auth.is_super_admin = true",
      viewRule: "@request.auth.is_super_admin = true",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.user",
      updateRule: null,
      deleteRule: "@request.auth.is_super_admin = true",
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "page", type: "text", max: 200 },
        { name: "section", type: "text", max: 100 },
        { name: "device_type", type: "text", max: 40 },
        { name: "browser", type: "text", max: 60 },
        { name: "os", type: "text", max: 60 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("analytics_visits");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
