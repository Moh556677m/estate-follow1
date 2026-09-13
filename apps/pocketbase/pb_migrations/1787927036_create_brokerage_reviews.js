/// <reference path="../pb_data/types.d.ts" />

// Brokerage reviews + ratings.
// - New `brokerage_reviews` collection: 1-5 star rating + short review per
//   broker/company, one review per user per target (unique index).
// - `rating_avg` / `rating_count` aggregate fields added to brokers and
//   brokerage_companies so the directory can sort/filter by rating without
//   recomputing client-side. A hook keeps them in sync on review changes.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    let reviews;
    try {
      reviews = app.findCollectionByNameOrId('brokerage_reviews');
    } catch (_) {
      reviews = new Collection({
        type: 'base',
        name: 'brokerage_reviews',
        // Any signed-in user can read reviews (directory is auth-gated).
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        // Author must set themselves as the user.
        createRule:
          "@request.auth.id != '' && @request.auth.id = @request.body.user",
        // Only the author may edit their own review.
        updateRule: "@request.auth.id != '' && @request.auth.id = user",
        // Author or Super Admin may delete (moderation).
        deleteRule:
          "@request.auth.id != '' && (@request.auth.id = user || @request.auth.is_super_admin = true)",
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
            name: 'user',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'rating', type: 'number', required: true, min: 1, max: 5 },
          { name: 'review', type: 'text', max: 1000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_review_unique ON brokerage_reviews (`user`, target_type, target_id)',
          'CREATE INDEX idx_review_target ON brokerage_reviews (target_type, target_id)',
        ],
      });
      app.save(reviews);
    }

    // Aggregate rating fields on brokers + companies.
    const addRatingFields = (colName) => {
      const col = app.findCollectionByNameOrId(colName);
      const add = (field) => {
        try {
          if (!col.fields.getByName(field.name)) {
            col.fields.add(field);
          }
        } catch (_) {
          col.fields.add(field);
        }
      };
      add(new NumberField({ name: 'rating_avg', min: 0, max: 5 }));
      add(new NumberField({ name: 'rating_count', min: 0 }));
      app.save(col);
    };

    addRatingFields('brokers');
    addRatingFields('brokerage_companies');
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('brokerage_reviews'));
    } catch (_) {}
    const removeRatingFields = (colName) => {
      try {
        const col = app.findCollectionByNameOrId(colName);
        try { col.fields.removeByName('rating_avg'); } catch (_) {}
        try { col.fields.removeByName('rating_count'); } catch (_) {}
        app.save(col);
      } catch (_) {}
    };
    removeRatingFields('brokers');
    removeRatingFields('brokerage_companies');
  },
);
