// Sentry (backend error tracking) — optional, activates only when SENTRY_DSN
// is set in the environment.
//
// Loaded via dynamic import() (not a static `import` at the top of main.js)
// so that:
//   1. A missing/not-yet-installed @sentry/node package can never crash the
//      whole API process on startup — it is added to package.json here, but
//      until `npm install` actually runs on the server, this module must
//      fail soft, not take the site down.
//   2. When SENTRY_DSN is unset (not configured yet), Sentry is skipped
//      entirely — no network calls, no overhead, same behavior as before
//      this integration existed.
//
// Usage:
//   import { initSentry, captureException } from './utils/sentry.js';
//   await initSentry();              // once, at process startup
//   captureException(err, { route: '/x' });  // from the error middleware
import logger from './logger.js';

let sentryModule = null;
let initialized = false;

export async function initSentry() {
    if (initialized) return sentryModule;
    initialized = true;

    const dsn = process.env.SENTRY_DSN;
    if (!dsn || String(dsn).trim() === '') {
        logger.info('Sentry (backend) not configured — SENTRY_DSN is unset, skipping.');
        return null;
    }

    try {
        const Sentry = await import('@sentry/node');
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV || 'production',
            tracesSampleRate: 0.1,
        });
        sentryModule = Sentry;
        logger.info('Sentry (backend) error tracking enabled.');
        return Sentry;
    } catch (err) {
        // Package not installed yet (`npm install` pending on the server), or
        // init failed for another reason. Never let this break the API.
        logger.warn(
            'Sentry (backend) init skipped — @sentry/node is not installed or failed to initialize:',
            err?.message || err,
        );
        sentryModule = null;
        return null;
    }
}

/** Report an exception to Sentry if it is configured; always safe to call. */
export function captureException(err, extra) {
    try {
        if (sentryModule && typeof sentryModule.captureException === 'function') {
            if (extra) {
                sentryModule.withScope((scope) => {
                    scope.setExtras(extra);
                    sentryModule.captureException(err);
                });
            } else {
                sentryModule.captureException(err);
            }
        }
    } catch (_) {
        // Never let Sentry reporting itself break error handling.
    }
}

export default { initSentry, captureException };
