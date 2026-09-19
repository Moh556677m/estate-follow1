
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

import routes from './routes/index.js';
import { errorMiddleware } from './middleware/error.js';
import logger from './utils/logger.js';
import { BodyLimit } from './constants/common.js';
import { initSentry } from './utils/sentry.js';
import { isPocketbaseReady } from './lib/pocketbaseReadiness.js';

// Sentry (backend error tracking) — no-op unless SENTRY_DSN is set in the
// environment. Started before anything else so early errors are captured too.
await initSentry();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vite build folder: apps/web/dist
const webDistPath = path.resolve(__dirname, '../../web/dist');

// Exactly one reverse proxy sits in front of this server — Traefik on the
// VPS (or, previously, self-hosted Hostinger's own platform Node.js app
// proxy). Trusting only that one hop — instead of `true`, which trusts the
// whole X-Forwarded-For chain including anything a client itself sends —
// makes req.ip resolve to each visitor's real IP instead of collapsing
// every visitor onto the same key. This matters for every per-IP scoped
// limiter below (and for req.ip-based logic elsewhere), not just one
// specific middleware.
app.set('trust proxy', 1);

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// NOTE: no SIGINT/SIGTERM handlers are registered here on purpose. This
// module is imported (not run standalone) by the root server.cjs, in the
// SAME process — Node delivers a signal to every listener registered for
// it, so a handler here would run CONCURRENTLY with server.cjs's own
// shutdown() and race it. That used to be a real bug: this file previously
// called `process.exit(0)` on its own fixed 3-second timer, completely
// independent of whether server.cjs had actually finished stopping the
// PocketBase child process it owns. Whichever handler's timer fired first
// won and killed the whole process immediately — if that was this one, it
// could cut server.cjs's own graceful PocketBase shutdown short, leaving
// that PocketBase process ORPHANED (a child is not auto-killed when its
// Node parent exits) and still holding its SQLite pb_data files open/locked
// right as a new instance was starting up — a direct contributor to the
// "database is locked" failures during migrations on redeploy. server.cjs
// is now the single, sole authority for shutdown: it stops this HTTP server
// (see the exported `server` below) and only then decides whether to stop
// PocketBase, in one coordinated sequence.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // apps/web/index.html ships a handful of small inline <script>
        // blocks (a mobile pinch-zoom lock, plus a few Vite build-injected
        // module-preload helpers) — this file is served as a static asset
        // via express.static(), never rendered per-request, so there is no
        // practical way to attach a per-request CSP nonce to them.
        //
        // Every domain below is a real, existing integration this app
        // already loads client-side — Helmet's un-configured defaults
        // (script-src/connect-src/style-src/font-src all effectively
        // 'self' only) were silently blocking ALL of them on every single
        // page load, confirmed one by one via the CI responsive-smoke
        // check's real Chromium console-error capture once that check
        // could finally run far enough to see it. None of these were a
        // deliberate security decision to exclude — this CSP was never
        // actually configured for what the app uses, just left at
        // Helmet's generic default.
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // apps/web/index.html's own small inline scripts (see above)
          'https://www.googletagmanager.com', // Google Analytics (gtag.js)
          'https://www.clarity.ms', // Microsoft Clarity's own loader...
          'https://scripts.clarity.ms', // ...which then loads the real tracker from this separate subdomain
          'https://cdn.onesignal.com', // OneSignal push-notification SDK
          'https://api.onesignal.com', // OneSignal's own JSONP-style sync call (loaded as a <script>, not fetch)
          'https://www.google.com', // reCAPTCHA v3 (login/signup/forgot-password)
        ],
        connectSrc: [
          "'self'",
          'https://ipwho.is', // best-effort GeoIP default for the phone/nationality fields
          'https://www.google-analytics.com',
          'https://www.googletagmanager.com',
          'https://cdn.onesignal.com',
          'https://api.onesignal.com',
          'https://onesignal.com',
          'https://www.clarity.ms',
          'https://scripts.clarity.ms',
          // Clarity's "collect" telemetry beacon uses a DIFFERENT, single
          // random-looking subdomain per session (e.g. https://f.clarity.ms,
          // https://t.clarity.ms, ...) rather than one fixed hostname —
          // confirmed live, a different one every single page load. Naming
          // them individually is not possible; only a wildcard covers it.
          'https://*.clarity.ms',
          'https://www.google.com', // reCAPTCHA v3's own token verification calls
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // component libraries that set inline style attributes
          'https://fonts.googleapis.com', // dynamic per-platform font stylesheet (App.jsx)
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'], // property/document images (e.g. Cloudinary) and social previews
        frameSrc: [
          'https://www.youtube.com',
          'https://youtube.com',
          'https://player.vimeo.com',
          'https://www.google.com', // reCAPTCHA badge/challenge iframe
        ],
      },
    },
  }),
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'QUERY'],
    // X-Portal: tags a PocketBase auth-with-password request as coming from
    // the admin login page or the regular user login page (see
    // AuthContext.jsx's login() and pb_hooks/portal-login-separation.pb.js)
    // so staff and owner accounts can be rejected server-side for using the
    // wrong one. Only matters for a cross-origin dev setup — same-origin
    // requests never go through CORS at all — but must be explicitly
    // allowed here or a cross-origin preflight would strip it.
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Portal'],
  }),
);

// gzip/deflate every compressible response — the built-in JS bundle alone
// is ~940KB raw (~283KB gzipped, per the real build output), and nothing
// in this app was ever compressing it or any other text response (JSON,
// CSS, HTML) before this: it was going out over the wire completely
// uncompressed on every single page load, which is a real, direct cause of
// "loading takes a long time" independent of anything else. `compression`
// decides per-response via Content-Type (its default `compressible`
// check), so it already skips already-compressed binary formats on its
// own (images, PDFs, video) — including the large PocketBase file
// downloads proxied below — there is nothing to gain and real CPU cost to
// lose by re-compressing those, so no extra filter is added here.
app.use(compression());

app.use(morgan('combined'));
// No app-wide rate limiter here on purpose. A single shared counter in front
// of every request (assets, PocketBase auth via the reverse proxy below,
// every API route) used to block ordinary site traffic for real users once
// exhausted — one page load's worth of JS/CSS/image/API requests could burn
// most of the budget on its own, before even counting other visitors that
// might resolve to the same IP (shared/corporate/mobile-carrier NAT is
// common). Static assets are never rate-limited at all now. Endpoints that
// actually need abuse protection (OTP send/verify, error reporting, the AI
// extraction endpoint) each have their own small, endpoint-scoped limiter
// instead — see user-otp.js, site-issues.js, integrated-ai-rate-limit.js.
// Login brute-force protection lives in PocketBase itself (settings.rateLimits
// + the *:auth rule), scoped per real client IP via trustedProxy, since
// auth-with-password is proxied straight through to PocketBase below and
// never passes through an Express route that could inspect it.

// --- PocketBase reverse proxy (self-host routing fix) ----------------------
// The frontend calls PocketBase through the relative path `/hcgi/platform/*`
// (see apps/web/src/lib/pocketbaseClient.js and apps/web/src/lib/editorClient.js)
// and calls this API through `/hcgi/api/*` (see apps/web/src/lib/apiServerClient.js
// and friends). Those paths only exist because this project was originally
// built for Hostinger Horizons hosting, which provides that routing
// automatically at the platform level (see README.md, "Important: this
// project was built for Hostinger Horizons hosting"). Plain/self-hosted
// Hostinger (the "Setup Node.js App" feature this server.cjs entry point
// targets) does NOT provide that routing — without it, every single
// PocketBase call the frontend makes (login, signup, session registration,
// the admin portal, the editor portal, property/document reads and writes —
// literally everything) fails, which is what actually causes the generic
// "Something went wrong!" / blank-looking failures reported on the admin
// login and elsewhere. This proxy reproduces that missing routing so the
// unmodified frontend code keeps working as-is on self-hosted Hostinger.
//
// Mounted BEFORE express.json()/urlencoded() below so every request body
// (JSON, and multipart file uploads used by property/document uploads) is
// streamed through to PocketBase byte-for-byte, unparsed and unmodified.
function createPocketbaseProxy(target) {
  const targetUrl = new URL(target);
  const client = targetUrl.protocol === 'https:' ? https : http;
  const targetPort =
    targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80);

  return (req, res) => {
    // Gate on the shared readiness flag (apps/api/src/lib/pocketbaseReadiness.js,
    // kept in sync by server.cjs's own health-check loop) BEFORE ever
    // attempting to forward this request. This app's HTTP server starts
    // accepting connections immediately on boot, deliberately not waiting
    // for PocketBase to finish starting (see server.cjs's Step 2 comment) —
    // without this check, any request arriving in that window reached this
    // far and then failed with a raw "connect ECONNREFUSED 127.0.0.1:8090"
    // from the client.request() call below, instead of a clean, temporary,
    // retryable response.
    if (!isPocketbaseReady()) {
      res.set('Retry-After', '2');
      res.status(503).json({ message: 'PocketBase is starting up — please retry in a moment.' });
      return;
    }

    const options = {
      hostname: targetUrl.hostname,
      port: targetPort,
      // req.url is already relative to the /hcgi/platform mount point
      // (Express strips the mount prefix), e.g. "/api/health" or
      // "/api/collections/users/auth-with-password".
      path: req.url || '/',
      method: req.method,
      headers: { ...req.headers, host: `${targetUrl.hostname}:${targetPort}` },
    };

    const proxyReq = client.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      logger.error('PocketBase proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ message: 'PocketBase is unreachable' });
      }
    });

    req.pipe(proxyReq);
  };
}

app.use(
  '/hcgi/platform',
  createPocketbaseProxy(process.env.POCKETBASE_URL || 'http://127.0.0.1:8090'),
);

app.use(
  express.json({
    limit: BodyLimit,

    // Capture the raw body so the Stripe webhook route can verify
    // the Stripe-Signature header against the exact bytes Stripe sent.
    // Parsed JSON still populates req.body as usual for every other route.
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: BodyLimit,
  }),
);

// Serve the built React / Vite website.
//
// Root cause of intermittent "blank white screen, nothing renders at all"
// reports (worst on mobile): express.static() here had no cache-control
// configuration of its own, so every file — INCLUDING index.html — only
// ever got Express's bare defaults (ETag/Last-Modified only, no explicit
// Cache-Control). index.html changes on every single deploy (it references
// the CURRENT build's content-hashed JS/CSS filenames), but browsers are
// free to serve a cached copy of it without revalidating first — some
// mobile browsers do this aggressively, especially over a flaky mobile
// connection. A visitor's phone would then load an OLD index.html
// referencing a JS bundle filename that no longer exists after a newer
// deploy replaced it (Vite content-hashes every filename in dist/assets/ —
// nothing keeps the old ones around). That JS 404s before React ever gets
// a chance to mount anything — not even this app's own ErrorBoundary,
// which only ever catches errors AFTER React has already started running.
// The result is a truly blank page with zero content and no visible error
// at all, exactly matching the report.
//
// The fix: index.html must NEVER be served from cache without revalidating
// (Cache-Control: no-cache — see sendIndexHtml() below, used everywhere
// index.html is served) — while the content-hashed files under
// dist/assets/ are the exact opposite case: their filename changes
// whenever their content does, so caching them forever is always safe and
// is what actually makes repeat visits fast. Everything else (favicon,
// manifest, robots.txt, the OneSignal service worker — copied from
// apps/web/public/ as-is, never content-hashed) keeps Express's own
// default, unchanged.
app.use(
  express.static(webDistPath, {
    // Without this, express.static()'s own built-in "serve index.html for a
    // directory/root request" behavior answers every `/` request directly,
    // completely bypassing sendIndexHtml() below (and its no-cache headers)
    // for the single most common request of all — confirmed by a real
    // request against this exact server: `/` came back
    // "Cache-Control: public, max-age=0" (Express's bare default) instead
    // of the no-cache this file needs. Turning this off forces EVERY
    // index.html response, no matter which route serves it, through the
    // one function that sets it correctly.
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

function sendIndexHtml(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  return res.sendFile(path.join(webDistPath, 'index.html'));
}

// Frontend SPA routes must be handled by React before API routes reach them.
// This has to be an explicit prefix allow-list, not a blanket "anything that
// isn't API" rule, because apiRouter below is ALSO mounted at the bare root
// `/` (kept for backward compatibility — see the comment on that mount).
// Any path not listed here still falls through to apiRouter first, same as
// before. The generic SPA-fallback middleware further down (after apiRouter)
// remains the true catch-all safety net for ordinary "page not found" cases;
// this early list exists so that KNOWN frontend pages can never be captured
// by an API sub-router mounted at root — which is exactly what happened to
// /admin/login: an unrelated feature router had an auth-check middleware
// registered without a path (`router.use(someAuthMiddleware)`), so it was
// intercepting every unmatched request — including this one — and hanging
// it on the generic error handler instead of ever reaching React. That
// specific middleware has been fixed to be properly scoped (see
// apps/api/src/routes/ai-providers.js), and this list is kept as a second,
// independent guarantee: even if some other router is ever mounted the same
// way and makes the same mistake, these frontend paths are never at risk.
const FRONTEND_PATH_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/admin',
  '/staff',
  '/editor',
];

function isFrontendRoute(reqPath) {
  return FRONTEND_PATH_PREFIXES.some(
    (prefix) => reqPath === prefix || reqPath.startsWith(`${prefix}/`),
  );
}

app.use((req, res, next) => {
  if (req.method === 'GET' && isFrontendRoute(req.path)) {
    return sendIndexHtml(res);
  }
  next();
});
// Existing API routes. Mounted at both `/` (original path, kept for
// backward compatibility / direct calls) and `/hcgi/api` (the relative path
// the frontend actually calls — see the PocketBase-proxy comment above for
// why self-hosted Hostinger needs this alias). Same router instance, so
// there is no duplicate route registration.
const apiRouter = routes();
app.use('/', apiRouter);
app.use('/hcgi/api', apiRouter);

// React SPA fallback
// If the requested URL is not an API/static file and expects HTML,
// return index.html so React Router can handle the page.
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return sendIndexHtml(res);
  }

  next();
});

// API / server errors
app.use(errorMiddleware);

// Final 404 response
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
  });
});

const port = process.env.PORT || 3001;

// Captured so the process entry point (server.cjs) can shut this HTTP
// server down gracefully — stop accepting NEW connections, let in-flight
// requests finish — as part of ONE coordinated shutdown sequence, instead
// of this module deciding on its own when the process exits (see the note
// above the removed SIGTERM/SIGINT handlers).
const server = app.listen(port, () => {
  logger.info(`🚀 API Server running on port ${port}`);
});

export default app;
export { server };