/// <reference path="../pb_data/types.d.ts" />

// Add a Date of Birth field to the users collection.
// Optional (not required) — owners fill it in their profile at any time.
// Non-destructive: existing rows keep their current (empty) value.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('users');

    const existing = collection.fields.getByName('date_of_birth');
    if (existing) {
      if (existing.type === 'date') return; // correct type already
      collection.fields.removeByName('date_of_birth');
    }

    collection.fields.add(
      new DateField({
        name: 'date_of_birth',
        required: false,
      }),
    );
    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('users');
      collection.fields.removeByName('date_of_birth');
      app.save(collection);
    } catch (e) {
      if (e.message && e.message.includes('no rows in result set')) {
        console.log('Collection not found, skipping revert');
        return;
      }
      throw e;
    }
  },
);
