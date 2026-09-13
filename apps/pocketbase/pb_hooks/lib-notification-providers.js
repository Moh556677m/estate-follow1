/// <reference path="../pb_data/types.d.ts" />

// Multi-channel notification Provider interface (Task #14; WhatsApp wired
// to a real provider in Task #25).
//
// A minimal, honest dispatch layer: `dispatch(channel, payload)` returns
// `{ ok, reason }`. `email`, `in_app`, and now `whatsapp` (via Meta's Cloud
// API, see lib-whatsapp-provider.js) actually send for real — `whatsapp`
// still honestly fails with `not_configured` / `no_template_configured` /
// `invalid_phone` / an http-xxx reason when credentials or a per-type
// approved template are missing, never a fake "sent". `sms`, `push`, and
// `webhook` remain unimplemented and return
// `{ ok: false, reason: 'requires_adapter' }`, logged as such, rather than
// pretending to deliver — same "Requires Adapter" honesty principle used
// elsewhere in this codebase (Integration Manager). When a real SMS/Push
// provider is wired up later, only this file needs a new branch; no caller
// needs to change.
//
// Every dispatch — success, failure, or "no provider" — is logged to the
// existing `notification_delivery_log` collection so Admin has one place to
// see delivery history across every channel, not just push/in_app/sound as
// before.

function logDelivery($app, { userId, notificationId, category, channel, status, detail }) {
  try {
    const col = $app.findCollectionByNameOrId("notification_delivery_log");
    const rec = new Record(col);
    rec.set("user", userId);
    if (notificationId) rec.set("notification", notificationId);
    rec.set("category", category || "");
    rec.set("channel", channel);
    rec.set("status", status);
    rec.set("detail", (detail || "").slice(0, 500));
    $app.save(rec);
  } catch (e) {
    $app.logger().error("notification delivery log failed", "channel", channel, "err", String(e));
  }
}

// channel: 'email' | 'in_app' | 'whatsapp' | 'sms' | 'push' | 'webhook'
// payload: { userId, category, ownerEmail, subject, html, title, body, notificationId }
function dispatch($app, channel, payload) {
  const { userId, category } = payload;

  if (channel === "email") {
    if (!payload.ownerEmail) {
      logDelivery($app, { userId, category, channel, status: "failed", detail: "no email on file" });
      return { ok: false, reason: "no_recipient" };
    }
    const { sendMail } = require(`${__hooks}/lib-email.js`);
    const ok = sendMail({
      to: payload.ownerEmail,
      subject: payload.subject,
      html: payload.html,
      logContext: "reminder-engine-" + category,
    });
    logDelivery($app, { userId, category, channel, status: ok ? "sent" : "failed", detail: ok ? "" : "sendMail returned false" });
    return { ok };
  }

  if (channel === "in_app") {
    try {
      const col = $app.findCollectionByNameOrId("notifications");
      const rec = new Record(col);
      rec.set("user", userId);
      rec.set("title", payload.title);
      rec.set("body", payload.body || "");
      rec.set("type", "reminder");
      rec.set("category", category || "");
      rec.set("read", false);
      $app.save(rec);
      logDelivery($app, { userId, notificationId: rec.id, category, channel, status: "sent" });
      return { ok: true, notificationId: rec.id };
    } catch (e) {
      logDelivery($app, { userId, category, channel, status: "failed", detail: String(e).slice(0, 300) });
      return { ok: false, reason: "save_failed" };
    }
  }

  if (channel === "whatsapp") {
    // Task #25 — real Meta WhatsApp Cloud API adapter. Still entirely
    // honest: every failure mode below is logged with its real reason, and
    // nothing is ever reported "sent" unless Meta's API actually returned
    // success. See lib-whatsapp-provider.js for why a pre-approved message
    // template is required and cannot be created by this code.
    const { sendTemplateMessage } = require(`${__hooks}/lib-whatsapp-provider.js`);
    if (!payload.ownerPhone) {
      logDelivery($app, { userId, category, channel, status: "failed", detail: "no_recipient" });
      return { ok: false, reason: "no_recipient" };
    }
    if (!payload.whatsappTemplateName) {
      logDelivery($app, { userId, category, channel, status: "failed", detail: "no_template_configured" });
      return { ok: false, reason: "no_template_configured" };
    }
    const result = sendTemplateMessage({
      toPhone: payload.ownerPhone,
      templateName: payload.whatsappTemplateName,
      languageCode: payload.whatsappTemplateLang || "ar",
      params: payload.whatsappParams || [],
    });
    logDelivery($app, {
      userId, category, channel,
      status: result.ok ? "sent" : "failed",
      detail: result.ok ? "" : (result.reason || "unknown") + (result.body ? (": " + result.body) : ""),
    });
    return result;
  }

  // sms / push / webhook — no real provider wired up yet in this codebase
  // (confirmed: no Twilio/other SMS or push client exists). Never claim
  // delivery for these — log the honest "requires_adapter" status so
  // Admin sees exactly which channels are configured-but-inert.
  logDelivery($app, { userId, category, channel, status: "failed", detail: "requires_adapter" });
  return { ok: false, reason: "requires_adapter" };
}

module.exports = { dispatch, logDelivery };
