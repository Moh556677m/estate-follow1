/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId('platform_settings');

    if (!settings.fields.getByName('cms')) {
      settings.fields.add(
        new JSONField({
          name: 'cms',
          maxSize: 5000000,
        }),
      );
    }
    if (!settings.fields.getByName('logo_file')) {
      settings.fields.add(
        new FileField({
          name: 'logo_file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'],
        }),
      );
    }
    if (!settings.fields.getByName('favicon_file')) {
      settings.fields.add(
        new FileField({
          name: 'favicon_file',
          maxSelect: 1,
          maxSize: 2097152,
          mimeTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/svg+xml',
            'image/x-icon',
            'image/vnd.microsoft.icon',
          ],
        }),
      );
    }
    if (!settings.fields.getByName('app_icon_file')) {
      settings.fields.add(
        new FileField({
          name: 'app_icon_file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        }),
      );
    }
    if (!settings.fields.getByName('og_image_file')) {
      settings.fields.add(
        new FileField({
          name: 'og_image_file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        }),
      );
    }
    if (!settings.fields.getByName('contact_email')) {
      settings.fields.add(new EmailField({ name: 'contact_email' }));
    }
    if (!settings.fields.getByName('contact_phone')) {
      settings.fields.add(
        new TextField({
          name: 'contact_phone',
          max: 40,
        }),
      );
    }
    if (!settings.fields.getByName('description')) {
      settings.fields.add(new TextField({ name: 'description', max: 2000 }));
    }
    if (!settings.fields.getByName('description_ar')) {
      settings.fields.add(new TextField({ name: 'description_ar', max: 2000 }));
    }
    if (!settings.fields.getByName('social_links')) {
      settings.fields.add(new JSONField({ name: 'social_links', maxSize: 200000 }));
    }
    app.save(settings);

    let audit;
    try {
      audit = app.findCollectionByNameOrId('settings_audit_logs');
    } catch (_) {
      const users = app.findCollectionByNameOrId('users');
      audit = new Collection({
        type: 'base',
        name: 'settings_audit_logs',
        listRule:
          "@request.auth.is_super_admin = true || @request.auth.role = 'admin'",
        viewRule:
          "@request.auth.is_super_admin = true || @request.auth.role = 'admin'",
        createRule:
          "@request.auth.is_super_admin = true || @request.auth.role = 'admin'",
        updateRule: null,
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          {
            name: 'admin',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: 'admin_email', type: 'text', max: 200 },
          { name: 'section', type: 'text', required: true, max: 80 },
          { name: 'action', type: 'text', max: 80 },
          { name: 'summary', type: 'text', max: 500 },
          { name: 'old_value', type: 'json', maxSize: 2000000 },
          { name: 'new_value', type: 'json', maxSize: 2000000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_settings_audit_created ON settings_audit_logs (created)',
          'CREATE INDEX idx_settings_audit_section ON settings_audit_logs (section)',
        ],
      });
      app.save(audit);
    }
  },
  (app) => {
    try {
      const audit = app.findCollectionByNameOrId('settings_audit_logs');
      app.delete(audit);
    } catch (_) {
      /* ignore */
    }
    try {
      const settings = app.findCollectionByNameOrId('platform_settings');
      [
        'cms',
        'logo_file',
        'favicon_file',
        'app_icon_file',
        'og_image_file',
        'contact_email',
        'contact_phone',
        'description',
        'description_ar',
        'social_links',
      ].forEach((n) => {
        try {
          settings.fields.removeByName(n);
        } catch (_) {
          /* ignore */
        }
      });
      app.save(settings);
    } catch (_) {
      /* ignore */
    }
  },
);
