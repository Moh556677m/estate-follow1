/**
 * Global Site Logo — single source of truth for Estate Follow's official
 * brand image across EVERY page (current and future).
 *
 * One static asset in /public is referenced by:
 *   - index.html  → default OG/Twitter meta, Organization JSON-LD logo
 *   - <Seo>       → default og:image / twitter:image (overridable per page)
 *   - <AuthPageSeo> → social_image fallback
 *   Browser tab / PWA icons are managed separately by siteIcon.js.
 *
 * Any new page that renders <Seo> (or just relies on index.html defaults)
 * inherits this logo automatically. A Super Admin can still override the
 * image for a specific page via CMS `social_image` / `og_image_url`.
 */

// Path served from /public (works on every domain: preview + production).
export const SITE_LOGO_PATH = '/estate-follow-logo.png';

// Production absolute URL — used for static <head> meta in index.html and as
// the canonical absolute fallback for social crawlers.
export const SITE_LOGO_URL = 'https://estatefollow.com/estate-follow-logo.png';

export const SITE_NAME = 'Estate Follow';

// The single production origin used for redirects, canonical URLs, sitemaps,
// and structured data. Keep this independent from the current browser host so
// the www host can never become an accidental canonical origin.
export const OFFICIAL_SITE_ORIGIN = 'https://estatefollow.com';

export function officialSiteUrl(path = '') {
    const normalizedPath = String(path || '');
    if (/^https?:\/\//i.test(normalizedPath)) {
        try {
            const parsed = new URL(normalizedPath);
            parsed.protocol = 'https:';
            parsed.hostname = 'estatefollow.com';
            return parsed.toString();
        } catch {
            return normalizedPath;
        }
    }
    return `${OFFICIAL_SITE_ORIGIN}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

// Absolute logo URL for the current origin. Used at runtime so link previews
// resolve correctly on both the preview domain and the production domain.
export function siteLogoUrl() {
    if (typeof window !== 'undefined' && window.location) {
        return `${window.location.origin}${SITE_LOGO_PATH}`;
    }
    return SITE_LOGO_URL;
}

// Resolve the social/OG image for a page. Returns an explicit override when
// the Super Admin set one, otherwise the global site logo.
export function resolveSocialImage(override) {
    if (override && String(override).trim()) return String(override).trim();
    return SITE_LOGO_URL;
}
