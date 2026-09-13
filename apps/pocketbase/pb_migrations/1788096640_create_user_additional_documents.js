/// <reference path="../pb_data/types.d.ts" />

// Optional additional identity documents for owners (ID card, extra passport,
// extra residence, driver license, other). Fully optional — never part of the
// mandatory verification requirement. Owner-scoped: only the owning user can
// list/view/update/delete their own additional documents.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    const collection = new Collection({
      type: 'base',
      name: 'user_additional_documents',
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'id_card',
            'passport_extra',
            'residence_extra',
            'driver_license',
            'other',
          ],
        },
        { name: 'name', type: 'text', required: false, max: 200 },
        { name: 'number', type: 'text', required: false, max: 120 },
        {
          name: 'file',
          type: 'file',
          required: true,
          maxSelect: 1,
          maxSize: 10 * 1024 * 1024,
          mimeTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
          ],
          protected: true,
        },
        {
          name: 'owner',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('user_additional_documents');
      app.delete(collection);
    } catch (e) {
      if (e.message.includes('no rows in result set')) return;
      throw e;
    }
  },
);
