/// <reference path="../pb_data/types.d.ts" />

// Production incident: real users were being hit with widespread 429s
// (login, browsing, ordinary API calls) and shown "حدث خطأ ما" — the
// dominant cause was a completely separate Express-level global limiter
// (apps/api/src/middleware/global-rate-limit.js, now removed) that counted
// EVERY request — static assets included — against one shared
// 100-requests/5-minutes budget in front of the whole site. See that
// removal in apps/api/src/main.js for the primary fix.
//
// This migration only relaxes PocketBase's OWN, separate general-purpose
// "/api" rate limit (set in 1769164585_set_rate_limits.js), as a second
// layer of defense-in-depth against the same class of incident: 200
// requests/5min per real client IP is tight enough to matter for shared
// IPs (corporate networks, mobile carrier NAT — many distinct real users
// can share one public IP) even though it was never the primary reported
// cause (it only ever governs actual PocketBase-bound traffic — auth,
// collection reads/writes, file downloads — never static JS/CSS/image
// assets, which Express serves directly and PocketBase never sees).
//
// The guest-only auth-attempt brute-force rule is also relaxed slightly
// (20 -> 40 per 5 minutes) for the same shared-IP reason, while staying a
// real, meaningful deterrent (40 attempts/5min is still far too slow for
// practical password guessing). It already only ever applies to guest
// (unauthenticated) requests — the moment a client authenticates
// successfully, its subsequent requests are tagged "@auth" and stop
// counting against this bucket at all, which is the closest PocketBase's
// built-in (success/failure-agnostic) counter gets to "reset after a
// successful login" without a custom hook.
//
// Every other existing rule (password reset, email verification, email
// change, OTP) is deliberately left untouched — those are low-volume,
// sensitive, already-reasonable per-IP limits that were never implicated
// in this incident and don't affect ordinary browsing/login at all.
migrate(
  (app) => {
    const settings = app.settings();
    const rules = settings.rateLimits.rules || [];

    const bump = (label, audience, newMax) => {
      const rule = rules.find((r) => r.label === label && r.audience === audience);
      if (rule) rule.maxRequests = newMax;
    };

    bump('/api', '', 2000);
    bump('*:auth', '@guest', 40);

    settings.rateLimits.rules = rules;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    const rules = settings.rateLimits.rules || [];

    const bump = (label, audience, oldMax) => {
      const rule = rules.find((r) => r.label === label && r.audience === audience);
      if (rule) rule.maxRequests = oldMax;
    };

    bump('/api', '', 200);
    bump('*:auth', '@guest', 20);

    settings.rateLimits.rules = rules;
    app.save(settings);
  },
);
