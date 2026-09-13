/// <reference path="../pb_data/types.d.ts" />

/**
 * Task #22 — "محرر الموقع" (Site Editor).
 *
 * Scope confirmed with the user: (1) an editor for the public-facing site's
 * pages, (2) a lightweight visual/section builder for those pages, and
 * (3) per-page SEO/meta management — distinct from the Insights blog CMS
 * (Task #19, `insights_pages` — editorial content, separate `editors` auth
 * collection) and from the sitewide brand/SEO fallback already in
 * `platform_settings` (`cms.seo` — global title/description fallback only,
 * see App.jsx's <GlobalSeoMeta>).
 *
 * `site_pages` holds:
 *  - The two existing hardcoded public marketing pages (About,
 *    What-is-Estate-Follow) as `is_core: true` shadow rows — these do NOT
 *    drive those pages' body JSX (kept exactly as authored, zero visual
 *    regression risk) or their literal <title>/<meta name="description">
 *    (Seo.jsx's own comment: the llms.txt build step reads those two tags
 *    straight out of each page's literal source — replacing them with a DB
 *    value would silently break that pipeline). They only supply optional
 *    social-preview overrides (og:title/og:description/og:image) consumed
 *    by that page's existing <Seo> component.
 *  - Any number of new custom pages (`is_core: false`), fully admin-authored:
 *    title, a small ordered list of content `blocks` (hero/text/image/cta/
 *    faq), and full SEO fields — rendered at the public route /page/:slug
 *    (SitePageView.jsx), where no pre-existing literal tags exist to protect,
 *    so title/description there ARE set dynamically.
 *
 * Access follows the same Super-Admin-only precedent already used for other
 * whole-site-affecting admin surfaces (integration_registry / CMS-from-the-
 * admin-side) rather than the granular staff `permissions` system — publishing
 * public pages and rewriting site-wide SEO is treated as high-trust, same as
 * External Tools.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId('site_pages');
    } catch (_) {
      collection = new Collection({
        type: 'base',
        name: 'site_pages',
        // Published pages are readable by anyone (they ARE the public site);
        // drafts are visible only to the Super Admin managing them.
        listRule: 'status = "published" || @request.auth.is_super_admin = true',
        viewRule: 'status = "published" || @request.auth.is_super_admin = true',
        createRule: '@request.auth.is_super_admin = true',
        updateRule: '@request.auth.is_super_admin = true',
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          { name: 'slug', type: 'text', required: true, max: 120 },
          { name: 'title_en', type: 'text', max: 200 },
          { name: 'title_ar', type: 'text', max: 200 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['draft', 'published'],
          },
          // is_core: the two shadow SEO-only rows for the hardcoded About /
          // What-is-Estate-Follow pages. Never creatable/deletable via the
          // API (enforced in the hook below) — only these two migration-
          // seeded rows may ever carry it.
          { name: 'is_core', type: 'bool' },
          // route_override: for is_core rows only — the real hardcoded route
          // this row's SEO overrides apply to (e.g. "/about"). Ignored for
          // custom pages, which are always served at /page/:slug.
          { name: 'route_override', type: 'text', max: 200 },
          // blocks: ordered content sections for custom pages only.
          // [{ id, type: 'hero'|'text'|'image'|'cta'|'faq', visible, order,
          //    heading_en, heading_ar, body_en, body_ar, image_url,
          //    cta_label_en, cta_label_ar, cta_url, faq_items: [{q_en,q_ar,a_en,a_ar}] }]
          { name: 'blocks', type: 'json', maxSize: 100000 },
          { name: 'meta_title_en', type: 'text', max: 200 },
          { name: 'meta_title_ar', type: 'text', max: 200 },
          { name: 'meta_description_en', type: 'text', max: 500 },
          { name: 'meta_description_ar', type: 'text', max: 500 },
          { name: 'og_image_url', type: 'text', max: 500 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_site_pages_slug ON site_pages (slug)',
        ],
      });
      app.save(collection);
    }

    // Seed the two core SEO-override shadow rows once (skip if already seeded).
    let hasAbout = false;
    let hasWhatIs = false;
    try {
      app.findFirstRecordByFilter('site_pages', 'slug = "about"');
      hasAbout = true;
    } catch (_) {}
    try {
      app.findFirstRecordByFilter('site_pages', 'slug = "what-is-estate-follow"');
      hasWhatIs = true;
    } catch (_) {}

    if (!hasAbout) {
      try {
        const rec = new Record(collection);
        rec.set('slug', 'about');
        rec.set('title_en', 'About Estate Follow');
        rec.set('title_ar', 'عن Estate Follow');
        rec.set('status', 'published');
        rec.set('is_core', true);
        rec.set('route_override', '/about');
        rec.set('blocks', JSON.stringify([]));
        app.save(rec);
      } catch (_) {}
    }
    if (!hasWhatIs) {
      try {
        const rec = new Record(collection);
        rec.set('slug', 'what-is-estate-follow');
        rec.set('title_en', 'What is Estate Follow');
        rec.set('title_ar', 'ما هو Estate Follow');
        rec.set('status', 'published');
        rec.set('is_core', true);
        rec.set('route_override', '/what-is-estate-follow');
        rec.set('blocks', JSON.stringify([]));
        app.save(rec);
      } catch (_) {}
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('site_pages');
      app.delete(c);
    } catch (_) {}
  },
);
