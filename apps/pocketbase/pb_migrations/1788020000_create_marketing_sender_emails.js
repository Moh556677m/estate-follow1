/// <reference path="../pb_data/types.d.ts" />

// Marketing sender emails — managed from Control Center > Marketing Settings.
// Super Admin only. The campaign form picks the "from" address from the
// active entries here. The platform mailer controls the actual envelope
// sender; the chosen email is stored on each campaign and used as the
// display name fallback / record of which sender was used.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const superRule = '@request.auth.is_super_admin = true';

    let col;
    try {
      col = app.findCollectionByNameOrId('marketing_sender_emails');
    } catch (_) {
      col = new Collection({
        type: 'base',
        name: 'marketing_sender_emails',
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
          { name: 'email', type: 'email', required: true },
          { name: 'name', type: 'text', max: 120 },
          { name: 'active', type: 'bool' },
          { name: 'is_default', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_mkt_sender_email ON marketing_sender_emails (email)',
        ],
      });
      app.save(col);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('marketing_sender_emails'));
    } catch (e) {
      if (e.message && e.message.includes('no rows')) return;
      throw e;
    }
  },
);
