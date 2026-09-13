/// <reference path="../pb_data/types.d.ts" />

// Extend the users.account_state select with the verification lifecycle values
// used by the owner verification + referral approval flow:
//   incomplete → pending_review → approved (or rejected / changes back to incomplete).
// Existing accounts keep their current value (active/inactive/suspended).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const f = users.fields.getByName('account_state');
    if (f) {
      f.values = [
        'active',
        'inactive',
        'suspended',
        'incomplete',
        'pending_review',
        'approved',
        'rejected',
      ];
    }
    app.save(users);
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('users');
      const f = users.fields.getByName('account_state');
      if (f) f.values = ['active', 'inactive', 'suspended'];
      app.save(users);
    } catch (e) {
      if (e.message && e.message.includes('no rows in result set')) return;
      throw e;
    }
  },
);
