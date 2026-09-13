import pb from '@/lib/pocketbaseClient';

// Alerts & Follow-up client (التنبيهات والمتابعة).
// Auto alerts are DERIVED from real properties + payments records (no
// duplication). Manual alerts live in the property_alerts collection. The
// process route (pb_hooks) generates notifications + emails with idempotency.

export const ALERT_TYPES = [
  'installment',
  'rent',
  'cheque',
  'contract_expiry',
  'service_fee',
  'handover',
  'document_expiry',
  'custom',
];

export const REPEAT_OPTIONS = [
  'none',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semiannual',
  'yearly',
  'custom',
];

export const OVERDUE_REPEAT_OPTIONS = ['none', 'daily', '3days', 'weekly'];

export const STATUS_ORDER = [
  'overdue',
  'due_today',
  'due_soon',
  'upcoming',
  'paid',
  'completed',
  'cancelled',
];

const REMINDER_PRESETS = [30, 14, 7, 3, 1, 0];

export const reminderPresets = () => REMINDER_PRESETS.slice();

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value).slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

// Compute display status from an event date + done flag.
export function computeStatus(eventDate, done) {
  if (done) return 'paid';
  const d = parseDate(eventDate);
  if (!d) return 'upcoming';
  const t0 = startOfToday();
  const diff = Math.round((d - t0) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due_today';
  if (diff <= 7) return 'due_soon';
  return 'upcoming';
}

// Build derived events from properties + payments (the "linking" — reads real
// records, never duplicates). Merges manual property_alerts.
//
// Property Calendar verification (Feature Management batch, task #8):
// the calendar previously read ONLY the legacy `payments` collection, so a
// property rented through the CURRENT rental flow (tenancies + rent_payments
// "checks" — see 1789200000_create_tenants.js and friends) had NO calendar
// events at all for its rent checks or lease expiry. `rentPayments` and
// `tenancies` are now accepted here (both optional, so every existing
// caller keeps working unchanged) to close that real gap — no new UI, the
// same calendar just gets fed from the collection the rental flow actually
// writes to.
export function buildEvents({ properties = [], payments = [], manualAlerts = [], adminDefaults = {}, rentPayments = [], tenancies = [] }) {
  const events = [];
  const t0 = startOfToday();
  const propMap = {};
  properties.forEach((p) => { propMap[p.id] = p; });

  const label = (p) => (p ? `${p.building || ''} / ${p.unit_number || ''}` : '');
  const remFor = (type) => {
    const d = adminDefaults[type];
    return Array.isArray(d) && d.length ? d : [7, 1];
  };

  payments.forEach((pay) => {
    const d = parseDate(pay.due_date);
    if (!d) return;
    const done = pay.status === 'paid';
    const kind = pay.kind;
    events.push({
      id: `payment:${pay.id}`,
      source: 'auto',
      refCollection: 'payments',
      refId: pay.id,
      propertyId: pay.property || '',
      type: kind === 'rent' ? 'rent' : 'installment',
      title: pay.label || (kind === 'rent' ? 'Rent' : 'Installment'),
      propertyLabel: label(propMap[pay.property]),
      eventDate: d,
      amount: Number(pay.amount || 0),
      isFinancial: true,
      done,
      reminders: remFor(kind === 'rent' ? 'rent' : 'installment'),
      repeat: 'none',
      raw: pay,
    });
  });

  properties.forEach((p) => {
    const end = parseDate(p.contract_end_date);
    if (end) {
      events.push({
        id: `contract_expiry:${p.id}`,
        source: 'auto',
        refCollection: 'properties',
        refId: p.id,
        propertyId: p.id,
        type: 'contract_expiry',
        title: 'Contract Expiry',
        propertyLabel: label(p),
        eventDate: end,
        amount: 0,
        isFinancial: false,
        done: false,
        reminders: remFor('contract_expiry'),
        repeat: 'none',
        raw: p,
      });
    }
    const hand = parseDate(p.expected_handover_date);
    if (hand && p.handover_status !== 'handover_completed') {
      events.push({
        id: `handover:${p.id}`,
        source: 'auto',
        refCollection: 'properties',
        refId: p.id,
        propertyId: p.id,
        type: 'handover',
        title: 'Handover',
        propertyLabel: label(p),
        eventDate: hand,
        amount: 0,
        isFinancial: false,
        done: p.handover_status === 'handover_completed',
        reminders: remFor('handover'),
        repeat: 'none',
        raw: p,
      });
    }
    if (p.service_charge_frequency === 'yearly' && Number(p.service_charge_amount || 0) > 0) {
      const base = parseDate(p.service_charge_date);
      if (base) {
        let next = new Date(base.getTime());
        while (next < t0) next.setFullYear(next.getFullYear() + 1);
        events.push({
          id: `service_fee:${p.id}:${next.getFullYear()}`,
          source: 'auto',
          refCollection: 'properties',
          refId: p.id,
          propertyId: p.id,
          type: 'service_fee',
          title: 'Service Fee',
          propertyLabel: label(p),
          eventDate: next,
          amount: Number(p.service_charge_amount || 0),
          isFinancial: true,
          done: false,
          reminders: remFor('service_fee'),
          repeat: 'yearly',
          raw: p,
        });
      }
    }
  });

  // Rent checks ("rent_payments") — the current rental flow's own ledger,
  // separate from the legacy `payments` collection handled above.
  rentPayments.forEach((rp) => {
    const d = parseDate(rp.due_date);
    if (!d) return;
    const done = rp.status === 'collected';
    events.push({
      id: `rent_payment:${rp.id}`,
      source: 'auto',
      refCollection: 'rent_payments',
      refId: rp.id,
      propertyId: rp.property || '',
      type: 'cheque',
      title: rp.check_number ? `Check #${rp.check_number}` : 'Rent check',
      propertyLabel: label(propMap[rp.property]),
      eventDate: d,
      amount: Number(rp.amount || 0),
      isFinancial: true,
      done,
      reminders: remFor('cheque'),
      repeat: 'none',
      raw: rp,
    });
  });

  // Lease expiry from ACTIVE tenancies (the current rental flow's own
  // end_date) — separate from the legacy properties.contract_end_date
  // handled above, which the new rental flow never sets.
  tenancies.forEach((tc) => {
    if (tc.status !== 'active') return;
    const end = parseDate(tc.end_date);
    if (!end) return;
    events.push({
      id: `lease_expiry:${tc.id}`,
      source: 'auto',
      refCollection: 'tenancies',
      refId: tc.id,
      propertyId: tc.property || '',
      type: 'contract_expiry',
      title: 'Lease Expiry',
      propertyLabel: label(propMap[tc.property]),
      eventDate: end,
      amount: 0,
      isFinancial: false,
      done: false,
      reminders: remFor('contract_expiry'),
      repeat: 'none',
      raw: tc,
    });
  });

  manualAlerts.forEach((a) => {
    const d = parseDate(a.event_date);
    if (!d) return;
    const rem = a.reminders;
    const reminders = Array.isArray(rem) && rem.length
      ? rem.map((r) => (typeof r === 'object' ? r.days_before : r))
      : remFor(a.alert_type);
    events.push({
      id: `manual:${a.id}`,
      source: 'manual',
      refCollection: 'property_alerts',
      refId: a.id,
      propertyId: a.property || '',
      type: a.alert_type,
      title: a.title,
      propertyLabel: label(propMap[a.property]),
      eventDate: d,
      eventTime: a.event_time || '',
      amount: Number(a.amount || 0),
      isFinancial: !!a.is_financial,
      done: a.status === 'paid' || a.status === 'completed',
      reminders,
      repeat: a.repeat || 'none',
      overdueRepeat: a.overdue_repeat || 'none',
      notes: a.notes || '',
      relatedDocField: a.related_doc_field || '',
      enabled: a.enabled !== false,
      raw: a,
    });
  });

  // Attach computed status + daysUntil
  events.forEach((ev) => {
    ev.status = computeStatus(ev.eventDate, ev.done);
    const t0b = startOfToday();
    ev.daysUntil = Math.round((ev.eventDate - t0b) / 86400000);
  });

  return events;
}

export function summarize(events) {
  const t0 = startOfToday();
  return {
    dueToday: events.filter((e) => !e.done && e.daysUntil === 0).length,
    next7: events.filter((e) => !e.done && e.daysUntil >= 0 && e.daysUntil <= 7).length,
    next30: events.filter((e) => !e.done && e.daysUntil >= 0 && e.daysUntil <= 30).length,
    overdue: events.filter((e) => !e.done && e.daysUntil < 0).length,
    completed: events.filter((e) => e.done).length,
    total: events.length,
  };
}

// "Needs your attention" — grouped human-readable items.
export function needsAttention(events, t) {
  const active = events.filter((e) => !e.done);
  const overdue = active.filter((e) => e.daysUntil < 0);
  const dueToday = active.filter((e) => e.daysUntil === 0);
  const week = active.filter((e) => e.daysUntil > 0 && e.daysUntil <= 7);
  const month = active.filter((e) => e.daysUntil > 7 && e.daysUntil <= 30);

  const items = [];
  if (overdue.length) items.push({ key: 'overdue', count: overdue.length, events: overdue });
  if (dueToday.length) items.push({ key: 'due_today', count: dueToday.length, events: dueToday });
  if (week.length) items.push({ key: 'week', count: week.length, events: week });
  if (month.length) items.push({ key: 'month', count: month.length, events: month });
  return items;
}

// --- PocketBase data loaders ---

export async function loadManualAlerts() {
  try {
    return await pb.collection('property_alerts').getFullList({
      sort: 'event_date',
      requestKey: `alerts-manual-${Date.now()}`,
    });
  } catch (_) {
    return [];
  }
}

export async function loadAlertSettings() {
  try {
    const list = await pb.collection('alert_settings').getFullList({
      requestKey: `alerts-settings-${Date.now()}`,
    });
    return list[0] || null;
  } catch (_) {
    return null;
  }
}

export async function loadAlertTypes() {
  try {
    return await pb.collection('alert_types').getFullList({
      sort: 'order',
      requestKey: `alerts-types-${Date.now()}`,
    });
  } catch (_) {
    return [];
  }
}

export async function loadAdminAlertSettings() {
  try {
    const list = await pb.collection('alert_admin_settings').getFullList({
      requestKey: `alerts-admin-${Date.now()}`,
    });
    return list[0] || null;
  } catch (_) {
    return null;
  }
}

export async function ensureAlertSettings() {
  const existing = await loadAlertSettings();
  if (existing) return existing;
  try {
    return await pb.collection('alert_settings').create({
      owner: pb.authStore.record.id,
      in_app_enabled: true,
      email_enabled: true,
      whatsapp_enabled: false,
      sms_enabled: false,
      push_enabled: false,
      property_overrides: {},
    });
  } catch (_) {
    return null;
  }
}

// Trigger the backend processor (pb_hooks custom route). Returns summary.
export async function processAlerts() {
  try {
    return await pb.send('/api/alerts/process', { method: 'POST' });
  } catch (_) {
    return { processed: 0, error: true };
  }
}

// --- Manual alert CRUD ---

export async function createManualAlert(data) {
  return pb.collection('property_alerts').create({
    owner: pb.authStore.record.id,
    ...data,
  }, { requestKey: `alert-create-${Date.now()}` });
}

export async function updateManualAlert(id, data) {
  return pb.collection('property_alerts').update(id, data, {
    requestKey: `alert-update-${id}-${Date.now()}`,
  });
}

export async function deleteManualAlert(id) {
  return pb.collection('property_alerts').delete(id, {
    requestKey: `alert-delete-${id}-${Date.now()}`,
  });
}

// Mark a manual alert as paid / completed.
export async function markManualAlertDone(id, isFinancial, extra = {}) {
  const patch = isFinancial
    ? { status: 'paid', paid_at: new Date().toISOString(), ...extra }
    : { status: 'completed', completed_at: new Date().toISOString(), ...extra };
  return updateManualAlert(id, patch);
}

// Mark a payment as paid (updates the real payments record — auto alert then
// reflects done automatically).
export async function markPaymentPaid(payment) {
  return pb.collection('payments').update(payment.id, {
    status: 'paid',
    paid_at: new Date().toISOString(),
  }, { requestKey: `pay-paid-${payment.id}-${Date.now()}` });
}

// Mark a rent check ("rent_payments" row) as collected — same shape
// OwnerDashboard.jsx's own markCheckCollected() already uses elsewhere, so
// the calendar's "mark done" action stays consistent with the rest of the
// app for the new rental flow's checks.
export async function markRentPaymentCollected(rentPayment) {
  return pb.collection('rent_payments').update(rentPayment.id, {
    status: 'collected',
    collected_at: new Date().toISOString(),
  }, { requestKey: `rent-payment-collected-${rentPayment.id}-${Date.now()}` });
}

// Update per-property alert override (enable + custom reminders) in alert_settings.
export async function savePropertyAlertOverride(propertyId, override) {
  const settings = await ensureAlertSettings();
  if (!settings) return null;
  const overrides = settings.property_overrides && typeof settings.property_overrides === 'object'
    ? { ...settings.property_overrides }
    : {};
  if (override === null) {
    delete overrides[propertyId];
  } else {
    overrides[propertyId] = override;
  }
  return pb.collection('alert_settings').update(settings.id, {
    property_overrides: overrides,
  }, { requestKey: `alert-override-${propertyId}-${Date.now()}` });
}

export { REMINDER_PRESETS };
