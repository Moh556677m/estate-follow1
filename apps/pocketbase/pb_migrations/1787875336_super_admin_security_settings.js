/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Recovery email on platform settings
    const settings = app.findCollectionByNameOrId('platform_settings');
    if (!settings.fields.getByName('security_recovery_email')) {
      settings.fields.add(
        new TextField({
          name: 'security_recovery_email',
          required: false,
          max: 200,
        }),
      );
      app.save(settings);
    }

    // Seed default recovery email on existing row
    try {
      const rows = app.findAllRecords('platform_settings');
      rows.forEach((r) => {
        if (!r.get('security_recovery_email')) {
          r.set('security_recovery_email', 'ceo@madproperties.ae');
          app.save(r);
        }
      });
    } catch (_) {
      /* ignore */
    }

    // Device column on activity logs
    const logs = app.findCollectionByNameOrId('activity_logs');
    if (!logs.fields.getByName('device')) {
      logs.fields.add(
        new TextField({
          name: 'device',
          required: false,
          max: 200,
        }),
      );
      app.save(logs);
    }

    // Dual-OTP challenges (server-only)
    let challenges;
    try {
      challenges = app.findCollectionByNameOrId('security_challenges');
    } catch (_) {
      challenges = new Collection({
        type: 'base',
        name: 'security_challenges',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'user',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('users').id,
            cascadeDelete: true,
          },
          {
            name: 'purpose',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['password_change', 'recovery_email_change'],
          },
          { name: 'code1', type: 'text', required: true, max: 12 },
          { name: 'code2', type: 'text', required: true, max: 12 },
          { name: 'code1_verified', type: 'bool' },
          { name: 'code2_verified', type: 'bool' },
          { name: 'completed', type: 'bool' },
          { name: 'expires_at', type: 'date', required: true },
          { name: 'payload', type: 'json' },
          { name: 'device', type: 'text', max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_sec_chal_user ON security_challenges (user, purpose)',
        ],
      });
      app.save(challenges);
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('security_challenges');
      app.delete(c);
    } catch (_) {
      /* ignore */
    }
    try {
      const logs = app.findCollectionByNameOrId('activity_logs');
      if (logs.fields.getByName('device')) {
        logs.fields.removeByName('device');
        app.save(logs);
      }
    } catch (_) {
      /* ignore */
    }
    try {
      const settings = app.findCollectionByNameOrId('platform_settings');
      if (settings.fields.getByName('security_recovery_email')) {
        settings.fields.removeByName('security_recovery_email');
        app.save(settings);
      }
    } catch (_) {
      /* ignore */
    }
  },
);
