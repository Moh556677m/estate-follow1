/// <reference path="../pb_data/types.d.ts" />

// Shared Alerts/Reminder engine (Task #14) — the real event-derivation and
// send logic that used to live only inline inside alerts.pb.js's
// POST /api/alerts/process handler. Extracted into a requireable module so
// BOTH the existing pull-based route (alerts.pb.js, kept for an owner's
// manual/on-open refresh) and the new cron-based sweep
// (reminder-scheduler.pb.js) call the exact same code — one engine, two
// triggers, zero duplicated logic.
//
// What changed vs. the original inline version:
//  - Messages now come from the existing `notification_templates` collection
//    (admin-editable, {{var}} placeholders) via lib-notification-templates.js,
//    instead of hardcoded Arabic/English strings — falls back to the old
//    hardcoded strings if a template is missing/disabled, so behavior never
//    regresses.
//  - Sending now goes through lib-notification-providers.js's dispatch(),
//    which supports channels beyond in_app/email — whatsapp is a real,
//    wired-up channel as of Task #25 (Meta WhatsApp Cloud API, honestly
//    reporting not_configured/no_template_configured/invalid_phone when
//    Admin hasn't set it up yet); sms/push remain unimplemented and are
//    honestly logged as "requires_adapter" — never faked.
//  - Idempotency keys are now PER CHANNEL (`...|<channel>`), matching the
//    "idempotency via notification_id + reminder_time + channel" requirement
//    — previously one shared key covered whichever channel happened to send
//    first, which could silently suppress a later-added channel's very first
//    send for an already-keyed reminder. This is a one-time behavior change:
//    on first deploy, a reminder already sent under the old shared key may
//    send once more under its new per-channel key (documented in the Task
//    #14 report).

function pad(n) { return (n < 10 ? "0" : "") + n; }
function dateStr(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function addDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function parseDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return d;
}

function safeFindAll($app, collection, filter) {
  try { return $app.findRecordsByFilter(collection, filter, "", 0, 0) || []; }
  catch (_) { return []; }
}
function safeFirst($app, collection, filter) {
  try { return $app.findFirstRecordByFilter(collection, filter) || null; }
  catch (_) { return null; }
}

function hasExecution($app, key) {
  return !!safeFirst($app, "alert_executions", `execution_key = "${key}"`);
}
function recordExecution($app, ownerId, alertRef, key, channel, status) {
  try {
    const col = $app.findCollectionByNameOrId("alert_executions");
    const rec = new Record(col);
    rec.set("owner", ownerId);
    rec.set("alert_ref", alertRef);
    rec.set("execution_key", key);
    rec.set("channel", channel);
    rec.set("status", status);
    rec.set("sent_at", new Date().toISOString());
    $app.save(rec);
  } catch (e) {
    $app.logger().error("alert execution save failed", "key", key, "err", String(e));
  }
}
function writeAudit($app, ownerId, action, alertRef, propertyRef, details) {
  try {
    const col = $app.findCollectionByNameOrId("alert_audit_log");
    const rec = new Record(col);
    rec.set("owner", ownerId);
    rec.set("action", action);
    rec.set("alert_ref", alertRef || "");
    rec.set("property_ref", propertyRef || "");
    rec.set("details", details || "");
    $app.save(rec);
  } catch (e) {
    $app.logger().error("alert audit save failed", "err", String(e));
  }
}

// Build the list of "events" (real obligations) for an owner from
// properties, payments, and manual alerts. Identical to the original
// buildEvents() in alerts.pb.js (verbatim logic — not rewritten, only moved).
function buildEvents($app, ownerId, adminDefaults) {
  const events = [];
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const props = safeFindAll($app, "properties", `owner = "${ownerId}"`);
  const pays = safeFindAll($app, "payments", `owner = "${ownerId}"`);
  const manual = safeFindAll($app, "property_alerts", `owner = "${ownerId}" && enabled = true`);

  const propMap = {};
  props.forEach((p) => { propMap[p.id] = p; });

  function propLabel(p) {
    if (!p) return "";
    return (p.get("building") || "") + " / " + (p.get("unit_number") || "");
  }
  function remindersFor(type) {
    const d = adminDefaults && adminDefaults[type];
    return Array.isArray(d) && d.length ? d : [7, 1];
  }

  pays.forEach((pay) => {
    const date = parseDate(pay.get("due_date"));
    if (!date) return;
    const kind = pay.get("kind");
    const done = pay.get("status") === "paid";
    events.push({
      ref: "payment:" + pay.id,
      type: kind === "rent" ? "rent" : "installment",
      title: (pay.get("label") || (kind === "rent" ? "Rent" : "Installment")) + " — " + propLabel(propMap[pay.get("property")]),
      date: date,
      amount: pay.get("amount") || 0,
      isFinancial: true,
      propertyId: pay.get("property") || "",
      done: done,
      reminders: remindersFor(kind === "rent" ? "rent" : "installment"),
    });
  });

  props.forEach((p) => {
    const label = propLabel(p);
    const end = parseDate(p.get("contract_end_date"));
    if (end) {
      events.push({
        ref: "contract_expiry:" + p.id, type: "contract_expiry", title: "Contract Expiry — " + label,
        date: end, amount: 0, isFinancial: false, propertyId: p.id, done: false,
        reminders: remindersFor("contract_expiry"),
      });
    }
    const hand = parseDate(p.get("expected_handover_date"));
    if (hand && p.get("handover_status") !== "handover_completed") {
      events.push({
        ref: "handover:" + p.id, type: "handover", title: "Handover — " + label,
        date: hand, amount: 0, isFinancial: false, propertyId: p.id,
        done: p.get("handover_status") === "handover_completed",
        reminders: remindersFor("handover"),
      });
    }
    if (p.get("service_charge_frequency") === "yearly" && p.get("service_charge_amount")) {
      const base = parseDate(p.get("service_charge_date"));
      if (base) {
        let next = new Date(base.getTime());
        while (next < t0) next.setFullYear(next.getFullYear() + 1);
        events.push({
          ref: "service_fee:" + p.id + ":" + next.getFullYear(), type: "service_fee",
          title: "Service Fee — " + label, date: next, amount: p.get("service_charge_amount") || 0,
          isFinancial: true, propertyId: p.id, done: false, reminders: remindersFor("service_fee"),
        });
      }
    }
  });

  manual.forEach((a) => {
    const date = parseDate(a.get("event_date"));
    if (!date) return;
    const rem = a.get("reminders");
    let reminders = Array.isArray(rem) && rem.length
      ? rem.map((r) => (typeof r === "object" ? r.days_before : r))
      : remindersFor(a.get("alert_type"));
    events.push({
      ref: "manual:" + a.id, type: a.get("alert_type"), title: a.get("title"), date: date,
      amount: a.get("amount") || 0, isFinancial: !!a.get("is_financial"),
      propertyId: a.get("property") || "",
      done: a.get("status") === "paid" || a.get("status") === "completed",
      reminders: reminders,
    });
  });

  return events;
}

// Send one event's notification across every channel the resolved template
// (or the owner/admin channel preferences, if no template matches) allows,
// with a per-channel idempotency key. Returns how many channels actually
// sent (email or in_app; whatsapp/sms/push count as attempted, not sent).
function sendEvent($app, { ownerId, ownerEmail, ownerPhone, ev, phase, baseKey, ownerEmailPref, ownerInAppPref, vars, fallbackTitle, fallbackBody, category }) {
  const { resolveTemplate } = require(`${__hooks}/lib-notification-templates.js`);
  const { dispatch } = require(`${__hooks}/lib-notification-providers.js`);

  const tpl = resolveTemplate($app, ev.type, phase, "ar", vars, fallbackTitle, fallbackBody);
  if (!tpl.enabled) return { sent: 0, attempted: 0 };

  // Channel gating: template.channels ∩ owner's own email/in-app preference
  // (whatsapp/sms/push have no owner-level toggle yet — template-level
  // enablement is the only gate for those. WhatsApp itself is a real,
  // wired-up channel as of Task #25 — see lib-whatsapp-provider.js — but
  // still requires Admin to have both real Meta credentials configured AND
  // an approved template mapped to this event type; sms/push remain
  // unimplemented).
  const wantChannels = [];
  if (tpl.channels.email && ownerEmailPref) wantChannels.push("email");
  if (tpl.channels.in_app && ownerInAppPref) wantChannels.push("in_app");
  if (tpl.channels.whatsapp) wantChannels.push("whatsapp");
  if (tpl.channels.sms) wantChannels.push("sms");
  if (tpl.channels.push) wantChannels.push("push");

  let sent = 0;
  let attempted = 0;
  wantChannels.forEach((channel) => {
    const key = `${baseKey}|${channel}`;
    if (hasExecution($app, key)) return;
    attempted++;
    const result = dispatch($app, channel, {
      userId: ownerId,
      category,
      ownerEmail,
      ownerPhone,
      subject: tpl.title,
      html: `<p>${tpl.body}</p>`,
      title: tpl.title,
      body: tpl.body,
      // Meta templates use positional {{1}}, {{2}}... placeholders, not
      // named {{var}} ones — this fixed, stable order matches what
      // 1790300000_task25_whatsapp_templates.js documents to Admin when
      // they build the approved template in Meta Business Manager.
      whatsappTemplateName: tpl.whatsappTemplateName,
      whatsappTemplateLang: tpl.whatsappTemplateLang,
      whatsappParams: [vars.property_name, vars.amount, vars.due_date],
    });
    if (result.ok) sent++;
    recordExecution($app, ownerId, ev.ref, key, channel, result.ok ? "sent" : "failed");
  });

  return { sent, attempted };
}

// The full per-owner sweep — identical semantics to the original
// /api/alerts/process route body, now shared by both trigger points.
function processOwnerAlerts($app, ownerId, ownerEmail, ownerPhone) {
  const admin = safeFirst($app, "alert_admin_settings", "1=1");
  if (admin && admin.get("system_enabled") === false) return { processed: 0, skipped: "system_disabled" };
  if (admin && admin.get("owner_alerts_enabled") === false) return { processed: 0, skipped: "owner_alerts_disabled" };

  const ownerSettings = safeFirst($app, "alert_settings", `owner = "${ownerId}"`);
  const emailEnabledGlobally = !admin || admin.get("email_alerts_enabled") !== false;
  const inAppEnabledGlobally = !admin || admin.get("in_app_enabled") !== false;
  const upcomingEnabled = !admin || admin.get("upcoming_enabled") !== false;
  const overdueEnabled = !admin || admin.get("overdue_enabled") !== false;
  const repeatedOverdue = !admin || admin.get("repeated_overdue_enabled") !== false;

  const ownerEmailPref = emailEnabledGlobally && !(ownerSettings && ownerSettings.get("email_enabled") === false);
  const ownerInAppPref = inAppEnabledGlobally && !(ownerSettings && ownerSettings.get("in_app_enabled") === false);

  const defaultsRaw = admin ? admin.get("default_reminders") : null;
  let adminDefaults = {};
  try { adminDefaults = typeof defaultsRaw === "string" ? JSON.parse(defaultsRaw) : (defaultsRaw || {}); }
  catch (_) { adminDefaults = {}; }

  const events = buildEvents($app, ownerId, adminDefaults);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let sent = 0, attempted = 0, overdueCount = 0;

  events.forEach((ev) => {
    if (ev.done) return;
    const isOverdue = ev.date < t0;

    if (isOverdue && overdueEnabled) {
      overdueCount++;
      const okey = `${ev.ref}|overdue|${dateStr(t0)}`;
      const r = sendEvent($app, {
        ownerId, ownerEmail, ownerPhone, ev, phase: "overdue", baseKey: okey, ownerEmailPref, ownerInAppPref,
        category: ev.type,
        vars: { owner_name: "", property_name: ev.title, amount: ev.amount, due_date: dateStr(ev.date), days_text: "متأخر" },
        fallbackTitle: "تنبيه عاجل — متأخر",
        fallbackBody: `${ev.title} أصبح متأخرًا.`,
      });
      sent += r.sent; attempted += r.attempted;
      if (r.attempted) writeAudit($app, ownerId, "became_overdue", ev.ref, ev.propertyId, ev.title);

      if (repeatedOverdue) {
        const daysLate = Math.floor((t0 - ev.date) / 86400000);
        if (daysLate > 0 && daysLate % 3 === 0) {
          const rkey = `${ev.ref}|overdue_repeat|${dateStr(t0)}`;
          if (ownerInAppPref && !hasExecution($app, rkey + "|in_app")) {
            const { dispatch } = require(`${__hooks}/lib-notification-providers.js`);
            const res = dispatch($app, "in_app", { userId: ownerId, category: ev.type, title: "تذكير متأخر", body: `${ev.title} لا يزال متأخرًا.` });
            recordExecution($app, ownerId, ev.ref, rkey + "|in_app", "in_app", res.ok ? "sent" : "failed");
          }
        }
      }
      return;
    }

    if (!upcomingEnabled) return;
    (ev.reminders || []).forEach((offset) => {
      const off = Number(offset) || 0;
      const reminderDate = addDays(ev.date, -off);
      if (reminderDate > t0) return;
      const isDueToday = off === 0 || dateStr(ev.date) === dateStr(t0);
      const phase = isDueToday ? "due_today" : "upcoming";
      const rkey = `${ev.ref}|remind|${off}|${dateStr(reminderDate)}`;
      const daysTxt = off === 0 ? "اليوم" : `بعد ${off} ${off === 1 ? "يوم" : "أيام"}`;
      const r = sendEvent($app, {
        ownerId, ownerEmail, ownerPhone, ev, phase, baseKey: rkey, ownerEmailPref, ownerInAppPref,
        category: ev.type,
        vars: { owner_name: "", property_name: ev.title, amount: ev.amount, due_date: dateStr(ev.date), days_text: daysTxt },
        fallbackTitle: isDueToday ? "تنبيه عقاري — مستحق اليوم" : "تنبيه عقاري",
        fallbackBody: `${ev.title} — ${daysTxt}.`,
      });
      sent += r.sent; attempted += r.attempted;
      if (r.attempted) writeAudit($app, ownerId, "alert_sent", ev.ref, ev.propertyId, `${ev.title} — ${daysTxt}.`);
    });
  });

  try {
    if (admin) { admin.set("last_run", new Date().toISOString()); $app.save(admin); }
  } catch (_) { /* ignore */ }

  return { processed: sent + attempted, sent, attempted, overdue: overdueCount, events: events.length };
}

// Every owner who might have a due reminder — same "reportable owners"
// pattern used by lib-monthly-reports.js's listReportableOwnerIds, but here
// scoped to owners with at least one property OR payment OR manual alert
// (an owner with none of those can never produce an event).
function listReminderableOwnerIds($app) {
  const ids = new Set();
  ["properties", "payments", "property_alerts"].forEach((col) => {
    try {
      const rows = $app.findRecordsByFilter(col, "1=1", "", 0, 0);
      rows.forEach((r) => { const o = r.get("owner"); if (o) ids.add(o); });
    } catch (_) { /* ignore */ }
  });
  return Array.from(ids);
}

module.exports = { processOwnerAlerts, listReminderableOwnerIds, buildEvents };
