/// <reference path="../pb_data/types.d.ts" />

// Remove demo "broker" and "brokerage company" accounts and their profile
// records. The platform is owner-only now (regular owners + Super Admin).
// Real owner accounts are never touched — only rows whose account_type is
// explicitly "broker" or "company" are deleted.

migrate(
  (app) => {
    // Defensive: on a FRESH database (first deploy, or migrations replayed
    // from scratch), migrations run strictly in filename/timestamp order.
    // This file's timestamp (1774934500) is EARLIER than
    // 1787926229_brokerage_profiles.js, which is what actually adds the
    // `account_type` field to `users`. That means step 3 below (which
    // filters `users` by `account_type`) can run before the field exists,
    // and PocketBase's filter parser throws "unknown field" — aborting the
    // whole migration chain and leaving PocketBase perpetually unhealthy
    // ("PocketBase not ready, retrying" on the API side). If the field or
    // collection genuinely doesn't exist yet, there is nothing to clean up
    // here, so treat that the same as "no rows" instead of failing the boot.
    const safeFilter = (collection, filter, params) => {
      try {
        return app.findRecordsByFilter(collection, filter, '-created', 1000, 0, params || {});
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        if (
          msg.indexOf('no rows') >= 0 ||
          msg.indexOf('no result') >= 0 ||
          msg.indexOf('unknown field') >= 0 ||
          msg.indexOf('unknown collection') >= 0 ||
          msg.indexOf('no such column') >= 0 ||
          msg.indexOf('missing collection context') >= 0
        ) {
          return [];
        }
        throw e;
      }
    };

    const deleteSessions = (userId) => {
      try {
        const sess = safeFilter('user_sessions', 'user = {:uid}', { uid: userId });
        for (const s of sess) {
          try {
            app.delete(s);
          } catch (_) {}
        }
      } catch (_) {}
    };

    const deleteOwnerIfBrokerOrCompany = (ownerId) => {
      if (!ownerId) return;
      try {
        const u = app.findRecordById('users', ownerId);
        const at = String(u.get('account_type') || '').toLowerCase();
        if (at === 'broker' || at === 'company') {
          deleteSessions(ownerId);
          try {
            app.delete(u);
          } catch (_) {}
        }
      } catch (_) {}
    };

    // 1) Broker profiles + their owner accounts.
    const brokers = safeFilter('brokers', "id != ''");
    for (const b of brokers) {
      let ownerId = '';
      try {
        ownerId = String(b.get('owner') || '');
      } catch (_) {}
      deleteOwnerIfBrokerOrCompany(ownerId);
      try {
        app.delete(b);
      } catch (_) {}
    }

    // 2) Brokerage company profiles + their owner accounts.
    const companies = safeFilter('brokerage_companies', "id != ''");
    for (const c of companies) {
      let ownerId = '';
      try {
        ownerId = String(c.get('owner') || '');
      } catch (_) {}
      deleteOwnerIfBrokerOrCompany(ownerId);
      try {
        app.delete(c);
      } catch (_) {}
    }

    // 3) Any remaining broker/company user accounts without a profile row.
    const orphans = safeFilter(
      'users',
      "account_type = 'broker' || account_type = 'company'",
    );
    for (const u of orphans) {
      deleteSessions(u.id);
      try {
        app.delete(u);
      } catch (_) {}
    }
  },
  (app) => {
    // Deleted demo accounts cannot be recreated.
  },
);
