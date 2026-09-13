/// <reference path="../pb_data/types.d.ts" />

// Template resolution for the Reminder Engine (Task #14), built on top of
// the EXISTING `notification_templates` collection (already used by
// NotificationManagementPanel.jsx's "templates" admin tab) instead of a new
// collection — extends it with a `channels` field (added by
// 1789600000_extend_notification_templates.js) rather than creating a
// parallel "reminder_rules" table.
//
// Maps an alerts-engine event type + phase (upcoming/due_today/overdue) to
// one of the 15 `notification_templates.type` values, renders {{var}}
// placeholders, and returns which channels Admin has enabled for that
// template. Falls back to a safe generic message when a template row is
// missing/disabled so the reminder engine never goes silent because of a
// missing template.

const TEMPLATE_TYPE_MAP = {
  installment: { overdue: "installment_overdue", due_today: "installment_due", upcoming: "installment_upcoming" },
  rent: { overdue: "rent_overdue", due_today: "rent_upcoming", upcoming: "rent_upcoming" },
  service_fee: { overdue: "service_due", due_today: "service_due", upcoming: "service_upcoming" },
  contract_expiry: { overdue: "contract_expiring", due_today: "contract_expiring", upcoming: "contract_expiring" },
  handover: { overdue: "handover_upcoming", due_today: "handover_upcoming", upcoming: "handover_upcoming" },
  cheque: { overdue: "cheque_due", due_today: "cheque_due", upcoming: "cheque_due" },
  document_expiry: { overdue: "document_expiry", due_today: "document_expiry", upcoming: "document_expiry" },
  custom: { overdue: "custom_reminder", due_today: "custom_reminder", upcoming: "custom_reminder" },
};

function templateTypeFor(eventType, phase) {
  const row = TEMPLATE_TYPE_MAP[eventType];
  return (row && row[phase]) || null;
}

function fillVars(text, vars) {
  if (!text) return "";
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m,
  );
}

const DEFAULT_CHANNELS = { email: true, in_app: true, whatsapp: false, sms: false, push: false };

// Returns { title, body, channels, enabled, fromTemplate } for a given
// event/phase, in the requested language ('ar' | 'en'). `vars` supplies the
// {{placeholder}} values: owner_name, property_name, amount, due_date,
// days_text.
function resolveTemplate($app, eventType, phase, lang, vars, fallbackTitle, fallbackBody) {
  const typeKey = templateTypeFor(eventType, phase);
  if (typeKey) {
    try {
      const row = $app.findFirstRecordByFilter("notification_templates", `type = "${typeKey}"`);
      if (row) {
        const enabled = row.get("enabled") !== false;
        if (!enabled) {
          return {
            title: fallbackTitle, body: fallbackBody, channels: DEFAULT_CHANNELS, enabled: false, fromTemplate: false,
            whatsappTemplateName: "", whatsappTemplateLang: "ar",
          };
        }
        const titleRaw = lang === "ar" ? row.get("title_ar") : row.get("title_en");
        const bodyRaw = lang === "ar" ? row.get("message_ar") : row.get("message_en");
        let channels = DEFAULT_CHANNELS;
        try {
          const raw = row.get("channels");
          const parsed = raw ? JSON.parse(String(raw)) : null;
          if (parsed && typeof parsed === "object") channels = Object.assign({}, DEFAULT_CHANNELS, parsed);
        } catch (_) { /* keep default */ }
        return {
          title: fillVars(titleRaw, vars) || fallbackTitle,
          body: fillVars(bodyRaw, vars) || fallbackBody,
          channels,
          enabled: true,
          fromTemplate: true,
          // Task #25 — the Meta-approved WhatsApp template mapped to this
          // reminder type by Admin. Empty until Admin fills it in; the
          // whatsapp provider treats an empty name as "not configured for
          // this type" rather than guessing a template name.
          whatsappTemplateName: String(row.get("whatsapp_template_name") || ""),
          whatsappTemplateLang: String(row.get("whatsapp_template_lang") || "ar"),
        };
      }
    } catch (e) {
      $app.logger().error("template resolve failed", "type", typeKey, "err", String(e));
    }
  }
  return {
    title: fallbackTitle, body: fallbackBody, channels: DEFAULT_CHANNELS, enabled: true, fromTemplate: false,
    whatsappTemplateName: "", whatsappTemplateLang: "ar",
  };
}

module.exports = { resolveTemplate, templateTypeFor, fillVars, DEFAULT_CHANNELS };
