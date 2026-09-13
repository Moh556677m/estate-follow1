/// <reference path="../pb_data/types.d.ts" />

// CRM | إدارة العملاء — collections for the broker/company CRM system.
// Leads are created ONLY through the public hook route (superuser context),
// so crm_leads.createRule is null (no direct REST create). All other writes
// are owner-scoped (the broker/company who owns the lead) plus Super Admin /
// staff roles. Company owners see leads they own; assigned brokers see leads
// assigned to them via the assigned_to relation.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    // ---- crm_leads ---------------------------------------------------------
    let leads;
    try {
      leads = app.findCollectionByNameOrId('crm_leads');
    } catch (_) {
      leads = new Collection({
        type: 'base',
        name: 'crm_leads',
        listRule:
          "@request.auth.id = owner || @request.auth.id = assigned_to || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        viewRule:
          "@request.auth.id = owner || @request.auth.id = assigned_to || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        createRule: null, // public leads are created via the hook route only
        updateRule:
          "@request.auth.id = owner || @request.auth.id = assigned_to || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        deleteRule:
          "@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: 'assigned_to',
            type: 'relation',
            maxSelect: 1,
            collectionId: users.id,
          },
          { name: 'name', type: 'text', required: true, max: 200 },
          { name: 'phone', type: 'text', required: true, max: 40 },
          { name: 'whatsapp', type: 'text', max: 40 },
          { name: 'email', type: 'email', required: true },
          { name: 'country', type: 'text', max: 120 },
          { name: 'city', type: 'text', max: 120 },
          { name: 'preferred_time', type: 'text', max: 120 },
          { name: 'message', type: 'text', max: 3000 },
          { name: 'request_type', type: 'text', max: 120 },
          {
            name: 'source',
            type: 'select',
            maxSelect: 1,
            values: [
              'instagram',
              'tiktok',
              'facebook',
              'whatsapp',
              'youtube',
              'website',
              'google',
              'direct',
              'other',
            ],
          },
          { name: 'source_label', type: 'text', max: 120 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['new', 'interested', 'follow_up', 'not_interested', 'won'],
          },
          { name: 'custom_fields', type: 'json', maxSize: 200000 },
          { name: 'last_follow_up', type: 'date' },
          { name: 'next_reminder', type: 'date' },
          { name: 'lead_page_slug', type: 'text', max: 80 },
          { name: 'tracking_id', type: 'text', max: 60 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_crm_leads_owner ON crm_leads (owner)',
          'CREATE INDEX idx_crm_leads_status ON crm_leads (status)',
          'CREATE INDEX idx_crm_leads_source ON crm_leads (source)',
          'CREATE INDEX idx_crm_leads_assigned ON crm_leads (assigned_to)',
        ],
      });
      app.save(leads);
    }

    // ---- crm_notes ---------------------------------------------------------
    let notes;
    try {
      notes = app.findCollectionByNameOrId('crm_notes');
    } catch (_) {
      notes = new Collection({
        type: 'base',
        name: 'crm_notes',
        listRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        viewRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        createRule: "@request.auth.id != ''",
        updateRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        deleteRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        fields: [
          {
            name: 'lead',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: leads.id,
            cascadeDelete: true,
          },
          {
            name: 'author',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'body', type: 'text', required: true, max: 5000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_crm_notes_lead ON crm_notes (lead, created)'],
      });
      app.save(notes);
    }

    // ---- crm_reminders -----------------------------------------------------
    let reminders;
    try {
      reminders = app.findCollectionByNameOrId('crm_reminders');
    } catch (_) {
      reminders = new Collection({
        type: 'base',
        name: 'crm_reminders',
        listRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        viewRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        createRule: "@request.auth.id != ''",
        updateRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        deleteRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        fields: [
          {
            name: 'lead',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: leads.id,
            cascadeDelete: true,
          },
          { name: 'title', type: 'text', required: true, max: 200 },
          { name: 'note', type: 'text', max: 2000 },
          { name: 'due_at', type: 'date', required: true },
          { name: 'completed', type: 'bool' },
          { name: 'completed_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_crm_reminders_lead ON crm_reminders (lead, due_at)',
          'CREATE INDEX idx_crm_reminders_due ON crm_reminders (completed, due_at)',
        ],
      });
      app.save(reminders);
    }

    // ---- crm_activity (auto timeline) -------------------------------------
    let activity;
    try {
      activity = app.findCollectionByNameOrId('crm_activity');
    } catch (_) {
      activity = new Collection({
        type: 'base',
        name: 'crm_activity',
        listRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        viewRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        createRule: null, // created server-side only
        updateRule: null,
        deleteRule:
          "lead.owner = @request.auth.id || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        fields: [
          {
            name: 'lead',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: leads.id,
            cascadeDelete: true,
          },
          { name: 'action', type: 'text', required: true, max: 120 },
          { name: 'details', type: 'text', max: 1000 },
          { name: 'actor', type: 'relation', maxSelect: 1, collectionId: users.id },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        indexes: ['CREATE INDEX idx_crm_activity_lead ON crm_activity (lead, created)'],
      });
      app.save(activity);
    }

    // ---- crm_settings (per broker/company lead page config) ---------------
    let settings;
    try {
      settings = app.findCollectionByNameOrId('crm_settings');
    } catch (_) {
      settings = new Collection({
        type: 'base',
        name: 'crm_settings',
        listRule:
          "@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        viewRule:
          "@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule:
          "@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        deleteRule:
          "@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'slug', type: 'text', max: 80 },
          { name: 'bio', type: 'text', max: 2000 },
          {
            name: 'photo',
            type: 'file',
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          },
          { name: 'field_config', type: 'json', maxSize: 200000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_crm_settings_slug ON crm_settings (slug) WHERE slug != \'\'',
          'CREATE INDEX idx_crm_settings_owner ON crm_settings (owner)',
        ],
      });
      app.save(settings);
    }

    // ---- crm_tracking_links -----------------------------------------------
    let tracking;
    try {
      tracking = app.findCollectionByNameOrId('crm_tracking_links');
    } catch (_) {
      tracking = new Collection({
        type: 'base',
        name: 'crm_tracking_links',
        listRule:
          "@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        viewRule:
          "@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule:
          "@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        deleteRule:
          "@request.auth.id = owner || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: 'source',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: [
              'instagram',
              'tiktok',
              'facebook',
              'whatsapp',
              'youtube',
              'website',
              'google',
              'custom',
            ],
          },
          { name: 'custom_source', type: 'text', max: 120 },
          { name: 'token', type: 'text', required: true, max: 60 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_crm_tracking_token ON crm_tracking_links (token)',
          'CREATE INDEX idx_crm_tracking_owner ON crm_tracking_links (owner)',
        ],
      });
      app.save(tracking);
    }

    // ---- crm_fields (super admin custom fields) ---------------------------
    let fields;
    try {
      fields = app.findCollectionByNameOrId('crm_fields');
    } catch (_) {
      fields = new Collection({
        type: 'base',
        name: 'crm_fields',
        listRule:
          "@request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        viewRule:
          "@request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: 'label_en', type: 'text', required: true, max: 120 },
          { name: 'label_ar', type: 'text', required: true, max: 120 },
          {
            name: 'field_type',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['text', 'number', 'select', 'date', 'bool'],
          },
          { name: 'options', type: 'json', maxSize: 200000 },
          { name: 'required', type: 'bool' },
          { name: 'broker_can_use', type: 'bool' },
          { name: 'company_can_use', type: 'bool' },
          { name: 'on_public_form', type: 'bool' },
          { name: 'active', type: 'bool' },
          { name: 'order', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_crm_fields_active ON crm_fields (active, order)'],
      });
      app.save(fields);
    }

    // ---- crm_admin_settings (single row, super admin) ---------------------
    let adminSettings;
    try {
      adminSettings = app.findCollectionByNameOrId('crm_admin_settings');
    } catch (_) {
      adminSettings = new Collection({
        type: 'base',
        name: 'crm_admin_settings',
        listRule:
          "@request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        viewRule:
          "@request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom'",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: 'system_enabled', type: 'bool' },
          { name: 'broker_enabled', type: 'bool' },
          { name: 'company_enabled', type: 'bool' },
          { name: 'ai_enabled', type: 'bool' },
          { name: 'export_enabled', type: 'bool' },
          { name: 'tracking_enabled', type: 'bool' },
          { name: 'whatsapp_enabled', type: 'bool' },
          { name: 'reminders_enabled', type: 'bool' },
          { name: 'sidebar_config', type: 'json', maxSize: 200000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [],
      });
      app.save(adminSettings);
    }

    // Seed a single crm_admin_settings row with sensible defaults.
    try {
      const existing = app.findRecordsByFilter('crm_admin_settings', "id != ''", '', 1, 0, {});
      if (!existing || existing.length === 0) {
        const rec = new Record(adminSettings);
        rec.set('system_enabled', true);
        rec.set('broker_enabled', true);
        rec.set('company_enabled', true);
        rec.set('ai_enabled', true);
        rec.set('export_enabled', true);
        rec.set('tracking_enabled', true);
        rec.set('whatsapp_enabled', true);
        rec.set('reminders_enabled', true);
        rec.set('sidebar_config', JSON.stringify([
          { key: 'leads', label_en: 'Leads', label_ar: 'العملاء', icon: 'Users', visible: true, order: 1 },
          { key: 'dashboard', label_en: 'Dashboard', label_ar: 'لوحة التحليلات', icon: 'BarChart3', visible: true, order: 2 },
          { key: 'reminders', label_en: 'Reminders', label_ar: 'التذكيرات', icon: 'Bell', visible: true, order: 3 },
          { key: 'tracking', label_en: 'Tracking Links', label_ar: 'روابط التتبع', icon: 'Link2', visible: true, order: 4 },
          { key: 'settings', label_en: 'Settings', label_ar: 'الإعدادات', icon: 'Settings', visible: true, order: 5 },
        ]));
        app.save(rec);
      }
    } catch (_) {
      /* ignore seed errors */
    }
  },
  (app) => {
    const names = [
      'crm_admin_settings',
      'crm_fields',
      'crm_tracking_links',
      'crm_settings',
      'crm_activity',
      'crm_reminders',
      'crm_notes',
      'crm_leads',
    ];
    names.forEach((n) => {
      try {
        const c = app.findCollectionByNameOrId(n);
        app.delete(c);
      } catch (_) {
        /* not present */
      }
    });
  },
);
