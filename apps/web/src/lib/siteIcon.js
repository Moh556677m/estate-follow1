/**
 * Global Site Icon — the official favicon/PWA icon used by every surface.
 *
 * The supplied logo is kept separate from the wordmark used inside page layouts.
 * Super Admin favicon settings may replace these URLs at runtime without changing
 * the page logo or artwork.
 */
export const DEFAULT_SITE_ICON_PATH = '/android-chrome-512x512.png';
export const DEFAULT_SITE_ICON_PATHS = {
  ico: '/favicon.ico',
  '16': '/favicon-16x16.png',
  '32': '/favicon-32x32.png',
  '180': '/apple-touch-icon.png',
  '192': '/android-chrome-192x192.png',
  '512': '/android-chrome-512x512.png',
};
export const DEFAULT_SITE_ICON_URL =
  typeof window !== 'undefined' && window.location
    ? `${window.location.origin}${DEFAULT_SITE_ICON_PATH}`
    : 'https://horizons-cdn.hostinger.com/b1fe22e7-8cfa-4988-b687-83acd2d93f4b/6ea139eba7d782eb810c5d206225c2c1.png';
export const DEFAULT_SITE_ICON_VERSION = '20260909-1';

let manifestObjectUrl = null;

function versionedUrl(value, version) {
  const raw = String(value || DEFAULT_SITE_ICON_URL).trim();
  if (!version) return raw;
  try {
    const url = new URL(raw, window.location.origin);
    url.searchParams.set('v', String(version));
    return url.toString();
  } catch {
    return raw;
  }
}

function ensureIconLink(spec, href) {
  let link = document.querySelector(`link[data-ef-site-icon="${spec.key}"]`);
  if (!link) {
    link = document.createElement('link');
    link.dataset.efSiteIcon = spec.key;
    document.head.appendChild(link);
  }
  link.rel = spec.rel;
  link.href = href;
  if (spec.type) link.type = spec.type;
  if (spec.sizes) link.sizes = spec.sizes;
  return link;
}

function updateManifest(iconUrl) {
  const link = document.querySelector('link[rel="manifest"]') || document.createElement('link');
  link.rel = 'manifest';
  if (!link.parentNode) document.head.appendChild(link);

  if (manifestObjectUrl) URL.revokeObjectURL(manifestObjectUrl);
  const manifest = {
    name: 'Estate Follow',
    short_name: 'Estate Follow',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#22C55E',
    icons: [
      { src: iconUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: iconUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: iconUrl, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: iconUrl, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  manifestObjectUrl = URL.createObjectURL(
    new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }),
  );
  link.href = manifestObjectUrl;
}

/**
 * Update every browser icon reference, including legacy, Apple and PWA links.
 * The version comes from the saved settings record so browser caches are
 * invalidated after a Super Admin changes the icon.
 */
export function applySiteIcon({ url = DEFAULT_SITE_ICON_URL, version = DEFAULT_SITE_ICON_VERSION } = {}) {
  if (typeof document === 'undefined') return;

  const href = versionedUrl(url, version);
  const specs = [
    { key: 'favicon.ico', rel: 'icon', type: 'image/x-icon', sizes: 'any' },
    { key: 'favicon-16x16.png', rel: 'icon', type: 'image/png', sizes: '16x16' },
    { key: 'favicon-32x32.png', rel: 'icon', type: 'image/png', sizes: '32x32' },
    { key: 'android-chrome-192x192.png', rel: 'icon', type: 'image/png', sizes: '192x192' },
    { key: 'android-chrome-512x512.png', rel: 'icon', type: 'image/png', sizes: '512x512' },
    { key: 'apple-touch-icon.png', rel: 'apple-touch-icon', type: 'image/png', sizes: '180x180' },
    { key: 'mask-icon', rel: 'mask-icon' },
  ];

  document
    .querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]')
    .forEach((link) => {
      link.href = href;
    });

  specs.forEach((spec) => ensureIconLink(spec, href));
  updateManifest(href);

  try {
    window.__EF_SITE_ICON__ = href;
    window.dispatchEvent(new CustomEvent('estatefollow-site-icon-updated', { detail: { href } }));
  } catch {
    /* Ignore environments without a fully available window event API. */
  }
}

if (typeof document !== 'undefined') applySiteIcon();
