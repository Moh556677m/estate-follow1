/// <reference path="../pb_data/types.d.ts" />

/**
 * Integration Registry — a single, real source of truth for every external
 * tool/service the project actually uses (Sentry, GA4, Clarity, OneSignal,
 * reCAPTCHA, Gemini/OpenAI/Anthropic, Stripe, Resend, Cloudinary), replacing
 * the previous state where each one's config was scattered across index.html,
 * .env, and separate ad-hoc admin panels (EstateAiManagementPanel,
 * PaymentGatewaysPanel) with no single overview.
 *
 * This collection does NOT store secrets. `secret_refs` holds only
 * *references* — env var names, or (for the two integrations that already
 * had their own encrypted-secret systems: AI provider keys and payment
 * gateways) a pointer to that existing record's id — never a raw key value.
 *
 * `is_system` marks the 11 integrations discovered by scanning the real
 * codebase (see the seed data below) — these can be edited/enabled/disabled
 * but never deleted, since deleting the registry ROW must never be confused
 * with deleting the actual integration's code/env var. A custom integration
 * added later via the Admin UI (`is_system: false`) can be deleted freely —
 * deleting it only removes this catalog entry, never any real secret.
 */
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId('integration_registry');
    } catch (_) {
      collection = new Collection({
        type: 'base',
        name: 'integration_registry',
        // Super-admin only, every operation — matches the existing
        // ai_provider_keys / crm_admin_settings pattern in this project.
        listRule: '@request.auth.is_super_admin = true',
        viewRule: '@request.auth.is_super_admin = true',
        createRule: '@request.auth.is_super_admin = true',
        updateRule: '@request.auth.is_super_admin = true',
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          { name: 'name', type: 'text', required: true, max: 120 },
          // provider: a short machine key used by the backend's per-service
          // test-connection/enable dispatch (server/routes/integrations.js).
          // "custom" = a user-added integration with no built-in wiring
          // beyond a generic HTTP test-connection.
          {
            name: 'provider',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: [
              'sentry', 'google_analytics', 'clarity', 'onesignal',
              'recaptcha', 'anthropic', 'openai', 'gemini', 'stripe',
              'resend', 'cloudinary', 'custom',
            ],
          },
          {
            name: 'category',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: [
              'error_tracking', 'analytics', 'push_notifications',
              'anti_bot', 'ai_provider', 'payment', 'email', 'storage_cdn',
              'sms', 'other',
            ],
          },
          { name: 'description', type: 'text', max: 500 },
          // usedBy — plain-language list of the site sections that depend on
          // this integration, shown in the admin UI so disabling one is an
          // informed decision (e.g. ["Estate AI — Add Property", "Smart Payment Plan Reader"]).
          { name: 'used_by', type: 'json', maxSize: 5000 },
          { name: 'enabled', type: 'bool' },
          // config — non-secret settings (model name, measurement id, app id,
          // priority, max file size, etc.) — whatever this integration needs
          // besides its secret.
          { name: 'config', type: 'json', maxSize: 20000 },
          // secret_refs — REFERENCES ONLY, never raw values. Typically
          // { env_var: "OPENAI_API_KEY" } or, for the two integrations that
          // already have their own encrypted-secret system,
          // { proxy_collection: "ai_provider_keys", proxy_id: "..." } /
          // { proxy_collection: "payment_gateways", proxy_id: "..." } so this
          // registry never duplicates where the real secret lives.
          { name: 'secret_refs', type: 'json', maxSize: 5000 },
          { name: 'needs_secret', type: 'bool' },
          {
            name: 'side',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['frontend', 'backend', 'both'],
          },
          { name: 'env_vars', type: 'json', maxSize: 2000 },
          {
            name: 'auth_type',
            type: 'select',
            maxSelect: 1,
            values: ['api_key', 'bearer_token', 'oauth', 'basic_auth', 'webhook', 'none'],
          },
          { name: 'base_url', type: 'text', max: 300 },
          { name: 'test_endpoint', type: 'text', max: 300 },
          { name: 'webhook_url', type: 'text', max: 300 },
          { name: 'docs_url', type: 'text', max: 300 },
          {
            name: 'health_status',
            type: 'select',
            maxSelect: 1,
            values: ['active', 'disabled', 'error', 'not_configured'],
          },
          { name: 'last_success', type: 'date' },
          { name: 'last_error', type: 'text', max: 1000 },
          { name: 'last_error_at', type: 'date' },
          // is_system: discovered-in-code vs admin-added-custom (see file header).
          { name: 'is_system', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_integration_registry_provider ON integration_registry (provider)',
        ],
      });
      app.save(collection);
    }

    // Seed with the integrations actually found in the codebase (verified by
    // reading the real source — nothing here is invented). Only seeded once
    // (skipped if the collection already has rows, e.g. on a re-run).
    const existing = app.findAllRecords('integration_registry');
    if (existing && existing.length > 0) return;

    const seeds = [
      {
        name: 'Sentry',
        provider: 'sentry',
        category: 'error_tracking',
        description_en: 'Frontend error tracking and crash reporting.',
        description_ar: 'تتبع أخطاء الواجهة الأمامية وتسجيل الأعطال.',
        used_by: ['apps/web/src/main.jsx (global init)'],
        enabled: true,
        config: { dsn_is_public: true },
        secret_refs: {},
        needs_secret: false,
        side: 'frontend',
        env_vars: [],
        auth_type: 'none',
        docs_url: 'https://docs.sentry.io/',
        health_status: 'active',
      },
      {
        name: 'Google Analytics (GA4)',
        provider: 'google_analytics',
        category: 'analytics',
        description_en: 'Pageview and event analytics (gtag.js).',
        description_ar: 'تحليلات الزيارات والأحداث.',
        used_by: ['apps/web/index.html (gtag.js)', 'apps/web/src/components/AnalyticsTracker.jsx'],
        enabled: true,
        config: { measurement_id: 'G-G5N5852F44' },
        secret_refs: {},
        needs_secret: false,
        side: 'frontend',
        env_vars: [],
        auth_type: 'none',
        docs_url: 'https://support.google.com/analytics',
        health_status: 'active',
      },
      {
        name: 'Microsoft Clarity',
        provider: 'clarity',
        category: 'analytics',
        description_en: 'Session recordings and heatmaps.',
        description_ar: 'تسجيل الجلسات وخرائط الحرارة.',
        used_by: ['apps/web/index.html (Clarity tag)'],
        enabled: true,
        config: { project_id: 'ygct2dhxso' },
        secret_refs: {},
        needs_secret: false,
        side: 'frontend',
        env_vars: [],
        auth_type: 'none',
        docs_url: 'https://clarity.microsoft.com/',
        health_status: 'active',
      },
      {
        name: 'OneSignal',
        provider: 'onesignal',
        category: 'push_notifications',
        description_en: 'Web push notifications.',
        description_ar: 'إشعارات الويب الفورية (Push).',
        used_by: ['apps/web/index.html (OneSignal SDK)', 'apps/web/src/lib/onesignal.js', 'apps/web/src/contexts/AuthContext.jsx'],
        enabled: true,
        config: { app_id: 'af6c81b2-a757-457f-9d46-50477b7ba31e' },
        secret_refs: {},
        needs_secret: false,
        side: 'frontend',
        env_vars: [],
        auth_type: 'none',
        docs_url: 'https://documentation.onesignal.com/',
        health_status: 'active',
      },
      {
        name: 'Google reCAPTCHA v3',
        provider: 'recaptcha',
        category: 'anti_bot',
        description_en: 'Bot protection on login/signup/forgot-password.',
        description_ar: 'حماية من البوتات عند تسجيل الدخول/التسجيل/نسيت كلمة المرور.',
        used_by: ['apps/web/src/lib/recaptcha.js', 'apps/api/src/routes/recaptcha.js', 'LoginPage/SignupPage/ForgotPasswordPage'],
        enabled: true,
        config: {},
        secret_refs: { env_var: 'RECAPTCHA_SECRET_KEY' },
        needs_secret: true,
        side: 'both',
        env_vars: ['RECAPTCHA_SECRET_KEY'],
        auth_type: 'api_key',
        test_endpoint: '/hcgi/api/recaptcha/verify',
        docs_url: 'https://developers.google.com/recaptcha',
        health_status: 'active',
      },
      {
        name: 'Anthropic Claude',
        provider: 'anthropic',
        category: 'ai_provider',
        description_en: 'Estate AI document reading — purchase contracts, payment plans, lease contracts.',
        description_ar: 'قراءة مستندات Estate AI — عقود الشراء وخطط الدفع وعقود الإيجار.',
        used_by: ['Estate AI — Add Property', 'Smart Payment Plan Reader'],
        enabled: true,
        config: { proxy_note: 'Enable/disable here mirrors the existing ai_provider_keys record — same source of truth.' },
        secret_refs: { proxy_collection: 'ai_provider_keys', env_var: 'ANTHROPIC_API_KEY' },
        needs_secret: true,
        side: 'backend',
        env_vars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'ANTHROPIC_PLAN_MODEL'],
        auth_type: 'api_key',
        docs_url: 'https://docs.anthropic.com/',
        health_status: 'active',
      },
      {
        name: 'OpenAI',
        provider: 'openai',
        category: 'ai_provider',
        description_en: 'Fallback AI provider for Estate AI document reading.',
        description_ar: 'مزود ذكاء اصطناعي بديل لقراءة مستندات Estate AI.',
        used_by: ['Estate AI — Add Property (fallback provider)'],
        enabled: false,
        config: { proxy_note: 'Enable/disable here mirrors the existing ai_provider_keys record — same source of truth.' },
        secret_refs: { proxy_collection: 'ai_provider_keys', env_var: 'OPENAI_API_KEY' },
        needs_secret: true,
        side: 'backend',
        env_vars: ['OPENAI_API_KEY'],
        auth_type: 'api_key',
        docs_url: 'https://platform.openai.com/docs',
        health_status: 'not_configured',
      },
      {
        name: 'Google Gemini',
        provider: 'gemini',
        category: 'ai_provider',
        description_en: 'Alternative AI provider for Estate AI document reading.',
        description_ar: 'مزود ذكاء اصطناعي بديل لقراءة مستندات Estate AI.',
        used_by: ['Estate AI — Add Property (alternative provider)'],
        enabled: false,
        config: { proxy_note: 'Enable/disable here mirrors the existing ai_provider_keys record — same source of truth.' },
        secret_refs: { proxy_collection: 'ai_provider_keys', env_var: 'GEMINI_API_KEY' },
        needs_secret: true,
        side: 'backend',
        env_vars: ['GEMINI_API_KEY'],
        auth_type: 'api_key',
        docs_url: 'https://ai.google.dev/',
        health_status: 'not_configured',
      },
      {
        name: 'Stripe',
        provider: 'stripe',
        category: 'payment',
        description_en: 'Subscription payments and billing.',
        description_ar: 'مدفوعات الاشتراكات والفوترة.',
        used_by: ['SubscriptionPanel.jsx', 'PaymentGatewaysPanel.jsx', 'apps/api/src/routes/payment-gateways.js', 'apps/api/src/routes/stripe-webhook.js'],
        enabled: true,
        config: { proxy_note: 'Enable/disable here mirrors the existing payment_gateways record — same source of truth.' },
        secret_refs: { proxy_collection: 'payment_gateways' },
        needs_secret: true,
        side: 'both',
        env_vars: [],
        auth_type: 'api_key',
        webhook_url: '/hcgi/api/stripe/webhook',
        docs_url: 'https://stripe.com/docs',
        health_status: 'active',
      },
      {
        name: 'Resend',
        provider: 'resend',
        category: 'email',
        description_en: 'Transactional email — OTP, email verification, password reset, notifications.',
        description_ar: 'البريد الإلكتروني التشغيلي — رمز التحقق، تفعيل البريد، إعادة تعيين كلمة المرور، الإشعارات.',
        used_by: ['apps/pocketbase/pb_hooks/0-resend-mailer.pb.js', 'auth OTP/verification flows', 'notifications'],
        enabled: true,
        config: {},
        secret_refs: { env_var: 'RESEND_API_KEY' },
        needs_secret: true,
        side: 'backend',
        env_vars: ['RESEND_API_KEY'],
        auth_type: 'api_key',
        docs_url: 'https://resend.com/docs',
        health_status: 'active',
      },
      {
        name: 'Cloudinary',
        provider: 'cloudinary',
        category: 'storage_cdn',
        description_en: 'Uploaded document/image storage and CDN delivery.',
        description_ar: 'تخزين المستندات/الصور المرفوعة وتوصيلها عبر CDN.',
        used_by: ['DocumentsCenter.jsx', 'PropertyForm.jsx', 'AiPropertyChat.jsx', 'apps/api/src/routes/cloudinary-upload.js'],
        enabled: true,
        config: {},
        secret_refs: { env_var: 'CLOUDINARY_API_SECRET' },
        needs_secret: true,
        side: 'both',
        env_vars: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
        auth_type: 'api_key',
        docs_url: 'https://cloudinary.com/documentation',
        health_status: 'active',
      },
    ];

    seeds.forEach((s) => {
      try {
        const rec = new Record(collection);
        rec.set('name', s.name);
        rec.set('provider', s.provider);
        rec.set('category', s.category);
        rec.set(
          'description',
          JSON.stringify({ en: s.description_en, ar: s.description_ar }),
        );
        rec.set('used_by', JSON.stringify(s.used_by || []));
        rec.set('enabled', !!s.enabled);
        rec.set('config', JSON.stringify(s.config || {}));
        rec.set('secret_refs', JSON.stringify(s.secret_refs || {}));
        rec.set('needs_secret', !!s.needs_secret);
        rec.set('side', s.side);
        rec.set('env_vars', JSON.stringify(s.env_vars || []));
        if (s.auth_type) rec.set('auth_type', s.auth_type);
        if (s.base_url) rec.set('base_url', s.base_url);
        if (s.test_endpoint) rec.set('test_endpoint', s.test_endpoint);
        if (s.webhook_url) rec.set('webhook_url', s.webhook_url);
        if (s.docs_url) rec.set('docs_url', s.docs_url);
        rec.set('health_status', s.health_status || 'not_configured');
        rec.set('is_system', true);
        app.save(rec);
      } catch (_) {
        /* never let one bad seed row abort the whole migration/boot */
      }
    });
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('integration_registry');
      app.delete(c);
    } catch (_) {}
  },
);
