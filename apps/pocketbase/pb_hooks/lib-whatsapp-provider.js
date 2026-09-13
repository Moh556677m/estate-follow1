/// <reference path="../pb_data/types.d.ts" />

// Task #25 — Real WhatsApp Business Cloud API (Meta) provider.
//
// Credentials are read from the POCKETBASE PROCESS environment (not
// apps/api/.env — PocketBase and the Express app are separate processes;
// this is the exact same distinction already documented for RESEND_API_KEY
// in 0-resend-mailer.pb.js):
//   WHATSAPP_ACCESS_TOKEN     — a Meta System User permanent access token
//   WHATSAPP_PHONE_NUMBER_ID  — the Cloud API "Phone number ID" (not the
//                                phone number itself)
//   WHATSAPP_API_VERSION      — optional, defaults to "v19.0"
// None of these exist anywhere in this codebase today — this file is
// inert (returns not_configured) until an admin/deploy step sets them in
// the PocketBase process environment. This mirrors the exact same
// "requires_adapter"-style honesty already used for every other
// unconfigured provider in this project — it never claims a send that
// did not really happen.
//
// IMPORTANT, disclosed here because it cannot be fixed in code: Meta's
// WhatsApp Business Platform requires every business-initiated message
// (anything outside a live 24h customer-service window — which is exactly
// what an automated payment/rent reminder is) to use a MESSAGE TEMPLATE
// that was created and approved inside Meta Business Manager beforehand.
// This module cannot create or approve templates — that is a manual,
// one-time step Mohamed does in Meta's own dashboard for each reminder
// type. Once a template is approved there, its exact name + language code
// is entered in Admin → Notification Management → Templates (see
// 1790300000_task25_whatsapp_templates.js), and this file sends it for
// real. Sending arbitrary free-text WhatsApp messages to a customer who
// has not messaged first is not possible on this API — this is a Meta
// platform rule, not a limitation of this integration.

function isConfigured() {
  const token = $os.getenv("WHATSAPP_ACCESS_TOKEN");
  const phoneId = $os.getenv("WHATSAPP_PHONE_NUMBER_ID");
  return !!(token && String(token).trim()) && !!(phoneId && String(phoneId).trim());
}

// Meta's API expects the destination as plain digits (country code +
// number, no "+", no spaces/dashes/parentheses).
function normalizePhone(raw) {
  return String(raw || "").replace(/[^\d]/g, "");
}

/**
 * Send an approved WhatsApp message template to one recipient.
 *
 * @param {object} opts
 * @param {string} opts.toPhone - destination phone, any format (normalized here)
 * @param {string} opts.templateName - the exact Meta-approved template name
 * @param {string} [opts.languageCode] - template language code, default "ar"
 * @param {Array<string|number>} [opts.params] - positional {{1}}, {{2}}... body params, in order
 * @returns {{ok: boolean, reason?: string, status?: number, body?: string}}
 */
function sendTemplateMessage(opts) {
  opts = opts || {};
  const token = $os.getenv("WHATSAPP_ACCESS_TOKEN");
  const phoneId = $os.getenv("WHATSAPP_PHONE_NUMBER_ID");
  const version = $os.getenv("WHATSAPP_API_VERSION") || "v19.0";

  if (!token || !String(token).trim() || !phoneId || !String(phoneId).trim()) {
    return { ok: false, reason: "not_configured", status: 0 };
  }

  const to = normalizePhone(opts.toPhone);
  if (!to || to.length < 8) {
    return { ok: false, reason: "invalid_phone", status: 0 };
  }

  const templateName = String(opts.templateName || "").trim();
  if (!templateName) {
    return { ok: false, reason: "no_template_configured", status: 0 };
  }

  const rawParams = Array.isArray(opts.params) ? opts.params : [];
  const bodyParams = rawParams.filter((p) => p !== undefined && p !== null && String(p).trim() !== "");

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: opts.languageCode || "ar" },
    },
  };
  if (bodyParams.length) {
    payload.template.components = [
      {
        type: "body",
        parameters: bodyParams.map((p) => ({ type: "text", text: String(p) })),
      },
    ];
  }

  try {
    const res = $http.send({
      url: `https://graph.facebook.com/${version}/${phoneId}/messages`,
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { ok: true, status: res.statusCode };
    }
    return {
      ok: false,
      reason: "http-" + res.statusCode,
      status: res.statusCode,
      body: String(res.body || "").slice(0, 500),
    };
  } catch (err) {
    return { ok: false, reason: "exception", status: 0, body: String(err).slice(0, 300) };
  }
}

module.exports = { isConfigured, normalizePhone, sendTemplateMessage };
