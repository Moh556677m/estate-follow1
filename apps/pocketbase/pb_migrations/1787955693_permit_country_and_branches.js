/// <reference path="../pb_data/types.d.ts" />

// 1) Add optional `country` to brokerage_permits.
// 2) Create brokerage_branches for company multi-branch listings.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const companies = app.findCollectionByNameOrId('brokerage_companies');

    const permits = app.findCollectionByNameOrId('brokerage_permits');
    if (!permits.fields.getByName('country')) {
      permits.fields.add(
        new TextField({
          name: 'country',
          required: false,
          max: 10,
        }),
      );
      app.save(permits);
    }

    let branches;
    try {
      branches = app.findCollectionByNameOrId('brokerage_branches');
    } catch (_) {
      branches = new Collection({
        type: 'base',
        name: 'brokerage_branches',
        // Any signed-in user can read (public company profile in directory).
        // Writes stay owner-scoped.
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true)",
        deleteRule:
          "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true)",
        fields: [
          {
            name: 'company',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: companies.id,
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
          { name: 'name', type: 'text', required: true, max: 200 },
          { name: 'country', type: 'text', required: true, max: 10 },
          { name: 'city', type: 'text', required: true, max: 120 },
          { name: 'license_number', type: 'text', max: 120 },
          {
            name: 'license_pdf',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['application/pdf'],
            protected: true,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_brokerage_branches_company ON brokerage_branches (company)',
          'CREATE INDEX idx_brokerage_branches_owner ON brokerage_branches (owner)',
        ],
      });
      app.save(branches);
    }
  },
  (app) => {
    try {
      const branches = app.findCollectionByNameOrId('brokerage_branches');
      app.delete(branches);
    } catch (e) {
      if (!String(e.message || '').includes('no rows in result set')) throw e;
    }
    try {
      const permits = app.findCollectionByNameOrId('brokerage_permits');
      const f = permits.fields.getByName('country');
      if (f) {
        permits.fields.removeByName('country');
        app.save(permits);
      }
    } catch (e) {
      if (!String(e.message || '').includes('no rows in result set')) throw e;
    }
  },
);
