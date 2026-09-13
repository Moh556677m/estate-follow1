/// <reference path="../pb_data/types.d.ts" />

// Clears every user's saved `default_landing` preference.
//
// The "default landing page after login" feature has been removed from the
// sidebar reorder system — post-login routing now always uses each account
// type's natural home page. Any previously saved landing preference is wiped
// so it can no longer influence old accounts. The `default_landing` JSON
// field itself is left in place (harmless, unused) to avoid extra schema churn.

migrate(
  (app) => {
    let records;
    try {
      records = app.findRecordsByFilter('users', "id != ''");
    } catch (e) {
      if (e.message.includes('no rows in result set')) {
        console.log('No users, nothing to clear');
        return;
      }
      throw e;
    }

    for (const record of records) {
      record.set('default_landing', null);
      app.save(record);
    }
  },
  (app) => {
    // One-way data wipe — rollback is manual (prior values were user-chosen
    // and are not recoverable from this migration).
  },
);
