/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('properties');
    if (!collection.fields.getByName('payment_plan_stages')) {
      collection.fields.add(
        new JSONField({
          name: 'payment_plan_stages',
          maxSize: 500000,
        }),
      );
    }
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('properties');
    if (collection.fields.getByName('payment_plan_stages')) {
      collection.fields.removeByName('payment_plan_stages');
    }
    app.save(collection);
  },
);
