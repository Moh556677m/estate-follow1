// Notification engine for Estate Follow owners.
//
// Computes due / overdue / upcoming / expiring notifications from the owner's
// REAL property + payment data and the user's reminder preferences, creates
// them idempotently in the `notifications` collection, fires browser push
// notifications + the selected sound, and cancels future reminders when a
// payment is marked paid or a date changes.
//
// There is no server-side scheduler (the platform hibernates when idle), so
// the engine runs client-side while the owner is signed in: it scans data,
// reconciles the notification set against what already exists (dedup_key),
// and surfaces new ones. This keeps notifications tied to real data — no
// manual notification creation, no stale reminders.

import pb from '@/lib/pocketbaseClient';
import { formatMoney } from '@/lib/api';

// Build a cheap content signature of the data slice that actually affects
// notification computation. Used by useNotificationEngine to skip redundant
// reconcile runs (each of which does a getFullList on `notifications`) when
// the dashboard reloaded but no due-relevant field changed.
//
// Only fields read by computeNotifications are included: payment id/status/
// due_date/kind, and property id/type/status/contract_end_date/expected_
// handover_date/handover_status, plus the user's reminder_days/categories
// (settings drive which notifications get created).
export function dataSignature({ properties, payments, settings }) {
  const p = (properties || [])
    .map((x) => `${x.id}:${x.type}:${x.status}:${x.contract_end_date || ''}:${x.expected_handover_date || ''}:${x.handover_status || ''}`)
    .join('|');
  const y = (payments || [])
    .map((x) => `${x.id}:${x.status}:${x.due_date || ''}:${x.kind || ''}`)
    .join('|');
  const s = `${(settings?.reminder_days || []).join(',')}:${JSON.stringify(settings?.categories || {})}`;
  return `${p}#${y}#${s}`;
}

// ---- Category metadata -----------------------------------------------------

export const NOTIF_CATEGORIES = [
  { key: 'installment', group: 'properties', templateType: 'installment_upcoming' },
  { key: 'rent', group: 'properties', templateType: 'rent_upcoming' },
  { key: 'service', group: 'properties', templateType: 'service_upcoming' },
  { key: 'contract', group: 'properties', templateType: 'contract_expiring' },
  { key: 'handover', group: 'properties', templateType: 'handover_upcoming' },
  { key: 'platform', group: 'platform', templateType: 'platform_update' },
  { key: 'inactivity', group: 'inactivity', templateType: 'inactivity_reminder' },
  { key: 'security', group: 'security', templateType: null },
];

export const CATEGORY_GROUPS = [
  { key: 'installment', label_ar: 'إشعارات الأقساط', label_en: 'Installments' },
  { key: 'rent', label_ar: 'إشعارات الإيجارات', label_en: 'Rentals' },
  { key: 'service', label_ar: 'إشعارات رسوم الخدمات', label_en: 'Service Fees' },
  { key: 'contract', label_ar: 'إشعارات العقود', label_en: 'Contracts' },
  { key: 'handover', label_ar: 'إشعارات الاستلام', label_en: 'Handover' },
  { key: 'platform', label_ar: 'تحديثات Estate Follow', label_en: 'Estate Follow Updates' },
  { key: 'inactivity', label_ar: 'تذكير عدم النشاط', label_en: 'Inactivity Reminder' },
];

// ---- Default user settings -------------------------------------------------

export const DEFAULT_SETTINGS = {
  push_enabled: true,
  in_app_enabled: true,
  sound_enabled: true,
  vibration_enabled: true,
  silent: false,
  mute_all: false,
  selected_sound: 'estate_default',
  hide_amount_lock: false,
  reminder_days: [7, 1, 0],
  categories: {
    installment: true,
    rent: true,
    service: true,
    contract: true,
    handover: true,
    platform: true,
    inactivity: true,
  },
  push_permission: 'default',
};

// ---- Settings load / save --------------------------------------------------

export async function loadSettings(userId) {
  if (!userId) return { ...DEFAULT_SETTINGS, id: null };
  try {
    const rows = await pb.collection('notification_settings').getFullList({
      filter: `user = "${userId}"`,
    });
    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: r.id,
        push_enabled: r.push_enabled ?? DEFAULT_SETTINGS.push_enabled,
        in_app_enabled: r.in_app_enabled ?? DEFAULT_SETTINGS.in_app_enabled,
        sound_enabled: r.sound_enabled ?? DEFAULT_SETTINGS.sound_enabled,
        vibration_enabled: r.vibration_enabled ?? DEFAULT_SETTINGS.vibration_enabled,
        silent: r.silent ?? false,
        mute_all: r.mute_all ?? false,
        selected_sound: r.selected_sound || DEFAULT_SETTINGS.selected_sound,
        hide_amount_lock: r.hide_amount_lock ?? false,
        reminder_days: parseJson(r.reminder_days, DEFAULT_SETTINGS.reminder_days),
        categories: parseJson(r.categories, DEFAULT_SETTINGS.categories),
        last_active_at: r.last_active_at || null,
        inactivity_last_sent: r.inactivity_last_sent || null,
        push_permission: r.push_permission || 'default',
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS, id: null };
}

export async function saveSettings(userId, settings) {
  if (!userId) return null;
  const body = {
    user: userId,
    push_enabled: !!settings.push_enabled,
    in_app_enabled: !!settings.in_app_enabled,
    sound_enabled: !!settings.sound_enabled,
    vibration_enabled: !!settings.vibration_enabled,
    silent: !!settings.silent,
    mute_all: !!settings.mute_all,
    selected_sound: settings.selected_sound || 'estate_default',
    hide_amount_lock: !!settings.hide_amount_lock,
    reminder_days: JSON.stringify(settings.reminder_days || [7, 1, 0]),
    categories: JSON.stringify(settings.categories || DEFAULT_SETTINGS.categories),
    push_permission: settings.push_permission || 'default',
  };
  try {
    if (settings.id) {
      const updated = await pb
        .collection('notification_settings')
        .update(settings.id, body, { requestKey: `notif-settings-${settings.id}` });
      return { ...settings, ...updated };
    }
    const created = await pb
      .collection('notification_settings')
      .create({ ...body }, { requestKey: `notif-settings-create-${userId}` });
    return { ...settings, id: created.id };
  } catch (err) {
    // Race: another tab created the row first. Reload and retry update.
    try {
      const rows = await pb.collection('notification_settings').getFullList({
        filter: `user = "${userId}"`,
      });
      if (rows.length > 0) {
        const updated = await pb
          .collection('notification_settings')
          .update(rows[0].id, body, { requestKey: `notif-settings-${rows[0].id}` });
        return { ...settings, id: rows[0].id, ...updated };
      }
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export async function touchLastActive(userId, settings) {
  if (!userId) return settings;
  const now = new Date().toISOString();
  try {
    if (settings.id) {
      await pb
        .collection('notification_settings')
        .update(settings.id, { last_active_at: now }, { requestKey: `notif-active-${settings.id}` });
    } else {
      // create-on-demand
      const created = await pb.collection('notification_settings').create({
        user: userId,
        last_active_at: now,
        reminder_days: JSON.stringify(DEFAULT_SETTINGS.reminder_days),
        categories: JSON.stringify(DEFAULT_SETTINGS.categories),
      });
      return { ...settings, id: created.id, last_active_at: now };
    }
  } catch {
    /* ignore — best effort */
  }
  return { ...settings, last_active_at: now };
}

// ---- Global config (Super Admin) -------------------------------------------

export async function loadConfig() {
  try {
    const rows = await pb.collection('notification_config').getFullList({ sort: 'created' });
    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: r.id,
        system_enabled: r.system_enabled ?? true,
        push_configured: r.push_configured ?? false,
        inactivity_days: r.inactivity_days ?? 7,
        inactivity_cooldown_days: r.inactivity_cooldown_days ?? 30,
        reminder_defaults: parseJson(r.reminder_defaults, [7, 1, 0]),
        critical_types: parseJson(r.critical_types, ['security']),
        default_sound: r.default_sound || 'estate_default',
        contract_expiry_days: r.contract_expiry_days != null ? Number(r.contract_expiry_days) : 30,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

// Fallback config (when no row exists yet) — keeps the dashboard card and
// the contract-expiry notification engine on a sane 30-day default.
export const DEFAULT_CONFIG = {
  system_enabled: true,
  push_configured: false,
  inactivity_days: 7,
  inactivity_cooldown_days: 30,
  reminder_defaults: [7, 1, 0],
  critical_types: ['security'],
  default_sound: 'estate_default',
  contract_expiry_days: 30,
};

// ---- Sounds ----------------------------------------------------------------

let audioCtx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}

// Play a short synthesized tone from a sound descriptor.
export function playSound(sound) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const freq = sound?.frequency || 880;
  const dur = sound?.duration || 0.25;
  const wave = sound?.waveform || 'sine';
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur + 0.02);
}

export async function loadSounds() {
  try {
    return await pb.collection('notification_sounds').getFullList({ sort: 'created' });
  } catch {
    return [];
  }
}

// ---- Push permission -------------------------------------------------------

export function pushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestPushPermission() {
  if (!pushSupported()) return 'denied';
  try {
    const perm = await Notification.requestPermission();
    return perm; // 'granted' | 'denied' | 'default'
  } catch {
    return 'denied';
  }
}

export function pushPermission() {
  if (!pushSupported()) return 'denied';
  return Notification.permission;
}

// Fire a browser notification. Returns true if shown.
export function firePushNotification({ title, body, link, icon }) {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(title, {
      body,
      icon: icon || '/favicon.ico',
      badge: icon || '/favicon.ico',
      tag: link || title,
      data: { link },
    });
    n.onclick = () => {
      window.focus();
      if (link) {
        const base = window.location.origin;
        window.location.href = link.startsWith('http') ? link : `${base}${link}`;
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

// ---- Helpers ---------------------------------------------------------------

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    const p = JSON.parse(value);
    return p || fallback;
  } catch {
    return fallback;
  }
}

function daysBetween(a, b) {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.round(ms / 86400000);
}

function dateOnly(d) {
  if (!d) return null;
  return String(d).slice(0, 10);
}

function propertyLabel(p, lang) {
  if (!p) return '';
  const parts = [p.building, p.unit_number].filter(Boolean);
  return parts.join(' · ') || (lang === 'ar' ? 'عقار' : 'Property');
}

// ---- Template rendering ----------------------------------------------------

export function renderTemplate(tpl, vars, lang) {
  if (!tpl) return { title: '', body: '' };
  const title = lang === 'ar' ? tpl.title_ar : tpl.title_en;
  const message = lang === 'ar' ? tpl.message_ar : tpl.message_en;
  const replace = (s) =>
    String(s || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
  return { title: replace(title), body: replace(message) };
}

// ---- Engine: compute + reconcile notifications ------------------------------

/**
 * Build the set of notifications that SHOULD exist right now from the owner's
 * real data + reminder preferences. Returns an array of descriptor objects
 * (not yet persisted).
 */
export function computeNotifications({ properties, payments, settings, config, lang }) {
  const out = [];
  if (!settings) return out;
  const cats = settings.categories || {};
  const reminderDays = settings.reminder_days || [7, 1, 0];
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const propById = Object.fromEntries((properties || []).map((p) => [p.id, p]));

  const addForPayment = (p) => {
    if (!p || !p.due_date || p.status === 'paid') return;
    const cat = p.kind === 'rent' ? 'rent' : p.kind === 'service' ? 'service' : 'installment';
    if (!cats[cat]) return;
    const prop = propById[p.property];
    const due = dateOnly(p.due_date);
    if (!due) return;
    const diff = daysBetween(due, todayStr);
    const amountStr = formatMoney(p.amount || 0, lang);
    const propStr = propertyLabel(prop, lang);

    // Overdue
    if (diff < 0) {
      const daysOverdue = Math.abs(diff);
      const typeKey =
        cat === 'rent' ? 'rent_overdue' : cat === 'service' ? 'service_due' : 'installment_overdue';
      out.push({
        dedup_key: `${typeKey}-${p.id}`,
        category: cat,
        type: 'reminder',
        priority: 'high',
        templateType: typeKey,
        link: `/dashboard/installments`,
        property: p.property,
        payment: p.id,
        vars: {
          amount: amountStr,
          due_date: due,
          days_overdue: daysOverdue,
          property_name: propStr,
          unit_number: prop?.unit_number || '',
          owner_name: '',
        },
      });
      return;
    }
    // Due today
    if (diff === 0 && reminderDays.includes(0)) {
      const typeKey =
        cat === 'rent' ? 'rent_upcoming' : cat === 'service' ? 'service_due' : 'installment_due';
      out.push({
        dedup_key: `${typeKey}-${p.id}`,
        category: cat,
        type: 'reminder',
        priority: 'normal',
        templateType: typeKey,
        link: `/dashboard/installments`,
        property: p.property,
        payment: p.id,
        vars: {
          amount: amountStr,
          due_date: due,
          days_overdue: 0,
          property_name: propStr,
          unit_number: prop?.unit_number || '',
        },
      });
      return;
    }
    // Upcoming — one per matching reminder day
    for (const d of reminderDays) {
      if (d > 0 && diff === d) {
        const typeKey =
          cat === 'rent'
            ? 'rent_upcoming'
            : cat === 'service'
              ? 'service_upcoming'
              : 'installment_upcoming';
        out.push({
          dedup_key: `${typeKey}-${p.id}-${d}`,
          category: cat,
          type: 'reminder',
          priority: 'normal',
          templateType: typeKey,
          link: `/dashboard/installments`,
          property: p.property,
          payment: p.id,
          vars: {
            amount: amountStr,
            due_date: due,
            days_overdue: 0,
            property_name: propStr,
            unit_number: prop?.unit_number || '',
          },
        });
      }
    }
  };

  (payments || []).forEach(addForPayment);

  // Contract expiry + handover from properties
  (properties || []).forEach((p) => {
    if (p.status !== 'approved') return;
    // Lease contract expiring
    if (p.type === 'rented' && p.contract_end_date && cats.contract) {
      const end = dateOnly(p.contract_end_date);
      const diff = daysBetween(end, todayStr);
      const expiryWindow = config && config.contract_expiry_days != null ? Number(config.contract_expiry_days) : 30;
      if (diff >= 0 && diff <= expiryWindow) {
        out.push({
          dedup_key: `contract_expiring-${p.id}`,
          category: 'contract',
          type: 'reminder',
          priority: diff <= 7 ? 'high' : 'normal',
          templateType: 'contract_expiring',
          link: `/dashboard/rentals`,
          property: p.id,
          payment: '',
          vars: {
            property_name: propertyLabel(p, lang),
            due_date: end,
            unit_number: p.unit_number || '',
          },
        });
      }
    }
    // Handover approaching (installment properties under construction)
    if (
      p.type === 'installment' &&
      p.expected_handover_date &&
      p.handover_status !== 'handover_completed' &&
      cats.handover
    ) {
      const hd = dateOnly(p.expected_handover_date);
      const diff = daysBetween(hd, todayStr);
      if (diff >= 0 && diff <= 30) {
        out.push({
          dedup_key: `handover_upcoming-${p.id}`,
          category: 'handover',
          type: 'reminder',
          priority: diff <= 7 ? 'high' : 'normal',
          templateType: 'handover_upcoming',
          link: `/dashboard/installments`,
          property: p.id,
          payment: '',
          vars: {
            property_name: propertyLabel(p, lang),
            due_date: hd,
            unit_number: p.unit_number || '',
          },
        });
      }
    }
  });

  return out;
}

/**
 * Reconcile computed notifications against what's already stored.
 * Creates missing ones (idempotent via dedup_key), fires push + sound for
 * newly created ones, and removes stale reminders for payments that are now
 * paid or whose date moved past the reminder window.
 *
 * Returns the list of newly created notifications.
 */
export async function reconcileNotifications({
  properties,
  payments,
  settings,
  config,
  templates,
  lang,
  userId,
}) {
  if (!userId || !settings) return [];
  if (config && config.system_enabled === false) return [];
  if (settings.mute_all) {
    // Still cancel stale reminders, but don't create new optional ones.
    await cancelStaleNotifications({ payments, userId });
    return [];
  }

  const computed = computeNotifications({ properties, payments, settings, config, lang });
  const tplByType = Object.fromEntries((templates || []).map((t) => [t.type, t]));

  // Fetch existing notifications for this user (dedup keys only).
  let existing = [];
  try {
    existing = await pb.collection('notifications').getFullList({
      filter: `user = "${userId}"`,
    });
  } catch {
    return [];
  }
  const existingByKey = {};
  existing.forEach((n) => {
    if (n.dedup_key) existingByKey[n.dedup_key] = n;
  });

  const created = [];
  for (const desc of computed) {
    if (existingByKey[desc.dedup_key]) continue;
    const tpl = tplByType[desc.templateType];
    if (tpl && tpl.enabled === false) continue;
    const { title, body } = renderTemplate(tpl, desc.vars, lang);
    // Privacy: hide amount on lock screen if user opted in.
    let finalBody = body;
    if (settings.hide_amount_lock && desc.vars.amount) {
      finalBody =
        lang === 'ar'
          ? 'لديك تذكير جديد متعلق بأحد عقاراتك.'
          : 'You have a new reminder related to one of your properties.';
    }
    try {
      const rec = await pb.collection('notifications').create(
        {
          user: userId,
          title: title || (lang === 'ar' ? 'إشعار' : 'Notification'),
          body: finalBody,
          type: desc.type,
          category: desc.category,
          priority: desc.priority,
          link: desc.link,
          property: desc.property || '',
          payment: desc.payment || '',
          dedup_key: desc.dedup_key,
          data: JSON.stringify(desc.vars || {}),
          read: false,
          sound_played: false,
          push_sent: false,
        },
        { requestKey: `notif-create-${desc.dedup_key}` },
      );
      created.push(rec);
      // Delivery log
      logDelivery(userId, rec.id, desc.category, 'in_app', 'sent').catch(() => {});
    } catch {
      /* dedup collision or validation — ignore */
    }
  }

  // Cancel stale reminders for paid / moved payments.
  await cancelStaleNotifications({ payments, userId, keepKeys: computed.map((c) => c.dedup_key) });

  return created;
}

// Remove notifications whose underlying payment is paid or no longer matches
// the reminder window. Keeps platform / inactivity / security notifications.
export async function cancelStaleNotifications({ payments, userId, keepKeys }) {
  const keep = new Set(keepKeys || []);
  const paidIds = new Set((payments || []).filter((p) => p.status === 'paid').map((p) => p.id));
  try {
    const rows = await pb.collection('notifications').getFullList({
      filter: `user = "${userId}" && read = false`,
    });
    const toDelete = rows.filter((n) => {
      if (!n.dedup_key) return false;
      // Only touch property/payment-derived reminders.
      if (!['installment', 'rent', 'service', 'contract', 'handover'].includes(n.category)) {
        return false;
      }
      // If its payment is now paid → delete the pending reminder.
      if (n.payment && paidIds.has(n.payment)) return true;
      // If it's no longer in the computed set for today → stale, remove.
      if (keep.size > 0 && !keep.has(n.dedup_key)) return true;
      return false;
    });
    await Promise.all(
      toDelete.map((n, i) =>
        pb.collection('notifications').delete(n.id, { requestKey: `notif-del-${n.id}-${i}` }),
      ),
    );
  } catch {
    /* ignore */
  }
}

// ---- Fire push + sound for new notifications -------------------------------

export async function presentNewNotifications({ notifications, settings, sounds, lang, config }) {
  if (!notifications || notifications.length === 0) return;
  const soundList = sounds || [];
  const chosen = soundList.find((s) => s.key === settings.selected_sound) || soundList[0];

  for (const n of notifications) {
    // In-app is the stored record itself (already created).
    // Push
    if (settings.push_enabled && !settings.mute_all && pushPermission() === 'granted') {
      const ok = firePushNotification({
        title: 'Estate Follow',
        body: `${n.title}${n.body ? '\n' + n.body : ''}`,
        link: n.link,
      });
      if (ok) {
        try {
          await pb
            .collection('notifications')
            .update(n.id, { push_sent: true }, { requestKey: `notif-push-${n.id}` });
        } catch {
          /* ignore */
        }
        logDelivery(n.user, n.id, n.category, 'push', 'sent').catch(() => {});
      } else {
        logDelivery(n.user, n.id, n.category, 'push', 'failed', 'permission denied').catch(() => {});
      }
    }
    // Sound
    if (settings.sound_enabled && !settings.silent && !settings.mute_all && chosen) {
      playSound(chosen);
      if (settings.vibration_enabled && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(120);
        } catch {
          /* ignore */
        }
      }
      logDelivery(n.user, n.id, n.category, 'sound', 'sent').catch(() => {});
    }
  }
}

// ---- Inactivity ------------------------------------------------------------

export async function maybeInactivityNotification({ settings, config, templates, lang, userId }) {
  if (!userId || !settings) return null;
  if (settings.mute_all) return null;
  if (!(settings.categories || {}).inactivity) return null;
  const cfg = config || {};
  const days = cfg.inactivity_days ?? 7;
  const cooldown = cfg.inactivity_cooldown_days ?? 30;
  const last = settings.last_active_at ? new Date(settings.last_active_at) : null;
  const lastSent = settings.inactivity_last_sent ? new Date(settings.inactivity_last_sent) : null;
  const now = new Date();
  if (!last) return null;
  const inactiveDays = Math.floor((now.getTime() - last.getTime()) / 86400000);
  if (inactiveDays < days) return null;
  // Cooldown — don't repeat too often.
  if (lastSent) {
    const sinceSent = Math.floor((now.getTime() - lastSent.getTime()) / 86400000);
    if (sinceSent < cooldown) return null;
  }
  const tplByType = Object.fromEntries((templates || []).map((t) => [t.type, t]));
  const tpl = tplByType['inactivity_reminder'];
  const { title, body } = renderTemplate(tpl, {}, lang);
  const dedup = `inactivity-${now.toISOString().slice(0, 10)}`;
  try {
    // Check not already created today.
    const existing = await pb.collection('notifications').getFullList({
      filter: `user = "${userId}" && dedup_key = "${dedup}"`,
    });
    if (existing.length > 0) return null;
    const rec = await pb.collection('notifications').create(
      {
        user: userId,
        title: title || (lang === 'ar' ? 'تذكير بالعودة' : 'We Missed You'),
        body,
        type: 'system',
        category: 'inactivity',
        priority: 'low',
        link: '/dashboard/home',
        dedup_key: dedup,
        read: false,
      },
      { requestKey: `notif-inactivity-${dedup}` },
    );
    // Stamp last sent.
    if (settings.id) {
      await pb
        .collection('notification_settings')
        .update(settings.id, { inactivity_last_sent: now.toISOString() }, {
          requestKey: `notif-inact-stamp-${settings.id}`,
        });
    }
    return rec;
  } catch {
    return null;
  }
}

// ---- Delivery log ----------------------------------------------------------

export async function logDelivery(userId, notifId, category, channel, status, detail) {
  try {
    await pb.collection('notification_delivery_log').create(
      {
        user: userId,
        notification: notifId || '',
        category: category || '',
        channel,
        status,
        detail: detail || '',
      },
      { requestKey: `notif-log-${userId}-${channel}-${status}-${Date.now()}-${Math.random()}` },
    );
  } catch {
    /* ignore */
  }
}

// ---- Mark read / delete ----------------------------------------------------

export async function markNotificationRead(id) {
  try {
    await pb.collection('notifications').update(id, { read: true }, { requestKey: `notif-read-${id}` });
  } catch {
    /* ignore */
  }
}

export async function markAllRead(userId) {
  try {
    const rows = await pb.collection('notifications').getFullList({
      filter: `user = "${userId}" && read = false`,
    });
    await Promise.all(
      rows.map((n, i) =>
        pb.collection('notifications').update(n.id, { read: true }, { requestKey: `notif-readall-${i}-${n.id}` }),
      ),
    );
  } catch {
    /* ignore */
  }
}

export async function deleteNotification(id) {
  try {
    await pb.collection('notifications').delete(id, { requestKey: `notif-rm-${id}` });
  } catch {
    /* ignore */
  }
}

export async function logNotificationOpen(id) {
  try {
    const n = await pb.collection('notifications').getOne(id);
    if (n) {
      logDelivery(n.user, id, n.category, 'push', 'opened').catch(() => {});
      logDelivery(n.user, id, n.category, 'in_app', 'opened').catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
