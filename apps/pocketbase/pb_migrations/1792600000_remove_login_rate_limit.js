/// <reference path="../pb_data/types.d.ts" />

// Explicit instruction: no limit at all on login. Removes the "*:auth" /
// "@guest" rule entirely (it was already relaxed from 20 to 40 attempts
// per 5 minutes in 1792500000_relax_general_rate_limits.js — this goes
// further and removes it, so no count of login attempts can ever block a
// real user from signing in).
//
// This intentionally REMOVES the site's only remaining brute-force
// throttle on password guessing against auth-with-password. Every other
// rate limit (the general "/api" budget, password reset, email
// verification, email change, OTP request) is untouched and still
// protects those specific, lower-traffic, higher-sensitivity actions.
migrate(
  (app) => {
    const settings = app.settings();
    const rules = settings.rateLimits.rules || [];
    settings.rateLimits.rules = rules.filter(
      (r) => !(r.label === '*:auth' && r.audience === '@guest'),
    );
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    const rules = settings.rateLimits.rules || [];
    const already = rules.some((r) => r.label === '*:auth' && r.audience === '@guest');
    if (!already) {
      rules.push({ label: '*:auth', audience: '@guest', duration: 5 * 60, maxRequests: 40 });
    }
    settings.rateLimits.rules = rules;
    app.save(settings);
  },
);
