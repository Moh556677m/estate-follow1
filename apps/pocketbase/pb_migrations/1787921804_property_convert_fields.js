/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('properties');
    if (!collection.fields.getByName('financing_details')) {
      collection.fields.add(
        new TextField({
          name: 'financing_details',
          required: false,
          max: 1000,
        }),
      );
    }
    if (!collection.fields.getByName('installment_plan_completed')) {
      collection.fields.add(
        new BoolField({
          name: 'installment_plan_completed',
        }),
      );
    }
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('properties');
    try {
      collection.fields.removeByName('financing_details');
    } catch (_) {
      /* ignore */
    }
    try {
      collection.fields.removeByName('installment_plan_completed');
    } catch (_) {
      /* ignore */
    }
    app.save(collection);
  },
);
