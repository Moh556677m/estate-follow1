/// <reference path="../pb_data/types.d.ts" />

// Adds subscription_start on users so paid packages can show an explicit
// start date (end = start + 1 year − 1 day). Existing rows keep their
// subscription_end; the UI back-calculates start when this field is empty.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    if (!users.fields.getByName('subscription_start')) {
      users.fields.add(new DateField({ name: 'subscription_start' }));
      app.save(users);
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    if (users.fields.getByName('subscription_start')) {
      users.fields.removeByName('subscription_start');
      app.save(users);
    }
  },
);
