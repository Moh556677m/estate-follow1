/// <reference path="../pb_data/types.d.ts" />

// Migrate existing user accounts into the new verification lifecycle.
//
// Before the referral + owner-verification system, accounts used
// account_state = "active" (or empty) for full access. The new lifecycle
// uses "approved" as the verified, full-access state and gates
// incomplete / pending_review / rejected accounts out of the owner dashboard.
//
// To apply the system to old accounts WITHOUT deleting data or forcing
// re-verification, every existing account that was effectively "active" is
// marked "approved" and stamped approved_at. They immediately receive the
// verified badge and keep full access. Suspended / inactive accounts keep
// their current state (admin actions preserved). Super Admin is untouched.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const all = app.findAllRecords(users);
    const nowIso = new Date().toISOString();
    all.forEach((rec) => {
      // Super Admin bypasses the lifecycle entirely.
      if (rec.getBool('is_super_admin')) return;
      const state = String(rec.get('account_state') || '').toLowerCase();
      // Only migrate accounts that held full access before the new system.
      // Leave suspended / inactive as-is so prior admin actions are preserved.
      if (state === 'active' || state === '') {
        rec.set('account_state', 'approved');
        if (!rec.get('approved_at')) rec.set('approved_at', nowIso);
        // Legacy accounts could already log in, so their email is proven.
        try {
          rec.set('verified', true);
        } catch (_) {}
        app.save(rec);
      }
    });
  },
  (app) => {
    // Non-destructive rollback: revert migrated accounts back to "active".
    try {
      const users = app.findCollectionByNameOrId('users');
      const all = app.findAllRecords(users);
      all.forEach((rec) => {
        if (rec.getBool('is_super_admin')) return;
        const state = String(rec.get('account_state') || '').toLowerCase();
        if (state === 'approved') {
          rec.set('account_state', 'active');
          app.save(rec);
        }
      });
    } catch (e) {
      if (e.message && e.message.includes('no rows in result set')) return;
      throw e;
    }
  },
);
