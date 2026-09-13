/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('brokerage_companies');

    if (!collection.fields.getByName('owner_country')) {
      collection.fields.add(
        new TextField({
          name: 'owner_country',
          required: false,
          max: 10,
          min: 0,
        }),
      );
    }

    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('brokerage_companies');
      collection.fields.removeByName('owner_country');
      app.save(collection);
    } catch (e) {
      if (String(e).includes('no rows in result set')) return;
      throw e;
    }
  },
);
