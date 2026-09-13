/// <reference path="../pb_data/types.d.ts" />

// Brokerage analytics events — profile views + contact/social clicks.
// Brokers/companies read only their own events (owner = profile owner).
// Any signed-in visitor can create an event when viewing/contacting a listing.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    let events;
    try {
      events = app.findCollectionByNameOrId('brokerage_events');
    } catch (_) {
      events = null;
    }

    if (!events) {
      events = new Collection({
        type: 'base',
        name: 'brokerage_events',
        listRule:
          "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = owner)",
        viewRule:
          "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = owner)",
        createRule: "@request.auth.id != ''",
        updateRule: null,
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          {
            name: 'target_type',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['broker', 'company'],
          },
          { name: 'target_id', type: 'text', required: true, max: 60 },
          {
            name: 'event',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: [
              'profile_view',
              'whatsapp',
              'call',
              'email',
              'website',
              'instagram',
              'facebook',
              'tiktok',
              'other',
            ],
          },
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: 'viewer',
            type: 'relation',
            required: false,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_brokerage_events_owner ON brokerage_events (owner, event)',
          'CREATE INDEX idx_brokerage_events_target ON brokerage_events (target_type, target_id, event)',
        ],
      });
      app.save(events);
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('brokerage_events');
      app.delete(col);
    } catch (_) {
      /* already gone */
    }
  },
);
