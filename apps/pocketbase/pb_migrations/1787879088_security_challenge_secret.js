/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('security_challenges');
    if (!collection.fields.getByName('secret_blob')) {
      collection.fields.add(
        new TextField({
          name: 'secret_blob',
          required: false,
          max: 2000,
        }),
      );
    }
    if (!collection.fields.getByName('expires_ms')) {
      collection.fields.add(
        new NumberField({
          name: 'expires_ms',
          required: false,
          min: 0,
        }),
      );
    }
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('security_challenges');
    try {
      collection.fields.removeByName('secret_blob');
    } catch (_) {}
    try {
      collection.fields.removeByName('expires_ms');
    } catch (_) {}
    app.save(collection);
  },
);
