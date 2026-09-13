/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("properties");
    } catch (_) {
      const users = app.findCollectionByNameOrId("users");
      const pdf = ["application/pdf"];
      const maxFile = 10 * 1024 * 1024; // 10MB

      collection = new Collection({
        type: "base",
        name: "properties",
        listRule: "@request.auth.id = owner || @request.auth.role = 'admin'",
        viewRule: "@request.auth.id = owner || @request.auth.role = 'admin'",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule:
          "(@request.auth.id = owner || @request.auth.role = 'admin') && (@request.body.status:isset = false || @request.auth.role = 'admin')",
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["installment", "rented"],
          },
          { name: "area", type: "text", required: true, max: 200 },
          { name: "building", type: "text", required: true, max: 200 },
          { name: "unit_number", type: "text", required: true, max: 60 },
          { name: "owner_phone", type: "text", required: true, max: 40 },
          { name: "owner_email", type: "email", required: true },
          {
            name: "passport_pdf",
            type: "file",
            required: true,
            maxSelect: 1,
            maxSize: maxFile,
            mimeTypes: pdf,
            protected: true,
          },
          {
            name: "residence_pdf",
            type: "file",
            maxSelect: 1,
            maxSize: maxFile,
            mimeTypes: pdf,
            protected: true,
          },
          {
            name: "title_deed_pdf",
            type: "file",
            required: true,
            maxSelect: 1,
            maxSize: maxFile,
            mimeTypes: pdf,
            protected: true,
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pending", "approved", "rejected", "suspended"],
          },
          { name: "review_note", type: "text", max: 1000 },
          // Installment plan fields
          { name: "total_price", type: "number", min: 0 },
          { name: "down_payment", type: "number", min: 0 },
          { name: "total_paid", type: "number", min: 0 },
          { name: "installment_amount", type: "number", min: 0 },
          // Rental fields
          { name: "tenant_name", type: "text", max: 200 },
          { name: "tenant_phone", type: "text", max: 40 },
          { name: "tenant_email", type: "email" },
          {
            name: "tenant_document",
            type: "file",
            maxSelect: 1,
            maxSize: maxFile,
            mimeTypes: pdf,
            protected: true,
          },
          {
            name: "lease_contract",
            type: "file",
            maxSelect: 1,
            maxSize: maxFile,
            mimeTypes: pdf,
            protected: true,
          },
          { name: "rent_amount", type: "number", min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_properties_owner ON properties (owner)",
          "CREATE INDEX idx_properties_status ON properties (status)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("properties");
      app.delete(collection);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
