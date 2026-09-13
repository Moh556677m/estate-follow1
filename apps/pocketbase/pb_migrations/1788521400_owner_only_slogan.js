/// <reference path="../pb_data/types.d.ts" />

// Site is now owner-only (broker/brokerage system removed). The Control
// Center slogan stored in platform_settings.cms.slogans.owner still
// references "الوصول إلى الوسطاء الموثوقين" / "accessing trusted brokers".
// Update the owner slogan (AR + EN) to an owner-only wording so the login
// page slogan reflects the owner-only product. Non-destructive: only the
// owner slogan strings are replaced; all other CMS content is preserved.

migrate(
  (app) => {
    let rows = [];
    try {
      rows = app.findAllRecords('platform_settings');
    } catch (_) {
      rows = [];
    }

    const OWNER_SLOGAN_AR = 'منصتك لإدارة عقاراتك ومتابعتها بسهولة';
    const OWNER_SLOGAN_EN = 'Your platform to manage and track your properties';

    rows.forEach((rec) => {
      let cms;
      try {
        cms = JSON.parse(JSON.stringify(rec.get('cms') || {}));
      } catch (_) {
        cms = {};
      }

      if (!cms.slogans || typeof cms.slogans !== 'object') cms.slogans = {};
      if (!cms.slogans.owner || typeof cms.slogans.owner !== 'object') {
        cms.slogans.owner = {};
      }

      const cur = cms.slogans.owner;
      const ar = String(cur.slogan_ar || '');
      const en = String(cur.slogan_en || '');

      // Only rewrite when the stored slogan still mentions brokers, or is
      // empty — avoids clobbering a deliberately customised owner slogan.
      const mentionsBrokers =
        ar.includes('الوسطاء') ||
        en.toLowerCase().includes('broker');

      if (mentionsBrokers || (!ar && !en)) {
        cur.slogan_ar = OWNER_SLOGAN_AR;
        cur.slogan_en = OWNER_SLOGAN_EN;
        rec.set('cms', cms);
        app.save(rec);
      }
    });
  },
  (app) => {
    // Non-destructive rollback: nothing to undo.
  },
);
