/// <reference path="../pb_data/types.d.ts" />

// CRM | إدارة العملاء — public lead page + submission + admin endpoints.
//
// Routes (all under /ef/crm/...):
//   GET  /check-slug?slug=...        — public; slug availability check
//   GET  /lead-page/:slug            — public; lead page config (profile + fields)
//   GET  /fields-public              — public; active custom fields for the form
//   POST /submit-lead                — public; validate + create lead (no login)
//   GET  /admin-settings             — super admin/staff; CRM toggles
//   POST /admin-settings             — super admin; update toggles
//   GET  /admin-stats                — super admin; platform-wide CRM stats
//   GET  /admin-broker/:id           — super admin; peek into a broker/company CRM
//
// IMPORTANT: PocketBase recompiles each routerAdd handler in a separate pooled
// VM, so handlers CANNOT access variables/helpers declared in the file's outer
// scope. Every handler is fully self-contained.

// Slug validation: 3-40 chars, lowercase letters, numbers, hyphens.
// NOTE: PocketBase recompiles each routerAdd handler in an isolated VM, so
// this helper is DUPLICATED inside every handler that needs it — it cannot be
// shared from the file's outer scope.

// ---------------------------------------------------------------------------
// GET /ef/crm/check-slug
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/crm/check-slug', (e) => {
  function validSlug(s) {
    return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(s || ''));
  }
  const slug = String((e.requestInfo().query || {}).slug || '').trim().toLowerCase();
  if (!validSlug(slug)) {
    return e.json(200, { available: false, reason: 'invalid' });
  }
  try {
    const rows = $app.findRecordsByFilter('crm_settings', "slug = {:s}", '', 1, 0, { s: slug });
    if (rows && rows.length > 0) return e.json(200, { available: false, reason: 'taken' });
  } catch (_) {
    /* ignore */
  }
  return e.json(200, { available: true });
});

// ---------------------------------------------------------------------------
// GET /ef/crm/lead-page/:slug  — public lead page config
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/crm/lead-page/{slug}', (e) => {
  function validSlug(s) {
    return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(s || ''));
  }
  // PocketBase v0.39 (chi router) exposes path params via the URL path.
  // Strip any query string, then take the last path segment as the slug.
  const rawPath = String((e.request && e.request.url && e.request.url.path) || '');
  const slug = rawPath.split('?')[0].replace(/\/+$/, '').split('/').pop().trim().toLowerCase();
  if (!validSlug(slug)) return e.json(404, { error: 'not_found' });

  // System enabled?
  try {
    const adminRows = $app.findRecordsByFilter('crm_admin_settings', "id != ''", '', 1, 0, {});
    if (adminRows && adminRows.length > 0) {
      const a = adminRows[0];
      if (!a.getBool('system_enabled')) return e.json(404, { error: 'not_found' });
    }
  } catch (_) {}

  let settings;
  try {
    const rows = $app.findRecordsByFilter('crm_settings', "slug = {:s}", '', 1, 0, { s: slug });
    if (!rows || !rows.length) return e.json(404, { error: 'not_found' });
    settings = rows[0];
  } catch (_) {
    return e.json(404, { error: 'not_found' });
  }

  const ownerId = settings.get('owner');
  if (!ownerId) return e.json(404, { error: 'not_found' });

  let owner;
  try {
    owner = $app.findRecordById('users', ownerId);
  } catch (_) {
    return e.json(404, { error: 'not_found' });
  }

  // Suspended / inactive owners cannot collect leads.
  const state = String(owner.get('account_state') || 'approved').toLowerCase();
  if (owner.getBool('suspended') || state === 'suspended' || state === 'inactive') {
    return e.json(404, { error: 'not_found' });
  }

  const accountType = String(owner.get('account_type') || 'broker').toLowerCase();

  // Respect per-type toggle.
  try {
    const adminRows = $app.findRecordsByFilter('crm_admin_settings', "id != ''", '', 1, 0, {});
    if (adminRows && adminRows.length > 0) {
      const a = adminRows[0];
      if (accountType === 'broker' && !a.getBool('broker_enabled')) return e.json(404, { error: 'not_found' });
      if (accountType === 'company' && !a.getBool('company_enabled')) return e.json(404, { error: 'not_found' });
    }
  } catch (_) {}

  // Resolve broker/company profile for display name + photo + verified.
  let profile = null;
  let profileKind = accountType;
  if (accountType === 'company') {
    try {
      const r = $app.findRecordsByFilter('brokerage_companies', "owner = {:o}", '', 1, 0, { o: ownerId });
      if (r && r.length) profile = r[0];
    } catch (_) {}
  } else {
    try {
      const r = $app.findRecordsByFilter('brokers', "owner = {:o}", '', 1, 0, { o: ownerId });
      if (r && r.length) profile = r[0];
    } catch (_) {}
  }

  const displayName =
    (profile && (profile.get('name') || profile.get('name_ar'))) ||
    owner.get('name') ||
    owner.get('email') ||
    '';
  const companyName =
    accountType === 'broker' && profile
      ? (profile.get('company_name') || '')
      : '';
  const verified = profile ? profile.getBool('license_verified') : false;
  const profileStatus = profile ? String(profile.get('status') || '') : '';

  // Photo: CRM custom photo > profile photo > profile photo_url.
  let photoUrl = '';
  const appUrl = $app.settings().meta.appURL || '';
  try {
    if (settings.get('photo')) {
      photoUrl = appUrl + '/api/files/' + settings.collection().id + '/' + settings.id + '/' + settings.get('photo');
    }
  } catch (_) {}
  if (!photoUrl && profile) {
    try {
      if (profile.get('photo')) {
        photoUrl = appUrl + '/api/files/' + profile.collection().id + '/' + profile.id + '/' + profile.get('photo');
      }
    } catch (_) {}
    if (!photoUrl) photoUrl = profile.get('photo_url') || '';
  }

  const bio = settings.get('bio') || (profile && (profile.get('description') || profile.get('description_ar'))) || '';

  // Field config (show/hide/required/order) from settings, merged with defaults.
  let fieldConfig = {};
  try {
    const fc = settings.get('field_config');
    if (fc && typeof fc === 'object') fieldConfig = fc;
    else if (typeof fc === 'string' && fc) fieldConfig = JSON.parse(fc);
  } catch (_) {}

  // Active custom fields available on the public form.
  let customFields = [];
  try {
    const cf = $app.findRecordsByFilter('crm_fields', "active = true && on_public_form = true", 'order', 1000, 0, {});
    customFields = (cf || []).map((f) => {
      let opts = f.get('options');
      if (opts && typeof opts !== 'object') {
        try { opts = JSON.parse(opts); } catch (_) { opts = []; }
      }
      return {
        id: f.id,
        label_en: f.get('label_en'),
        label_ar: f.get('label_ar'),
        field_type: f.get('field_type'),
        options: opts || [],
        required: f.getBool('required'),
        order: Number(f.get('order')) || 0,
      };
    });
  } catch (_) {}

  return e.json(200, {
    slug,
    account_type: accountType,
    display_name: displayName,
    company_name: companyName,
    verified,
    profile_status: profileStatus,
    photo_url: photoUrl,
    bio,
    field_config: fieldConfig,
    custom_fields: customFields,
    whatsapp_enabled: (function () {
      try {
        const a = $app.findRecordsByFilter('crm_admin_settings', "id != ''", '', 1, 0, {});
        if (a && a.length) return a[0].getBool('whatsapp_enabled');
      } catch (_) {}
      return true;
    })(),
  });
});

// ---------------------------------------------------------------------------
// GET /ef/crm/fields-public — active custom fields for the public form
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/crm/fields-public', (e) => {
  let customFields = [];
  try {
    const cf = $app.findRecordsByFilter('crm_fields', "active = true && on_public_form = true", 'order', 1000, 0, {});
    customFields = (cf || []).map((f) => {
      let opts = f.get('options');
      if (opts && typeof opts !== 'object') {
        try { opts = JSON.parse(opts); } catch (_) { opts = []; }
      }
      return {
        id: f.id,
        label_en: f.get('label_en'),
        label_ar: f.get('label_ar'),
        field_type: f.get('field_type'),
        options: opts || [],
        required: f.getBool('required'),
        order: Number(f.get('order')) || 0,
      };
    });
  } catch (_) {}
  return e.json(200, { custom_fields: customFields });
});

// ---------------------------------------------------------------------------
// POST /ef/crm/submit-lead — public lead submission (no login required)
// ---------------------------------------------------------------------------
routerAdd('POST', '/ef/crm/submit-lead', (e) => {
  function validSlug(s) {
    return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(s || ''));
  }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const norm = (v) => String(v == null ? '' : v).trim();

  function fail(msg) {
    return e.json(400, { error: msg || 'invalid' });
  }

  const body = e.requestInfo().body || {};
  const slug = norm(body.slug || '').toLowerCase();
  const name = norm(body.name);
  const phone = norm(body.phone);
  const whatsapp = norm(body.whatsapp);
  const email = norm(body.email).toLowerCase();
  const country = norm(body.country);
  const city = norm(body.city);
  const preferredTime = norm(body.preferred_time);
  const message = norm(body.message);
  const requestType = norm(body.request_type);
  const source = String(body.source || 'direct').toLowerCase();
  const sourceLabel = norm(body.source_label);
  const trackingId = norm(body.tracking_id);
  const customFields = body.custom_fields || {};

  if (!validSlug(slug)) return fail('invalid');
  if (!name) return fail('name_required');
  if (!phone) return fail('phone_required');
  if (!email || !EMAIL_RE.test(email)) return fail('email_required');

  // System enabled?
  let adminSettings = null;
  try {
    const a = $app.findRecordsByFilter('crm_admin_settings', "id != ''", '', 1, 0, {});
    if (a && a.length) adminSettings = a[0];
  } catch (_) {}
  if (adminSettings && !adminSettings.getBool('system_enabled')) return fail('closed');

  // Resolve settings + owner.
  let settings;
  try {
    const rows = $app.findRecordsByFilter('crm_settings', "slug = {:s}", '', 1, 0, { s: slug });
    if (!rows || !rows.length) return fail('not_found');
    settings = rows[0];
  } catch (_) {
    return fail('not_found');
  }
  const ownerId = settings.get('owner');
  if (!ownerId) return fail('not_found');

  let owner;
  try {
    owner = $app.findRecordById('users', ownerId);
  } catch (_) {
    return fail('not_found');
  }
  const accountType = String(owner.get('account_type') || 'broker').toLowerCase();
  if (adminSettings) {
    if (accountType === 'broker' && !adminSettings.getBool('broker_enabled')) return fail('closed');
    if (accountType === 'company' && !adminSettings.getBool('company_enabled')) return fail('closed');
  }

  // Duplicate detection (phone / whatsapp / email within this owner's leads).
  let duplicates = [];
  try {
    const byEmail = $app.findRecordsByFilter('crm_leads', "owner = {:o} && email = {:e}", '', 50, 0, { o: ownerId, e: email });
    if (byEmail && byEmail.length) duplicates = byEmail;
  } catch (_) {}
  if (duplicates.length === 0 && phone) {
    try {
      const byPhone = $app.findRecordsByFilter('crm_leads', "owner = {:o} && phone = {:p}", '', 50, 0, { o: ownerId, p: phone });
      if (byPhone && byPhone.length) duplicates = byPhone;
    } catch (_) {}
  }
  if (duplicates.length === 0 && whatsapp) {
    try {
      const byWa = $app.findRecordsByFilter('crm_leads', "owner = {:o} && whatsapp = {:w}", '', 50, 0, { o: ownerId, w: whatsapp });
      if (byWa && byWa.length) duplicates = byWa;
    } catch (_) {}
  }

  // Create the lead (status new).
  const leadsCol = $app.findCollectionByNameOrId('crm_leads');
  const lead = new Record(leadsCol);
  lead.set('owner', ownerId);
  lead.set('name', name);
  lead.set('phone', phone);
  if (whatsapp) lead.set('whatsapp', whatsapp);
  lead.set('email', email);
  if (country) lead.set('country', country);
  if (city) lead.set('city', city);
  if (preferredTime) lead.set('preferred_time', preferredTime);
  if (message) lead.set('message', message);
  if (requestType) lead.set('request_type', requestType);
  const validSources = ['instagram', 'tiktok', 'facebook', 'whatsapp', 'youtube', 'website', 'google', 'direct', 'other'];
  lead.set('source', validSources.indexOf(source) >= 0 ? source : 'direct');
  if (sourceLabel) lead.set('source_label', sourceLabel);
  lead.set('status', 'new');
  if (trackingId) lead.set('tracking_id', trackingId);
  lead.set('lead_page_slug', slug);
  try { lead.set('custom_fields', JSON.stringify(customFields || {})); } catch (_) {}
  try { $app.save(lead); } catch (err) {
    $app.logger().error('crm submit save failed', 'err', String(err));
    return fail('error');
  }

  // Activity timeline entries.
  try {
    const actCol = $app.findCollectionByNameOrId('crm_activity');
    const a1 = new Record(actCol);
    a1.set('lead', lead.id);
    a1.set('action', 'lead_created');
    a1.set('details', name);
    $app.save(a1);
    const a2 = new Record(actCol);
    a2.set('lead', lead.id);
    a2.set('action', 'source');
    a2.set('details', sourceLabel || source || 'direct');
    $app.save(a2);
  } catch (_) {}

  // Notification to the owner.
  try {
    const notifCol = $app.findCollectionByNameOrId('notifications');
    const n = new Record(notifCol);
    n.set('user', ownerId);
    n.set('title', 'عميل جديد | New Lead');
    n.set('body', name + ' — ' + phone + (email ? ' · ' + email : ''));
    n.set('type', 'status');
    n.set('read', false);
    $app.save(n);
  } catch (_) {}

  return e.json(200, {
    status: 'ok',
    lead_id: lead.id,
    duplicate: duplicates.length > 0,
    duplicate_ids: duplicates.map((d) => d.id),
  });
});

// ---------------------------------------------------------------------------
// GET /ef/crm/admin-settings — super admin/staff
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/crm/admin-settings', (e) => {
  const auth = e.requestInfo().auth;
  const ok =
    auth &&
    (auth.getBool('is_super_admin') ||
      ['admin', 'editor', 'support', 'custom'].indexOf(String(auth.get('role') || '')) >= 0);
  if (!ok) return e.json(403, { error: 'forbidden' });

  try {
    const rows = $app.findRecordsByFilter('crm_admin_settings', "id != ''", '', 1, 0, {});
    if (!rows || !rows.length) {
      return e.json(200, {
        system_enabled: true, broker_enabled: true, company_enabled: true,
        ai_enabled: true, export_enabled: true, tracking_enabled: true,
        whatsapp_enabled: true, reminders_enabled: true, sidebar_config: [],
      });
    }
    const a = rows[0];
    let sb = a.get('sidebar_config');
    if (sb && typeof sb !== 'object') { try { sb = JSON.parse(sb); } catch (_) { sb = []; } }
    return e.json(200, {
      id: a.id,
      system_enabled: a.getBool('system_enabled'),
      broker_enabled: a.getBool('broker_enabled'),
      company_enabled: a.getBool('company_enabled'),
      ai_enabled: a.getBool('ai_enabled'),
      export_enabled: a.getBool('export_enabled'),
      tracking_enabled: a.getBool('tracking_enabled'),
      whatsapp_enabled: a.getBool('whatsapp_enabled'),
      reminders_enabled: a.getBool('reminders_enabled'),
      sidebar_config: sb || [],
    });
  } catch (_) {
    return e.json(200, { system_enabled: true, sidebar_config: [] });
  }
});

// ---------------------------------------------------------------------------
// POST /ef/crm/admin-settings — super admin only
// ---------------------------------------------------------------------------
routerAdd('POST', '/ef/crm/admin-settings', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth || !auth.getBool('is_super_admin')) return e.json(403, { error: 'forbidden' });
  const body = e.requestInfo().body || {};
  const setBool = (rec, key) => {
    if (body[key] !== undefined) rec.set(key, !!body[key]);
  };

  let rec;
  try {
    const rows = $app.findRecordsByFilter('crm_admin_settings', "id != ''", '', 1, 0, {});
    if (rows && rows.length) rec = rows[0];
  } catch (_) {}
  if (!rec) {
    const col = $app.findCollectionByNameOrId('crm_admin_settings');
    rec = new Record(col);
  }
  setBool(rec, 'system_enabled');
  setBool(rec, 'broker_enabled');
  setBool(rec, 'company_enabled');
  setBool(rec, 'ai_enabled');
  setBool(rec, 'export_enabled');
  setBool(rec, 'tracking_enabled');
  setBool(rec, 'whatsapp_enabled');
  setBool(rec, 'reminders_enabled');
  if (body.sidebar_config !== undefined) {
    try { rec.set('sidebar_config', JSON.stringify(body.sidebar_config)); } catch (_) {}
  }
  try { $app.save(rec); } catch (err) {
    return e.json(500, { error: 'save_failed', detail: String(err) });
  }
  return e.json(200, { status: 'ok' });
});

// ---------------------------------------------------------------------------
// GET /ef/crm/admin-stats — platform-wide CRM stats (super admin)
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/crm/admin-stats', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth || !auth.getBool('is_super_admin')) return e.json(403, { error: 'forbidden' });

  function count(filter) {
    try {
      const r = $app.findRecordsByFilter('crm_leads', filter, '', 100000, 0, {});
      return r ? r.length : 0;
    } catch (_) { return 0; }
  }
  function groupBy(field) {
    const map = {};
    try {
      const r = $app.findRecordsByFilter('crm_leads', "id != ''", '', 100000, 0, {});
      (r || []).forEach((x) => {
        const v = String(x.get(field) || 'unknown');
        map[v] = (map[v] || 0) + 1;
      });
    } catch (_) {}
    return map;
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);
  const startOfWeek = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);

  const total = count("id != ''");
  const byStatus = groupBy('status');
  const bySource = groupBy('source');
  const byCountry = groupBy('country');

  // Leads today / this week / this month (by created date prefix).
  let today = 0, week = 0, month = 0;
  try {
    const r = $app.findRecordsByFilter('crm_leads', "id != ''", '', 100000, 0, {});
    (r || []).forEach((x) => {
      const c = String(x.get('created') || '').slice(0, 10);
      if (c === todayStr) today++;
      if (c >= startOfWeek) week++;
      if (c.slice(0, 7) === monthStr) month++;
    });
  } catch (_) {}

  // Active CRM accounts (brokers/companies with a crm_settings row).
  let activeAccounts = 0;
  let brokerLeads = 0, companyLeads = 0;
  try {
    const s = $app.findRecordsByFilter('crm_settings', "id != ''", '', 100000, 0, {});
    activeAccounts = s ? s.length : 0;
  } catch (_) {}
  try {
    const r = $app.findRecordsByFilter('crm_leads', "id != ''", '', 100000, 0, {});
    (r || []).forEach((x) => {
      const oid = x.get('owner');
      if (!oid) return;
      try {
        const u = $app.findRecordById('users', oid);
        const at = String(u.get('account_type') || 'broker').toLowerCase();
        if (at === 'company') companyLeads++; else brokerLeads++;
      } catch (_) {}
    });
  } catch (_) {}

  const purchased = byStatus['won'] || 0;
  const conversion = total > 0 ? Math.round((purchased / total) * 1000) / 10 : 0;

  return e.json(200, {
    total, today, week, month,
    by_status: byStatus,
    by_source: bySource,
    by_country: byCountry,
    broker_leads: brokerLeads,
    company_leads: companyLeads,
    active_accounts: activeAccounts,
    purchased,
    conversion_rate: conversion,
  });
});

// ---------------------------------------------------------------------------
// POST /ef/crm/email-analysis — email a client analysis report (auth required)
// Server re-fetches the lead from the DB so the report uses real CRM data.
// ---------------------------------------------------------------------------
routerAdd('POST', '/ef/crm/email-analysis', (e) => {
  const auth = e.requestInfo().auth;
  if (!auth) return e.json(401, { error: 'unauthorized' });
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const body = e.requestInfo().body || {};
  const leadId = String(body.lead_id || '').trim();
  const toEmail = String(body.to_email || '').trim().toLowerCase();
  if (!leadId || !toEmail) return e.json(400, { error: 'missing' });
  if (!EMAIL_RE.test(toEmail)) return e.json(400, { error: 'invalid_email' });

  let lead;
  try { lead = $app.findRecordById('crm_leads', leadId); } catch (_) { return e.json(404, { error: 'not_found' }); }
  const ownerId = lead.get('owner');
  const assignedTo = lead.get('assigned_to');
  const authId = auth.id;
  if (authId !== ownerId && authId !== assignedTo && !auth.getBool('is_super_admin')) {
    return e.json(403, { error: 'forbidden' });
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }
  function fmtDate(d) {
    if (!d) return '—';
    return String(d).slice(0, 10);
  }
  function row(label, val) {
    return "<tr><td style='padding:6px 0;color:#888;width:200px'>" + esc(label) + "</td><td style='padding:6px 0;font-weight:600'>" + val + "</td></tr>";
  }
  function li(arr) {
    return (arr || []).map(function (x) {
      var t = typeof x === 'object' ? (x.value || x.label || JSON.stringify(x)) : x;
      return "<li style='margin:2px 0'>" + esc(t) + "</li>";
    }).join('');
  }

  var name = esc(lead.get('name'));
  var phone = esc(lead.get('phone'));
  var email = esc(lead.get('email'));
  var country = esc(lead.get('country'));
  var city = esc(lead.get('city'));
  var source = esc(lead.get('source_label') || lead.get('source') || 'direct');
  var created = esc(fmtDate(lead.get('created')));
  var status = esc(lead.get('status'));
  var interest = esc(body.interest || '');
  var analysis = body.analysis || {};
  var interests = analysis.interests || [];
  var knownInfo = analysis.known_info || [];
  var missingInfo = analysis.missing_info || [];
  var questions = analysis.suggested_questions || [];
  var isAr = String(body.lang || 'ar') === 'ar';
  var dir = isAr ? 'rtl' : 'ltr';

  var html =
    "<div style='font-family:sans-serif;max-width:600px;margin:auto;direction:" + dir + "'>" +
    "<h2 style='color:#1a7a4b'>" + esc(body.report_title || 'Estate Follow CRM — Client Analysis Report') + "</h2>" +
    "<table style='width:100%;border-collapse:collapse;font-size:14px'>" +
    row(isAr ? 'اسم العميل' : 'Client Name', name) +
    row(isAr ? 'الهاتف' : 'Phone', phone) +
    row(isAr ? 'البريد الإلكتروني' : 'Email', email) +
    row(isAr ? 'الدولة' : 'Country', country + (city ? ' · ' + city : '')) +
    row(isAr ? 'المصدر' : 'Source', source) +
    row(isAr ? 'تاريخ التسجيل' : 'Registration Date', created) +
    row(isAr ? 'الحالة' : 'Status', status) +
    "</table>" +
    (interest ? "<h3 style='color:#1a7a4b;margin-top:16px'>" + esc(body.interest_label || (isAr ? 'اهتمام العميل' : 'Client Interest')) + "</h3><p style='font-size:14px'>" + interest + "</p>" : '') +
    (interests.length ? "<h3 style='color:#1a7a4b;margin-top:16px'>" + esc(body.interest_in_label || (isAr ? 'العميل مهتم بـ:' : 'Interested in')) + "</h3><ul style='font-size:14px'>" + li(interests) + "</ul>" : '') +
    "<h3 style='color:#1a7a4b;margin-top:16px'>" + (isAr ? 'تحليل الذكاء الاصطناعي' : 'AI Analysis') + "</h3>" +
    (analysis.summary ? "<p style='font-size:14px'><b>" + (isAr ? 'ملخص الحالة:' : 'Summary:') + "</b> " + esc(analysis.summary) + "</p>" : '') +
    (analysis.interest_level ? "<p style='font-size:14px'><b>" + (isAr ? 'درجة الاهتمام:' : 'Interest Level:') + "</b> " + esc(analysis.interest_level) + (analysis.interest_reason ? " — " + esc(analysis.interest_reason) : '') + "</p>" : '') +
    (knownInfo.length ? "<p style='font-size:14px;margin-top:8px'><b>" + (isAr ? 'المعلومات المعروفة:' : 'Known Information:') + "</b></p><ul style='font-size:14px'>" + li(knownInfo) + "</ul>" : '') +
    (missingInfo.length ? "<p style='font-size:14px;margin-top:8px'><b>" + (isAr ? 'المعلومات الناقصة:' : 'Missing Information:') + "</b></p><ul style='font-size:14px'>" + li(missingInfo) + "</ul>" : '') +
    (questions.length ? "<p style='font-size:14px;margin-top:8px'><b>" + (isAr ? 'الأسئلة المقترحة:' : 'Suggested Questions:') + "</b></p><ul style='font-size:14px'>" + li(questions) + "</ul>" : '') +
    (analysis.next_step ? "<p style='font-size:14px;margin-top:8px'><b>" + (isAr ? 'الخطوة التالية:' : 'Next Step:') + "</b> " + esc(analysis.next_step) + "</p>" : '') +
    (analysis.follow_up_message ? "<p style='font-size:14px;margin-top:8px'><b>" + (isAr ? 'رسالة المتابعة:' : 'Follow-up Message:') + "</b></p><p style='white-space:pre-wrap;font-size:14px;background:#f5f5f5;padding:10px;border-radius:6px'>" + esc(analysis.follow_up_message) + "</p>" : '') +
    "<hr style='border:none;border-top:1px solid #eee;margin:16px 0'/>" +
    "<p style='color:#888;font-size:12px'>Estate Follow — إستيت فولو</p></div>";

  try {
    $app.newMailClient().send(
      new MailerMessage({
        from: { name: 'Estate Follow CRM' },
        to: [{ address: toEmail }],
        subject: 'Estate Follow CRM — ' + (lead.get('name') || 'Client') + ' ' + (isAr ? 'تحليل' : 'Analysis'),
        html: html,
      }),
    );
  } catch (err) {
    $app.logger().error('crm email-analysis failed', 'err', String(err));
    return e.json(500, { error: 'send_failed' });
  }
  return e.json(200, { status: 'ok' });
});
