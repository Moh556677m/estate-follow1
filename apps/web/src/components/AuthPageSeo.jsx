import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { DEFAULT_SEO_PAGES, DEFAULT_SEO } from '@/lib/cmsDefaults';
import { officialSiteUrl, resolveSocialImage, SITE_NAME, siteLogoUrl } from '@/lib/siteLogo';

// Fallback SEO defaults per public page key. Used before the public-seo
// hook responds (or if it fails) so crawlers always see correct meta.
const FALLBACK = {
  login: {
    name_ar: 'تسجيل الدخول',
    name_en: 'Login',
    seo_title_ar: 'استيت فولو تسجيل الدخول',
    seo_title_en: 'Estate Follow Login',
    meta_desc_ar:
      'دخول آمن إلى منصة Estate Follow — منصتك الذكية لإدارة عقاراتك بكل سهولة',
    meta_desc_en:
      'Secure login to Estate Follow — your smart platform to manage your properties with ease',
    canonical: 'https://estatefollow.com/login',
    structured_data: 'LoginAction',
    keywords: [
      'استيت فولو تسجيل دخول',
      'Estate Follow تسجيل دخول',
      'تسجيل دخول استيت فولو',
      'تسجيل الدخول Estate Follow',
      'Estate Follow login',
      'Estate Follow sign in',
      'login Estate Follow',
      'sign in Estate Follow',
    ],
  },
  signup: {
    name_ar: 'إنشاء حساب',
    name_en: 'Sign Up',
    seo_title_ar: 'إنشاء حساب في استيت فولو',
    seo_title_en: 'Estate Follow Sign Up',
    meta_desc_ar:
      'انضم إلى Estate Follow وأنشئ حسابك الآن. منصتك الذكية لإدارة عقاراتك بكل سهولة',
    meta_desc_en:
      'Create your Estate Follow account today. Your smart platform to manage your properties with ease',
    canonical: 'https://estatefollow.com/signup',
    structured_data: 'CreateAction',
    keywords: [
      'استيت فولو إنشاء حساب',
      'إنشاء حساب Estate Follow',
      'التسجيل في استيت فولو',
      'استيت فولو تسجيل جديد',
      'Estate Follow sign up',
      'Estate Follow register',
      'create Estate Follow account',
      'Estate Follow create account',
    ],
  },
  'forgot-password': {
    name_ar: 'نسيت كلمة المرور',
    name_en: 'Forgot Password',
    seo_title_ar: 'استعادة كلمة المرور | Estate Follow',
    seo_title_en: 'Reset Password | Estate Follow',
    meta_desc_ar:
      'استعد كلمة مرورك في Estate Follow بسهولة وأمان. اتبع خطوات بسيطة لاستعادة الوصول إلى حسابك',
    meta_desc_en:
      'Reset your Estate Follow password securely. Follow simple steps to regain access to your account',
    canonical: 'https://estatefollow.com/forgot-password',
    structured_data: 'PasswordResetAction',
    keywords: [
      'استيت فولو نسيت كلمة المرور',
      'نسيت كلمة السر Estate Follow',
      'استعادة كلمة مرور استيت فولو',
      'تغيير كلمة مرور Estate Follow',
      'Estate Follow forgot password',
      'Estate Follow reset password',
      'reset Estate Follow password',
      'Estate Follow password recovery',
    ],
  },
  'admin-portal': {
    name_ar: 'بوابة الإدارة',
    name_en: 'Admin Portal',
    seo_title_ar: 'بوابة الإدارة | Estate Follow Admin',
    seo_title_en: 'Admin Portal | Estate Follow',
    meta_desc_ar:
      'بوابة الإدارة الآمنة لـ Estate Follow. دخول محدود للمسؤولين والموظفين فقط',
    meta_desc_en:
      'Estate Follow Admin Portal. Secure access for administrators and staff only',
    canonical: 'https://estatefollow.com/admin',
    structured_data: 'WebSite',
    keywords: [
      'استيت فولو ادمن',
      'Estate Follow admin',
      'Estate Follow admin login',
      'استيت فولو تسجيل دخول الادمن',
      'admin portal Estate Follow',
    ],
  },
};

const DEFAULT_DOMAIN = 'https://estatefollow.com';

// Build a Schema.org JSON-LD object for the given structured-data type.
function buildJsonLd(type, page, lang, domain) {
  const title = lang === 'ar' ? page.seo_title_ar : page.seo_title_en;
  const desc = lang === 'ar' ? page.meta_desc_ar : page.meta_desc_en;
  const url = officialSiteUrl(page.canonical || `${domain}${page.url || ''}`);
  const base = { '@context': 'https://schema.org', image: siteLogoUrl() };
  switch (type) {
    case 'LoginAction':
      return {
        ...base,
        '@type': 'LoginAction',
        name: title,
        description: desc,
        target: url,
        actionStatus: 'PotentialActionStatus',
      };
    case 'CreateAction':
      return {
        ...base,
        '@type': 'CreateAction',
        name: title,
        description: desc,
        target: url,
        actionStatus: 'PotentialActionStatus',
      };
    case 'PasswordResetAction':
      return {
        ...base,
        '@type': 'PasswordResetAction',
        name: title,
        description: desc,
        target: url,
        actionStatus: 'PotentialActionStatus',
      };
    case 'WebSite':
      return {
        ...base,
        '@type': 'WebSite',
        name: title || 'Estate Follow',
        url: domain,
        description: desc,
        inLanguage: lang === 'ar' ? 'ar' : 'en',
      };
    default:
      return null;
  }
}

// Data-driven SEO for public auth pages. Reads the public-seo hook so the
// Super Admin's Control Center edits (Page SEO + Keywords) apply live.
// Props: pageKey — one of 'login' | 'signup' | 'forgot-password' | 'admin-portal'
//        path  — optional override of the URL path (e.g. '/admin/login')
//        noindex — force noindex regardless of CMS setting
export default function AuthPageSeo({ pageKey, path, noindex = false }) {
  const { lang } = useLanguage();
  const { isAuthed } = useAuth();
  const [seoData, setSeoData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Authenticated users get CMS via BrandLoader (window.__EF_CMS__);
    // public (pre-login) pages fetch the public-seo hook.
    const fromWindow = window.__EF_CMS__;
    if (fromWindow && fromWindow.seo_pages) {
      setSeoData({
        seo: { ...DEFAULT_SEO, ...(fromWindow.seo || {}) },
        seo_pages: fromWindow.seo_pages,
      });
      return undefined;
    }
    pb
      .send('/ef/public-seo', { method: 'GET' })
      .then((res) => {
        if (cancelled) return;
        if (res && res.seo_pages) {
          setSeoData({ seo: { ...DEFAULT_SEO, ...(res.seo || {}) }, seo_pages: res.seo_pages });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthed]);

  const fallback = FALLBACK[pageKey] || FALLBACK.login;
  const domain =
    (seoData?.seo?.canonical_domain || '').trim()
      ? (seoData.seo.canonical_domain.startsWith('http')
          ? seoData.seo.canonical_domain
          : `https://${seoData.seo.canonical_domain}`).replace(/\/$/, '')
      : DEFAULT_DOMAIN;

  // Find the CMS page entry; fall back to DEFAULT_SEO_PAGES then to FALLBACK.
  const cmsPage = seoData?.seo_pages?.find((p) => p.key === pageKey);
  const defPage = DEFAULT_SEO_PAGES.find((p) => p.key === pageKey);
  const page = {
    key: pageKey,
    url: path || cmsPage?.url || defPage?.url || fallback.canonical.replace(domain, ''),
    name_ar: cmsPage?.name_ar || defPage?.name_ar || fallback.name_ar,
    name_en: cmsPage?.name_en || defPage?.name_en || fallback.name_en,
    seo_title_ar: cmsPage?.seo_title_ar || fallback.seo_title_ar,
    seo_title_en: cmsPage?.seo_title_en || fallback.seo_title_en,
    meta_desc_ar: cmsPage?.meta_desc_ar || fallback.meta_desc_ar,
    meta_desc_en: cmsPage?.meta_desc_en || fallback.meta_desc_en,
    h1: cmsPage?.h1 || '',
    canonical: cmsPage?.canonical || fallback.canonical,
    social_image: resolveSocialImage(cmsPage?.social_image || seoData?.seo?.og_image_url || ''),
    index: noindex ? false : cmsPage?.index !== false,
    follow: noindex ? false : cmsPage?.follow !== false,
    structured_data: cmsPage?.structured_data || fallback.structured_data,
    keywords: cmsPage?.keywords?.length ? cmsPage.keywords : fallback.keywords,
  };

  const title = lang === 'ar' ? page.seo_title_ar : page.seo_title_en;
  const description = lang === 'ar' ? page.meta_desc_ar : page.meta_desc_en;
  const canonical = officialSiteUrl(page.canonical || `${domain}${page.url}`);
  const robots = `${page.index ? 'index' : 'noindex'},${page.follow ? 'follow' : 'nofollow'}`;
  const jsonLd = buildJsonLd(page.structured_data, page, lang, domain);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonical} />
      {/* hreflang — the page is bilingual (AR/EN) on a single URL. */}
      <link rel="alternate" hrefLang="ar" href={canonical} />
      <link rel="alternate" hrefLang="en" href={canonical} />
      <link rel="alternate" hrefLang="x-default" href={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:locale" content={lang === 'ar' ? 'ar_AR' : 'en_US'} />
      {page.social_image && <meta property="og:image" content={page.social_image} />}
      <meta property="og:image:alt" content={`${SITE_NAME} — official logo`} />
      <meta name="twitter:card" content={seoData?.seo?.twitter_card || 'summary_large_image'} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {page.social_image && <meta name="twitter:image" content={page.social_image} />}
      <meta name="twitter:image:alt" content={`${SITE_NAME} — official logo`} />
      {page.keywords?.length > 0 && (
        <meta name="keywords" content={page.keywords.join(', ')} />
      )}
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}
