/// <reference path="../pb_data/types.d.ts" />

// Tenants — normalized tenant records, linked to a property via a `tenancies`
// row (never duplicated onto the property itself). Part of the property
// management rebuild: renting a cash/installment property no longer mutates
// properties.type or re-enters property data — it creates a tenant +
// tenancy (+ rent_payments/checks) linked by property_id/owner_id.
//
// A tenant record can be reused across tenancies over time (a returning
// tenant), but today's flows create one tenant per tenancy for simplicity —
// that is a UI choice, not a schema constraint.
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId('tenants');
    } catch (_) {
      const users = app.findCollectionByNameOrId('users');

      collection = new Collection({
        type: 'base',
        name: 'tenants',
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
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'name', type: 'text', required: true, max: 200 },
          { name: 'phone', type: 'text', max: 40 },
          { name: 'email', type: 'email' },
          { name: 'nationality', type: 'text', max: 100 },
          {
            name: 'id_document',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
            protected: true,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_tenants_owner ON tenants (owner)'],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('tenants');
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes('no rows in result set')) return;
      throw e;
    }
  },
);
