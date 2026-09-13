/// <reference path="../pb_data/types.d.ts" />

// Keep existing city data; stop requiring city on new/updated branches.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('brokerage_branches');
    const field = collection.fields.getByName('city');
    if (field) {
      field.required = false;
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('brokerage_branches');
      const field = collection.fields.getByName('city');
      if (field) {
        field.required = true;
        app.save(collection);
      }
    } catch (e) {
      if (String(e).includes('no rows')) return;
      throw e;
    }
  },
);
