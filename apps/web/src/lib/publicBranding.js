import apiServerClient from './apiServerClient';

// Fetches the public (no-auth) subset of platform_settings — logo, favicon,
// brand colors, and sitewide SEO defaults — so GUEST visitors (not just
// logged-in users) get the real Admin-configured brand instead of only the
// static build-time defaults baked into index.html.
//
// Cached in-memory for the life of the tab: this is called from multiple
// places (SiteIconSync, GlobalSeoMeta, PublicBrandLayout) and the data
// changes rarely, so we don't want three separate network requests on every
// page load. Call with { force: true } right after an Admin save to bypass
// the cache (see estatefollow-cms-updated listeners).
let cached = null;
let inflight = null;

export async function fetchPublicBranding({ force = false } = {}) {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;

  inflight = apiServerClient
    .fetch('/public/branding')
    .then((res) => (res.ok ? res.json() : { ok: false, data: null }))
    .then((json) => {
      cached = json && json.ok ? json.data : null;
      return cached;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function getCachedPublicBranding() {
  return cached;
}
