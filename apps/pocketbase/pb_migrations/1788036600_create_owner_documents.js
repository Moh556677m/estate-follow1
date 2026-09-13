/// <reference path="../pb_data/types.d.ts" />

// Owner Documents Center — a single collection for custom documents the owner
// adds manually (extra contracts, tenant documents, personal documents, etc.).
//
// Documents that are already attached to a property (title_deed_pdf,
// lease_contract, tenant_document) or to the owner profile (passport_pdf,
// residence_pdf) are NOT duplicated here — the Documents Center aggregates
// them directly from their source records. Only manually-added documents
// live in this collection, each optionally linked to a property.
//
// All files are protected (token-only access) and the access rules are
// owner-scoped with Super Admin / staff override — never public.
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("owner_documents");
    } catch (_) {
      const users = app.findCollectionByNameOrId("users");
      const properties = app.findCollectionByNameOrId("properties");

      collection = new Collection({
        type: "base",
        name: "owner_documents",
        // Owner-only by default; Super Admin + staff roles may also read.
        listRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        viewRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        deleteRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "name", type: "text", required: true, max: 200 },
          {
            name: "category",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["my_documents", "ownership", "installment", "rental", "tenant"],
          },
          {
            name: "property",
            type: "relation",
            maxSelect: 1,
            collectionId: properties.id,
            cascadeDelete: false,
          },
          { name: "tenant_name", type: "text", max: 200 },
          { name: "tenant_phone", type: "text", max: 40 },
          { name: "tenant_email", type: "email" },
          {
            name: "file",
            type: "file",
            required: true,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: [
              "application/pdf",
              "image/jpeg",
              "image/png",
              "image/webp",
            ],
            protected: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_owner_docs_owner ON owner_documents (owner)",
          "CREATE INDEX idx_owner_docs_category ON owner_documents (category)",
          "CREATE INDEX idx_owner_docs_property ON owner_documents (property)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("owner_documents");
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);
