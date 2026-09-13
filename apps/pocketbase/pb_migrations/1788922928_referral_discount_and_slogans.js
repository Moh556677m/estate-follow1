/// <reference path="../pb_data/types.d.ts" />

// Referral discount + admin-editable slogans.
//
// Adds to `users`:
//   referral_discount_used  bool — true once the referred user has consumed
//                                  their one-time first-subscription discount
//                                  (set by the Stripe webhook on paid order).
//
// Adds to `subscription_orders`:
//   referral_discount_percent  number — the discount % applied to this order
//                                       (0 / empty when no referral discount).
//
// Seeds `platform_settings.cms.referrals` with:
//   discount_percent  number — admin-controlled discount % applied to a
//                              referred user's FIRST subscription at Stripe
//                              Checkout (default 10).
//   slogans           array  — admin-editable promotional sentences shown on
//                              the referrals page. Each item: { ar, en }.
//                              Admin can add / edit / remove any time from the
//                              control panel without touching code.
//
// The existing on/off flags (enabled, owner, broker, company) are preserved.

migrate(
  (app) => {
    // ---- users.referral_discount_used ----
    const users = app.findCollectionByNameOrId('users');
    if (!users.fields.getByName('referral_discount_used')) {
      users.fields.add(new BoolField({ name: 'referral_discount_used' }));
      app.save(users);
    }

    // ---- subscription_orders.referral_discount_percent ----
    try {
      const orders = app.findCollectionByNameOrId('subscription_orders');
      if (orders && !orders.fields.getByName('referral_discount_percent')) {
        orders.fields.add(
          new NumberField({ name: 'referral_discount_percent', min: 0, max: 100 }),
        );
        app.save(orders);
      }
    } catch (_) {}

    // ---- seed referral settings (discount_percent + slogans) ----
    const DEFAULT_SLOGANS = [
      {
        ar: 'ادعُ أصدقاءك واحصل على خصم خاص على أول اشتراك لكما.',
        en: 'Invite your friends and both get a special discount on your first subscription.',
      },
      {
        ar: 'كل صديق ينضم برابطك يقرّبك من المكافآت.',
        en: 'Every friend who joins via your link brings you closer to rewards.',
      },
      {
        ar: 'شارك تجربتك مع إستيت فولو وابنِ مجتمعك العقاري.',
        en: 'Share your Estate Follow experience and build your property community.',
      },
    ];

    try {
      const rows = app.findAllRecords('platform_settings');
      if (rows.length) {
        const rec = rows[0];
        let cms = rec.get('cms');
        if (!cms || typeof cms !== 'object') cms = {};
        if (!cms.referrals || typeof cms.referrals !== 'object') {
          cms.referrals = {
            enabled: true,
            owner: true,
            broker: true,
            company: true,
            discount_percent: 10,
            slogans: DEFAULT_SLOGANS,
          };
        } else {
          const r = cms.referrals;
          if (typeof r.discount_percent === 'undefined') r.discount_percent = 10;
          if (!Array.isArray(r.slogans)) r.slogans = DEFAULT_SLOGANS;
        }
        rec.set('cms', cms);
        app.save(rec);
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('users');
      if (users.fields.getByName('referral_discount_used')) {
        users.fields.removeByName('referral_discount_used');
        app.save(users);
      }
    } catch (_) {}
    try {
      const orders = app.findCollectionByNameOrId('subscription_orders');
      if (orders && orders.fields.getByName('referral_discount_percent')) {
        orders.fields.removeByName('referral_discount_percent');
        app.save(orders);
      }
    } catch (_) {}
  },
);
