/// <reference path="../pb_data/types.d.ts" />

// Sensitive profile updates (name, passport, license, permits) for APPROVED
// brokers/companies are stored here for admin review instead of being applied
// directly to the live record. The live record keeps showing the old approved
// data until an admin approves the pending update.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const collection = new Collection({
      type: "base",
      name: "brokerage_pending_updates",
      listRule:
        "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
      viewRule:
        "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule:
        "@request.auth.id != '' && (@request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom' || @request.auth.id = owner)",
      deleteRule:
        "@request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
      fields: [
        {
          name: "target_type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["broker", "company"],
        },
        { name: "target_id", type: "text", required: true, max: 60 },
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "field_changes", type: "json", maxSize: 200000 },
        {
          name: "new_passport_pdf",
          type: "file",
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ["application/pdf"],
          protected: true,
        },
        {
          name: "new_license_pdf",
          type: "file",
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ["application/pdf"],
          protected: true,
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "approved", "rejected"],
        },
        { name: "review_note", type: "text", max: 2000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("brokerage_pending_updates");
    app.delete(collection);
  },
);
