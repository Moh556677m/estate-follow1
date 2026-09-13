/// <reference path="../pb_data/types.d.ts" />

// Relax brokerage_reviews createRule: the onRecordCreateRequest hook already
// forces `user = auth.id`, so the `@request.body.user` check is redundant and
// can cause spurious failures. Keep only "must be signed in" here; the hook
// remains the authorship enforcer. (Change 3: fix "Failed to create record".)

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('brokerage_reviews');
    col.createRule = '@request.auth.id != \'\'';
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId('brokerage_reviews');
    col.createRule =
      '@request.auth.id != \'\' && @request.auth.id = @request.body.user';
    app.save(col);
  },
);
