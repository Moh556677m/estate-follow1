/// <reference path="../pb_data/types.d.ts" />

// Per-link analytics key so custom social platforms get their own counters.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('brokerage_events');
    if (!col.fields.getByName('link_key')) {
      col.fields.add(
        new TextField({
          name: 'link_key',
          required: false,
          max: 120,
        }),
      );
    }
    const indexes = col.indexes || [];
    const idx =
      'CREATE INDEX idx_brokerage_events_link ON brokerage_events (owner, link_key, event)';
    if (!indexes.includes(idx)) {
      col.indexes.push(idx);
    }
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId('brokerage_events');
    col.fields.removeByName('link_key');
    col.indexes = (col.indexes || []).filter(
      (i) => !String(i).includes('idx_brokerage_events_link'),
    );
    app.save(col);
  },
);
