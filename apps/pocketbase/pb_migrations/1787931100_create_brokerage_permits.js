/// <reference path="../pb_data/types.d.ts" />

// Additional permits / licenses for broker and brokerage company profiles.
// Each permit is its own row (name, optional number, PDF) so brokers and
// companies can attach more than one extra credential. Private to the owner
// and Super Admin — not exposed in the public directory.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    const collection = new Collection({
      type: 'base',
      name: 'brokerage_permits',
      listRule:
        "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true)",
      createRule:
        "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule:
        "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true)",
      deleteRule:
        "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.is_super_admin = true)",
      fields: [
        {
          name: 'target_type',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['broker', 'company'],
        },
        { name: 'target_id', type: 'text', required: true, max: 60 },
        {
          name: 'owner',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: 'name', type: 'text', required: true, max: 200 },
        { name: 'number', type: 'text', max: 120 },
        {
          name: 'pdf',
          type: 'file',
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ['application/pdf'],
          protected: true,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('brokerage_permits');
      app.delete(collection);
    } catch (e) {
      if (e.message.includes('no rows in result set')) return;
      throw e;
    }
  },
);
