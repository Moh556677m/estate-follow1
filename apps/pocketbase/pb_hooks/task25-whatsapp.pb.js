/// <reference path="../pb_data/types.d.ts" />

// Task #25 — WhatsApp official notification channel: admin-facing status
// check + manual test-send, both Super-Admin-only (same access level as
// the Integration Registry / Site Editor / Site Issues admin surfaces).
//
// Every callback below is fully self-contained (PB JSVM isolated-scope
// constraint confirmed repeatedly in this codebase) — requires
// lib-whatsapp-provider.js fresh inside each handler body rather than
// relying on a shared top-level reference.

// GET /ef/whatsapp/status — does WHATSAPP_ACCESS_TOKEN +
// WHATSAPP_PHONE_NUMBER_ID exist in the PocketBase process env? Never
// returns the values themselves, only a boolean — safe to show in the
// admin panel, but still gated to Super Admin like the rest of this area.
routerAdd(
  "GET",
  "/ef/whatsapp/status",
  (e) => {
    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool("is_super_admin")) {
      return e.json(403, { error: "Super Admin only" });
    }
    const { isConfigured } = require(`${__hooks}/lib-whatsapp-provider.js`);
    return e.json(200, { configured: isConfigured() });
  },
  $apis.requireAuth(),
);

// POST /ef/whatsapp/test-send — Super Admin only. Sends one real template
// message via Meta's Cloud API so Mohamed can verify end-to-end delivery
// once real credentials + an approved template exist. Body:
//   { phone, templateName, languageCode, params: [] }
// Returns the real result from lib-whatsapp-provider (never simulated).
routerAdd(
  "POST",
  "/ef/whatsapp/test-send",
  (e) => {
    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool("is_super_admin")) {
      return e.json(403, { error: "Super Admin only" });
    }
    const { sendTemplateMessage } = require(`${__hooks}/lib-whatsapp-provider.js`);
    const body = info.body || {};
    const result = sendTemplateMessage({
      toPhone: String(body.phone || ""),
      templateName: String(body.templateName || ""),
      languageCode: String(body.languageCode || "ar"),
      params: Array.isArray(body.params) ? body.params : [],
    });
    return e.json(result.ok ? 200 : 400, result);
  },
  $apis.requireAuth(),
);
