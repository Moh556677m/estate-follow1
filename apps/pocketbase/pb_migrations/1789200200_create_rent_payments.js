/// <reference path="../pb_data/types.d.ts" />

// Rent payments ("checks") — one row per cheque/payment expected under a
// tenancy. Linked via `tenancy` + `property` + `owner` (never duplicated
// property data). Separate from the legacy `payments` collection (which
// still holds installment rows and legacy kind="rent" rows for old data) so
// the new rental flow never depends on payments.kind="rent" again.
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId('rent_payments');
    } catch (_) {
      const users = app.findCollectionByNameOrId('users');
      const properties = app.findCollectionByNameOrId('properties');
      const tenancies = app.findCollectionByNameOrId('tenancies');

      collection = new Collection({
        type: 'base',
        name: 'rent_payments',
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
            name: 'tenancy',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: tenancies.id,
            cascadeDelete: true,
          },
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
          { name: 'check_number', type: 'number', min: 0 },
          { name: 'amount', type: 'number', required: true, min: 0 },
          { name: 'due_date', type: 'date', required: true },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pending', 'collected', 'bounced'],
          },
          { name: 'collected_at', type: 'date' },
          { name: 'note', type: 'text', max: 500 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_rent_payments_tenancy ON rent_payments (tenancy)',
          'CREATE INDEX idx_rent_payments_property ON rent_payments (property)',
          'CREATE INDEX idx_rent_payments_owner ON rent_payments (owner)',
          'CREATE INDEX idx_rent_payments_due ON rent_payments (due_date, status)',
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('rent_payments');
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes('no rows in result set')) return;
      throw e;
    }
  },
);
