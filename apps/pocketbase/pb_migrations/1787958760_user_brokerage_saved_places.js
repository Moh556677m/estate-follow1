/// <reference path="../pb_data/types.d.ts" />

// Owner-saved countries/cities for the brokerage directory (quick picks).
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    if (!users.fields.getByName('brokerage_saved_places')) {
      users.fields.add(
        new JSONField({
          name: 'brokerage_saved_places',
          required: false,
          maxSize: 200000,
        }),
      );
      app.save(users);
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    try {
      users.fields.removeByName('brokerage_saved_places');
      app.save(users);
    } catch (_) {}
  },
);
