/// <reference path="../pb_data/types.d.ts" />

// Independent multi-session support:
// - session_token / access_token / refresh_token per browser profile
// - last_seen_ms for stale-session recycling (does not rely on date-only fields)
// - staff may manage owner sessions; owners manage their own
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('user_sessions');

    if (!collection.fields.getByName('session_token')) {
      collection.fields.add(
        new TextField({
          name: 'session_token',
          required: false,
          max: 120,
        }),
      );
    }
    if (!collection.fields.getByName('access_token')) {
      collection.fields.add(
        new TextField({
          name: 'access_token',
          required: false,
          max: 120,
        }),
      );
    }
    if (!collection.fields.getByName('refresh_token')) {
      collection.fields.add(
        new TextField({
          name: 'refresh_token',
          required: false,
          max: 120,
        }),
      );
    }
    if (!collection.fields.getByName('last_seen_ms')) {
      collection.fields.add(
        new NumberField({
          name: 'last_seen_ms',
          required: false,
          min: 0,
        }),
      );
    }

    // Owners see/manage own rows; staff/super can manage any (admin tools).
    collection.listRule =
      "@request.auth.id != '' && (@request.auth.id = user || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')";
    collection.viewRule =
      "@request.auth.id != '' && (@request.auth.id = user || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')";
    collection.createRule = "@request.auth.id != ''";
    collection.updateRule =
      "@request.auth.id != '' && (@request.auth.id = user || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')";
    collection.deleteRule =
      "@request.auth.id != '' && (@request.auth.id = user || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')";

    // Unique session_token when present (empty allowed for legacy rows).
    const indexes = collection.indexes || [];
    const hasTokenIdx = indexes.some(
      (idx) => typeof idx === 'string' && idx.includes('idx_user_session_token'),
    );
    if (!hasTokenIdx) {
      indexes.push(
        'CREATE UNIQUE INDEX `idx_user_session_token` ON `user_sessions` (`session_token`) WHERE `session_token` != \'\'',
      );
      collection.indexes = indexes;
    }

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('user_sessions');
    try {
      collection.fields.removeByName('session_token');
    } catch (_) {}
    try {
      collection.fields.removeByName('access_token');
    } catch (_) {}
    try {
      collection.fields.removeByName('refresh_token');
    } catch (_) {}
    try {
      collection.fields.removeByName('last_seen_ms');
    } catch (_) {}
    collection.indexes = (collection.indexes || []).filter(
      (idx) => !(typeof idx === 'string' && idx.includes('idx_user_session_token')),
    );
    app.save(collection);
  },
);
