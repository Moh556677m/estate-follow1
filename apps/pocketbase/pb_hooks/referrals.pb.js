/// <reference path="../pb_data/types.d.ts" />

// Referrals system + Owner account verification.
// Each handler is self-contained (PB JSVM isolated scope).

// ---------------------------------------------------------------------------
// Shared reward-granting logic (inlined per handler — PB JSVM scope isolation).
// Called after a referral becomes "approved". For each active offer matching
// the referrer/referred account types and country, if the referrer's approved
// count for that offer's referred_type has reached required_count, create a
// reward (granted if automatic, pending otherwise). For free_subscription
// rewards, extend the referrer's real subscription_expiry.
// ---------------------------------------------------------------------------
function grantRewardsForReferrer(app, referrerId) {
  try {
    const referrer = app.findRecordById('users', referrerId);
    const referrerType = String(referrer.get('account_type') || 'owner').toLowerCase();
    const now = new Date();
    const nowIso = now.toISOString();
    let offers = [];
    try {
      offers = app.findRecordsByFilter('referral_offers', "status = 'active'", '', 1000, 0, {});
    } catch (_) {}
    offers.forEach((offer) => {
      const benType = String(offer.get('beneficiary_type') || 'all').toLowerCase();
      const refType = String(offer.get('referred_type') || 'all').toLowerCase();
      if (benType !== 'all' && benType !== referrerType) return;
      const required = Number(offer.get('required_count')) || 0;
      if (required <= 0) return;
      // Date window
      const startD = offer.get('start_date');
      const endD = offer.get('end_date');
      if (startD) { try { if (new Date(String(startD)) > now) return; } catch (_) {} }
      if (endD) { try { if (new Date(String(endD)) < now) return; } catch (_) {} }
      // Count approved referrals matching referred_type (and country if limited)
      const allCountries = offer.getBool('all_countries');
      let countries = [];
      try { const c = offer.get('countries'); if (Array.isArray(c)) countries = c; else if (typeof c === 'string' && c) countries = JSON.parse(c); } catch (_) {}
      let approved = [];
      try {
        approved = app.findRecordsByFilter('referral_offers', 'id != ""', '', 1, 0, {});
      } catch (_) {}
      // Count from referrals collection
      let refRows = [];
      try {
        refRows = app.findRecordsByFilter('referrals', 'referrer = {:rid} && status = \'approved\'', '', 100000, 0, { rid: referrerId });
      } catch (_) {}
      let matched = 0;
      refRows.forEach((r) => {
        const at = String(r.get('account_type') || 'owner').toLowerCase();
        if (refType !== 'all' && refType !== at) return;
        if (!allCountries) {
          const c = String(r.get('country') || '').toUpperCase();
          const list = (countries || []).map((x) => String(x).toUpperCase());
          if (c && list.length && list.indexOf(c) === -1) return;
        }
        matched += 1;
      });
      if (matched < required) return;
      // Already granted (non-rejected)?
      let existing = [];
      try {
        existing = app.findRecordsByFilter('referral_rewards', 'referrer = {:rid} && offer = {:oid}', '', 100, 0, { rid: referrerId, oid: offer.id });
      } catch (_) {}
      const hasGranted = existing.some((x) => x.get('status') !== 'rejected');
      const oneTime = offer.getBool('one_time');
      if (oneTime && hasGranted) return;
      // Create reward
      const rewardType = String(offer.get('reward_type') || 'badge').toLowerCase();
      const automatic = offer.getBool('automatic');
      const plan = String(offer.get('plan') || 'free').toLowerCase();
      const duration = String(offer.get('reward_duration') || 'none').toLowerCase();
      const rewardsCol = app.findCollectionByNameOrId('referral_rewards');
      const reward = new Record(rewardsCol);
      reward.set('referrer', referrerId);
      reward.set('offer', offer.id);
      reward.set('plan', plan);
      if (automatic) {
        reward.set('status', 'granted');
        reward.set('granted_at', nowIso);
        // Real subscription extension for free_subscription rewards.
        if (rewardType === 'free_subscription' && duration !== 'none') {
          let base = referrer.get('subscription_expiry');
          let baseDate = null;
          try { if (base) baseDate = new Date(String(base)); } catch (_) {}
          if (!baseDate || isNaN(baseDate.getTime()) || baseDate < now) baseDate = now;
          const addMs = duration === 'monthly' ? 30 * 86400000 : duration === 'yearly' ? 365 * 86400000 : duration === 'lifetime' ? 100 * 365 * 86400000 : 0;
          if (addMs > 0) {
            const newExp = new Date(baseDate.getTime() + addMs).toISOString();
            referrer.set('subscription_expiry', newExp);
            referrer.set('subscription_plan', plan);
            app.save(referrer);
            reward.set('expiry', newExp);
          }
        }
      } else {
        reward.set('status', 'pending');
      }
      app.save(reward);
    });
  } catch (err) {
    try { app.logger().error('grantRewards failed', 'err', String(err)); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// GET /ef/referral/me — current user's referral stats, eligible offers,
// progress, and rewards. Auth required.
// ---------------------------------------------------------------------------
routerAdd(
  'GET',
  '/ef/referral/me',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) throw new UnauthorizedError('Authentication required.');
    const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };
    const readNum = (rec, key) => { try { const v = rec.get(key); const n = Number(v); return isNaN(n) ? 0 : n; } catch (_) { return 0; } };

    let referrals = [];
    try { referrals = $app.findRecordsByFilter('referrals', 'referrer = {:rid}', '-created', 100000, 0, { rid: auth.id }); } catch (_) {}
    let clicks = 0;
    try { const c = $app.findRecordsByFilter('referral_clicks', 'referrer = {:rid}', '', 100000, 0, { rid: auth.id }); clicks = c.length; } catch (_) {}
    let rewards = [];
    try { rewards = $app.findRecordsByFilter('referral_rewards', 'referrer = {:rid}', '-created', 100000, 0, { rid: auth.id }); } catch (_) {}
    let offers = [];
    try { offers = $app.findRecordsByFilter('referral_offers', "status = 'active'", '', 100000, 0, {}); } catch (_) {}

    const approved = referrals.filter((r) => readStr(r, 'status') === 'approved');
    const pending = referrals.filter((r) => readStr(r, 'status') === 'pending');
    const rejected = referrals.filter((r) => readStr(r, 'status') === 'rejected');
    const changes = referrals.filter((r) => readStr(r, 'status') === 'changes_requested');

    const referrerType = String(auth.get('account_type') || 'owner').toLowerCase();
    const now = new Date();

    const offerProgress = offers.map((o) => {
      const refType = String(o.get('referred_type') || 'all').toLowerCase();
      const required = Number(o.get('required_count')) || 0;
      const allCountries = o.getBool('all_countries');
      let countries = [];
      try { const c = o.get('countries'); if (Array.isArray(c)) countries = c; else if (typeof c === 'string' && c) countries = JSON.parse(c); } catch (_) {}
      let matched = 0;
      approved.forEach((r) => {
        const at = String(r.get('account_type') || 'owner').toLowerCase();
        if (refType !== 'all' && refType !== at) return;
        if (!allCountries) {
          const c = String(r.get('country') || '').toUpperCase();
          const list = (countries || []).map((x) => String(x).toUpperCase());
          if (c && list.length && list.indexOf(c) === -1) return;
        }
        matched += 1;
      });
      return {
        id: o.id,
        name_en: readStr(o, 'name_en'),
        name_ar: readStr(o, 'name_ar'),
        desc_en: readStr(o, 'desc_en'),
        desc_ar: readStr(o, 'desc_ar'),
        beneficiary_type: readStr(o, 'beneficiary_type'),
        referred_type: refType,
        required_count: required,
        reward_type: readStr(o, 'reward_type'),
        reward_duration: readStr(o, 'reward_duration'),
        plan: readStr(o, 'plan'),
        one_time: o.getBool('one_time'),
        automatic: o.getBool('automatic'),
        progress: matched,
        target: required,
      };
    }).filter((o) => {
      if (o.beneficiary_type === 'all') return true;
      return o.beneficiary_type === referrerType;
    });

    const log = referrals.map((r) => {
      let referredName = '';
      let referredEmail = readStr(r, 'referred_email');
      const ru = r.get('referred_user');
      const ruId = typeof ru === 'string' ? ru : (ru && ru.id) || '';
      if (ruId) { try { const u = $app.findRecordById('users', ruId); referredName = readStr(u, 'name'); } catch (_) {} }
      return {
        id: r.id,
        referred_name: referredName,
        referred_email: referredEmail,
        account_type: readStr(r, 'account_type'),
        country: readStr(r, 'country'),
        status: readStr(r, 'status'),
        created: readStr(r, 'created'),
        approved_at: readStr(r, 'approved_at'),
      };
    });

    // Admin-editable slogans + discount % shown on the referrals page.
    let slogans = [];
    let discountPercent = 0;
    try {
      const rows = $app.findAllRecords('platform_settings');
      if (rows.length) {
        const r = rows[0].get('cms') || {};
        const ref = r.referrals || {};
        if (Array.isArray(ref.slogans)) slogans = ref.slogans;
        const dp = Number(ref.discount_percent);
        if (!isNaN(dp)) discountPercent = dp;
      }
    } catch (_) {}

    return e.json(200, {
      userId: auth.id,
      referralCode: auth.id,
      slogans,
      discountPercent,
      approvedCount: approved.length,
      pendingCount: pending.length,
      rejectedCount: rejected.length,
      changesCount: changes.length,
      registrationsCount: referrals.length,
      linkClicks: clicks,
      offers: offerProgress,
      rewards: rewards.map((rw) => ({
        id: rw.id,
        offer_id: (() => { const o = rw.get('offer'); return typeof o === 'string' ? o : (o && o.id) || ''; })(),
        status: readStr(rw, 'status'),
        plan: readStr(rw, 'plan'),
        expiry: readStr(rw, 'expiry'),
        granted_at: readStr(rw, 'granted_at'),
        created: readStr(rw, 'created'),
      })),
      log,
    });
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// GET /ef/referral/track?ref=<userId> — public, records a link click.
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/referral/track', (e) => {
  const info = e.requestInfo();
  const ref = String((info.query && info.query.ref) || '').trim();
  if (!ref) return e.json(200, { ok: false });
  try {
    const referrer = $app.findRecordById('users', ref);
    if (referrer) {
      const col = $app.findCollectionByNameOrId('referral_clicks');
      const rec = new Record(col);
      rec.set('referrer', ref);
      try { rec.set('ip', String(info.remoteIP || '').slice(0, 60)); } catch (_) {}
      try { rec.set('user_agent', String(info.headers && info.headers['user-agent'] || '').slice(0, 300)); } catch (_) {}
      $app.save(rec);
    }
  } catch (err) {
    $app.logger().error('referral track failed', 'err', String(err));
  }
  return e.json(200, { ok: true });
});

// ---------------------------------------------------------------------------
// POST /ef/referral/invite — auth user emails a friend a signup link that
// contains their referral code (?ref=<userId>). Delivered via the platform
// mailer (Resend). Best-effort: a delivery failure returns a 400 so the UI
// can tell the user to try again, but never leaks the API key.
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/referral/invite',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) throw new UnauthorizedError('Authentication required.');
    const body = (e.requestInfo && e.requestInfo() ? e.requestInfo().body : null) || {};
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestError('A valid friend email is required.');
    }

    // Build the signup link with the caller's referral code embedded.
    let appUrl = '';
    try { appUrl = $app.settings().meta.appURL || ''; } catch (_) {}
    const link = appUrl + '/signup?ref=' + auth.id;

    let referrerName = 'Estate Follow';
    try { referrerName = auth.getString('name') || auth.getString('email') || referrerName; } catch (_) {}

    const subject = referrerName + ' دعاك إلى إستيت فولو / invited you to Estate Follow';
    const html =
      '<div dir="rtl" style="font-family:IBM Plex Sans Arabic,Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">' +
      '<h2 style="margin:0 0 12px">دعوة إلى إستيت فولو</h2>' +
      '<p style="font-size:16px;line-height:1.7">دعاك <b>' + referrerName + '</b> للانضمام إلى إستيت فولو — منصة إدارة العقارات الذكية. سجّل الآن عبر رابط الدعوة واحصل على خصم خاص على أول اشتراك.</p>' +
      '<p style="margin:18px 0"><a href="' + link + '" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700">سجّل الآن</a></p>' +
      '<p dir="ltr" style="font-size:13px;color:#64748b;word-break:break-all">' + link + '</p>' +
      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">' +
      '<p dir="ltr" style="font-size:15px;line-height:1.6"><b>' + referrerName + '</b> invited you to Estate Follow — the smart property management platform. Sign up now via the invite link and get a special discount on your first subscription.</p>' +
      '<p dir="ltr" style="margin:18px 0"><a href="' + link + '" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700">Sign up now</a></p>' +
      '</div>';
    const text = referrerName + ' invited you to Estate Follow. Sign up: ' + link;

    try {
      const msg = new MailerMessage({
        from: { name: 'Estate Follow' },
        to: [{ address: email }],
        subject: subject,
        html: html,
        text: text,
      });
      $app.newMailClient().send(msg);
    } catch (err) {
      $app.logger().error('referral invite email failed', 'to', email, 'err', String(err));
      throw new BadRequestError('Could not send the invite email. Please try again.');
    }
    return e.json(200, { ok: true });
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// GET /ef/referral/admin-overview — Super Admin aggregated stats.
// ---------------------------------------------------------------------------
routerAdd(
  'GET',
  '/ef/referral/admin-overview',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.getBool('is_super_admin')) throw new ForbiddenError('Super Admin only.');
    const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };

    let referrals = []; try { referrals = $app.findRecordsByFilter('referrals', 'id != ""', '-created', 100000, 0, {}); } catch (_) {}
    let clicks = []; try { clicks = $app.findRecordsByFilter('referral_clicks', 'id != ""', '-created', 100000, 0, {}); } catch (_) {}
    let offers = []; try { offers = $app.findRecordsByFilter('referral_offers', 'id != ""', '-created', 100000, 0, {}); } catch (_) {}
    let rewards = []; try { rewards = $app.findRecordsByFilter('referral_rewards', 'id != ""', '-created', 100000, 0, {}); } catch (_) {}

    const approved = referrals.filter((r) => readStr(r, 'status') === 'approved');
    const pending = referrals.filter((r) => readStr(r, 'status') === 'pending');
    const rejected = referrals.filter((r) => readStr(r, 'status') === 'rejected');
    const changes = referrals.filter((r) => readStr(r, 'status') === 'changes_requested');

    const byType = { owner: 0, broker: 0, company: 0 };
    approved.forEach((r) => { const at = String(r.get('account_type') || 'owner').toLowerCase(); if (byType[at] !== undefined) byType[at] += 1; });
    const byCountry = {};
    approved.forEach((r) => { const c = String(r.get('country') || '').toUpperCase(); if (c) byCountry[c] = (byCountry[c] || 0) + 1; });
    const byAccountTypeAll = { owner: 0, broker: 0, company: 0 };
    referrals.forEach((r) => { const at = String(r.get('account_type') || 'owner').toLowerCase(); if (byAccountTypeAll[at] !== undefined) byAccountTypeAll[at] += 1; });

    // Top referrers by approved count
    const refCounts = {};
    approved.forEach((r) => { const rf = r.get('referrer'); const id = typeof rf === 'string' ? rf : (rf && rf.id) || ''; if (id) refCounts[id] = (refCounts[id] || 0) + 1; });
    const topReferrers = Object.entries(refCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => {
      let name = ''; let email = ''; try { const u = $app.findRecordById('users', id); name = readStr(u, 'name'); email = readStr(u, 'email'); } catch (_) {}
      return { id, name, email, approvedCount: count };
    });

    const activeOffers = offers.filter((o) => readStr(o, 'status') === 'active').length;
    const pendingRewards = rewards.filter((rw) => readStr(rw, 'status') === 'pending').length;
    const grantedRewards = rewards.filter((rw) => readStr(rw, 'status') === 'granted').length;

    // Referral settings from platform_settings.cms.referrals
    let settings = { enabled: true, owner: true, broker: true, company: true };
    try {
      const rows = $app.findAllRecords('platform_settings');
      if (rows.length) {
        const cms = rows[0].get('cms') || {};
        if (cms.referrals) settings = Object.assign(settings, cms.referrals);
      }
    } catch (_) {}

    return e.json(200, {
      totalApproved: approved.length,
      pending: pending.length,
      rejected: rejected.length,
      changesRequested: changes.length,
      linkClicks: clicks.length,
      registrations: referrals.length,
      ownersReferred: byType.owner,
      brokersReferred: byType.broker,
      companiesReferred: byType.company,
      byCountry: Object.entries(byCountry).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count),
      byAccountType: byAccountTypeAll,
      activeOffers,
      pendingRewards,
      grantedRewards,
      topReferrers,
      settings,
      offers: offers.map((o) => ({
        id: o.id,
        name_en: readStr(o, 'name_en'),
        name_ar: readStr(o, 'name_ar'),
        desc_en: readStr(o, 'desc_en'),
        desc_ar: readStr(o, 'desc_ar'),
        beneficiary_type: readStr(o, 'beneficiary_type'),
        referred_type: readStr(o, 'referred_type'),
        required_count: Number(o.get('required_count')) || 0,
        reward_type: readStr(o, 'reward_type'),
        reward_duration: readStr(o, 'reward_duration'),
        plan: readStr(o, 'plan'),
        start_date: readStr(o, 'start_date'),
        end_date: readStr(o, 'end_date'),
        automatic: o.getBool('automatic'),
        one_time: o.getBool('one_time'),
        all_countries: o.getBool('all_countries'),
        countries: (() => { try { const c = o.get('countries'); return Array.isArray(c) ? c : (typeof c === 'string' ? JSON.parse(c) : []); } catch (_) { return []; } })(),
        status: readStr(o, 'status'),
        created: readStr(o, 'created'),
      })),
      rewards: rewards.map((rw) => {
        const o = rw.get('offer'); const oid = typeof o === 'string' ? o : (o && o.id) || '';
        const rf = rw.get('referrer'); const rid = typeof rf === 'string' ? rf : (rf && rf.id) || '';
        let referrerName = ''; let offerName = '';
        try { referrerName = readStr($app.findRecordById('users', rid), 'name'); } catch (_) {}
        try { offerName = readStr($app.findRecordById('referral_offers', oid), 'name_en'); } catch (_) {}
        return {
          id: rw.id,
          referrer_id: rid,
          referrer_name: referrerName,
          offer_id: oid,
          offer_name: offerName,
          status: readStr(rw, 'status'),
          plan: readStr(rw, 'plan'),
          expiry: readStr(rw, 'expiry'),
          granted_at: readStr(rw, 'granted_at'),
          created: readStr(rw, 'created'),
        };
      }),
    });
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// POST /ef/referral/admin/settings — update referral on/off settings.
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/referral/admin/settings',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.getBool('is_super_admin')) throw new ForbiddenError('Super Admin only.');
    const body = (e.requestInfo && e.requestInfo() ? e.requestInfo().body : null) || {};
    const settings = {
      enabled: !!body.enabled,
      owner: !!body.owner,
      broker: !!body.broker,
      company: !!body.company,
    };
    // Admin-controlled discount % applied to a referred user's first
    // subscription at Stripe Checkout. 0–100; 0 disables the discount.
    const dp = Number(body.discount_percent);
    settings.discount_percent = isNaN(dp) ? 0 : Math.max(0, Math.min(100, dp));
    // Admin-editable promotional slogans shown on the referrals page.
    // Each item: { ar, en }. Stored verbatim; admin can add/edit/remove.
    let slogans = body.slogans;
    if (typeof slogans === 'string') {
      try { slogans = JSON.parse(slogans); } catch (_) { slogans = []; }
    }
    if (Array.isArray(slogans)) {
      settings.slogans = slogans
        .map((s) => (s && typeof s === 'object' ? {
          ar: String(s.ar || '').slice(0, 500),
          en: String(s.en || '').slice(0, 500),
        } : null))
        .filter((s) => s && (s.ar || s.en))
        .slice(0, 20);
    }
    try {
      const rows = $app.findAllRecords('platform_settings');
      if (rows.length) {
        const rec = rows[0];
        let cms = rec.get('cms') || {};
        if (!cms || typeof cms !== 'object') cms = {};
        const prev = (cms.referrals && typeof cms.referrals === 'object') ? cms.referrals : {};
        // Merge: keep previous slogans/discount when the admin form didn't
        // submit them (defends against partial updates wiping settings).
        const merged = {
          enabled: settings.enabled,
          owner: settings.owner,
          broker: settings.broker,
          company: settings.company,
          discount_percent: settings.discount_percent,
          slogans: Array.isArray(settings.slogans) ? settings.slogans : (Array.isArray(prev.slogans) ? prev.slogans : []),
        };
        cms.referrals = merged;
        rec.set('cms', cms);
        $app.save(rec);
      }
    } catch (err) { $app.logger().error('referral settings save failed', 'err', String(err)); }
    return e.json(200, { ok: true, settings: settings });
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// POST /ef/referral/admin/grant-reward — manually grant a pending reward.
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/referral/admin/grant-reward',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.getBool('is_super_admin')) throw new ForbiddenError('Super Admin only.');
    const body = (e.requestInfo && e.requestInfo() ? e.requestInfo().body : null) || {};
    const rewardId = String(body.rewardId || '').trim();
    if (!rewardId) throw new BadRequestError('rewardId required.');
    let reward;
    try { reward = $app.findRecordById('referral_rewards', rewardId); } catch (_) { throw new BadRequestError('Reward not found.'); }
    if (reward.get('status') !== 'pending') throw new BadRequestError('Only pending rewards can be granted.');
    reward.set('status', 'granted');
    reward.set('granted_at', new Date().toISOString());
    const plan = String(reward.get('plan') || 'free').toLowerCase();
    // Apply real subscription extension.
    const rf = reward.get('referrer'); const rid = typeof rf === 'string' ? rf : (rf && rf.id) || '';
    const offerId = (() => { const o = reward.get('offer'); return typeof o === 'string' ? o : (o && o.id) || ''; })();
    let duration = 'none';
    try { const o = $app.findRecordById('referral_offers', offerId); duration = String(o.get('reward_duration') || 'none').toLowerCase(); } catch (_) {}
    if (rid && duration !== 'none') {
      try {
        const referrer = $app.findRecordById('users', rid);
        const now = new Date();
        let base = referrer.get('subscription_expiry');
        let baseDate = null;
        try { if (base) baseDate = new Date(String(base)); } catch (_) {}
        if (!baseDate || isNaN(baseDate.getTime()) || baseDate < now) baseDate = now;
        const addMs = duration === 'monthly' ? 30 * 86400000 : duration === 'yearly' ? 365 * 86400000 : duration === 'lifetime' ? 100 * 365 * 86400000 : 0;
        if (addMs > 0) {
          const newExp = new Date(baseDate.getTime() + addMs).toISOString();
          referrer.set('subscription_expiry', newExp);
          referrer.set('subscription_plan', plan);
          $app.save(referrer);
          reward.set('expiry', newExp);
        }
      } catch (err) { $app.logger().error('grant-reward sub update failed', 'err', String(err)); }
    }
    $app.save(reward);
    return e.json(200, { ok: true });
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// POST /ef/referral/approve-user — Super Admin approve / request changes /
// reject an owner account. Triggers referral count +1 on approve and checks
// rewards for the referrer.
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/referral/approve-user',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.getBool('is_super_admin')) throw new ForbiddenError('Super Admin only.');
    const body = (e.requestInfo && e.requestInfo() ? e.requestInfo().body : null) || {};
    const userId = String(body.userId || '').trim();
    const action = String(body.action || '').trim().toLowerCase();
    const note = String(body.note || '').slice(0, 2000);
    if (!userId) throw new BadRequestError('userId required.');
    if (action !== 'approve' && action !== 'request_changes' && action !== 'reject') {
      throw new BadRequestError('action must be approve | request_changes | reject.');
    }
    let user;
    try { user = $app.findRecordById('users', userId); } catch (_) { throw new BadRequestError('User not found.'); }
    if (user.getBool('is_super_admin')) throw new BadRequestError('Cannot review the Super Admin account.');

    const nowIso = new Date().toISOString();
    if (action === 'approve') {
      user.set('account_state', 'approved');
      user.set('approved_at', nowIso);
      user.set('verified', true);
      user.set('user_review_note', '');
      $app.save(user);
      // Approve the referral row (count +1).
      try {
        let rows = $app.findRecordsByFilter('referrals', 'referred_user = {:uid}', '', 10, 0, { uid: userId });
        rows.forEach((r) => {
          if (r.get('status') !== 'approved') {
            r.set('status', 'approved');
            r.set('approved_at', nowIso);
            $app.save(r);
            const rf = r.get('referrer'); const rid = typeof rf === 'string' ? rf : (rf && rf.id) || '';
            if (rid) grantRewardsForReferrer($app, rid);
          }
        });
      } catch (err) { $app.logger().error('referral approve failed', 'err', String(err)); }
    } else if (action === 'request_changes') {
      user.set('account_state', 'incomplete');
      user.set('user_review_note', note);
      $app.save(user);
      try {
        let rows = $app.findRecordsByFilter('referrals', 'referred_user = {:uid}', '', 10, 0, { uid: userId });
        rows.forEach((r) => { r.set('status', 'changes_requested'); $app.save(r); });
      } catch (_) {}
    } else {
      user.set('account_state', 'rejected');
      user.set('user_review_note', note);
      $app.save(user);
      try {
        let rows = $app.findRecordsByFilter('referrals', 'referred_user = {:uid}', '', 10, 0, { uid: userId });
        rows.forEach((r) => { r.set('status', 'rejected'); $app.save(r); });
      } catch (_) {}
    }

    // Activity log + notification.
    try {
      const col = $app.findCollectionByNameOrId('activity_logs');
      const rec = new Record(col);
      rec.set('user', userId);
      rec.set('action', action === 'approve' ? 'account_approved' : action === 'request_changes' ? 'account_changes_requested' : 'account_rejected');
      rec.set('entity', 'user');
      rec.set('entity_id', userId);
      rec.set('details', note || '');
      try { rec.set('admin', auth.id); } catch (_) {}
      try { rec.set('admin_email', auth.getString('email')); } catch (_) {}
      $app.save(rec);
    } catch (_) {}
    try {
      const ncol = $app.findCollectionByNameOrId('notifications');
      const nrec = new Record(ncol);
      nrec.set('user', userId);
      nrec.set('title', action === 'approve' ? 'Account Approved' : action === 'request_changes' ? 'Changes Requested' : 'Account Rejected');
      nrec.set('body', note || '');
      nrec.set('type', 'status');
      $app.save(nrec);
    } catch (_) {}

    return e.json(200, { ok: true, account_state: user.get('account_state') });
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// Hook: when a broker or brokerage_company profile status changes, sync the
// owner's users.account_state so the verified/approved badge is persistent
// across refresh / re-login / other devices. Also approves the matching
// referral row (+ rewards) when the profile becomes approved.
//
// Status mapping (broker/company status → users.account_state):
//   approved           → approved  (verified = true, approved_at set)
//   rejected           → rejected  (user_review_note = review_note)
//   changes_requested  → incomplete (user_review_note = review_note)
//   pending            → pending_review
//   hidden             → (no change — hidden is a visibility flag, not review)
// ---------------------------------------------------------------------------
function syncBrokerageOwnerState(app, record, colName) {
  const status = String(record.get('status') || '').toLowerCase();
  if (status === 'hidden') return; // visibility flag, not a review state
  const owner = record.get('owner');
  const ownerId = typeof owner === 'string' ? owner : (owner && owner.id) || '';
  if (!ownerId) return;
  try {
    const user = app.findRecordById('users', ownerId);
    if (user.getBool('is_super_admin')) return; // never touch super admin
    const nowIso = new Date().toISOString();
    const reviewNote = String(record.get('review_note') || '');
    let changed = false;
    if (status === 'approved') {
      if (user.getString('account_state') !== 'approved') { user.set('account_state', 'approved'); changed = true; }
      if (!user.getBool('verified')) { user.set('verified', true); changed = true; }
      if (!user.get('approved_at')) { user.set('approved_at', nowIso); changed = true; }
      if (reviewNote && user.getString('user_review_note') !== '') { user.set('user_review_note', ''); changed = true; }
    } else if (status === 'rejected') {
      if (user.getString('account_state') !== 'rejected') { user.set('account_state', 'rejected'); changed = true; }
      if (user.getString('user_review_note') !== reviewNote) { user.set('user_review_note', reviewNote); changed = true; }
    } else if (status === 'changes_requested') {
      if (user.getString('account_state') !== 'incomplete') { user.set('account_state', 'incomplete'); changed = true; }
      if (user.getString('user_review_note') !== reviewNote) { user.set('user_review_note', reviewNote); changed = true; }
    } else if (status === 'pending') {
      if (user.getString('account_state') !== 'pending_review') { user.set('account_state', 'pending_review'); changed = true; }
    }
    if (changed) app.save(user);
  } catch (err) {
    try { app.logger().error('syncBrokerageOwnerState failed', 'col', colName, 'err', String(err)); } catch (_) {}
  }
}

function approveReferralForOwner(app, ownerId) {
  const nowIso = new Date().toISOString();
  let rows = [];
  try { rows = app.findRecordsByFilter('referrals', 'referred_user = {:uid}', '', 10, 0, { uid: ownerId }); } catch (_) {}
  rows.forEach((r) => {
    if (r.get('status') !== 'approved') {
      r.set('status', 'approved');
      r.set('approved_at', nowIso);
      app.save(r);
      const rf = r.get('referrer'); const rid = typeof rf === 'string' ? rf : (rf && rf.id) || '';
      if (rid) grantRewardsForReferrer(app, rid);
    }
  });
}

// BUGFIX (all 4 hooks below): e.next() must never run inside a try/catch —
// see the identical fix + explanation in trial-auto-assign.pb.js. Each hook
// now reads the collection name outside any try, so the single e.next()
// call at the end always runs exactly once, unguarded.
onRecordAfterUpdateSuccess((e) => {
  const colName = (() => {
    try {
      const col = e.record.collection();
      return col && col.name ? col.name : '';
    } catch (_) {
      return '';
    }
  })();
  if (colName === 'brokers') {
    try {
      const status = String(e.record.get('status') || '').toLowerCase();
      const owner = e.record.get('owner');
      const ownerId = typeof owner === 'string' ? owner : (owner && owner.id) || '';
      syncBrokerageOwnerState($app, e.record, colName);
      if (status === 'approved' && ownerId) approveReferralForOwner($app, ownerId);
    } catch (err) {
      $app.logger().error('broker approval hook failed', 'err', String(err));
    }
  }
  e.next();
}, 'brokers');

onRecordAfterUpdateSuccess((e) => {
  const colName = (() => {
    try {
      const col = e.record.collection();
      return col && col.name ? col.name : '';
    } catch (_) {
      return '';
    }
  })();
  if (colName === 'brokerage_companies') {
    try {
      const status = String(e.record.get('status') || '').toLowerCase();
      const owner = e.record.get('owner');
      const ownerId = typeof owner === 'string' ? owner : (owner && owner.id) || '';
      syncBrokerageOwnerState($app, e.record, colName);
      if (status === 'approved' && ownerId) approveReferralForOwner($app, ownerId);
    } catch (err) {
      $app.logger().error('company approval hook failed', 'err', String(err));
    }
  }
  e.next();
}, 'brokerage_companies');

// Also sync on CREATE (initial profile submission) — the update hook only
// fires on edits, so a brand-new pending profile must sync account_state too.
onRecordAfterCreateSuccess((e) => {
  const colName = (() => {
    try {
      const col = e.record.collection();
      return col && col.name ? col.name : '';
    } catch (_) {
      return '';
    }
  })();
  if (colName === 'brokers' || colName === 'brokerage_companies') {
    try {
      syncBrokerageOwnerState($app, e.record, colName);
    } catch (err) {
      $app.logger().error('brokerage create sync hook failed', 'err', String(err));
    }
  }
  e.next();
}, 'brokers');

onRecordAfterCreateSuccess((e) => {
  const colName = (() => {
    try {
      const col = e.record.collection();
      return col && col.name ? col.name : '';
    } catch (_) {
      return '';
    }
  })();
  if (colName === 'brokerage_companies') {
    try {
      syncBrokerageOwnerState($app, e.record, colName);
    } catch (err) {
      $app.logger().error('company create sync hook failed', 'err', String(err));
    }
  }
  e.next();
}, 'brokerage_companies');

// ---------------------------------------------------------------------------
// VERIFICATION — email + phone OTP, and submit-for-review.
// ---------------------------------------------------------------------------

function sendCodeEmail(app, toEmail, code, purposeLabelAr, purposeLabelEn) {
  const msg = new MailerMessage({
    from: { name: 'Estate Follow' },
    to: [{ address: toEmail }],
    subject: 'Estate Follow — Verification Code',
    html:
      '<div style="font-family:sans-serif;max-width:480px;margin:auto;background:#fff;border:1px solid #eee;border-radius:10px;padding:24px">' +
      '<h2 style="color:#1a2e4f;margin:0 0 12px">Estate Follow</h2>' +
      '<p style="font-size:15px;color:#222">Your verification code is:</p>' +
      '<p style="font-size:30px;font-weight:bold;letter-spacing:6px;text-align:center;color:#22C55E">' + code + '</p>' +
      '<p style="font-size:13px;color:#888">This code expires in 10 minutes.</p>' +
      '<p dir="rtl" style="font-size:13px;color:#888">رمز التحقق صالح لمدة 10 دقائق.</p>' +
      '</div>',
  });
  app.newMailClient().send(msg);
}

function genCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

// POST /ef/verification/send-email-code
routerAdd(
  'POST',
  '/ef/verification/send-email-code',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) throw new UnauthorizedError('Authentication required.');
    const code = genCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    try {
      const col = $app.findCollectionByNameOrId('verification_codes');
      const rec = new Record(col);
      rec.set('user', auth.id);
      rec.set('purpose', 'email');
      rec.set('code', code);
      rec.set('expires_at', expires);
      rec.set('verified', false);
      $app.save(rec);
    } catch (err) { $app.logger().error('vercode save failed', 'err', String(err)); throw new BadRequestError('Failed to send code.'); }
    try {
      sendCodeEmail($app, auth.getString('email'), code, 'توثيق البريد', 'Email verification');
    } catch (err) { $app.logger().error('vercode email failed', 'err', String(err)); throw new BadRequestError('Failed to send verification email.'); }
    return e.json(200, { ok: true });
  },
  $apis.requireAuth(),
);

// POST /ef/verification/verify-email-code
routerAdd(
  'POST',
  '/ef/verification/verify-email-code',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) throw new UnauthorizedError('Authentication required.');
    const body = (e.requestInfo && e.requestInfo() ? e.requestInfo().body : null) || {};
    const entered = String(body.code || '').trim();
    if (!entered) throw new BadRequestError('Code required.');
    let rows = [];
    try { rows = $app.findRecordsByFilter('verification_codes', 'user = {:uid} && purpose = \'email\'', '-created', 5, 0, { uid: auth.id }); } catch (_) {}
    if (!rows.length) throw new BadRequestError('No code found. Request a new one.');
    const latest = rows[0];
    const exp = latest.get('expires_at');
    if (exp && new Date(String(exp)) < new Date()) throw new BadRequestError('Code expired. Request a new one.');
    if (String(latest.get('code') || '') !== entered) throw new BadRequestError('Invalid code.');
    latest.set('verified', true);
    $app.save(latest);
    const user = $app.findRecordById('users', auth.id);
    user.set('verified', true);
    $app.save(user);
    return e.json(200, { ok: true, verified: true });
  },
  $apis.requireAuth(),
);

// POST /ef/verification/send-phone-code — code sent to the registered email
// (SMS/WhatsApp can be wired here later without changing the API contract).
routerAdd(
  'POST',
  '/ef/verification/send-phone-code',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) throw new UnauthorizedError('Authentication required.');
    const code = genCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    try {
      const col = $app.findCollectionByNameOrId('verification_codes');
      const rec = new Record(col);
      rec.set('user', auth.id);
      rec.set('purpose', 'phone');
      rec.set('code', code);
      rec.set('expires_at', expires);
      rec.set('verified', false);
      $app.save(rec);
    } catch (err) { $app.logger().error('phone vercode save failed', 'err', String(err)); throw new BadRequestError('Failed to send code.'); }
    try {
      const phone = String(auth.get('phone') || '');
      sendCodeEmail($app, auth.getString('email'), code, 'توثيق الهاتف', 'Phone verification');
    } catch (err) { $app.logger().error('phone vercode email failed', 'err', String(err)); throw new BadRequestError('Failed to send verification code.'); }
    return e.json(200, { ok: true });
  },
  $apis.requireAuth(),
);

// POST /ef/verification/verify-phone-code
routerAdd(
  'POST',
  '/ef/verification/verify-phone-code',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) throw new UnauthorizedError('Authentication required.');
    const body = (e.requestInfo && e.requestInfo() ? e.requestInfo().body : null) || {};
    const entered = String(body.code || '').trim();
    if (!entered) throw new BadRequestError('Code required.');
    let rows = [];
    try { rows = $app.findRecordsByFilter('verification_codes', 'user = {:uid} && purpose = \'phone\'', '-created', 5, 0, { uid: auth.id }); } catch (_) {}
    if (!rows.length) throw new BadRequestError('No code found. Request a new one.');
    const latest = rows[0];
    const exp = latest.get('expires_at');
    if (exp && new Date(String(exp)) < new Date()) throw new BadRequestError('Code expired. Request a new one.');
    if (String(latest.get('code') || '') !== entered) throw new BadRequestError('Invalid code.');
    latest.set('verified', true);
    $app.save(latest);
    const user = $app.findRecordById('users', auth.id);
    user.set('phone_verified', true);
    $app.save(user);
    return e.json(200, { ok: true, phone_verified: true });
  },
  $apis.requireAuth(),
);

// GET /ef/verification/status — owner's current verification state.
routerAdd(
  'GET',
  '/ef/verification/status',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) throw new UnauthorizedError('Authentication required.');
    const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };
    const u = $app.findRecordById('users', auth.id);
    const hasPassport = !!u.get('passport_file');
    const hasResidence = !!u.get('residence_file');
    const hasLegacyDoc = !!u.get('document_file');
    return e.json(200, {
      account_state: readStr(u, 'account_state'),
      email_verified: !!u.getBool('verified'),
      phone_verified: !!u.getBool('phone_verified'),
      date_of_birth: readStr(u, 'date_of_birth'),
      document_type: readStr(u, 'document_type'),
      document_number: readStr(u, 'document_number'),
      has_document_file: !!u.get('document_file'),
      has_profile_photo: !!u.get('profile_photo'),
      // New dedicated identity document fields (Passport + Residence Permit).
      passport_number: readStr(u, 'passport_number'),
      has_passport_file: hasPassport,
      residence_number: readStr(u, 'residence_number'),
      has_residence_file: hasResidence,
      // At least one valid identity document is present.
      has_identity_document: hasPassport || hasResidence || hasLegacyDoc,
      identity_count: (hasPassport ? 1 : 0) + (hasResidence ? 1 : 0) + (hasLegacyDoc && !hasPassport && !hasResidence ? 1 : 0),
      submitted_at: readStr(u, 'submitted_at'),
      approved_at: readStr(u, 'approved_at'),
      review_note: readStr(u, 'user_review_note'),
      name: readStr(u, 'name'),
      nationality: readStr(u, 'nationality'),
      gender: readStr(u, 'gender'),
      phone: readStr(u, 'phone'),
      email: readStr(u, 'email'),
    });
  },
  $apis.requireAuth(),
);

// POST /ef/verification/submit — owner submits verification for review.
// Validates all required fields are present on the user record (files are
// uploaded by the frontend directly to the users collection before calling
// this route), then sets account_state = pending_review.
routerAdd(
  'POST',
  '/ef/verification/submit',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) throw new UnauthorizedError('Authentication required.');
    const u = $app.findRecordById('users', auth.id);
    if (u.getBool('is_super_admin')) throw new BadRequestError('Super Admin does not need verification.');
    const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };
    const missing = [];
    if (!readStr(u, 'date_of_birth')) missing.push('date_of_birth');
    if (!u.getBool('verified')) missing.push('email_verified');
    if (!u.getBool('phone_verified')) missing.push('phone_verified');
    // Identity documents: at least ONE valid identity document is required.
    //   - Passport (passport_file + passport_number), OR
    //   - Residence Permit (residence_file + residence_number), OR
    //   - Legacy single document (document_file + document_type + document_number).
    // A second identity document is optional and never required.
    const hasPassport = !!u.get('passport_file') && !!readStr(u, 'passport_number');
    const hasResidence = !!u.get('residence_file') && !!readStr(u, 'residence_number');
    const hasLegacy =
      !!u.get('document_file') &&
      !!readStr(u, 'document_type') &&
      !!readStr(u, 'document_number');
    if (!hasPassport && !hasResidence && !hasLegacy) {
      missing.push('identity_document');
    }
    if (missing.length) {
      throw new BadRequestError('Missing required fields: ' + missing.join(', '));
    }
    u.set('account_state', 'pending_review');
    u.set('submitted_at', new Date().toISOString());
    u.set('user_review_note', '');
    $app.save(u);
    // Notify super admins (best-effort).
    try {
      let admins = $app.findRecordsByFilter('users', 'is_super_admin = true', '', 50, 0, {});
      const ncol = $app.findCollectionByNameOrId('notifications');
      admins.forEach((a) => {
        const n = new Record(ncol);
        n.set('user', a.id);
        n.set('title', 'New owner account pending review');
        n.set('body', (readStr(u, 'name') || readStr(u, 'email')) + ' submitted verification for review.');
        n.set('type', 'system');
        $app.save(n);
      });
    } catch (_) {}
    return e.json(200, { ok: true, account_state: 'pending_review' });
  },
  $apis.requireAuth(),
);

// POST /ef/profile/complete-basic — first-run "complete your profile" action
// (new-owner onboarding, task: profile completion rebuild).
//
// This is intentionally SEPARATE from /ef/verification/submit above: that
// route gates the Super Admin's manual approval queue and additionally
// requires phone_verified/email_verified, which are a later, optional step
// inside the full Owner Profile page. This route only enforces the minimum
// the NEW-signup completion screen must collect before the owner is allowed
// past it: date of birth, gender, and at least one identity document
// (Passport OR Residence ID) — nothing else. Email is already proven at
// signup (OTP), so it is never required again here.
//
// Text fields (name/nationality/gender/date_of_birth/profile_photo) and the
// identity document file(s) are saved by the frontend directly via
// pb.collection('users').update(...) BEFORE calling this route (same pattern
// as /ef/verification/submit) — this route only re-validates what actually
// landed on the record (defense in depth) and flips the completion flags.
//
// Idempotent: calling it again after the profile is already complete is a
// harmless no-op that simply confirms the current state.
routerAdd(
  'POST',
  '/ef/profile/complete-basic',
  (e) => {
    const auth = e.auth;
    if (!auth || !auth.id) throw new UnauthorizedError('Authentication required.');
    const u = $app.findRecordById('users', auth.id);
    const readStr = (rec, key) => {
      try { const v = rec.getString(key); if (v) return v; } catch (_) {}
      try { const g = rec.get(key); if (g) return String(g); } catch (_) {}
      return '';
    };
    const missing = [];
    if (!readStr(u, 'date_of_birth')) missing.push('date_of_birth');
    if (!readStr(u, 'gender')) missing.push('gender');
    const hasPassport = !!u.get('passport_file') && !!readStr(u, 'passport_number');
    const hasResidence = !!u.get('residence_file') && !!readStr(u, 'residence_number');
    const hasLegacy =
      !!u.get('document_file') &&
      !!readStr(u, 'document_type') &&
      !!readStr(u, 'document_number');
    const hasIdentityDocument = hasPassport || hasResidence || hasLegacy;
    if (!hasIdentityDocument) missing.push('identity_document');
    if (missing.length) {
      throw new BadRequestError('Missing required fields: ' + missing.join(', '));
    }

    u.set('profile_complete', true);
    // Only advance the (separate, non-blocking) admin-review workflow the
    // first time — never regress an already-approved/rejected account, and
    // never re-notify admins on every subsequent no-op call.
    const priorState = String(readStr(u, 'account_state') || '').toLowerCase();
    let notifyAdmins = false;
    if (priorState === 'incomplete' || !priorState) {
      u.set('account_state', 'pending_review');
      u.set('submitted_at', new Date().toISOString());
      u.set('user_review_note', '');
      notifyAdmins = true;
    }
    $app.save(u);

    if (notifyAdmins) {
      try {
        const admins = $app.findRecordsByFilter('users', 'is_super_admin = true', '', 50, 0, {});
        const ncol = $app.findCollectionByNameOrId('notifications');
        admins.forEach((a) => {
          const n = new Record(ncol);
          n.set('user', a.id);
          n.set('title', 'New owner account pending review');
          n.set('body', (readStr(u, 'name') || readStr(u, 'email')) + ' completed registration and is awaiting review.');
          n.set('type', 'system');
          $app.save(n);
        });
      } catch (_) {}
    }

    return e.json(200, {
      ok: true,
      profile_complete: true,
      account_state: readStr(u, 'account_state'),
    });
  },
  $apis.requireAuth(),
);
