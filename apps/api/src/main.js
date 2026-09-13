
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

import routes from './routes/index.js';
import { errorMiddleware } from './middleware/error.js';
import { globalRateLimit } from './middleware/global-rate-limit.js';
import logger from './utils/logger.js';
import { BodyLimit } from './constants/common.js';
import { initSentry } from './utils/sentry.js';

// Sentry (backend error tracking) — no-op unless SENTRY_DSN is set in the
// environment. Started before anything else so early errors are captured too.
await initSentry();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vite build folder: apps/web/dist
const webDistPath = path.resolve(__dirname, '../../web/dist');

app.set('trust proxy', true);

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
app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'QUERY'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }),
);

app.use(morgan('combined'));
app.use(globalRateLimit);

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

// Serve the built React / Vite website
app.use(express.static(webDistPath));

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
    return res.sendFile(path.join(webDistPath, 'index.html'));
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
    return res.sendFile(path.join(webDistPath, 'index.html'));
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