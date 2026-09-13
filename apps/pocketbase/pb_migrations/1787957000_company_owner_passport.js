/// <reference path="../pb_data/types.d.ts" />

// Owner passport/residence PDF on brokerage company profiles (optional).
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('brokerage_companies');
    if (!collection.fields.getByName('passport_pdf')) {
      collection.fields.add(
        new FileField({
          name: 'passport_pdf',
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ['application/pdf'],
          protected: true,
          required: false,
        }),
      );
      app.save(collection);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('brokerage_companies');
    const f = collection.fields.getByName('passport_pdf');
    if (f) {
      collection.fields.removeById(f.id);
      app.save(collection);
    }
  },
);
