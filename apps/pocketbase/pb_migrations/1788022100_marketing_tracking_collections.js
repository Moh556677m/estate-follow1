/// <reference path="../pb_data/types.d.ts" />

// Marketing tracking — adds per-recipient open/click counters to
// marketing_sends and two event-log collections (marketing_opens,
// marketing_clicks) so the dashboard can show total vs unique opens,
// clicks over time, and top clicked links. Super Admin only.

migrate(
  (app) => {
    const superRule = '@request.auth.is_super_admin = true';

    // ---- add counters to marketing_sends ----
    const sends = app.findCollectionByNameOrId('marketing_sends');
    if (!sends.fields.getByName('open_count')) {
      sends.fields.add(new NumberField({ name: 'open_count', min: 0 }));
    }
    if (!sends.fields.getByName('click_count')) {
      sends.fields.add(new NumberField({ name: 'click_count', min: 0 }));
    }
    if (!sends.fields.getByName('clicked_at')) {
      sends.fields.add(new DateField({ name: 'clicked_at' }));
    }
    app.save(sends);

    // ---- marketing_opens (one row per open event) ----
    let opens;
    try {
      opens = app.findCollectionByNameOrId('marketing_opens');
    } catch (_) {
      opens = new Collection({
        type: 'base',
        name: 'marketing_opens',
        listRule: superRule,
        viewRule: superRule,
        createRule: '',
        updateRule: null,
        deleteRule: superRule,
        fields: [
          {
            name: 'send',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: sends.id,
            cascadeDelete: true,
          },
          { name: 'campaign', type: 'text', max: 60 },
          { name: 'email', type: 'text', max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        indexes: [
          'CREATE INDEX idx_mkt_opens_send ON marketing_opens (send)',
          'CREATE INDEX idx_mkt_opens_campaign ON marketing_opens (campaign)',
        ],
      });
      app.save(opens);
    }

    // ---- marketing_clicks (one row per click event) ----
    let clicks;
    try {
      clicks = app.findCollectionByNameOrId('marketing_clicks');
    } catch (_) {
      clicks = new Collection({
        type: 'base',
        name: 'marketing_clicks',
        listRule: superRule,
        viewRule: superRule,
        createRule: '',
        updateRule: null,
        deleteRule: superRule,
        fields: [
          {
            name: 'send',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: sends.id,
            cascadeDelete: true,
          },
          { name: 'campaign', type: 'text', max: 60 },
          { name: 'email', type: 'text', max: 200 },
          { name: 'url', type: 'text', required: true, max: 1000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        indexes: [
          'CREATE INDEX idx_mkt_clicks_send ON marketing_clicks (send)',
          'CREATE INDEX idx_mkt_clicks_campaign ON marketing_clicks (campaign)',
          'CREATE INDEX idx_mkt_clicks_url ON marketing_clicks (url)',
        ],
      });
      app.save(clicks);
    }
  },
  (app) => {
    // down — remove counters + drop event collections
    try {
      const sends = app.findCollectionByNameOrId('marketing_sends');
      ['open_count', 'click_count', 'clicked_at'].forEach((n) => {
        if (sends.fields.getByName(n)) sends.fields.removeByName(n);
      });
      app.save(sends);
    } catch (_) {}
    ['marketing_clicks', 'marketing_opens'].forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n));
      } catch (e) {
        if (e.message && e.message.includes('no rows')) return;
        throw e;
      }
    });
  },
);
