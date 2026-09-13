/// <reference path="../pb_data/types.d.ts" />

// Referrals system + Owner account verification.
//
// Adds to `users`:
//   referred_by      relation -> users (the referrer; set at signup)
//   phone_verified   bool
//   document_type    select [passport, residence]
//   document_number  text
//   document_file    file (pdf/image, protected) — ID document
//   profile_photo    file (image) — optional profile photo
//   submitted_at     date — when owner submitted for review
//   approved_at      date — when super admin approved the account
//   user_review_note text — admin note for changes_requested/rejected
//
// New collections:
//   referrals            — one row per referred account (referrer + referred)
//   referral_clicks      — anonymous link-open events
//   referral_offers      — dynamic offers created by Super Admin
//   referral_rewards     — granted/pending rewards
//   verification_codes   — email/phone OTP codes (server-side only)
//
// Referral settings live in platform_settings.cms.referrals.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    const addField = (name, factory) => {
      if (users.fields.getByName(name)) return;
      users.fields.add(factory());
    };

    addField('referred_by', () =>
      new RelationField({
        name: 'referred_by',
        required: false,
        maxSelect: 1,
        collectionId: users.id,
        cascadeDelete: false,
      }),
    );
    addField('phone_verified', () => new BoolField({ name: 'phone_verified' }));
    addField('document_type', () =>
      new SelectField({
        name: 'document_type',
        required: false,
        maxSelect: 1,
        values: ['passport', 'residence'],
      }),
    );
    addField('document_number', () => new TextField({ name: 'document_number', max: 120 }));
    addField('document_file', () =>
      new FileField({
        name: 'document_file',
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        protected: true,
      }),
    );
    addField('profile_photo', () =>
      new FileField({
        name: 'profile_photo',
        maxSelect: 1,
        maxSize: 5242880,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      }),
    );
    addField('submitted_at', () => new DateField({ name: 'submitted_at', required: false }));
    addField('approved_at', () => new DateField({ name: 'approved_at', required: false }));
    addField('user_review_note', () => new TextField({ name: 'user_review_note', max: 2000 }));
    addField('subscription_plan', () =>
      new SelectField({
        name: 'subscription_plan',
        required: false,
        maxSelect: 1,
        values: ['free', 'monthly', 'yearly', 'lifetime'],
      }),
    );
    addField('subscription_expiry', () => new DateField({ name: 'subscription_expiry', required: false }));

    app.save(users);

    // ---- referrals ----
    const createCollection = (name, rules, fields, indexes) => {
      try {
        app.findCollectionByNameOrId(name);
        return app.findCollectionByNameOrId(name);
      } catch (_) {}
      const col = new Collection({
        type: 'base',
        name,
        listRule: rules.list,
        viewRule: rules.view,
        createRule: rules.create,
        updateRule: rules.update,
        deleteRule: rules.delete,
        fields,
        indexes: indexes || [],
      });
      app.save(col);
      return col;
    };

    createCollection(
      'referrals',
      {
        list: "@request.auth.id != '' && (@request.auth.id = referrer || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        view: "@request.auth.id != '' && (@request.auth.id = referrer || @request.auth.is_super_admin = true || @request.auth.role = 'admin' || @request.auth.role = 'editor' || @request.auth.role = 'support' || @request.auth.role = 'custom')",
        create: '@request.auth.is_super_admin = true',
        update: '@request.auth.is_super_admin = true',
        delete: '@request.auth.is_super_admin = true',
      },
      [
        { name: 'referrer', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
        { name: 'referred_user', type: 'relation', required: false, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
        { name: 'referred_email', type: 'text', max: 200 },
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['pending', 'approved', 'rejected', 'changes_requested'] },
        { name: 'account_type', type: 'text', max: 20 },
        { name: 'country', type: 'text', max: 120 },
        { name: 'approved_at', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      [
        'CREATE INDEX idx_referrals_referrer ON referrals (referrer, status)',
        'CREATE INDEX idx_referrals_referred ON referrals (referred_user)',
      ],
    );

    createCollection(
      'referral_clicks',
      {
        list: '@request.auth.is_super_admin = true',
        view: '@request.auth.is_super_admin = true',
        create: '', // anonymous link opens
        update: null,
        delete: '@request.auth.is_super_admin = true',
      },
      [
        { name: 'referrer', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
        { name: 'ip', type: 'text', max: 60 },
        { name: 'user_agent', type: 'text', max: 300 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      ['CREATE INDEX idx_refclicks_referrer ON referral_clicks (referrer, created)'],
    );

    createCollection(
      'referral_offers',
      {
        list: '@request.auth.is_super_admin = true',
        view: '@request.auth.is_super_admin = true',
        create: '@request.auth.is_super_admin = true',
        update: '@request.auth.is_super_admin = true',
        delete: '@request.auth.is_super_admin = true',
      },
      [
        { name: 'name_en', type: 'text', required: true, max: 200 },
        { name: 'name_ar', type: 'text', required: true, max: 200 },
        { name: 'desc_en', type: 'text', max: 2000 },
        { name: 'desc_ar', type: 'text', max: 2000 },
        { name: 'beneficiary_type', type: 'select', required: true, maxSelect: 1, values: ['owner', 'broker', 'company', 'all'] },
        { name: 'referred_type', type: 'select', required: true, maxSelect: 1, values: ['owner', 'broker', 'company', 'all'] },
        { name: 'required_count', type: 'number', required: true, min: 1 },
        { name: 'reward_type', type: 'select', required: true, maxSelect: 1, values: ['free_subscription', 'badge', 'custom'] },
        { name: 'reward_duration', type: 'select', maxSelect: 1, values: ['monthly', 'yearly', 'lifetime', 'none'] },
        { name: 'plan', type: 'select', maxSelect: 1, values: ['free', 'monthly', 'yearly', 'lifetime'] },
        { name: 'start_date', type: 'date' },
        { name: 'end_date', type: 'date' },
        { name: 'automatic', type: 'bool' },
        { name: 'one_time', type: 'bool' },
        { name: 'all_countries', type: 'bool' },
        { name: 'countries', type: 'json', maxSize: 200000 },
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'paused', 'ended', 'archived'] },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      ['CREATE INDEX idx_refoffers_status ON referral_offers (status)'],
    );

    createCollection(
      'referral_rewards',
      {
        list: "@request.auth.id != '' && (@request.auth.id = referrer || @request.auth.is_super_admin = true)",
        view: "@request.auth.id != '' && (@request.auth.id = referrer || @request.auth.is_super_admin = true)",
        create: '@request.auth.is_super_admin = true',
        update: '@request.auth.is_super_admin = true',
        delete: '@request.auth.is_super_admin = true',
      },
      [
        { name: 'referrer', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
        { name: 'offer', type: 'relation', required: true, maxSelect: 1, collectionId: app.findCollectionByNameOrId('referral_offers').id, cascadeDelete: true },
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['pending', 'granted', 'rejected'] },
        { name: 'plan', type: 'text', max: 40 },
        { name: 'expiry', type: 'date' },
        { name: 'granted_at', type: 'date' },
        { name: 'note', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      [
        'CREATE INDEX idx_refrewards_referrer ON referral_rewards (referrer, status)',
        'CREATE UNIQUE INDEX idx_refrewards_unique ON referral_rewards (referrer, offer) WHERE status != \'rejected\'',
      ],
    );

    createCollection(
      'verification_codes',
      {
        list: null,
        view: null,
        create: null, // server-side only
        update: null,
        delete: null,
      },
      [
        { name: 'user', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
        { name: 'purpose', type: 'select', required: true, maxSelect: 1, values: ['email', 'phone'] },
        { name: 'code', type: 'text', required: true, max: 12 },
        { name: 'expires_at', type: 'date', required: true },
        { name: 'verified', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      ['CREATE INDEX idx_vercode_user ON verification_codes (user, purpose, created)'],
    );

    // ---- default referral settings in platform_settings.cms.referrals ----
    try {
      const rows = app.findAllRecords('platform_settings');
      if (rows.length) {
        const rec = rows[0];
        let cms = rec.get('cms');
        if (!cms || typeof cms !== 'object') cms = {};
        let changed = false;
        if (!cms.referrals || typeof cms.referrals !== 'object') {
          cms.referrals = { enabled: true, owner: true, broker: true, company: true };
          changed = true;
        } else {
          const r = cms.referrals;
          if (typeof r.enabled === 'undefined') { r.enabled = true; changed = true; }
          if (typeof r.owner === 'undefined') { r.owner = true; changed = true; }
          if (typeof r.broker === 'undefined') { r.broker = true; changed = true; }
          if (typeof r.company === 'undefined') { r.company = true; changed = true; }
        }
        if (changed) {
          rec.set('cms', cms);
          app.save(rec);
        }
      }
    } catch (_) {}
  },
  (app) => {
    const dropIf = (name) => {
      try {
        const c = app.findCollectionByNameOrId(name);
        app.delete(c);
      } catch (_) {}
    };
    dropIf('referral_rewards');
    dropIf('referral_offers');
    dropIf('referral_clicks');
    dropIf('referrals');
    dropIf('verification_codes');
    try {
      const users = app.findCollectionByNameOrId('users');
      ['referred_by', 'phone_verified', 'document_type', 'document_number', 'document_file', 'profile_photo', 'submitted_at', 'approved_at', 'user_review_note', 'subscription_plan', 'subscription_expiry'].forEach((n) => {
        if (users.fields.getByName(n)) users.fields.removeByName(n);
      });
      app.save(users);
    } catch (_) {}
  },
);
