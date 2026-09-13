/// <reference path="../pb_data/types.d.ts" />

// Marketing module — email campaigns, templates, mailing lists, contacts,
// unsubscribe list, and per-recipient send log with open tracking.
// Super Admin only (all rules require is_super_admin). The pb_hooks routes
// (send-batch, open pixel, unsubscribe) run with superuser context and bypass
// rules, so they can create sends / unsubscribes from unauthenticated email
// clients.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    const superRule = "@request.auth.is_super_admin = true";

    // ---- marketing_campaigns ----
    let campaigns;
    try {
      campaigns = app.findCollectionByNameOrId('marketing_campaigns');
    } catch (_) {
      campaigns = new Collection({
        type: 'base',
        name: 'marketing_campaigns',
        listRule: superRule,
        viewRule: superRule,
        createRule: superRule,
        updateRule: superRule,
        deleteRule: superRule,
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'name', type: 'text', required: true, max: 200 },
          { name: 'subject', type: 'text', required: true, max: 300 },
          { name: 'body', type: 'text', required: true, max: 20000 },
          { name: 'cta_label', type: 'text', max: 100 },
          { name: 'cta_url', type: 'url', max: 500 },
          { name: 'signature', type: 'text', max: 500 },
          { name: 'image_url', type: 'text', max: 500 },
          {
            name: 'image_file',
            type: 'file',
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'],
          },
          {
            name: 'source',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['platform', 'list', 'both'],
          },
          {
            name: 'account_filter',
            type: 'select',
            maxSelect: 1,
            values: ['all', 'owner', 'broker', 'company'],
          },
          { name: 'country_filter', type: 'text', max: 10 },
          { name: 'city_filter', type: 'text', max: 120 },
          {
            name: 'status_filter',
            type: 'select',
            maxSelect: 1,
            values: ['all', 'active', 'inactive', 'suspended'],
          },
          { name: 'list_ids', type: 'json', maxSize: 100000 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'],
          },
          { name: 'scheduled_at', type: 'date' },
          { name: 'sent_at', type: 'date' },
          { name: 'recipient_count', type: 'number' },
          { name: 'sent_count', type: 'number' },
          { name: 'failed_count', type: 'number' },
          { name: 'opened_count', type: 'number' },
          { name: 'clicked_count', type: 'number' },
          { name: 'sender_name', type: 'text', max: 120 },
          { name: 'sender_email', type: 'email' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_mkt_campaigns_owner ON marketing_campaigns (owner)',
          'CREATE INDEX idx_mkt_campaigns_status ON marketing_campaigns (status)',
        ],
      });
      app.save(campaigns);
    }

    // ---- marketing_templates ----
    let templates;
    try {
      templates = app.findCollectionByNameOrId('marketing_templates');
    } catch (_) {
      templates = new Collection({
        type: 'base',
        name: 'marketing_templates',
        listRule: superRule,
        viewRule: superRule,
        createRule: superRule,
        updateRule: superRule,
        deleteRule: superRule,
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'name', type: 'text', required: true, max: 200 },
          { name: 'subject', type: 'text', max: 300 },
          { name: 'body', type: 'text', max: 20000 },
          { name: 'cta_label', type: 'text', max: 100 },
          { name: 'cta_url', type: 'url', max: 500 },
          { name: 'signature', type: 'text', max: 500 },
          { name: 'image_url', type: 'text', max: 500 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_mkt_templates_owner ON marketing_templates (owner)'],
      });
      app.save(templates);
    }

    // ---- marketing_lists ----
    let lists;
    try {
      lists = app.findCollectionByNameOrId('marketing_lists');
    } catch (_) {
      lists = new Collection({
        type: 'base',
        name: 'marketing_lists',
        listRule: superRule,
        viewRule: superRule,
        createRule: superRule,
        updateRule: superRule,
        deleteRule: superRule,
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'name', type: 'text', required: true, max: 200 },
          { name: 'total', type: 'number' },
          { name: 'valid', type: 'number' },
          { name: 'invalid_count', type: 'number' },
          { name: 'duplicate_count', type: 'number' },
          { name: 'in_platform', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_mkt_lists_owner ON marketing_lists (owner)'],
      });
      app.save(lists);
    }

    // ---- marketing_contacts ----
    let contacts;
    try {
      contacts = app.findCollectionByNameOrId('marketing_contacts');
    } catch (_) {
      contacts = new Collection({
        type: 'base',
        name: 'marketing_contacts',
        listRule: superRule,
        viewRule: superRule,
        createRule: superRule,
        updateRule: superRule,
        deleteRule: superRule,
        fields: [
          {
            name: 'list',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: lists.id,
            cascadeDelete: true,
          },
          { name: 'email', type: 'text', required: true, max: 200 },
          { name: 'name', type: 'text', max: 200 },
          { name: 'country', type: 'text', max: 120 },
          { name: 'city', type: 'text', max: 120 },
          { name: 'company', type: 'text', max: 200 },
          { name: 'phone', type: 'text', max: 60 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_mkt_contacts_list ON marketing_contacts (list)',
          'CREATE INDEX idx_mkt_contacts_email ON marketing_contacts (email)',
        ],
      });
      app.save(contacts);
    }

    // ---- marketing_unsubscribes ----
    let unsubs;
    try {
      unsubs = app.findCollectionByNameOrId('marketing_unsubscribes');
    } catch (_) {
      unsubs = new Collection({
        type: 'base',
        name: 'marketing_unsubscribes',
        listRule: superRule,
        viewRule: superRule,
        createRule: superRule,
        updateRule: superRule,
        deleteRule: superRule,
        fields: [
          { name: 'email', type: 'text', required: true, max: 200 },
          { name: 'reason', type: 'text', max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_mkt_unsub_email ON marketing_unsubscribes (email)',
        ],
      });
      app.save(unsubs);
    }

    // ---- marketing_sends (per-recipient log + open tracking) ----
    let sends;
    try {
      sends = app.findCollectionByNameOrId('marketing_sends');
    } catch (_) {
      sends = new Collection({
        type: 'base',
        name: 'marketing_sends',
        listRule: superRule,
        viewRule: superRule,
        createRule: superRule,
        updateRule: superRule,
        deleteRule: superRule,
        fields: [
          {
            name: 'campaign',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: campaigns.id,
            cascadeDelete: true,
          },
          { name: 'email', type: 'text', required: true, max: 200 },
          { name: 'recipient_name', type: 'text', max: 200 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['sent', 'failed', 'opened', 'clicked', 'unsubscribed'],
          },
          { name: 'error', type: 'text', max: 500 },
          { name: 'token', type: 'text', max: 80 },
          { name: 'sent_at', type: 'date' },
          { name: 'opened_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_mkt_sends_campaign ON marketing_sends (campaign)',
          'CREATE UNIQUE INDEX idx_mkt_sends_token ON marketing_sends (token) WHERE token != \'\'',
          'CREATE INDEX idx_mkt_sends_email ON marketing_sends (email)',
        ],
      });
      app.save(sends);
    }
  },
  (app) => {
    const names = [
      'marketing_sends',
      'marketing_unsubscribes',
      'marketing_contacts',
      'marketing_lists',
      'marketing_templates',
      'marketing_campaigns',
    ];
    names.forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n));
      } catch (e) {
        if (e.message && e.message.includes('no rows')) return;
        throw e;
      }
    });
  },
);
