import React from 'react';
import { Helmet } from 'react-helmet';
import { officialSiteUrl, resolveSocialImage, SITE_NAME } from '@/lib/siteLogo';
import { getCachedPublicSeoBundle } from '@/lib/brandEntity';

function getCanonicalUrl(url) {
    if (url) return officialSiteUrl(url);
    return officialSiteUrl(typeof window !== 'undefined' ? window.location.pathname : '/');
}

// Social + canonical tags only. The page's own <Helmet> must keep a literal
// <title> and <meta name="description">, because the llms.txt build step reads
// those two tags straight out of the page file's source.
//
// `image` defaults to the global Estate Follow logo so every page that uses
// <Seo> inherits the official brand image as its link preview / search
// thumbnail automatically. Pass an explicit `image` to override per page.
const Seo = ({ title, description, image, url, siteName, type = 'website' }) => {
    const canonical = getCanonicalUrl(url);
    // Precedence: explicit per-page `image` prop > Admin-configured OG image
    // (Settings → SEO) > the static official Estate Follow logo. The Admin
    // value is read from the same public-seo cache <GlobalSeoMeta> and
    // useBrandEntity() share (lib/brandEntity.js) — no extra network request
    // from here, and it's simply absent (falls through to the static logo)
    // until that fetch resolves at least once.
    const adminOgImage = getCachedPublicSeoBundle()?.seo?.og_image_url;
    const socialImage = resolveSocialImage(image || adminOgImage);

    return (
        <Helmet>
            <link rel="canonical" href={canonical} />
            <meta property="og:url" content={canonical} />
            <meta property="og:type" content={type} />
            <meta property="og:site_name" content={siteName || SITE_NAME} />
            {title && <meta property="og:title" content={title} />}
            {description && <meta property="og:description" content={description} />}
            <meta property="og:image" content={socialImage} />
            <meta property="og:image:alt" content={`${SITE_NAME} — official logo`} />
            <meta name="twitter:card" content="summary_large_image" />
            {title && <meta name="twitter:title" content={title} />}
            {description && <meta name="twitter:description" content={description} />}
            <meta name="twitter:image" content={socialImage} />
            <meta name="twitter:image:alt" content={`${SITE_NAME} — official logo`} />
        </Helmet>
    );
}

export default Seo;

export { Seo };
