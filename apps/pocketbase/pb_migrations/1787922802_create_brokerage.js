/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let companies;
    try {
      companies = app.findCollectionByNameOrId('brokerage_companies');
    } catch (_) {
      companies = new Collection({
        type: 'base',
        name: 'brokerage_companies',
        listRule:
          "status = 'approved' || @request.auth.is_super_admin = true",
        viewRule:
          "status = 'approved' || @request.auth.is_super_admin = true",
        createRule: '@request.auth.is_super_admin = true',
        updateRule: '@request.auth.is_super_admin = true',
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          { name: 'name', type: 'text', required: true, max: 200 },
          { name: 'name_ar', type: 'text', max: 200 },
          {
            name: 'logo',
            type: 'file',
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
          },
          { name: 'logo_url', type: 'text', max: 500 },
          { name: 'country', type: 'text', required: true, max: 10 },
          { name: 'city', type: 'text', max: 120 },
          { name: 'city_ar', type: 'text', max: 120 },
          { name: 'description', type: 'text', max: 2000 },
          { name: 'description_ar', type: 'text', max: 2000 },
          { name: 'languages', type: 'text', max: 300 },
          { name: 'specialization', type: 'text', max: 300 },
          { name: 'specialization_ar', type: 'text', max: 300 },
          { name: 'phone', type: 'text', max: 40 },
          { name: 'whatsapp', type: 'text', max: 40 },
          { name: 'email', type: 'email' },
          { name: 'website', type: 'text', max: 500 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pending', 'approved', 'hidden'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_brokerage_co_country ON brokerage_companies (country)',
          'CREATE INDEX idx_brokerage_co_status ON brokerage_companies (status)',
        ],
      });
      app.save(companies);
    }

    let brokers;
    try {
      brokers = app.findCollectionByNameOrId('brokers');
    } catch (_) {
      const co = app.findCollectionByNameOrId('brokerage_companies');
      brokers = new Collection({
        type: 'base',
        name: 'brokers',
        listRule:
          "status = 'approved' || @request.auth.is_super_admin = true",
        viewRule:
          "status = 'approved' || @request.auth.is_super_admin = true",
        createRule: '@request.auth.is_super_admin = true',
        updateRule: '@request.auth.is_super_admin = true',
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          { name: 'name', type: 'text', required: true, max: 200 },
          { name: 'name_ar', type: 'text', max: 200 },
          {
            name: 'photo',
            type: 'file',
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          },
          { name: 'photo_url', type: 'text', max: 500 },
          {
            name: 'company',
            type: 'relation',
            maxSelect: 1,
            collectionId: co.id,
            cascadeDelete: false,
          },
          { name: 'company_name', type: 'text', max: 200 },
          { name: 'country', type: 'text', required: true, max: 10 },
          { name: 'city', type: 'text', max: 120 },
          { name: 'city_ar', type: 'text', max: 120 },
          { name: 'languages', type: 'text', max: 300 },
          { name: 'specialization', type: 'text', max: 300 },
          { name: 'specialization_ar', type: 'text', max: 300 },
          { name: 'phone', type: 'text', max: 40 },
          { name: 'whatsapp', type: 'text', max: 40 },
          { name: 'email', type: 'email' },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pending', 'approved', 'hidden'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_brokers_country ON brokers (country)',
          'CREATE INDEX idx_brokers_status ON brokers (status)',
          'CREATE INDEX idx_brokers_company ON brokers (company)',
        ],
      });
      app.save(brokers);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('brokers'));
    } catch (_) {
      /* ignore */
    }
    try {
      app.delete(app.findCollectionByNameOrId('brokerage_companies'));
    } catch (_) {
      /* ignore */
    }
  },
);
