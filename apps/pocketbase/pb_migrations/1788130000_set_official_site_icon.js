/// <reference path="../pb_data/types.d.ts" />

// Establish the attached green icon as the single official browser/PWA icon.
// This deliberately leaves the in-page Estate Follow logo untouched.
migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId('platform_settings');
    if (!settings.fields.getByName('site_icon_version')) {
      settings.fields.add(new TextField({ name: 'site_icon_version', max: 80 }));
      app.save(settings);
    }

    // Store the absolute CDN URL so every environment (preview + production)
    // resolves the same official green icon without depending on /public paths.
    const iconUrl =
      'https://horizons-cdn.hostinger.com/b1fe22e7-8cfa-4988-b687-83acd2d93f4b/b9fa6ac1dc90225c8c98b2a9e8eae6fe.png';
    const version = '20260830-1';
    const rows = app.findAllRecords('platform_settings');
    rows.forEach((record) => {
      record.set('site_icon_url', iconUrl);
      record.set('site_icon_version', version);
      // Clear legacy uploaded browser/app icons so they cannot override the
      // new official URL. The in-page logo_file is intentionally preserved.
      try {
        if (settings.fields.getByName('favicon_file') && record.get('favicon_file')) {
          record.set('favicon_file', null);
        }
      } catch (_) { /* ignore */ }
      try {
        if (settings.fields.getByName('app_icon_file') && record.get('app_icon_file')) {
          record.set('app_icon_file', null);
        }
      } catch (_) { /* ignore */ }
      app.save(record);
    });
  },
  (app) => {
    const settings = app.findCollectionByNameOrId('platform_settings');
    try {
      settings.fields.removeByName('site_icon_version');
      app.save(settings);
    } catch (_) {
      /* Best effort rollback. */
    }
  },
);
