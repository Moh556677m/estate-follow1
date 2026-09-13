import apiServerClient from './apiServerClient';

// Conditionally injects GA4 / Clarity / OneSignal — replacing the previous
// unconditional static <script> tags in index.html — so a Super Admin
// "Disable" in Integration Registry (Admin → External Tools) actually stops
// that script from ever loading, instead of only hiding a UI toggle that had
// no real effect. See apps/api/src/routes/integrations.js
// (publicScriptStatusRouter) for the no-auth status endpoint this reads.
//
// Trade-off, stated plainly: these scripts now load a few dozen ms later
// than before (one small fetch first, cached for 60s server-side) instead of
// being present in the static HTML from byte one. That's the correct trade
// for making the Admin toggle real rather than cosmetic.

function injectScript(src, attrs = {}) {
  const s = document.createElement('script');
  s.src = src;
  Object.entries(attrs).forEach(([k, v]) => {
    s[k] = v;
  });
  document.head.appendChild(s);
  return s;
}

function loadGA4() {
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  injectScript('https://www.googletagmanager.com/gtag/js?id=G-G5N5852F44', { async: true });
  gtag('js', new Date());
  gtag('config', 'G-G5N5852F44');
}

function loadClarity() {
  (function (c, l, a, r, i, t, y) {
    c[a] =
      c[a] ||
      function () {
        // eslint-disable-next-line prefer-rest-params
        (c[a].q = c[a].q || []).push(arguments);
      };
    t = l.createElement(r);
    t.async = 1;
    t.src = 'https://www.clarity.ms/tag/' + i;
    y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);
    // eslint-disable-next-line no-undef
  })(window, document, 'clarity', 'script', 'ygct2dhxso');
}

function loadOneSignal() {
  injectScript('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js', { defer: true });
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    await OneSignal.init({
      appId: 'af6c81b2-a757-457f-9d46-50477b7ba31e',
      allowLocalhostAsSecureOrigin: true,
      notifyButton: { enable: true },
    });
  });
}

const DEFAULT_STATUS = { sentry: true, google_analytics: true, clarity: true, onesignal: true };

export async function loadEnabledIntegrationScripts() {
  let status = DEFAULT_STATUS;
  try {
    const res = await apiServerClient.fetch('/public/integration-status');
    if (res.ok) {
      const json = await res.json();
      status = { ...DEFAULT_STATUS, ...json };
    }
  } catch {
    // Fail open with defaults — a transient network/API error must never
    // silently disable analytics/monitoring the Admin left enabled.
  }
  if (status.google_analytics) loadGA4();
  if (status.clarity) loadClarity();
  if (status.onesignal) loadOneSignal();
  return status;
}
