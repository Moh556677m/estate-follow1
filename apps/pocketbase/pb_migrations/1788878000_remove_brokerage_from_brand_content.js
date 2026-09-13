/// <reference path="../pb_data/types.d.ts" />

// Site is owner-only (broker/brokerage system removed). The Control Center
// CMS content stored in platform_settings.cms still references
// "الوسطاء" / "وساطة" / "brokers" / "brokerage" in the owner slogan, brand
// entity descriptions, SEO meta, SEO page descriptions, and the public FAQ.
// This migration rewrites all of those to owner-only, property-management
// wording so every public surface (login, about, what-is, insights, meta
// tags, structured data) reflects the owner-only product.
//
// Non-destructive to everything else: only the brokerage-mentioning strings
// are replaced; all other CMS content, colors, sidebar, plans, etc. are
// preserved. Idempotent — safe to re-run.

migrate(
  (app) => {
    let rows = [];
    try {
      rows = app.findAllRecords('platform_settings');
    } catch (_) {
      rows = [];
    }

    const OWNER_SLOGAN_AR = 'منصتك الذكية لإدارة عقاراتك بكل سهولة';
    const OWNER_SLOGAN_EN = 'Your smart platform to manage your properties with ease';
    const TAGLINE_AR = 'منصتك الذكية لإدارة عقاراتك بكل سهولة';
    const TAGLINE_EN = 'Your smart platform to manage your properties with ease';

    const BRAND_SHORT_AR =
      'إستيت فولو هي منصة ذكية لإدارة ومتابعة المحفظة العقارية — عقارات، أقساط، إيجارات، مدفوعات، عقود، مستندات وتنبيهات من مكان واحد.';
    const BRAND_SHORT_EN =
      'Estate Follow is a smart property management and real estate portfolio tracking platform — properties, installments, rentals, payments, contracts, documents and alerts in one place.';
    const BRAND_LONG_AR =
      'إستيت فولو هي منصة ذكية لإدارة ومتابعة المحفظة العقارية تساعد الملاك على إدارة عقاراتهم ومتابعة الأقساط والإيجارات والمدفوعات والعقود والمستندات والتنبيهات من مكان واحد.';
    const BRAND_LONG_EN =
      'Estate Follow is a smart property management and real estate portfolio tracking platform that helps property owners manage properties, installments, rentals, payments, contracts, documents, and reminders from one place.';
    const AUDIENCE_AR =
      'أصحاب العقارات والمستثمرون الذين يديرون محافظ عقارية (جاهزة، تحت الإنشاء، وإيجارية).';
    const AUDIENCE_EN =
      'Property owners and investors managing real estate portfolios (ready, off-plan and rental).';

    const SEO_TITLE_EN = 'Estate Follow — Smart Property Management';
    const SEO_TITLE_AR = 'إستيت فولو — منصتك الذكية لإدارة عقاراتك';
    const SEO_DESC_EN = 'Manage your properties, payments and documents in one smart platform.';
    const SEO_DESC_AR = 'أدِر عقاراتك ومدفوعاتك ومستنداتك من منصة ذكية واحدة.';

    const mentionsBrokers = (s) => {
      if (!s || typeof s !== 'string') return false;
      const low = s.toLowerCase();
      return (
        s.includes('الوسطاء') ||
        s.includes('الوساطة') ||
        s.includes('وسيط') ||
        s.includes('وسطاء') ||
        s.includes('وساطة') ||
        low.includes('broker') ||
        low.includes('brokerage')
      );
    };

    rows.forEach((rec) => {
      let changed = false;

      // 1) Owner slogan (AR + EN) — always set to the new owner-only wording.
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
      const owner = cms.slogans.owner;
      owner.slogan_ar = OWNER_SLOGAN_AR;
      owner.slogan_en = OWNER_SLOGAN_EN;
      changed = true;

      // 2) Brand entity — strip brokerage from descriptions / services / audience.
      if (cms.brand_entity && typeof cms.brand_entity === 'object') {
        const be = cms.brand_entity;
        be.short_desc_ar = BRAND_SHORT_AR;
        be.short_desc_en = BRAND_SHORT_EN;
        be.long_desc_ar = BRAND_LONG_AR;
        be.long_desc_en = BRAND_LONG_EN;
        be.audience_ar = AUDIENCE_AR;
        be.audience_en = AUDIENCE_EN;
        // Remove brokerage services from the services lists.
        if (Array.isArray(be.services_ar)) {
          be.services_ar = be.services_ar.filter(
            (s) => !mentionsBrokers(s),
          );
        }
        if (Array.isArray(be.services_en)) {
          be.services_en = be.services_en.filter(
            (s) => !mentionsBrokers(s),
          );
        }
        // Legacy alias fields used by older records.
        if ('short_desc' in be) be.short_desc = BRAND_SHORT_AR;
        if ('long_desc' in be) be.long_desc = BRAND_LONG_AR;
        if ('target_audience' in be) be.target_audience = AUDIENCE_AR;
        if ('main_services' in be) {
          be.main_services = Array.isArray(be.main_services)
            ? be.main_services.filter((s) => !mentionsBrokers(s))
            : be.main_services;
        }
        changed = true;
      }

      // 3) SEO global meta — strip brokerage.
      if (cms.seo && typeof cms.seo === 'object') {
        cms.seo.meta_title_en = SEO_TITLE_EN;
        cms.seo.meta_title_ar = SEO_TITLE_AR;
        cms.seo.meta_description_en = SEO_DESC_EN;
        cms.seo.meta_description_ar = SEO_DESC_AR;
        changed = true;
      }

      // 4) SEO pages — rewrite brokerage-mentioning titles/descriptions.
      if (Array.isArray(cms.seo_pages)) {
        cms.seo_pages = cms.seo_pages.map((p) => {
          if (!p || typeof p !== 'object') return p;
          const np = { ...p };
          if (p.key === 'login') {
            np.meta_desc_ar =
              'دخول آمن إلى منصة Estate Follow — منصتك الذكية لإدارة عقاراتك بكل سهولة';
            np.meta_desc_en =
              'Secure login to Estate Follow — your smart platform to manage your properties with ease';
          } else if (p.key === 'signup') {
            np.meta_desc_ar =
              'انضم إلى Estate Follow وأنشئ حسابك الآن. منصتك الذكية لإدارة عقاراتك بكل سهولة';
            np.meta_desc_en =
              'Create your Estate Follow account today. Your smart platform to manage your properties with ease';
          } else if (p.key === 'about') {
            np.seo_title_en =
              'About Estate Follow — Smart Property Management Platform';
            np.seo_title_ar =
              'من نحن | إستيت فولو — منصة ذكية لإدارة العقارات';
            np.meta_desc_en =
              'Estate Follow is a smart property management and real estate portfolio tracking platform for property owners and investors.';
            np.meta_desc_ar =
              'إستيت فولو هي منصة ذكية لإدارة ومتابعة المحفظة العقارية لأصحاب العقارات والمستثمرين.';
          } else if (p.key === 'what-is-estate-follow') {
            np.seo_title_en =
              'What is Estate Follow? Smart Services for Property Owners';
            np.seo_title_ar =
              'ما هي إستيت فولو؟ خدمات ذكية لإدارة العقارات';
            np.meta_desc_en =
              'What is Estate Follow, who it is for, and how it helps property owners and investors manage properties, installments, rentals and documents.';
            np.meta_desc_ar =
              'ما هي إستيت فولو، لمن هي، وكيف تساعد الملاك والمستثمرين على إدارة العقارات والأقساط والإيجارات والمستندات.';
          }
          // Generic sweep: any remaining brokerage mention in this page's
          // text fields gets neutralized.
          ['seo_title_ar', 'seo_title_en', 'meta_desc_ar', 'meta_desc_en', 'h1'].forEach((k) => {
            if (mentionsBrokers(np[k])) {
              if (k.endsWith('_ar')) np[k] = np[k].replace(/،? ?مع الوصول إلى الوسطاء وشركات الوساطة العقارية الموثوقة\.?/g, '.');
              np[k] = np[k]
                .replace(/والوسطاء العقاريون، وشركات الوساطة العقارية\.?/g, '.')
                .replace(/، والوسطاء العقاريين وشركات الوساطة العقارية\.?/g, '.')
                .replace(/، بالإضافة إلى الوسطاء العقاريين وشركات الوساطة العقارية\.?/g, '.')
                .replace(/, real estate brokers, and brokerage companies\.?/g, '.')
                .replace(/, as well as real estate brokers and brokerage companies\.?/g, '.')
                .replace(/brokers and brokerage companies/gi, 'property owners and investors')
                .replace(/trusted brokerage/gi, 'smart property management')
                .replace(/brokerage/gi, 'property management');
            }
          });
          return np;
        });
        changed = true;
      }

      // 5) Public FAQ — rewrite brokerage-mentioning Q&A to owner-only content.
      if (Array.isArray(cms.seo_faq)) {
        cms.seo_faq = cms.seo_faq.map((f) => {
          if (!f || typeof f !== 'object') return f;
          const nf = { ...f };
          if (f.id === 'faq_what_is') {
            nf.answer_ar = BRAND_LONG_AR;
            nf.answer_en = BRAND_LONG_EN;
          } else if (f.id === 'faq_who_uses') {
            nf.answer_ar = AUDIENCE_AR;
            nf.answer_en = AUDIENCE_EN;
          } else if (f.id === 'faq_brokerage') {
            nf.question_ar = 'هل تصلح Estate Follow لإدارة أنواع عقارات متعددة؟';
            nf.question_en = 'Can Estate Follow manage multiple property types?';
            nf.answer_ar =
              'نعم، تدعم المنصة العقارات الجاهزة، والعقارات تحت الإنشاء (على الخارطة)، والعقارات الإيجارية — مع بيانات المستأجرين والعقود والشيكات وتذكيرات الاستحقاق.';
            nf.answer_en =
              'Yes, the platform supports ready properties, off-plan properties, and rented properties — including tenant data, contracts, cheques and due-date reminders.';
            nf.keywords = 'إدارة العقارات, property management estate follow';
          } else {
            // Generic sweep on any other FAQ entry that still mentions brokers.
            ['question_ar', 'question_en', 'answer_ar', 'answer_en'].forEach((k) => {
              if (mentionsBrokers(nf[k])) {
                nf[k] = String(nf[k])
                  .replace(/الوسطاء العقاريين وشركات الوساطة الموثوقة/g, 'عقاراتك بسهولة')
                  .replace(/الوسطاء العقاريين/g, 'الملاك')
                  .replace(/شركات الوساطة العقارية/g, 'المستثمرين')
                  .replace(/الوسطاء/g, 'الملاك')
                  .replace(/الوساطة العقارية/g, 'إدارة العقارات')
                  .replace(/الوساطة/g, 'إدارة العقارات')
                  .replace(/verified real estate brokers and brokerage companies/gi, 'property owners and investors')
                  .replace(/brokers and brokerage companies/gi, 'property owners and investors')
                  .replace(/brokerage companies/gi, 'investors')
                  .replace(/brokers/gi, 'owners')
                  .replace(/brokerage/gi, 'property management');
              }
            });
          }
          return nf;
        });
        changed = true;
      }

      // Save guard: the cms JSON field enforces a 5MB (5000000 byte) max.
      // In some environments the stored cms blob is already at/over that
      // limit, and re-saving the record re-validates the whole blob, throwing
      // "The maximum allowed JSON size is 5000000 bytes" and aborting the
      // entire migration (site-down). When the serialized cms fits, save
      // normally (preserves the preview behavior where the full
      // brokerage-stripping rewrite applies). When it does not fit, skip the
      // cms rewrite and update only the standalone tagline text fields via
      // raw SQL (bypassing json-field validation) so the migration still
      // completes and the site boots.
      let cmsTooBig = false;
      if (changed) {
        let cmsSize = 0;
        try {
          cmsSize = JSON.stringify(cms).length;
        } catch (_) {
          cmsSize = 0;
        }
        if (cmsSize > 0 && cmsSize < 4900000) {
          rec.set('cms', cms);
        } else if (cmsSize >= 4900000) {
          cmsTooBig = true;
        }
      }

      // 6) Top-level tagline fields (edited in Platform Branding) — strip
      // brokerage so the admin-managed tagline matches the new wording.
      const tagAr = String(rec.get('tagline_ar') || '');
      const tagEn = String(rec.get('tagline') || '');
      let tagChanged = false;
      if (mentionsBrokers(tagAr) || tagAr === '') {
        rec.set('tagline_ar', TAGLINE_AR);
        tagChanged = true;
      }
      if (mentionsBrokers(tagEn) || tagEn === '') {
        rec.set('tagline', TAGLINE_EN);
        tagChanged = true;
      }

      if (cmsTooBig) {
        // Avoid app.save(rec): it re-validates the oversized cms blob and
        // throws. Update only the tagline text columns directly via raw SQL.
        if (tagChanged) {
          try {
            app
              .db()
              .newQuery(
                'UPDATE platform_settings SET tagline_ar = {:ar}, tagline = {:en} WHERE id = {:id}',
              )
              .bind({ ar: TAGLINE_AR, en: TAGLINE_EN, id: rec.id })
              .execute();
          } catch (_) {
            /* ignore — non-fatal cosmetic field */
          }
        }
      } else {
        app.save(rec);
      }
    });
  },
  (app) => {
    // Non-destructive rollback: nothing to undo.
  },
);
