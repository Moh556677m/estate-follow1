/// <reference path="../pb_data/types.d.ts" />

// Public SEO — used by the external (pre-login) pages: /login, /signup,
// /forgot-password and /admin (landing). These pages are NOT authenticated,
// and platform_settings is auth-gated, so this public route exposes ONLY the
// SEO-relevant fields the crawlers and the <Helmet> need.
//
// It also exposes the central Brand Entity (cms.brand_entity) and the public
// FAQ (cms.seo_faq) so every public page reads brand identity from one source
// of truth — no hardcoded brand data scattered across pages.
//
// Route (public, no auth required):
//   GET /ef/public-seo — returns { seo, seo_pages, robots_txt, brand_entity, faq }
//
// IMPORTANT: PocketBase recompiles each routerAdd handler in a separate pooled
// VM, so the handler is fully self-contained.

routerAdd('GET', '/ef/public-seo', function (e) {
  var seo = {
    canonical_domain: '',
    site_title_en: 'Estate Follow',
    site_title_ar: 'إستيت فولو',
    brand_name: 'Estate Follow',
    default_language: 'ar',
    supported_languages: ['ar', 'en'],
    og_image_url: '',
    twitter_card: 'summary_large_image',
    // Sitewide fallback title/description — consumed only as a react-helmet
    // fallback for a page that sets none of its own (see App.jsx's
    // <GlobalSeoMeta>). Every existing page keeps its own literal
    // <title>/<meta name="description"> for the llms.txt build step; this
    // is what makes the Admin's meta_title/meta_description fields actually
    // reach the real site instead of being purely cosmetic.
    meta_title_en: '',
    meta_title_ar: '',
    meta_description_en: '',
    meta_description_ar: '',
  };
  var seoPages = [];
  var robotsTxt = '';
  var brandEntity = null;
  var faq = [];

  try {
    var rows = $app.findAllRecords('platform_settings');
    if (rows && rows.length > 0) {
      var rec = rows[0];
      var cms = rec.get('cms') || {};
      var s = cms.seo || {};
      if (s.canonical_domain) seo.canonical_domain = s.canonical_domain;
      if (s.site_title_en) seo.site_title_en = s.site_title_en;
      if (s.site_title_ar) seo.site_title_ar = s.site_title_ar;
      if (s.brand_name) seo.brand_name = s.brand_name;
      if (s.default_language) seo.default_language = s.default_language;
      if (s.supported_languages) seo.supported_languages = s.supported_languages;
      if (s.og_image_url) seo.og_image_url = s.og_image_url;
      if (s.twitter_card) seo.twitter_card = s.twitter_card;
      if (s.meta_title_en) seo.meta_title_en = s.meta_title_en;
      if (s.meta_title_ar) seo.meta_title_ar = s.meta_title_ar;
      if (s.meta_description_en) seo.meta_description_en = s.meta_description_en;
      if (s.meta_description_ar) seo.meta_description_ar = s.meta_description_ar;

      var pages = cms.seo_pages || [];
      pages.forEach(function (p) {
        if (!p) return;
        seoPages.push({
          id: p.id || '',
          key: p.key || '',
          name_en: p.name_en || '',
          name_ar: p.name_ar || '',
          url: p.url || '',
          slug: p.slug || '',
          seo_title_en: p.seo_title_en || '',
          seo_title_ar: p.seo_title_ar || '',
          meta_desc_en: p.meta_desc_en || '',
          meta_desc_ar: p.meta_desc_ar || '',
          h1: p.h1 || '',
          canonical: p.canonical || '',
          social_image: p.social_image || '',
          index: p.index !== false,
          follow: p.follow !== false,
          structured_data: p.structured_data || '',
          keywords: p.keywords || [],
        });
      });

      if (typeof cms.robots_txt === 'string') robotsTxt = cms.robots_txt;

      // ---- Central Brand Entity (public-safe fields only) ----
      var be = cms.brand_entity || {};
      brandEntity = {
        name_en: be.name_en || 'Estate Follow',
        name_ar: be.name_ar || 'إستيت فولو',
        display_name: be.display_name || 'إستيت فولو | Estate Follow',
        website: be.website || 'https://estatefollow.com',
        logo: be.logo || '',
        short_desc_ar: be.short_desc_ar || be.short_desc || '',
        short_desc_en: be.short_desc_en || be.short_desc || '',
        long_desc_ar: be.long_desc_ar || be.long_desc || '',
        long_desc_en: be.long_desc_en || be.long_desc || '',
        services_ar: be.services_ar || (be.main_services || []),
        services_en: be.services_en || (be.main_services || []),
        audience_ar: be.audience_ar || be.target_audience || '',
        audience_en: be.audience_en || be.target_audience || '',
        countries: be.countries || [],
        languages: be.languages || ['ar', 'en'],
        social_profiles: be.social_profiles || {},
        contact: be.contact || { email: '', phone: '' },
      };

      // ---- Public FAQ (only visible items) ----
      var rawFaq = cms.seo_faq || [];
      rawFaq.forEach(function (f) {
        if (!f || f.visible === false) return;
        faq.push({
          id: f.id || '',
          question_en: f.question_en || '',
          question_ar: f.question_ar || '',
          answer_en: f.answer_en || '',
          answer_ar: f.answer_ar || '',
          page: f.page || '',
          order: f.order || 0,
        });
      });
    }
  } catch (_) {
    /* use defaults */
  }

  return e.json(200, { seo: seo, seo_pages: seoPages, robots_txt: robotsTxt, brand_entity: brandEntity, faq: faq });
});
