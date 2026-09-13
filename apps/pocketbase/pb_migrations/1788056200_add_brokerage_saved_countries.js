/// <reference path="../pb_data/types.d.ts" />

// Owner-saved countries for the brokerage directory (quick-pick chips).
// Stored as a JSON array of ISO codes on the users auth record so the list
// syncs across devices and survives refresh / re-login. Distinct from
// brokerage_saved_places (which holds saved cities).
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    if (!users.fields.getByName('brokerage_saved_countries')) {
      users.fields.add(
        new JSONField({
          name: 'brokerage_saved_countries',
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
      users.fields.removeByName('brokerage_saved_countries');
      app.save(users);
    } catch (_) {}
  },
);
