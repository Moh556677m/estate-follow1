/// <reference path="../pb_data/types.d.ts" />

// Tenancies — a rental "status" linked to an existing property via
// `property` (property_id) + `owner` (owner_id), never a duplicate property
// row and never a destructive mutation of properties.type.
//
// Renting out a cash/installment property creates ONE tenancy row here; the
// property keeps its original type (cash/installment) forever. A property
// can have many tenancies over time (one per lease) but at most one with
// status = "active" is expected at once — enforced in the app layer, not the
// DB, so a lease can be safely re-created after data issues without a rigid
// constraint blocking recovery.
//
// tenant_name / tenant_phone / tenant_email are a denormalized snapshot
// (fast list rendering without a join) alongside the `tenant` relation to
// the normalized `tenants` record — both are kept in sync by the app.
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId('tenancies');
    } catch (_) {
      const users = app.findCollectionByNameOrId('users');
      const properties = app.findCollectionByNameOrId('properties');
      const tenants = app.findCollectionByNameOrId('tenants');

      collection = new Collection({
        type: 'base',
        name: 'tenancies',
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
            name: 'property',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: properties.id,
            cascadeDelete: true,
          },
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: 'tenant',
            type: 'relation',
            maxSelect: 1,
            collectionId: tenants.id,
            cascadeDelete: false,
          },
          { name: 'tenant_name', type: 'text', max: 200 },
          { name: 'tenant_phone', type: 'text', max: 40 },
          { name: 'tenant_email', type: 'email' },
          { name: 'tenant_nationality', type: 'text', max: 100 },
          {
            name: 'lease_contract',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
            protected: true,
          },
          { name: 'start_date', type: 'date' },
          { name: 'end_date', type: 'date' },
          { name: 'security_deposit', type: 'number', min: 0 },
          { name: 'payments_count', type: 'number', min: 0 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['active', 'ended'],
          },
          { name: 'notes', type: 'text', max: 2000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_tenancies_property ON tenancies (property)',
          'CREATE INDEX idx_tenancies_owner ON tenancies (owner)',
          'CREATE INDEX idx_tenancies_status ON tenancies (status)',
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('tenancies');
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes('no rows in result set')) return;
      throw e;
    }
  },
);
