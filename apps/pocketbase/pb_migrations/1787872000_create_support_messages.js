/// <reference path="../pb_data/types.d.ts" />

// Support & Help — stores support requests submitted by owners/admins.
// A PocketBase hook emails each new request to support@estatefollow.com.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const collection = new Collection({
      type: "base",
      name: "support_messages",
      // Owner can read their own requests; admins can read all.
      listRule:
        "@request.auth.id != '' && (@request.auth.id = user || @request.auth.role = 'admin')",
      viewRule:
        "@request.auth.id != '' && (@request.auth.id = user || @request.auth.role = 'admin')",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && @request.auth.id = user",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "contact_email", type: "email", required: true },
        { name: "subject", type: "text", required: true, max: 200 },
        { name: "message", type: "text", required: true, max: 5000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("support_messages");
    app.delete(collection);
  },
);
