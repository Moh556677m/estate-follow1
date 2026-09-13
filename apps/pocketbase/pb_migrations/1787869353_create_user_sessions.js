/// <reference path="../pb_data/types.d.ts" />

// Tracks registered devices and active sessions per user.
// Limits enforced in pb_hooks/sessions.pb.js:
//   - max 5 registered devices per account
//   - max 3 simultaneous active sessions per account
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "user_sessions",
      listRule: "@request.auth.id != '' && @request.auth.id = user",
      viewRule: "@request.auth.id != '' && @request.auth.id = user",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && @request.auth.id = user",
      deleteRule: "@request.auth.id != '' && @request.auth.id = user",
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "device_id", type: "text", required: true, max: 100 },
        { name: "device_name", type: "text", max: 200 },
        { name: "device_type", type: "text", max: 40 },
        { name: "browser", type: "text", max: 120 },
        { name: "active", type: "bool" },
        { name: "last_active", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_user_session_device` ON `user_sessions` (`user`, `device_id`)",
        "CREATE INDEX `idx_user_session_user` ON `user_sessions` (`user`)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("user_sessions");
      app.delete(collection);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
