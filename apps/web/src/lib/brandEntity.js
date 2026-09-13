/**
 * Central Brand Entity — single source of truth for Estate Follow's brand
 * identity across every public page (current and future).
 *
 * Brand data is authored by the Super Admin in
 *   SEO & AI Search > Brand Entity
 * and stored in `platform_settings.cms.brand_entity`. Because
 * `platform_settings` is auth-gated, public (pre-login) pages read it through
 * the public PocketBase route `/ef/public-seo`, which exposes the public-safe
 * brand fields plus the public FAQ.
 *
 * Authenticated pages get the same data instantly from `window.__EF_CMS__`
 * (populated by BrandLoader) and refresh live on the
 * `estatefollow-cms-updated` event — so any Super Admin save applies
 * immediately with no per-page edits.
 */
import { useEffect, useState } from 'react';
import pb from '@/lib/pocketbaseClient';
import { DEFAULT_BRAND_ENTITY, DEFAULT_SEO_FAQ } from '@/lib/cmsDefaults';
import { officialSiteUrl, siteLogoUrl } from '@/lib/siteLogo';

// Module-level cache so multiple pages share one fetch.
let _cache = null;
let _promise = null;
const _listeners = new Set();

function fromWindow() {
  try {
    const cms = window.__EF_CMS__;
    if (cms && cms.brand_entity) {
      return {
        brand: normalizeBrand(cms.brand_entity),
        faq: normalizeFaq(cms.seo_faq),
        seo: (cms.seo && typeof cms.seo === 'object' ? cms.seo : {}) || {},
        seoPages: Array.isArray(cms.seo_pages) ? cms.seo_pages : [],
        robotsTxt: typeof cms.robots_txt === 'string' ? cms.robots_txt : '',
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function normalizeBrand(raw) {
  const be = raw || {};
  return {
    ...DEFAULT_BRAND_ENTITY,
    ...be,
    contact: { ...DEFAULT_BRAND_ENTITY.contact, ...(be.contact || {}) },
    social_profiles: { ...(be.social_profiles || {}) },
    services_ar: be.services_ar || be.main_services || DEFAULT_BRAND_ENTITY.services_ar,
    services_en: be.services_en || be.main_services || DEFAULT_BRAND_ENTITY.services_en,
    short_desc_ar: be.short_desc_ar || be.short_desc || DEFAULT_BRAND_ENTITY.short_desc_ar,
    short_desc_en: be.short_desc_en || be.short_desc || DEFAULT_BRAND_ENTITY.short_desc_en,
    long_desc_ar: be.long_desc_ar || be.long_desc || DEFAULT_BRAND_ENTITY.long_desc_ar,
    long_desc_en: be.long_desc_en || be.long_desc || DEFAULT_BRAND_ENTITY.long_desc_en,
    audience_ar: be.audience_ar || be.target_audience || DEFAULT_BRAND_ENTITY.audience_ar,
    audience_en: be.audience_en || be.target_audience || DEFAULT_BRAND_ENTITY.audience_en,
  };
}

export function normalizeFaq(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((f) => f && f.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function fetchPublic() {
  if (_promise) return _promise;
  _promise = pb
    .send('/ef/public-seo', { method: 'GET' })
    .then((res) => {
      const data = {
        brand: normalizeBrand(res?.brand_entity),
        faq: normalizeFaq(res?.faq),
        seo: (res?.seo && typeof res.seo === 'object' ? res.seo : {}) || {},
        seoPages: Array.isArray(res?.seo_pages) ? res.seo_pages : [],
        robotsTxt: typeof res?.robots_txt === 'string' ? res.robots_txt : '',
      };
      _cache = data;
      _listeners.forEach((fn) => fn(data));
      return data;
    })
    .catch(() => {
      // Fall back to defaults so pages always render brand identity.
      const data = {
        brand: DEFAULT_BRAND_ENTITY,
        faq: normalizeFaq(DEFAULT_SEO_FAQ),
        seo: {},
        seoPages: [],
        robotsTxt: '',
      };
      _cache = data;
      return data;
    })
    .finally(() => {
      _promise = null;
    });
  return _promise;
}

// Non-hook accessor for consumers that can't use the React hook (e.g. a
// module-level fallback, or a component that only needs a fire-and-forget
// fetch without re-rendering on updates — see App.jsx's <GlobalSeoMeta>).
export function fetchPublicSeoBundle() {
  const w = fromWindow();
  if (w) return Promise.resolve(w);
  if (_cache) return Promise.resolve(_cache);
  return fetchPublic();
}

export function getCachedPublicSeoBundle() {
  return fromWindow() || _cache || null;
}

/**
 * React hook — returns `{ brand, faq, loading }`.
 * Uses cached/window data first, then fetches the public route for guests.
 */
export function useBrandEntity() {
  const [state, setState] = useState(() => {
    const w = fromWindow();
    if (w) return { ...w, loading: false };
    if (_cache) return { ..._cache, loading: false };
    return { brand: DEFAULT_BRAND_ENTITY, faq: normalizeFaq(DEFAULT_SEO_FAQ), loading: true };
  });

  useEffect(() => {
    // Live updates for authenticated users (BrandLoader dispatches this).
    const onCms = () => {
      const w = fromWindow();
      if (w) setState({ ...w, loading: false });
    };
    const listener = (data) => setState({ ...data, loading: false });
    _listeners.add(listener);
    window.addEventListener('estatefollow-cms-updated', onCms);

    const w = fromWindow();
    if (w) {
      setState({ ...w, loading: false });
    } else if (_cache) {
      setState({ ..._cache, loading: false });
    } else {
      fetchPublic().then((data) => setState({ ...data, loading: false }));
    }

    return () => {
      _listeners.delete(listener);
      window.removeEventListener('estatefollow-cms-updated', onCms);
    };
  }, []);

  return state;
}

/** Localized helpers */
export function brandName(brand, lang) {
  const b = brand || DEFAULT_BRAND_ENTITY;
  return lang === 'ar' ? b.name_ar || b.name_en : b.name_en || b.name_ar;
}

export function brandShortDesc(brand, lang) {
  const b = brand || DEFAULT_BRAND_ENTITY;
  return lang === 'ar' ? b.short_desc_ar : b.short_desc_en;
}

export function brandLongDesc(brand, lang) {
  const b = brand || DEFAULT_BRAND_ENTITY;
  return lang === 'ar' ? b.long_desc_ar : b.long_desc_en;
}

export function brandServices(brand, lang) {
  const b = brand || DEFAULT_BRAND_ENTITY;
  return lang === 'ar' ? b.services_ar : b.services_en;
}

export function brandAudience(brand, lang) {
  const b = brand || DEFAULT_BRAND_ENTITY;
  return lang === 'ar' ? b.audience_ar : b.audience_en;
}

export function brandLogo(brand) {
  const b = brand || DEFAULT_BRAND_ENTITY;
  return (b.logo && String(b.logo).trim()) || siteLogoUrl();
}

/* ---------------- Schema.org JSON-LD builders ---------------- */

export function buildOrganizationJsonLd(brand) {
  const b = brand || DEFAULT_BRAND_ENTITY;
  const logo = brandLogo(b);
  const sameAs = Object.values(b.social_profiles || {}).filter(Boolean);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: b.name_en || 'Estate Follow',
    alternateName: b.name_ar || 'إستيت فولو',
    url: officialSiteUrl(b.website || '/'),
    logo,
    image: logo,
    description: b.long_desc_en || b.short_desc_en || '',
  };
  if (sameAs.length) ld.sameAs = sameAs;
  if (b.contact?.email) ld.email = b.contact.email;
  if (b.contact?.phone) ld.telephone = b.contact.phone;
  return ld;
}

export function buildWebSiteJsonLd(brand) {
  const b = brand || DEFAULT_BRAND_ENTITY;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: b.name_en || 'Estate Follow',
    alternateName: b.name_ar || 'إستيت فولو',
    url: officialSiteUrl(b.website || '/'),
    description: b.short_desc_en || b.long_desc_en || '',
    inLanguage: ['ar', 'en'],
  };
}

export function buildFaqJsonLd(faq, lang) {
  const list = Array.isArray(faq) ? faq : [];
  const items = list
    .filter((f) => (lang === 'ar' ? f.question_ar && f.answer_ar : f.question_en && f.answer_en))
    .map((f) => ({
      '@type': 'Question',
      name: lang === 'ar' ? f.question_ar : f.question_en,
      acceptedAnswer: {
        '@type': 'Answer',
        text: lang === 'ar' ? f.answer_ar : f.answer_en,
      },
    }));
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items,
  };
}
