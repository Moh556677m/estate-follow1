/// <reference path="../pb_data/types.d.ts" />

// Brokerage favorites: a user can save (heart) any approved broker or
// brokerage company and revisit them from the Favorites sidebar section.
// One row per (owner, target_type, target_id); unique index prevents dupes.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    let collection;
    try {
      collection = app.findCollectionByNameOrId('brokerage_favorites');
    } catch (_) {
      collection = new Collection({
        type: 'base',
        name: 'brokerage_favorites',
        listRule:
          "@request.auth.id != '' && @request.auth.id = owner",
        viewRule:
          "@request.auth.id != '' && @request.auth.id = owner",
        createRule:
          "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule:
          "@request.auth.id != '' && @request.auth.id = owner",
        deleteRule:
          "@request.auth.id != '' && @request.auth.id = owner",
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
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      });
      app.save(collection);
    }

    // Ensure the unique index exists (idempotent).
    const hasIdx = (collection.indexes || []).some((i) =>
      String(i).includes('idx_brokerage_fav_unique'),
    );
    if (!hasIdx) {
      collection.indexes.push(
        'CREATE UNIQUE INDEX IF NOT EXISTS `idx_brokerage_fav_unique` ON `brokerage_favorites` (`owner`, target_type, target_id)',
      );
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('brokerage_favorites');
      app.delete(collection);
    } catch (_) {}
  },
);
