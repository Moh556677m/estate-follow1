/// <reference path="../pb_data/types.d.ts" />

/**
 * Task #23 — "مشاكل الموقع" (Site Issues).
 *
 * Scope confirmed with the user (all three selected): (1) platform-wide
 * technical/data issues, (2) the same class of problem the existing "SEO &
 * AI Search" admin panel already surfaces (broken links / canonical /
 * missing titles — that panel's own detection logic is left untouched; this
 * page adds its own SEO summary for the NEW `site_pages` collection from
 * Task #22 and links out to the existing SEO panel rather than duplicating
 * its logic), and (3) real technical issues users actually hit — uncaught
 * frontend JS errors and failed backend API requests.
 *
 * Writes are Super-Admin-only, same as `integration_registry` / `site_pages`
 * — including the two automated sources (js_error/api_error). The Express
 * layer (apps/api/src/routes/site-issues.js) is what accepts PUBLIC error
 * reports and writes them here using its already-authenticated superuser
 * PocketBase client (apps/api/src/utils/pocketbaseClient.js) — this
 * collection itself never grants an anonymous visitor direct write access,
 * so it inherits the Express app's existing `globalRateLimit`/helmet/body-
 * size protections instead of needing a second, separately-invented set.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId('site_issues');
    } catch (_) {
      collection = new Collection({
        type: 'base',
        name: 'site_issues',
        listRule: '@request.auth.is_super_admin = true',
        viewRule: '@request.auth.is_super_admin = true',
        createRule: '@request.auth.is_super_admin = true',
        updateRule: '@request.auth.is_super_admin = true',
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          {
            name: 'source',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['js_error', 'api_error', 'seo', 'data_integrity'],
          },
          {
            name: 'severity',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['critical', 'warning', 'info'],
          },
          { name: 'title', type: 'text', required: true, max: 300 },
          { name: 'message', type: 'text', max: 2000 },
          // details: stack trace / request path+method+status / check-specific
          // payload (e.g. the offending record id). Never secret values.
          { name: 'details', type: 'json', maxSize: 20000 },
          // context: url, user agent, language, and (only when available)
          // the authenticated user id who hit it — for a data_integrity/seo
          // finding this instead names which record/collection it's about.
          { name: 'context', type: 'json', maxSize: 5000 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['open', 'resolved', 'ignored'],
          },
          // A rough client/server-computed fingerprint so the admin panel can
          // group repeated identical errors together at display time instead
          // of showing hundreds of near-duplicate rows.
          { name: 'fingerprint', type: 'text', max: 200 },
          { name: 'resolved_note', type: 'text', max: 1000 },
          { name: 'resolved_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_site_issues_source_status ON site_issues (source, status)',
          'CREATE INDEX idx_site_issues_fingerprint ON site_issues (fingerprint)',
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('site_issues');
      app.delete(c);
    } catch (_) {}
  },
);
