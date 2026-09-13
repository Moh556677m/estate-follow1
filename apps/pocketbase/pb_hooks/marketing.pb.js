/// <reference path="../pb_data/types.d.ts" />

// Marketing module hooks.
// Routes (all under /ef/marketing/...):
//   POST /send-test   — super admin only; send a single test email
//   POST /send-batch  — super admin only; send one batch for a campaign
//   POST /retry       — super admin only; re-send failed/unsent recipients
//   POST /fix-stuck   — super admin only; resolve campaigns stuck in "sending"
//   GET  /status      — super admin only; honest email service status
//   POST /webhook     — public; receive email provider events
//   GET  /open        — public; 1x1 tracking pixel, records an open
//   GET  /click       — public; records a click then 302-redirects
//   GET  /unsub       — public; unsubscribe landing page
//
// Email delivery uses the platform mailer ($app.newMailClient().send()).
// Each recipient receives their own separate message (no CC/BCC) with a
// unique unsubscribe + open-tracking token. Unsubscribed and bounced
// addresses are never sent marketing campaigns again.
//
// IMPORTANT: PocketBase recompiles each routerAdd handler in a separate
// pooled VM, so a handler CANNOT access variables/helpers declared in the
// file's outer scope. Every handler below is fully self-contained — all
// helpers are defined INSIDE the handler.

// ---------------------------------------------------------------------------
// POST /ef/marketing/send-test
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/marketing/send-test',
  (e) => {
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizeEmail = (v) =>
      String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');
    const escapeHtml = (s) =>
      String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const textToHtml = (s) => escapeHtml(s).replace(/\n/g, '<br/>');

    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool('is_super_admin')) {
      return e.json(403, { error: 'Super Admin only' });
    }
    const body = info.body || {};
    const to = normalizeEmail(body.to || '');
    const subject = String(body.subject || '').trim();
    const html = String(body.html || '');
    const fromName = String(body.fromName || 'Estate Follow').trim() || 'Estate Follow';
    if (!to || !EMAIL_RE.test(to)) return e.json(400, { error: 'Invalid recipient email' });
    if (!subject) return e.json(400, { error: 'Subject required' });

    try {
      const msg = new MailerMessage({
        from: { name: fromName },
        to: [{ address: to }],
        subject: subject,
        html: html || '<div style="font-family:sans-serif">' + textToHtml(subject) + '</div>',
      });
      $app.newMailClient().send(msg);
    } catch (err) {
      $app.logger().error('marketing test email failed', 'err', String(err));
      return e.json(500, { error: 'Failed to send test email: ' + String(err).slice(0, 300) });
    }
    return e.json(200, { ok: true });
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// Campaign status vocabulary
//   draft             — unsaved/edited form
//   scheduled         — send deferred to a scheduled time
//   queued            — recipients resolved, sending not started yet
//   sending           — at least one send attempted in the current run
//   sent              — every recipient handed to the mailer successfully
//   partially_failed  — some sent, some failed
//   failed            — none sent (zero recipients, or every send failed)
//   cancelled         — admin cancelled
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POST /ef/marketing/send-batch
// Processes ONE batch (<= batchSize recipients) per call. The frontend loops
// this endpoint with small batches so every HTTP request finishes well under
// the reverse-proxy timeout — campaigns complete instead of hanging in
// "Sending". Already-delivered recipients are skipped (sentSet), failed ones
// are re-attempted and their send row is updated in place (no duplicates).
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/marketing/send-batch',
  (e) => {
    const { sendCampaignBatch } = require(`${__hooks}/lib-marketing-send.js`);

    // ---- route body ----
    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool('is_super_admin')) {
      return e.json(403, { error: 'Super Admin only' });
    }
    const body = info.body || {};
    const campaignId = String(body.campaignId || '').trim();
    let batchSize = parseInt(String(body.batchSize || '50'), 10);
    if (!batchSize || isNaN(batchSize) || batchSize < 1) batchSize = 50;
    if (batchSize > 200) batchSize = 200;
    const full = !!body.full;
    if (!campaignId) return e.json(400, { error: 'campaignId required' });

    const result = sendCampaignBatch($app, campaignId, batchSize, full);
    if (result.error) return e.json(result.status || 500, { error: result.error });
    return e.json(200, result);
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// POST /ef/marketing/retry  — re-send only failed/unsent recipients of an
// existing campaign. No duplicate campaign is created; the same campaign id
// is reused and already-delivered recipients are skipped.
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/marketing/retry',
  (e) => {
    const { sendCampaignBatch, readStr } = require(`${__hooks}/lib-marketing-send.js`);

    // ---- route body ----
    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool('is_super_admin')) return e.json(403, { error: 'Super Admin only' });
    const body = info.body || {};
    const campaignId = String(body.campaignId || '').trim();
    if (!campaignId) return e.json(400, { error: 'campaignId required' });

    let campaign;
    try { campaign = $app.findRecordById('marketing_campaigns', campaignId); }
    catch (_) { return e.json(404, { error: 'Campaign not found' }); }
    const status = readStr(campaign, 'status');
    if (status === 'sent') return e.json(400, { error: 'Campaign already completed successfully' });
    if (status === 'cancelled') return e.json(400, { error: 'Campaign is cancelled' });

    let batchSize = parseInt(String(body.batchSize || '50'), 10);
    if (!batchSize || isNaN(batchSize) || batchSize < 1) batchSize = 50;
    if (batchSize > 200) batchSize = 200;

    campaign.set('status', 'queued');
    campaign.set('last_error', '');
    $app.save(campaign);

    const result = sendCampaignBatch($app, campaignId, batchSize, true);
    if (result.error) return e.json(result.status || 500, { error: result.error });
    return e.json(200, Object.assign({ retried: true }, result));
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// POST /ef/marketing/fix-stuck  — resolve campaigns stuck in "sending".
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/ef/marketing/fix-stuck',
  (e) => {
    const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };
    const readNum = (rec, key) => { try { const v = rec.get(key); const n = Number(v); return isNaN(n) ? 0 : n; } catch (_) { return 0; } };
    const recountCampaign = (app, campaign) => {
      let all = []; try { all = app.findRecordsByFilter('marketing_sends', "campaign = {:cid}", '', 100000, 0, { cid: campaign.id }); } catch (_) {}
      let sCount = 0, fCount = 0, oCount = 0, cCount = 0;
      all.forEach((s) => { const st = readStr(s, 'status'); if (st === 'sent' || st === 'delivered' || st === 'opened' || st === 'clicked') sCount += 1; if (st === 'failed' || st === 'bounced' || st === 'dropped') fCount += 1; if (st === 'opened' || st === 'clicked') oCount += 1; if (st === 'clicked') cCount += 1; });
      campaign.set('sent_count', sCount); campaign.set('failed_count', fCount); campaign.set('opened_count', oCount); campaign.set('clicked_count', cCount);
      return { sCount, fCount, oCount, cCount };
    };
    const computeFinalStatus = (total, sent, failed) => { if (total <= 0) return 'failed'; if (sent <= 0 && failed > 0) return 'failed'; if (sent > 0 && failed > 0) return 'partially_failed'; return 'sent'; };

    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool('is_super_admin')) return e.json(403, { error: 'Super Admin only' });
    let stuck = [];
    try { stuck = $app.findRecordsByFilter('marketing_campaigns', "status = 'sending'", '', 1000, 0, {}); } catch (_) {}
    let fixed = 0;
    const summary = [];
    stuck.forEach((c) => {
      const counts = recountCampaign($app, c);
      const total = readNum(c, 'recipient_count');
      const finalStatus = computeFinalStatus(total, counts.sCount, counts.fCount);
      c.set('status', finalStatus);
      if (finalStatus === 'sent') c.set('sent_at', new Date().toISOString());
      if (finalStatus === 'failed' || finalStatus === 'partially_failed') {
        const errMsg = total <= 0 ? 'No recipients resolved for the selected audience/filters. Use Retry after adjusting the audience.' : 'Sending did not complete (stuck in Sending). Use Retry to re-send failed recipients.';
        c.set('last_error', errMsg.slice(0, 2000));
      }
      $app.save(c);
      fixed += 1;
      summary.push({ id: c.id, name: readStr(c, 'name'), status: finalStatus });
    });
    return e.json(200, { fixed, campaigns: summary });
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// GET /ef/marketing/status  — honest email service status.
// ---------------------------------------------------------------------------
routerAdd(
  'GET',
  '/ef/marketing/status',
  (e) => {
    const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };
    const classifyMailerError = (raw) => {
      const x = String(raw || '').toLowerCase();
      if (!x) return 'Email provider returned an unknown error.';
      if (x.indexOf('401') >= 0 || x.indexOf('unauthorized') >= 0 || x.indexOf('invalid_api_key') >= 0 || x.indexOf('authentication') >= 0) return 'Email provider authentication failed. The configured API key/credentials are invalid or expired.';
      if (x.indexOf('verified') >= 0 || x.indexOf('sender') >= 0 || x.indexOf('domain') >= 0 || x.indexOf('spf') >= 0 || x.indexOf('dkim') >= 0) return 'Sender email/domain is not verified. Verify the sender domain (SPF/DKIM/DMARC) and sender address before sending.';
      if (x.indexOf('limit') >= 0 || x.indexOf('quota') >= 0 || x.indexOf('rate') >= 0) return 'Email provider sending limit reached. Try again later or reduce the batch size.';
      if (x.indexOf('timeout') >= 0) return 'The email provider took too long to respond. Try again with a smaller batch.';
      if (x.indexOf('connection') >= 0 || x.indexOf('network') >= 0) return 'Could not reach the email provider. Check the server network connection and try again.';
      return String(raw).replace(/(sk_[a-z0-9_-]+|api[_-]?key["':= ]+[a-z0-9_-]+|bearer [a-z0-9._-]+|password["':= ]+\S+)/gi, '[redacted]').slice(0, 300);
    };

    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool('is_super_admin')) return e.json(403, { error: 'Super Admin only' });

    const readNum = (rec, key) => { try { const v = rec.get(key); const n = Number(v); return isNaN(n) ? 0 : n; } catch (_) { return 0; } };
    const recountCampaign = (app, campaign) => {
      let all = []; try { all = app.findRecordsByFilter('marketing_sends', "campaign = {:cid}", '', 100000, 0, { cid: campaign.id }); } catch (_) {}
      let sCount = 0, fCount = 0, oCount = 0, cCount = 0;
      all.forEach((s) => { const st = readStr(s, 'status'); if (st === 'sent' || st === 'delivered' || st === 'opened' || st === 'clicked') sCount += 1; if (st === 'failed' || st === 'bounced' || st === 'dropped') fCount += 1; if (st === 'opened' || st === 'clicked') oCount += 1; if (st === 'clicked') cCount += 1; });
      campaign.set('sent_count', sCount); campaign.set('failed_count', fCount); campaign.set('opened_count', oCount); campaign.set('clicked_count', cCount);
      return { sCount, fCount, oCount, cCount };
    };
    const computeFinalStatus = (total, sent, failed) => { if (total <= 0) return 'failed'; if (sent <= 0 && failed > 0) return 'failed'; if (sent > 0 && failed > 0) return 'partially_failed'; return 'sent'; };

    let providerConnected = true;
    try { $app.newMailClient(); } catch (_) { providerConnected = false; }

    let lastSuccessAt = null, lastFailedAt = null, lastFailedError = '';
    try {
      const ok = $app.findRecordsByFilter('marketing_sends', "status = 'sent' || status = 'delivered' || status = 'opened' || status = 'clicked'", '-sent_at', 1, 0, {});
      if (ok.length) lastSuccessAt = readStr(ok[0], 'sent_at') || readStr(ok[0], 'created');
    } catch (_) {}
    try {
      const bad = $app.findRecordsByFilter('marketing_sends', "status = 'failed' || status = 'bounced' || status = 'dropped'", '-created', 1, 0, {});
      if (bad.length) { lastFailedAt = readStr(bad[0], 'created'); lastFailedError = readStr(bad[0], 'error'); }
    } catch (_) {}

    // Count stuck campaigns, then auto-resolve them in place so legacy
    // "sending" campaigns (e.g. from a timed-out full-mode run) are moved to
    // their honest final status every time an admin checks status.
    let stuckCount = 0, resolvedStuck = 0;
    try {
      const stuck = $app.findRecordsByFilter('marketing_campaigns', "status = 'sending'", '', 1000, 0, {});
      stuckCount = stuck.length;
      stuck.forEach((c) => {
        const counts = recountCampaign($app, c);
        const total = readNum(c, 'recipient_count');
        const finalStatus = computeFinalStatus(total, counts.sCount, counts.fCount);
        c.set('status', finalStatus);
        if (finalStatus === 'sent') c.set('sent_at', new Date().toISOString());
        if (finalStatus === 'failed' || finalStatus === 'partially_failed') {
          const errMsg = total <= 0 ? 'No recipients resolved for the selected audience/filters. Use Retry after adjusting the audience.' : 'Sending did not complete (was stuck in Sending). Use Retry to re-send failed recipients.';
          c.set('last_error', errMsg.slice(0, 2000));
        }
        $app.save(c);
        resolvedStuck += 1;
      });
    } catch (_) {}

    let lastWebhookAt = null;
    try {
      const ev = $app.findRecordsByFilter('marketing_sends', "delivered_at != '' || bounced = true", '-updated', 1, 0, {});
      if (ev.length) lastWebhookAt = readStr(ev[0], 'delivered_at') || readStr(ev[0], 'updated') || readStr(ev[0], 'created');
    } catch (_) {}

    let senderAddress = '';
    try { senderAddress = $os.getenv('BUILDER_MAILER_SENDER_ADDRESS') || ''; } catch (_) {}

    // Real send probe — actually hand a tiny email to the platform mailer and
    // capture the exact result. Instantiation alone does NOT prove the
    // provider can send (auth/sender/quota errors only surface on .send()).
    // Only probe when there is no recent successful send, so repeated status
    // refreshes don't spam the sender mailbox once the system is healthy.
    let probeOk = null, probeError = '';
    const recentSuccess = lastSuccessAt && !isNaN(new Date(lastSuccessAt).getTime()) && (Date.now() - new Date(lastSuccessAt).getTime()) < 3600000;
    if (!recentSuccess) {
      try {
        const probeTo = senderAddress || 'noreply@horizons.hostinger.com';
        const msg = new MailerMessage({
          from: { name: 'Estate Follow Status Probe' },
          to: [{ address: probeTo }],
          subject: 'Estate Follow — Email service probe',
          html: '<div style="font-family:sans-serif;padding:16px"><p>This is an automated connectivity probe from Estate Follow Marketing.</p><p style="color:#888;font-size:12px">بريد اختبار آلي للتحقق من اتصال خدمة البريد — إستيت فولو.</p></div>',
        });
        $app.newMailClient().send(msg);
        probeOk = true;
      } catch (err) {
        probeOk = false;
        probeError = classifyMailerError(String(err));
        $app.logger().error('marketing status probe failed', 'err', String(err));
      }
    }
    const realConnected = probeOk === false ? false : (probeOk === true ? true : providerConnected);

    const appUrl = $app.settings().meta.appURL || '';
    const webhookUrl = appUrl.replace(/\/$/, '') + '/ef/marketing/webhook';

    return e.json(200, {
      providerConnected: realConnected,
      providerName: 'Platform Mailer (managed)',
      senderAddress,
      senderVerified: true,
      senderVerificationNote: 'Sender domain & address are managed and verified by the Hostinger platform (SPF/DKIM handled automatically).',
      queueRunning: true,
      queueNote: 'Synchronous — sends run inside the send request in small batches. No background worker (instance hibernates when idle).',
      webhookConnected: !!lastWebhookAt,
      webhookUrl,
      webhookNote: 'Point your email provider webhook at the URL above to receive delivered/bounce/open/click events. Opens & clicks are also tracked via pixel/redirect regardless.',
      openClickTracking: true,
      probeOk,
      probeError,
      lastSuccessAt,
      lastFailedAt,
      lastFailedError: lastFailedError ? classifyMailerError(lastFailedError) : '',
      lastWebhookAt,
      stuckCampaigns: stuckCount,
      resolvedStuck,
    });
  },
  $apis.requireAuth(),
);

// ---------------------------------------------------------------------------
// POST /ef/marketing/webhook  — receive email provider events.
// Public (providers cannot authenticate); only updates existing send rows.
// ---------------------------------------------------------------------------
routerAdd('POST', '/ef/marketing/webhook', (e) => {
  const normalizeEmail = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');
  const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };

  const info = e.requestInfo();
  const body = info.body || {};
  const event = String(body.event || body.type || body.EventType || '').toLowerCase();
  const messageId = String(body.messageId || body.message_id || body.MessageId || body.mj_message_id || '').trim();
  const email = normalizeEmail(body.email || body.recipient || body.to || body.To || '');
  const reason = String(body.reason || body.bounce_reason || body.Description || '').slice(0, 500);
  const token = String(body.token || '').trim();

  let send = null;
  if (messageId) { try { const r = $app.findRecordsByFilter('marketing_sends', "message_id = {:m}", '', 1, 0, { m: messageId }); if (r.length) send = r[0]; } catch (_) {} }
  if (!send && token) { try { const r = $app.findRecordsByFilter('marketing_sends', "token = {:t}", '', 1, 0, { t: token }); if (r.length) send = r[0]; } catch (_) {} }
  if (!send && email) { try { const r = $app.findRecordsByFilter('marketing_sends', "email = {:e}", '-created', 1, 0, { e: email }); if (r.length) send = r[0]; } catch (_) {} }
  if (!send) return e.json(200, { ok: true, matched: false });

  const map = {
    delivered: 'delivered', send: 'delivered', processed: 'delivered',
    bounce: 'bounced', bounced: 'bounced', dropped: 'dropped', deferred: 'failed',
    open: 'opened', opened: 'opened', click: 'clicked', clicked: 'clicked',
    complaint: 'complained', complained: 'complained', spam: 'complained',
    unsubscribe: 'unsubscribed', unsubscribed: 'unsubscribed',
  };
  const newStatus = map[event];
  if (!newStatus) return e.json(200, { ok: true, matched: true, ignored: event });

  try {
    const cur = readStr(send, 'status');
    if (newStatus === 'bounced' || newStatus === 'dropped') {
      send.set('status', newStatus); send.set('bounced', true); send.set('bounce_reason', reason);
    } else if (newStatus === 'delivered') {
      if (cur === 'sent' || cur === 'failed' || cur === 'queued') send.set('status', 'delivered');
      send.set('delivered_at', new Date().toISOString());
    } else {
      send.set('status', newStatus);
    }
    if (messageId) send.set('message_id', messageId);
    $app.save(send);

    const cid = send.get('campaign');
    const cidStr = typeof cid === 'string' ? cid : (cid && cid.id) || '';
    if (cidStr) {
      try {
        const camp = $app.findRecordById('marketing_campaigns', cidStr);
        let all = []; try { all = $app.findRecordsByFilter('marketing_sends', "campaign = {:cid}", '', 100000, 0, { cid: cidStr }); } catch (_) {}
        let sCount = 0, fCount = 0, oCount = 0, cCount = 0;
        all.forEach((s) => { const st = readStr(s, 'status'); if (st === 'sent' || st === 'delivered' || st === 'opened' || st === 'clicked') sCount += 1; if (st === 'failed' || st === 'bounced' || st === 'dropped') fCount += 1; if (st === 'opened' || st === 'clicked') oCount += 1; if (st === 'clicked') cCount += 1; });
        camp.set('sent_count', sCount); camp.set('failed_count', fCount); camp.set('opened_count', oCount); camp.set('clicked_count', cCount);
        $app.save(camp);
      } catch (_) {}
    }
  } catch (err) {
    $app.logger().error('marketing webhook failed', 'err', String(err));
  }
  return e.json(200, { ok: true, matched: true, status: newStatus });
});

// ---------------------------------------------------------------------------
// GET /ef/marketing/open?t=<token>  — 1x1 transparent GIF, records an open
// ---------------------------------------------------------------------------
const GIF_BYTES = [
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
];

routerAdd('GET', '/ef/marketing/open', (e) => {
  const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };
  const readNum = (rec, key) => { try { const v = rec.get(key); const n = Number(v); return isNaN(n) ? 0 : n; } catch (_) { return 0; } };

  const info = e.requestInfo();
  const token = String((info.query && info.query.t) || '').trim();
  if (token) {
    try {
      const rows = $app.findRecordsByFilter('marketing_sends', "token = {:t}", '', 1, 0, { t: token });
      if (rows.length) {
        const s = rows[0];
        const st = readStr(s, 'status');
        if (st === 'sent') { s.set('status', 'opened'); s.set('opened_at', new Date().toISOString()); }
        s.set('open_count', readNum(s, 'open_count') + 1);
        $app.save(s);
        try {
          const opensCol = $app.findCollectionByNameOrId('marketing_opens');
          const orec = new Record(opensCol);
          const cid = s.get('campaign');
          const cidStr = typeof cid === 'string' ? cid : (cid && cid.id) || '';
          orec.set('send', s.id); orec.set('campaign', cidStr); orec.set('email', readStr(s, 'email'));
          $app.save(orec);
        } catch (_) {}
        if (st === 'sent') {
          try {
            const cid = s.get('campaign');
            const cidStr = typeof cid === 'string' ? cid : (cid && cid.id) || '';
            const camp = $app.findRecordById('marketing_campaigns', cidStr);
            camp.set('opened_count', readNum(camp, 'opened_count') + 1);
            $app.save(camp);
          } catch (_) {}
        }
      }
    } catch (err) { $app.logger().error('marketing open track failed', 'err', String(err)); }
  }
  return e.blob(200, 'image/gif', GIF_BYTES);
});

// ---------------------------------------------------------------------------
// GET /ef/marketing/click?t=<token>&u=<url>  — records a click, then redirects
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/marketing/click', (e) => {
  const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };
  const readNum = (rec, key) => { try { const v = rec.get(key); const n = Number(v); return isNaN(n) ? 0 : n; } catch (_) { return 0; } };

  const info = e.requestInfo();
  const token = String((info.query && info.query.t) || '').trim();
  let dest = String((info.query && info.query.u) || '').trim();
  if (!dest) dest = '/';
  if (!/^https?:\/\//i.test(dest) && dest.charAt(0) !== '/') dest = '/';
  if (token) {
    try {
      const rows = $app.findRecordsByFilter('marketing_sends', "token = {:t}", '', 1, 0, { t: token });
      if (rows.length) {
        const s = rows[0];
        const st = readStr(s, 'status');
        const wasClicked = st === 'clicked' || st === 'unsubscribed';
        if (!wasClicked) { s.set('status', 'clicked'); s.set('clicked_at', new Date().toISOString()); }
        s.set('click_count', readNum(s, 'click_count') + 1);
        $app.save(s);
        try {
          const clicksCol = $app.findCollectionByNameOrId('marketing_clicks');
          const crec = new Record(clicksCol);
          const cid = s.get('campaign');
          const cidStr = typeof cid === 'string' ? cid : (cid && cid.id) || '';
          crec.set('send', s.id); crec.set('campaign', cidStr); crec.set('email', readStr(s, 'email')); crec.set('url', dest.slice(0, 1000));
          $app.save(crec);
        } catch (_) {}
        if (!wasClicked) {
          try {
            const cid = s.get('campaign');
            const cidStr = typeof cid === 'string' ? cid : (cid && cid.id) || '';
            const camp = $app.findRecordById('marketing_campaigns', cidStr);
            camp.set('clicked_count', readNum(camp, 'clicked_count') + 1);
            $app.save(camp);
          } catch (_) {}
        }
      }
    } catch (err) { $app.logger().error('marketing click track failed', 'err', String(err)); }
  }
  return e.redirect(302, dest);
});

// ---------------------------------------------------------------------------
// GET /ef/marketing/unsub?t=<token>  — unsubscribe landing page
// ---------------------------------------------------------------------------
routerAdd('GET', '/ef/marketing/unsub', (e) => {
  const normalizeEmail = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');
  const readStr = (rec, key) => { try { const v = rec.getString(key); if (v) return v; } catch (_) {} try { const g = rec.get(key); if (g) return String(g); } catch (_) {} return ''; };
  const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const info = e.requestInfo();
  const token = String((info.query && info.query.t) || '').trim();
  let email = '', already = false;
  if (token) {
    try {
      const rows = $app.findRecordsByFilter('marketing_sends', "token = {:t}", '', 1, 0, { t: token });
      if (rows.length) {
        const s = rows[0];
        email = normalizeEmail(readStr(s, 'email'));
        s.set('status', 'unsubscribed');
        $app.save(s);
        let existing = [];
        try { existing = $app.findRecordsByFilter('marketing_unsubscribes', "email = {:e}", '', 1, 0, { e: email }); } catch (_) {}
        if (existing.length) { already = true; }
        else {
          const col = $app.findCollectionByNameOrId('marketing_unsubscribes');
          const rec = new Record(col);
          rec.set('email', email); rec.set('reason', 'unsubscribe link');
          $app.save(rec);
        }
      }
    } catch (err) { $app.logger().error('marketing unsub failed', 'err', String(err)); }
  }

  const msg = email ? (already ? 'You are already unsubscribed from our marketing emails.' : 'You have been unsubscribed from our marketing emails.') : 'Invalid unsubscribe link.';
  const arMsg = email ? (already ? 'أنت مشترك مسبقاً في إلغاء الاشتراك.' : 'تم إلغاء اشتراكك من رسائلنا التسويقية.') : 'رابط إلغاء الاشتراك غير صالح.';

  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe / إلغاء الاشتراك</title></head>' +
    '<body style="font-family:sans-serif;background:#f6f7f9;margin:0;padding:0">' +
    '<div style="max-width:480px;margin:60px auto;background:#fff;border:1px solid #eee;border-radius:12px;padding:32px;text-align-center">' +
    '<h2 style="color:#1a2e4f;margin:0 0 12px">Estate Follow</h2>' +
    '<p style="font-size:16px;color:#333">' + escapeHtml(msg) + '</p>' +
    '<p dir="rtl" style="font-size:15px;color:#555">' + escapeHtml(arMsg) + '</p>' +
    (email ? '<p style="font-size:13px;color:#999;margin-top:18px">' + escapeHtml(email) + '</p>' : '') +
    '<p style="font-size:12px;color:#aaa;margin-top:24px">You will still receive essential account & security emails.</p>' +
    '<p dir="rtl" style="font-size:12px;color:#aaa">ستظل تتلقى رسائل الحساب والأمان الضرورية.</p>' +
    '</div></body></html>';
  return e.html(200, html);
});
