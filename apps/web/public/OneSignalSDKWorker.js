// OneSignal Web Push service worker.
// The OneSignal Web SDK registers this file from the site root
// (https://estatefollow.com/OneSignalSDKWorker.js). It must be served with
// content-type application/javascript and be publicly accessible on the same
// origin as the site. Vite serves everything under apps/web/public/ at the
// site root, so this file is available at /OneSignalSDKWorker.js in both the
// dev preview and the production build.
//
// Do NOT add any other logic here — OneSignal manages push delivery through
// the imported SDK worker. If you need to combine this with another service
// worker, follow OneSignal's "OneSignal service worker" migration guide.
/* global importScripts */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
