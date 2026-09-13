/// <reference path="../pb_data/types.d.ts" />

// Adds per-user sidebar preferences to the `users` collection:
//   sidebar_order   — JSON object keyed by surface scope (owner/broker/company/admin)
//                     mapping to an ordered array of nav item keys.
//   default_landing — JSON object keyed by surface scope mapping to the
//                     preferred landing page key after login.
// Both are owner-scoped (the signed-in user reads/writes their own record),
// sync across devices, and persist across refresh / logout / language switch.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    if (!users.fields.getByName('sidebar_order')) {
      users.fields.add(
        new JSONField({
          name: 'sidebar_order',
          maxSize: 200000,
        }),
      );
    }

    if (!users.fields.getByName('default_landing')) {
      users.fields.add(
        new JSONField({
          name: 'default_landing',
          maxSize: 200000,
        }),
      );
    }

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    try {
      users.fields.removeByName('sidebar_order');
    } catch (_) {}
    try {
      users.fields.removeByName('default_landing');
    } catch (_) {}
    app.save(users);
  },
);
