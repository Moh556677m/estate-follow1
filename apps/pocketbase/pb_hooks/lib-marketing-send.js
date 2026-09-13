// Shared campaign-sending engine for the Marketing module.
//
// This used to be copy-pasted in full (helpers + the entire batching loop)
// inside BOTH /ef/marketing/send-batch and /ef/marketing/retry in
// marketing.pb.js — a real "same logic, two files" duplication found during
// the Admin-area dedup audit. Every future fix to the sending logic (e.g.
// the sender_email -> From/Reply-To fix) had to be applied twice and could
// silently drift apart. Centralized here the same way lib-email.js
// centralizes simple transactional sends (require()'d PocketBase JSVM local
// modules ARE plain CommonJS and DO have access to the same bound globals —
// $app, MailerMessage, Record — as any pb_hooks file, verified empirically).
//
// Usage from any pb_hooks file:
//   const { sendCampaignBatch } = require(`${__hooks}/lib-marketing-send.js`);
//   const result = sendCampaignBatch(app, campaignId, batchSize, full);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The platform's own Resend-verified sending domain (must match
// NOTIFICATIONS_FROM's domain in 0-resend-mailer.pb.js). A campaign's chosen
// sender_email is only ever used as the real envelope From address when it
// is on this domain — Resend can only send From addresses on a domain it
// has verified. Any other domain is never spoofed as From; it is carried as
// Reply-To instead so replies still reach the intended sender's real inbox.
const VERIFIED_SENDER_DOMAIN = 'estatefollow.com';

function normalizeEmail(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');
}

function readStr(rec, key) {
  try { const v = rec.getString(key); if (v) return v; } catch (_) {}
  try { const g = rec.get(key); if (g) return String(g); } catch (_) {}
  return '';
}

function readNum(rec, key) {
  try { const v = rec.get(key); const n = Number(v); return isNaN(n) ? 0 : n; } catch (_) { return 0; }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(s) {
  return escapeHtml(s).replace(/\n/g, '<br/>');
}

function randToken() {
  let s = '';
  for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s + Date.now().toString(36);
}

function classifyMailerError(raw) {
  const x = String(raw || '').toLowerCase();
  if (!x) return 'Email provider returned an unknown error.';
  if (x.indexOf('401') >= 0 || x.indexOf('unauthorized') >= 0 || x.indexOf('invalid_api_key') >= 0 || x.indexOf('invalid api key') >= 0 || x.indexOf('authentication') >= 0)
    return 'Email provider authentication failed. The configured API key/credentials are invalid or expired.';
  if (x.indexOf('verified') >= 0 || x.indexOf('sender') >= 0 || x.indexOf('domain') >= 0 || x.indexOf('spf') >= 0 || x.indexOf('dkim') >= 0 || x.indexOf('dmarc') >= 0)
    return 'Sender email/domain is not verified. Verify the sender domain (SPF/DKIM/DMARC) and sender address before sending.';
  if (x.indexOf('limit') >= 0 || x.indexOf('quota') >= 0 || x.indexOf('rate') >= 0 || x.indexOf('throttl') >= 0 || x.indexOf('too many') >= 0)
    return 'Email provider sending limit reached. Try again later or reduce the batch size.';
  if (x.indexOf('recipient') >= 0 || x.indexOf('invalid email') >= 0 || x.indexOf('invalid address') >= 0)
    return 'One or more recipient addresses were rejected by the email provider.';
  if (x.indexOf('timeout') >= 0 || x.indexOf('timed out') >= 0 || x.indexOf('deadline') >= 0)
    return 'The email provider took too long to respond. Try again with a smaller batch.';
  if (x.indexOf('connection') >= 0 || x.indexOf('network') >= 0 || x.indexOf('unreachable') >= 0 || x.indexOf('dns') >= 0)
    return 'Could not reach the email provider. Check the server network connection and try again.';
  return String(raw).replace(/(sk_[a-z0-9_-]+|api[_-]?key["':= ]+[a-z0-9_-]+|bearer [a-z0-9._-]+|password["':= ]+\S+)/gi, '[redacted]').slice(0, 300);
}

function buildEmailHtml(opts) {
  const subject = opts.subject || '';
  const body = opts.body || '';
  const ctaLabel = opts.ctaLabel || '';
  const ctaUrl = opts.ctaUrl || '';
  const signature = opts.signature || '';
  const imageUrl = opts.imageUrl || '';
  const pdfUrl = opts.pdfUrl || '';
  const recipientName = opts.recipientName || '';
  const unsubLink = opts.unsubLink || '';
  const openPixel = opts.openPixel || '';
  const senderName = opts.senderName || 'Estate Follow';
  const name = recipientName || (opts.lang === 'ar' ? 'عميلنا العزيز' : 'there');
  const personalized = body.replace(/\{\{name\}\}/gi, name);
  const bodyHtml = textToHtml(personalized);
  const sigHtml = signature ? '<div style="margin-top:18px;white-space:pre-line;color:#555">' + textToHtml(signature) + '</div>' : '';
  const ctaHtml = (ctaLabel && ctaUrl)
    ? '<div style="margin:22px 0"><a href="' + escapeHtml(ctaUrl) + '" style="display:inline-block;background:#22C55E;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:8px;font-size:15px">' + escapeHtml(ctaLabel) + '</a></div>'
    : '';
  const imgHtml = imageUrl ? '<div style="margin:0 0 16px"><img src="' + escapeHtml(imageUrl) + '" alt="" style="max-width:100%;height:auto;border-radius:8px"/></div>' : '';
  const pdfHtml = pdfUrl
    ? '<div style="margin:18px 0"><a href="' + escapeHtml(pdfUrl) + '" style="display:inline-block;background:#1a2e4f;color:#fff;text-decoration:none;font-weight:700;padding:10px 22px;border-radius:8px;font-size:14px">' + (opts.lang === 'ar' ? 'فتح / تنزيل ملف PDF' : 'Open / Download PDF') + '</a></div>'
    : '';
  const unsubHtml = unsubLink
    ? '<p style="margin-top:24px;font-size:12px;color:#999">' + (opts.lang === 'ar' ? 'تلقيت هذه الرسالة لأنك مسجل في إستيت فولو. ' : 'You received this message because you are registered with Estate Follow. ') + '<a href="' + escapeHtml(unsubLink) + '" style="color:#999">' + (opts.lang === 'ar' ? 'إلغاء الاشتراك' : 'Unsubscribe') + '</a></p>'
    : '';
  return '<div style="font-family:sans-serif;max-width:560px;margin:auto;background:#fff;border:1px solid #eee;border-radius:10px;padding:24px"><h2 style="margin:0 0 12px;color:#1a2e4f">' + escapeHtml(subject) + '</h2>' + imgHtml + '<div style="font-size:15px;line-height:1.6;color:#222">' + bodyHtml + '</div>' + ctaHtml + pdfHtml + sigHtml + unsubHtml + '</div><p style="text-align:center;color:#bbb;font-size:11px;margin-top:12px">' + escapeHtml(senderName) + ' — Estate Follow</p>' + (openPixel ? '<img src="' + escapeHtml(openPixel) + '" width="1" height="1" alt="" style="display:none"/>' : '');
}

function resolveRecipients(app, campaign) {
  const source = readStr(campaign, 'source');
  const accountFilter = readStr(campaign, 'account_filter') || 'all';
  const countryFilter = readStr(campaign, 'country_filter') || '';
  const cityFilter = readStr(campaign, 'city_filter') || '';
  const statusFilter = readStr(campaign, 'status_filter') || 'all';
  const listIdsRaw = campaign.get('list_ids');
  let listIds = [];
  try {
    if (Array.isArray(listIdsRaw)) listIds = listIdsRaw;
    else if (typeof listIdsRaw === 'string' && listIdsRaw) listIds = JSON.parse(listIdsRaw);
    else if (listIdsRaw && typeof listIdsRaw === 'object') listIds = Array.from(listIdsRaw);
  } catch (_) {}
  const map = {};
  const add = (email, name) => {
    const em = normalizeEmail(email);
    if (!em || !EMAIL_RE.test(em)) return;
    if (map[em]) return;
    map[em] = { email: em, name: name || '' };
  };
  if (source === 'platform' || source === 'both') {
    let users = [];
    try { users = app.findRecordsByFilter('users', "id != ''", '', 100000, 0, {}); } catch (_) {}
    users.forEach((u) => {
      try { if (u.getBool('is_super_admin')) return; } catch (_) {}
      const role = readStr(u, 'role');
      if (['admin', 'editor', 'support', 'custom'].includes(role)) return;
      const at = String(readStr(u, 'account_type') || 'owner').toLowerCase();
      if (accountFilter !== 'all' && at !== accountFilter) return;
      const nationality = readStr(u, 'nationality');
      if (countryFilter && nationality.toUpperCase() !== countryFilter.toUpperCase()) return;
      const state = String(readStr(u, 'account_state') || (u.getBool('suspended') ? 'suspended' : 'active')).toLowerCase();
      if (statusFilter !== 'all' && state !== statusFilter) return;
      add(readStr(u, 'email'), readStr(u, 'name'));
    });
  }
  if (source === 'list' || source === 'both') {
    const idSet = {};
    listIds.forEach((id) => { if (id) idSet[id] = true; });
    if (Object.keys(idSet).length) {
      let contacts = [];
      try { contacts = app.findRecordsByFilter('marketing_contacts', "list != ''", '', 100000, 0, {}); } catch (_) {}
      contacts.forEach((c) => {
        const listRel = c.get('list');
        const listId = typeof listRel === 'string' ? listRel : (listRel && listRel.id) || '';
        if (!idSet[listId]) return;
        const country = readStr(c, 'country');
        const city = readStr(c, 'city');
        if (countryFilter && country.toUpperCase() !== countryFilter.toUpperCase()) return;
        if (cityFilter && city.toLowerCase().indexOf(cityFilter.toLowerCase()) === -1) return;
        add(readStr(c, 'email'), readStr(c, 'name'));
      });
    }
  }
  let unsubs = [];
  try { unsubs = app.findRecordsByFilter('marketing_unsubscribes', "id != ''", '', 100000, 0, {}); } catch (_) {}
  const unsubSet = {};
  unsubs.forEach((u) => { unsubSet[normalizeEmail(readStr(u, 'email'))] = true; });
  const out = [];
  Object.keys(map).forEach((em) => { if (!unsubSet[em]) out.push(map[em]); });
  out.sort((a, b) => (a.email < b.email ? -1 : 1));
  return out;
}

function recountCampaign(app, campaign) {
  const campaignId = campaign.id;
  let all = [];
  try { all = app.findRecordsByFilter('marketing_sends', "campaign = {:cid}", '', 100000, 0, { cid: campaignId }); } catch (_) {}
  let sCount = 0, fCount = 0, oCount = 0, cCount = 0;
  all.forEach((s) => {
    const st = readStr(s, 'status');
    if (st === 'sent' || st === 'delivered' || st === 'opened' || st === 'clicked') sCount += 1;
    if (st === 'failed' || st === 'bounced' || st === 'dropped') fCount += 1;
    if (st === 'opened' || st === 'clicked') oCount += 1;
    if (st === 'clicked') cCount += 1;
  });
  campaign.set('sent_count', sCount);
  campaign.set('failed_count', fCount);
  campaign.set('opened_count', oCount);
  campaign.set('clicked_count', cCount);
  return { sCount, fCount, oCount, cCount };
}

function computeFinalStatus(total, sent, failed) {
  if (total <= 0) return 'failed';
  if (sent <= 0 && failed > 0) return 'failed';
  if (sent > 0 && failed > 0) return 'partially_failed';
  return 'sent';
}

/**
 * Send (or resume sending) one batch — or, with full:true, the entire
 * remaining audience — of a campaign. Idempotent: already-delivered
 * recipients (tracked in marketing_sends) are never re-sent.
 *
 * @param {object} app - $app (superuser context)
 * @param {string} campaignId
 * @param {number} batchSize
 * @param {boolean} full - true = loop until the whole audience is done
 *   (used by both the "send now, full" path and /ef/marketing/retry);
 *   false = send exactly one batch and return (used for incremental
 *   client-driven polling).
 * @returns {object} result, or { error, status } on failure
 */
function sendCampaignBatch(app, campaignId, batchSize, full) {
  let campaign;
  try { campaign = app.findRecordById('marketing_campaigns', campaignId); }
  catch (_) { return { error: 'Campaign not found', status: 404 }; }

  const status = readStr(campaign, 'status');
  if (status === 'sent') {
    return { done: true, sent: 0, failed: 0, remaining: 0, recipientCount: readNum(campaign, 'recipient_count'), sentCount: readNum(campaign, 'sent_count'), failedCount: readNum(campaign, 'failed_count'), finalStatus: 'sent', lastError: readStr(campaign, 'last_error') };
  }
  if (status === 'cancelled') { return { error: 'Campaign cancelled', status: 400 }; }

  campaign.set('status', 'sending');
  campaign.set('last_error', '');
  app.save(campaign);

  // Pre-check: mailer must be instantiable.
  try { app.newMailClient(); }
  catch (mcErr) {
    const friendly = 'Email service is not configured. Connect an email provider before sending campaigns.';
    campaign.set('status', 'failed');
    campaign.set('last_error', friendly);
    app.save(campaign);
    return { done: true, sent: 0, failed: 0, remaining: 0, recipientCount: 0, sentCount: 0, failedCount: 0, finalStatus: 'failed', lastError: friendly };
  }

  const appUrl = app.settings().meta.appURL || '';
  const base = appUrl.replace(/\/$/, '');

  let already = [];
  try { already = app.findRecordsByFilter('marketing_sends', "campaign = {:cid}", '', 100000, 0, { cid: campaignId }); } catch (_) {}
  const SUCCESS = { sent: true, delivered: true, opened: true, clicked: true, unsubscribed: true };
  const sentSet = {};
  const existingByEmail = {};
  already.forEach((s) => {
    const em = normalizeEmail(readStr(s, 'email'));
    if (SUCCESS[readStr(s, 'status')]) sentSet[em] = true;
    if (!existingByEmail[em]) existingByEmail[em] = s;
  });

  const recipients = resolveRecipients(app, campaign);
  const totalRecipients = recipients.length;
  if (readNum(campaign, 'recipient_count') !== totalRecipients) {
    campaign.set('recipient_count', totalRecipients);
    app.save(campaign);
  }

  const subject = readStr(campaign, 'subject');
  const bodyText = readStr(campaign, 'body');
  const ctaLabel = readStr(campaign, 'cta_label');
  const ctaUrl = readStr(campaign, 'cta_url');
  const signature = readStr(campaign, 'signature');
  const senderName = readStr(campaign, 'sender_name') || 'Estate Follow';
  const senderEmail = readStr(campaign, 'sender_email');
  const senderDomain = senderEmail.indexOf('@') > -1 ? senderEmail.split('@')[1].toLowerCase() : '';
  const senderEmailIsVerifiedDomain = senderDomain === VERIFIED_SENDER_DOMAIN;
  let imageUrl = readStr(campaign, 'image_url');
  try {
    const imgFile = campaign.get('image_file');
    if (imgFile) {
      const fileUrl = app.settings().meta.appURL + '/api/files/' + campaign.collection().id + '/' + campaign.id + '/' + imgFile;
      imageUrl = imageUrl || fileUrl;
    }
  } catch (_) {}
  let pdfUrl = '';
  try {
    const pdfFile = campaign.get('pdf_file');
    if (pdfFile) pdfUrl = app.settings().meta.appURL + '/api/files/' + campaign.collection().id + '/' + campaign.id + '/' + pdfFile;
  } catch (_) {}

  const sendsCol = app.findCollectionByNameOrId('marketing_sends');
  let sent = 0, failed = 0, done = false, guard = 0;
  const maxIter = full ? 5000 : 1;
  let lastError = '';

  while (!done && guard < maxIter) {
    guard += 1;
    const remaining = recipients.filter((r) => !sentSet[r.email]);
    if (remaining.length === 0) { done = true; break; }
    const batch = remaining.slice(0, batchSize);

    batch.forEach((r) => {
      const token = randToken();
      const unsubLink = base + '/ef/marketing/unsub?t=' + token;
      const openPixel = base + '/ef/marketing/open?t=' + token;
      const wrappedCta = ctaUrl ? base + '/ef/marketing/click?t=' + token + '&u=' + encodeURIComponent(ctaUrl) : '';
      const html = buildEmailHtml({ subject, body: bodyText, ctaLabel, ctaUrl: wrappedCta, signature, imageUrl, pdfUrl, recipientName: r.name, unsubLink, openPixel, senderName, lang: 'en' });

      let ok = false, errMsg = '';
      try {
        const msgFields = { from: { name: senderName }, to: [{ address: r.email }], subject, html };
        if (senderEmail && senderEmailIsVerifiedDomain) {
          msgFields.from.address = senderEmail;
        } else if (senderEmail) {
          msgFields.replyTo = { address: senderEmail };
        }
        const msg = new MailerMessage(msgFields);
        app.newMailClient().send(msg);
        ok = true;
      } catch (err) {
        errMsg = String(err);
        app.logger().error('marketing send failed', 'to', r.email, 'err', errMsg);
        if (!lastError) lastError = errMsg;
      }

      try {
        const existing = existingByEmail[r.email];
        const rec = existing || new Record(sendsCol);
        rec.set('campaign', campaignId);
        rec.set('email', r.email);
        rec.set('recipient_name', r.name || '');
        rec.set('status', ok ? 'sent' : 'failed');
        rec.set('error', ok ? '' : errMsg.slice(0, 500));
        rec.set('token', token);
        if (ok) rec.set('sent_at', new Date().toISOString());
        app.save(rec);
        if (!existing) existingByEmail[r.email] = rec;
      } catch (saveErr) {
        app.logger().error('marketing send log save failed', 'err', String(saveErr));
      }

      sentSet[r.email] = true;
      if (ok) sent += 1; else failed += 1;
    });

    if (!full) break;
  }

  const counts = recountCampaign(app, campaign);
  const sCount = counts.sCount, fCount = counts.fCount;
  const stillRemaining = totalRecipients - sCount - fCount;
  let finalStatus;
  if (stillRemaining > 0) {
    finalStatus = 'sending';
    campaign.set('status', 'sending');
  } else {
    finalStatus = computeFinalStatus(totalRecipients, sCount, fCount);
    campaign.set('status', finalStatus);
    if (finalStatus === 'sent') campaign.set('sent_at', new Date().toISOString());
    if (finalStatus === 'failed' || finalStatus === 'partially_failed') {
      const errMsg = totalRecipients <= 0
        ? 'No recipients resolved for the selected audience/filters. Adjust the audience or upload a list, then retry.'
        : (lastError ? classifyMailerError(lastError) : 'One or more sends failed. Open the campaign to see per-recipient errors, then retry.');
      campaign.set('last_error', errMsg.slice(0, 2000));
    }
  }
  app.save(campaign);

  return {
    sent, failed,
    remaining: Math.max(0, stillRemaining),
    done: stillRemaining <= 0,
    recipientCount: totalRecipients,
    sentCount: sCount, failedCount: fCount,
    finalStatus, lastError: readStr(campaign, 'last_error'),
  };
}

module.exports = {
  sendCampaignBatch,
  // Exported too since /ef/marketing/webhook, /open, /click, /unsub and
  // /ef/marketing/status (elsewhere in marketing.pb.js) use the same small
  // helpers — kept available so those call sites can also drop their own
  // copies later without another round of duplication.
  normalizeEmail,
  readStr,
  readNum,
  classifyMailerError,
  recountCampaign,
};
