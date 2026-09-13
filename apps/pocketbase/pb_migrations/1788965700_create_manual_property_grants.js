/// <reference path="../pb_data/types.d.ts" />

// Manual property grants — a COMPLETELY SEPARATE system from paid subscriptions.
//
// This collection stores admin-granted property allowances for special cases
// (demo accounts, VIP clients, gifts). It is intentionally independent of:
//   - subscription_settings (public package definitions)
//   - subscription_orders / Stripe payment flow
//   - the user's subscription_package / subscription_start / subscription_end
//
// When an active manual grant exists for a user, it takes PRIORITY over the
// paid subscription limit during property-create enforcement (see
// subscription-enforcement.pb.js). The paid subscription state is never
// mutated by this system — granting/removing a manual grant does not touch
// subscription_package, subscription_start, or subscription_end.
//
// One row per user (unique index on `user`): granting upserts, removing deletes.
// Super Admin only — every rule is locked to @request.auth.is_super_admin.

migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId('manual_property_grants');
    } catch (_) {
      const users = app.findCollectionByNameOrId('users');

      collection = new Collection({
        type: 'base',
        name: 'manual_property_grants',
        listRule: '@request.auth.is_super_admin = true || @request.auth.id = user',
        viewRule: '@request.auth.is_super_admin = true || @request.auth.id = user',
        createRule: '@request.auth.is_super_admin = true',
        updateRule: '@request.auth.is_super_admin = true',
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: 'granted_by',
            type: 'relation',
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: 'grant_type',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['limited', 'unlimited'],
          },
          {
            name: 'property_limit',
            type: 'number',
            min: 0,
            onlyInt: true,
          },
          { name: 'note', type: 'text', max: 500 },
          { name: 'active', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_manual_grant_user ON manual_property_grants (user)',
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('manual_property_grants');
      app.delete(collection);
    } catch (e) {
      if (!e.message.includes('no rows in result set')) throw e;
    }
  },
);
