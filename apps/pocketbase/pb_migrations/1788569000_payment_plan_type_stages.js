/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('properties');
    if (!collection.fields.getByName('payment_plan_type')) {
      collection.fields.add(
        new SelectField({
          name: 'payment_plan_type',
          maxSelect: 1,
          values: ['type1', 'type2', 'type3', 'type4', 'type5'],
        }),
      );
    }
    if (!collection.fields.getByName('plan_custom_stages')) {
      collection.fields.add(
        new JSONField({
          name: 'plan_custom_stages',
          maxSize: 200000,
        }),
      );
    }
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('properties');
    if (collection.fields.getByName('plan_custom_stages')) {
      collection.fields.removeByName('plan_custom_stages');
    }
    if (collection.fields.getByName('payment_plan_type')) {
      collection.fields.removeByName('payment_plan_type');
    }
    app.save(collection);
  },
);
