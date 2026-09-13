/// <reference path="../pb_data/types.d.ts" />

// Add a free-text `job_title` field to the brokers collection (e.g. CEO,
// Founder, Property Consultant). Required at first profile creation only;
// preserved on every subsequent edit (routine + sensitive save paths).
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('brokers');

    if (collection.fields.getByName('job_title')) return;

    collection.fields.add(
      new TextField({
        name: 'job_title',
        required: false,
        max: 120,
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('brokers');
      collection.fields.removeByName('job_title');
      app.save(collection);
    } catch (e) {
      if (String(e).includes('no rows in result set')) return;
      throw e;
    }
  },
);
