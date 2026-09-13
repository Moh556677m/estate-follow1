import { Router } from 'express';
import healthCheck from './health-check.js';
import integratedAiRouter from './integrated-ai.js';
import estateAiRouter from './estate-ai.js';
import aiProvidersRouter from './ai-providers.js';
import insightsSeoRouter from './insights-seo.js';
import cloudinaryRouter from './cloudinary-upload.js';
import paymentGatewaysRouter from './payment-gateways.js';
import stripeWebhook from './stripe-webhook.js';
import recaptchaRouter from './recaptcha.js';
import publicBrandingRouter from './public-branding.js';
import integrationsRouter, { publicScriptStatusRouter } from './integrations.js';
import portfolioAdvisorRouter from './portfolio-advisor.js';
import documentSharesRouter from './document-shares.js';
import siteIssuesRouter from './site-issues.js';
import supabaseDiagnosticsRouter from './supabase-diagnostics.js';

const router = Router();

export default () => {
    router.get('/health', healthCheck);
    router.use('/integrated-ai', integratedAiRouter);
    router.use('/estate-ai', estateAiRouter);
    router.use('/', aiProvidersRouter);
    router.use('/insights', insightsSeoRouter);
    router.use('/cloudinary', cloudinaryRouter);
    router.use('/payment-gateways', paymentGatewaysRouter);
    // reCAPTCHA v3 verification — pre-auth, no PocketBase auth middleware.
    router.use('/recaptcha', recaptchaRouter);
    // Public branding (logo/favicon/brand colors/SEO defaults) — deliberately
    // no auth middleware, so anonymous visitors get the real Admin-configured
    // brand instead of only the static build-time defaults.
    router.use('/public/branding', publicBrandingRouter);
    // Integration Registry — Admin panel (super-admin only) + a tiny public
    // status endpoint the frontend script loader checks before injecting
    // GA4/Clarity/OneSignal/Sentry.
    router.use('/integrations', integrationsRouter);
    router.use('/public/integration-status', publicScriptStatusRouter);
    // Task #17 — AI Portfolio Advisor (auth required, entitlement-gated).
    router.use('/portfolio-advisor', portfolioAdvisorRouter);
    // Task #17 — Secure Sharing resolution. Deliberately public (see
    // document-shares.js header comment) — a share-link viewer has no
    // PocketBase session.
    router.use('/public/document-shares', documentSharesRouter);
    // Stripe webhook — mounted bare (no auth, no /payment-gateways prefix)
    // because Stripe POSTs directly to this URL with a signature header.
    router.post('/stripe/webhook', stripeWebhook);
    // Task #23 — Site Issues. /report is public (see file header); everything
    // else in this router requires Super Admin.
    router.use('/site-issues', siteIssuesRouter);
    // Supabase migration — Super-Admin-only diagnostic (see file header for
    // why this exists and what it does/doesn't touch).
    router.use('/supabase-diagnostics', supabaseDiagnosticsRouter);

    return router;
};

