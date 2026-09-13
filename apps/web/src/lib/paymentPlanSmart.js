/**
 * Smart Payment Plan helpers: date parse/format, phase mapping,
 * recurring installment generation, percentage totals, normalize AI output.
 */
import { normalizeMoneyValue, moneyNumber } from '@/lib/money';

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

/** Parse many date formats → YYYY-MM-DD or ''. Never invent. */
export function parseFlexibleDate(raw) {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return toIsoDate(raw);
  }
  let s = String(raw).trim();
  if (!s) return '';
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

  // ISO
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return clampIso(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const d = +m[1];
    const mo = +m[2];
    const y = +m[3];
    // Prefer DMY for real-estate MENA docs when day > 12 or always DMY for / -
    if (d <= 31 && mo <= 12) return clampIso(y, mo, d);
  }

  // MM/DD/YYYY only when first part > 12 would fail DMY — already handled

  // "15 September 2027" / "Sep 15, 2027" / "15 Sep 2027"
  m = s.match(/^(\d{1,2})\s+([A-Za-z\u0600-\u06FF]+)\s*,?\s*(\d{4})$/);
  if (m) {
    const mo = monthIndex(m[2]);
    if (mo != null) return clampIso(+m[3], mo + 1, +m[1]);
  }
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s*,?\s*(\d{4})$/);
  if (m) {
    const mo = monthIndex(m[1]);
    if (mo != null) return clampIso(+m[3], mo + 1, +m[2]);
  }

  // Arabic month names (common + Levantine). October/November/December
  // were previously off-by-one — fixed to 10/11/12.
  const arMonths = {
    يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5,
    يونيو: 6, يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9,
    اكتوبر: 10, أكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
    // Levantine / Syrian month names
    'كانون الثاني': 1, شباط: 2, آذار: 3, اذار: 3, نيسان: 4,
    أيار: 5, ايار: 5, حزيران: 6, تموز: 7, آب: 8,
    أيلول: 9, ايلول: 9, 'تشرين الأول': 10, 'تشرين الثاني': 11, 'كانون الأول': 12,
  };
  // Allow whitespace OR dash/slash/dot separators between day, month, year
  // so "25-مايو-2026" and "25/مايو/2026" parse correctly.
  m = s.match(/^(\d{1,2})[\s\-/.]+([^\s\d\-/.]+)[\s\-/.]+(\d{4})$/);
  if (m && arMonths[m[2]] != null) return clampIso(+m[3], arMonths[m[2]], +m[1]);
  // Also try a looser match (month may be a multi-word Levantine name).
  m = s.match(/(\d{1,2})\s+([^\s\d]+(?:\s+[^\s\d]+)?)\s+(\d{4})/);
  if (m && arMonths[m[2]] != null) return clampIso(+m[3], arMonths[m[2]], +m[1]);

  const t = Date.parse(s);
  if (!Number.isNaN(t)) return toIsoDate(new Date(t));
  return '';
}

function monthIndex(name) {
  const k = String(name || '').toLowerCase().replace(/\./g, '');
  return MONTHS[k] != null ? MONTHS[k] : null;
}

function clampIso(y, m, d) {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function toIsoDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Display DD/MM/YYYY from ISO or flexible input (central platform format). */
export function formatPlanDateDisplay(raw) {
  const iso = parseFlexibleDate(raw) || (String(raw || '').match(/^\d{4}-\d{2}-\d{2}/) ? String(raw).slice(0, 10) : '');
  if (!iso) return raw ? String(raw) : '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Human-readable date — same single platform format DD/MM/YYYY.
 * Stored internally as YYYY-MM-DD; this is display-only.
 * `lang` kept for call-site compatibility (unused).
 */
export function formatPlanDateHuman(raw, _lang = 'ar') {
  const out = formatPlanDateDisplay(raw);
  return out === '—' ? '—' : out;
}

export function addMonthsIso(iso, months) {
  const base = parseFlexibleDate(iso);
  if (!base) return '';
  const [y, m, d] = base.split('-').map(Number);
  const adj = new Date(Date.UTC(y, m - 1 + Number(months || 0), 1));
  const lastDay = new Date(Date.UTC(adj.getUTCFullYear(), adj.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const final = new Date(Date.UTC(adj.getUTCFullYear(), adj.getUTCMonth(), day));
  return `${final.getUTCFullYear()}-${String(final.getUTCMonth() + 1).padStart(2, '0')}-${String(final.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysIso(iso, days) {
  const base = parseFlexibleDate(iso);
  if (!base) return '';
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Resolve relative phrases against booking/purchase start date.
 * Returns { date, needsStartDate } — never invents start.
 */
export function resolveRelativeDate(phrase, startIso) {
  if (!phrase || typeof phrase !== 'string') return { date: '', needsStartDate: false };
  const p = phrase.toLowerCase();
  const start = parseFlexibleDate(startIso);
  const daysM = p.match(/(\d+)\s*days?\s*(from|after|of)?\s*(booking|purchase|contract|reservation|start)?/i)
    || p.match(/بعد\s*(\d+)\s*يوم/);
  const monthsM = p.match(/(\d+)\s*months?\s*(from|after|of)?/i)
    || p.match(/(?:بعد|خلال)\s*(\d+)\s*شهر/);
  const yearsM = p.match(/(\d+)\s*years?\s*(from|after)?/i)
    || p.match(/بعد\s*(\d+)\s*سن/);

  const isRelative = !!(daysM || monthsM || yearsM)
    || /from booking|after booking|from purchase|after reservation|من تاريخ|بعد الحجز|بعد الشراء/i.test(p);

  if (!isRelative) {
    const abs = parseFlexibleDate(phrase);
    return { date: abs, needsStartDate: false };
  }
  if (!start) return { date: '', needsStartDate: true };

  if (daysM) {
    const n = Number(daysM[1]);
    return { date: addDaysIso(start, n), needsStartDate: false };
  }
  if (monthsM) {
    const n = Number(monthsM[1]);
    return { date: addMonthsIso(start, n), needsStartDate: false };
  }
  if (yearsM) {
    const n = Number(yearsM[1]);
    return { date: addMonthsIso(start, n * 12), needsStartDate: false };
  }
  return { date: '', needsStartDate: true };
}

export function mapPaymentStage(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'first_payment' || s === 'down_payment') return 'first_payment';
  if (/post[_\s-]?handover|after\s*handover|بعد\s*الاستلام|بعد\s*التسليم/.test(s)) return 'post_handover';
  if (/handover|on\s*handover|at\s*handover|عند\s*الاستلام|عند\s*التسليم/.test(s) && !/post|بعد|after/.test(s)) {
    return 'handover';
  }
  // First payment / down payment / booking — never treat as construction installment.
  if (
    /down\s*payment|first\s*payment|first\s*installment|booking|reservation|deposit/.test(s) ||
    /دفعة\s*أولى|دفعة\s*اولى|القسط\s*الأول|القسط\s*الاول|عربون|حجزية|مقدم/.test(s) ||
    /(^|\s)حجز(\s|$)/.test(s)
  ) {
    return 'first_payment';
  }
  if (/construction|during|installment|milestone|أثناء|اثناء|إنشاء|انشاء|بناء|pre[_\s-]?handover/.test(s)) {
    return 'pre_handover';
  }
  if (s === 'pre_handover' || s === 'handover' || s === 'post_handover' || s === 'first_payment') return s;
  return 'pre_handover';
}

export function stageLabelKey(stage) {
  if (stage === 'first_payment') return 'phase_first_payment';
  if (stage === 'handover') return 'phase_handover';
  if (stage === 'post_handover') return 'phase_post_handover';
  return 'phase_pre_handover';
}

/** Detect relative post-handover phrasing in a label/note. */
export function parseRelativeHandoverOffset(text) {
  if (text == null || text === '') return null;
  const s = String(text).trim();
  if (!s) return null;
  const patterns = [
    /(\d+)\s*(?:أشهر|اشهر|شهر|months?|month)\s*(?:بعد\s*)?(?:التسليم|الاستلام|handover)/i,
    /(?:بعد)\s*(\d+)\s*(?:أشهر|اشهر|شهر|months?|month)\s*(?:من\s*)?(?:التسليم|الاستلام|handover)?/i,
    /(\d+)\s*months?\s*(?:after|from|post)\s*handover/i,
    /after\s*handover\s*[+:\-]?\s*(\d+)\s*months?/i,
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const m = s.match(patterns[i]);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Detect relative-to-booking-date phrasing in a label/note.
 *  e.g. "1 Month from Booking Date", "12 Months from Booking Date",
 *  "شهر من تاريخ الحجز", "12 شهر من تاريخ الحجز". Returns the month count or null. */
export function parseRelativeBookingOffset(text) {
  if (text == null || text === '') return null;
  const s = String(text).trim();
  if (!s) return null;
  const patterns = [
    /(\d+)\s*(?:months?|month)\s*(?:from|after|of)?\s*(?:booking\s*date|reservation\s*date|contract\s*date|purchase\s*date)/i,
    /(?:from|after)\s*booking\s*date\s*[+:\-]?\s*(\d+)\s*months?/i,
    /(\d+)\s*(?:أشهر|اشهر|شهر)\s*(?:من|بعد|خلال)?\s*(?:تاريخ\s*)?(?:الحجز|الشراء|العقد)/i,
    /(?:من|بعد|خلال)\s*(?:تاريخ\s*)?(?:الحجز|الشراء|العقد)\s*[+:\-]?\s*(\d+)\s*(?:أشهر|اشهر|شهر)/i,
    /(\d+)\s*(?:أشهر|اشهر|شهر)\s*(?:من|بعد)\s*(?:تاريخ\s*)?(?:الحجز|الشراء|العقد)/i,
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const m = s.match(patterns[i]);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** True when label clearly means first/down payment (not a regular construction installment). */
export function isFirstPaymentLabel(row) {
  const s = [
    row?.name,
    row?.raw_label,
    row?.payment_type,
    row?.note,
    row?.phase,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!s) return false;
  if (row?.payment_type === 'down_payment' || row?.payment_type === 'first_payment') return true;
  if (row?.phase === 'first_payment') return true;
  return (
    /down\s*payment|first\s*payment|first\s*installment|booking\s*fee|reservation|deposit/.test(s) ||
    /دفعة\s*أولى|دفعة\s*اولى|القسط\s*الأول|القسط\s*الاول|عربون|مقدم|حجزية/.test(s)
  );
}

/**
 * Generate N recurring installments with advanced options.
 * Supports per-installment amount OR total-amount mode (auto-calculates each,
 * adjusts the last installment to absorb fractions so the sum matches exactly),
 * an optional different last installment, bimonthly/custom intervals, and
 * same-day-each-month date clamping (handled by addMonthsIso).
 */
export function generateRecurringInstallments({
  count,
  amount,
  totalAmount,
  firstDate,
  frequency = 'monthly', // monthly | bimonthly | quarterly | semi_annual | yearly | custom
  customMonths = 1,
  lastDifferent = false,
  lastAmount = '',
  phase = 'pre_handover',
  percentage = '',
  startNumber = 1,
  sameDayEachMonth = true,
}) {
  const n = Math.max(0, Math.min(500, Math.floor(Number(count) || 0)));
  const start = parseFlexibleDate(firstDate);
  const step =
    frequency === 'yearly' ? 12
      : frequency === 'semi_annual' ? 6
        : frequency === 'quarterly' ? 3
          : frequency === 'bimonthly' ? 2
            : frequency === 'custom' ? Math.max(1, Math.floor(Number(customMonths) || 1))
              : 1;

  // Resolve per-installment amount and (optional) last installment amount.
  let baseAmt = '';
  let lastAmt = '';
  const total = moneyNumber(totalAmount);
  if (totalAmount != null && String(totalAmount).trim() !== '' && total > 0 && n > 0) {
    // Total-amount mode: split evenly, push any fraction onto the last installment.
    const base = Math.floor((total / n) * 100) / 100;
    const remainder = Math.round((total - base * n) * 100) / 100;
    baseAmt = String(base);
    lastAmt = String(Math.round((base + remainder) * 100) / 100);
  } else {
    baseAmt = normalizeMoneyValue(amount);
    if (lastDifferent && lastAmount != null && String(lastAmount).trim() !== '') {
      lastAmt = normalizeMoneyValue(lastAmount);
    }
  }

  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const due = start ? addMonthsIso(start, i * step) : '';
    const isLast = i === n - 1;
    const amt = isLast && lastAmt !== '' ? lastAmt : baseAmt;
    rows.push({
      number: startNumber + i,
      name: `Installment ${startNumber + i}`,
      amount: amt,
      percentage: percentage !== '' && percentage != null ? String(percentage) : '',
      percent: percentage !== '' && percentage != null ? String(percentage) : '',
      due_date: due,
      phase,
      payment_type: phase === 'handover' ? 'handover' : phase === 'post_handover' ? 'post_handover' : 'installment',
      status: 'unpaid',
      note: '',
      notes: '',
      needs_review: !due || !amt,
    });
  }
  return rows;
}

/** Summarize a generated plan for the preview card (count, total, from, to). */
export function previewInstallmentSummary(rows) {
  if (!Array.isArray(rows) || !rows.length) return { count: 0, total: 0, from: '', to: '' };
  const total = rows.reduce((s, r) => s + moneyNumber(r.amount), 0);
  const dates = rows.map((r) => r.due_date).filter(Boolean).sort();
  return {
    count: rows.length,
    total: Math.round(total * 100) / 100,
    from: dates[0] || '',
    to: dates[dates.length - 1] || '',
  };
}

/**
 * Expand compact plan rules from AI:
 * { down_pct, monthly_count, monthly_pct, monthly_amount, handover_pct, frequency, start_date }
 */
export function expandCompactPlan(rule, opts = {}) {
  const total = moneyNumber(rule.total_price || opts.totalPrice);
  const start = parseFlexibleDate(rule.start_date || opts.startDate);
  const rows = [];
  let needsStartDate = false;
  let num = 1;

  const pushPct = (pct, phase, name, due) => {
    const p = Number(pct);
    if (!Number.isFinite(p) || p <= 0) return;
    const amount = total > 0 ? String(Math.round((total * p) / 100 * 100) / 100) : '';
    rows.push({
      number: num,
      name,
      amount,
      percentage: String(p),
      percent: String(p),
      due_date: due || '',
      phase,
      payment_type: phase === 'handover' ? 'handover' : phase === 'post_handover' ? 'post_handover' : 'down_payment',
      status: 'unpaid',
      note: '',
      needs_review: !due,
    });
    num += 1;
  };

  if (rule.down_pct != null) {
    const rel = resolveRelativeDate(rule.down_due || start || '', start);
    if (rel.needsStartDate) needsStartDate = true;
    pushPct(rule.down_pct, 'pre_handover', 'Down Payment / دفعة أولى', rel.date || start || '');
  }

  const mCount = Math.floor(Number(rule.monthly_count || rule.installment_count) || 0);
  if (mCount > 0) {
    if (!start) needsStartDate = true;
    const freq = rule.frequency || 'monthly';
    const step = freq === 'yearly' ? 12 : freq === 'semi_annual' ? 6 : freq === 'quarterly' ? 3 : 1;
    const eachPct = rule.monthly_pct != null ? Number(rule.monthly_pct) : null;
    const eachAmt =
      rule.monthly_amount != null
        ? normalizeMoneyValue(rule.monthly_amount)
        : eachPct != null && total > 0
          ? String(Math.round((total * eachPct) / 100 * 100) / 100)
          : '';
    // First monthly often starts 1 period after booking
    const offset = rule.monthly_start_offset != null ? Number(rule.monthly_start_offset) : 1;
    for (let i = 0; i < mCount; i += 1) {
      const due = start ? addMonthsIso(start, offset + i * step) : '';
      rows.push({
        number: num,
        name: `Installment ${i + 1}`,
        amount: eachAmt,
        percentage: eachPct != null ? String(eachPct) : '',
        percent: eachPct != null ? String(eachPct) : '',
        due_date: due,
        phase: 'pre_handover',
        payment_type: 'installment',
        status: 'unpaid',
        note: '',
        needs_review: !due || !eachAmt,
      });
      num += 1;
    }
  }

  if (rule.handover_pct != null) {
    pushPct(rule.handover_pct, 'handover', 'Handover / عند الاستلام', parseFlexibleDate(rule.handover_date) || '');
  }
  if (rule.post_pct != null) {
    pushPct(rule.post_pct, 'post_handover', 'Post Handover / بعد الاستلام', parseFlexibleDate(rule.post_date) || '');
  }

  return { installments: rows, needsStartDate };
}

export function sumPhasePercentages(installments) {
  const acc = {
    first_payment: 0,
    pre_handover: 0,
    handover: 0,
    post_handover: 0,
    total: 0,
  };
  (installments || []).forEach((r) => {
    const phase = mapPaymentStage(r.phase || r.payment_type);
    const pct = Number(r.percentage != null ? r.percentage : r.percent);
    if (!Number.isFinite(pct)) return;
    acc[phase] = (acc[phase] || 0) + pct;
    acc.total += pct;
  });
  Object.keys(acc).forEach((k) => {
    acc[k] = Math.round(acc[k] * 100) / 100;
  });
  return acc;
}

export function normalizeInstallmentPlan(raw, opts = {}) {
  const d = raw && typeof raw === 'object' ? { ...raw } : {};
  let list = Array.isArray(d.installments) ? [...d.installments] : [];

  // Expand compact rule if AI returned schedule_rule instead of full rows
  if ((!list.length || list.length < 2) && d.schedule_rule && typeof d.schedule_rule === 'object') {
    const exp = expandCompactPlan(d.schedule_rule, opts);
    if (exp.installments.length) {
      list = exp.installments;
      d.needs_start_date = d.needs_start_date || exp.needsStartDate;
    }
  }

  // Multi-image merge: installments_batches
  if (Array.isArray(d.installments_batches) && d.installments_batches.length) {
    const merged = [];
    d.installments_batches.forEach((batch) => {
      if (Array.isArray(batch)) merged.push(...batch);
      else if (Array.isArray(batch?.installments)) merged.push(...batch.installments);
    });
    if (merged.length) list = merged;
  }

  const start = opts.startDate || d.plan_start_date || '';
  let needsStart = !!d.needs_start_date;

  const normalized = list.map((r, i) => {
    const row = { ...(r || {}) };
    // Parse THIS row's date only — never borrow another installment's date.
    const rawDue =
      row.due_date != null && row.due_date !== ''
        ? row.due_date
        : row.date != null && row.date !== ''
          ? row.date
          : row.dueDate != null && row.dueDate !== ''
            ? row.dueDate
            : '';
    let due = parseFlexibleDate(rawDue);
    let relative = null;
    if (row.relative && typeof row.relative === 'object' && row.relative.offset_months != null) {
      const relTo = row.relative.to === 'booking_date' ? 'booking_date' : 'handover';
      relative = {
        to: relTo,
        offset_months: Number(row.relative.offset_months) || 0,
      };
      // Relative dates: keep due_date empty until the anchor is known.
      due = '';
    }
    const relFromText =
      parseRelativeHandoverOffset(rawDue) ||
      parseRelativeHandoverOffset(row.due_date_relative) ||
      parseRelativeHandoverOffset(row.name) ||
      parseRelativeHandoverOffset(row.raw_label) ||
      parseRelativeHandoverOffset(row.note);
    if (relFromText != null) {
      relative = { to: 'handover', offset_months: relFromText };
      due = '';
    } else {
      const relBookFromText =
        parseRelativeBookingOffset(rawDue) ||
        parseRelativeBookingOffset(row.due_date_relative) ||
        parseRelativeBookingOffset(row.name) ||
        parseRelativeBookingOffset(row.raw_label) ||
        parseRelativeBookingOffset(row.note);
      if (relBookFromText != null) {
        relative = { to: 'booking_date', offset_months: relBookFromText };
        due = '';
      }
    }
    if (!relative && !due && row.due_date_relative) {
      const rel = resolveRelativeDate(String(row.due_date_relative), start);
      // Only accept absolute resolution from booking start — never invent.
      if (rel.date) due = rel.date;
      else if (rel.needsStartDate) needsStart = true;
    } else if (
      !relative &&
      !due &&
      typeof rawDue === 'string' &&
      /day|month|year|يوم|شهر|سنة|booking|حجز/i.test(rawDue) &&
      !/handover|استلام|تسليم/i.test(rawDue)
    ) {
      const rel = resolveRelativeDate(rawDue, start);
      if (rel.date) due = rel.date;
      else if (rel.needsStartDate) needsStart = true;
    }

    const labelBlob = [row.name, row.raw_label, row.payment_type, row.phase, row.note]
      .filter(Boolean)
      .join(' ');
    let phase = mapPaymentStage(row.phase || row.payment_type || row.paymentStage || row.stage || labelBlob);
    if (isFirstPaymentLabel({ ...row, name: row.name || labelBlob })) {
      phase = 'first_payment';
    }
    // Only handover-relative payments are post-handover; booking-date-relative
    // payments stay in their classified phase (usually pre_handover).
    if (relative && relative.to === 'handover') phase = 'post_handover';

    const amount = row.amount != null && row.amount !== '' ? normalizeMoneyValue(row.amount) : '';
    const pct =
      row.percentage != null && row.percentage !== ''
        ? String(row.percentage)
        : row.percent != null && row.percent !== ''
          ? String(row.percent)
          : '';
    const name =
      row.name != null && String(row.name).trim()
        ? String(row.name)
        : row.number != null
          ? `Installment ${row.number}`
          : `Installment ${i + 1}`;
    const uncertain =
      row.needs_review === true ||
      row.uncertain === true ||
      (!amount && !pct) ||
      (!!String(rawDue || '').trim() && !due && !relative) ||
      (!due && !relative);

    let payment_type = row.payment_type || 'installment';
    if (phase === 'first_payment') payment_type = 'down_payment';
    else if (phase === 'handover') payment_type = 'handover';
    else if (phase === 'post_handover') payment_type = 'post_handover';

    return {
      number: row.number != null ? Number(row.number) || i + 1 : i + 1,
      name,
      raw_label: row.raw_label != null ? String(row.raw_label) : name,
      source_page: row.source_page != null ? row.source_page : null,
      amount,
      percentage: pct,
      percent: pct,
      // Independent per-row date — empty when unknown (never invent / never copy).
      due_date: due || '',
      relative,
      phase,
      payment_type,
      status: row.status === 'paid' ? 'paid' : 'unpaid',
      note: row.note || row.notes || '',
      notes: row.note || row.notes || '',
      needs_review: uncertain,
      day: due ? due.slice(8, 10) : '',
      month: due ? due.slice(5, 7) : '',
      year: due ? due.slice(0, 4) : '',
    };
  });

  // Sort by due_date then number when dates exist
  normalized.sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    return (a.number || 0) - (b.number || 0);
  });
  normalized.forEach((r, i) => {
    r.number = i + 1;
  });

  const phases = sumPhasePercentages(normalized);
  // Prefer explicit plan % from AI when present; else derive from rows
  const plan_down_pct =
    d.plan_down_pct != null && d.plan_down_pct !== ''
      ? d.plan_down_pct
      : null;
  const plan_construction_pct =
    d.plan_construction_pct != null && d.plan_construction_pct !== ''
      ? d.plan_construction_pct
      : null;
  const plan_handover_pct =
    d.plan_handover_pct != null && d.plan_handover_pct !== ''
      ? d.plan_handover_pct
      : phases.handover || null;
  const plan_post_pct =
    d.plan_post_pct != null && d.plan_post_pct !== ''
      ? d.plan_post_pct
      : phases.post_handover || null;

  let pctTotal = null;
  if (
    plan_down_pct != null ||
    plan_construction_pct != null ||
    plan_handover_pct != null ||
    plan_post_pct != null
  ) {
    pctTotal =
      moneyNumber(plan_down_pct) +
      moneyNumber(plan_construction_pct) +
      moneyNumber(plan_handover_pct) +
      moneyNumber(plan_post_pct);
    pctTotal = Math.round(pctTotal * 100) / 100;
  } else if (phases.total > 0) {
    pctTotal = phases.total;
  }

  return {
    ...d,
    total_price: d.total_price != null ? normalizeMoneyValue(d.total_price) : d.total_price,
    down_payment: d.down_payment != null ? normalizeMoneyValue(d.down_payment) : d.down_payment,
    installments: normalized,
    plan_down_pct: plan_down_pct != null ? String(plan_down_pct) : d.plan_down_pct,
    plan_construction_pct:
      plan_construction_pct != null ? String(plan_construction_pct) : d.plan_construction_pct,
    plan_handover_pct: plan_handover_pct != null ? String(plan_handover_pct) : d.plan_handover_pct,
    plan_post_pct: plan_post_pct != null ? String(plan_post_pct) : d.plan_post_pct,
    phase_pct: phases,
    pct_total: pctTotal,
    pct_ok: pctTotal == null || Math.abs(pctTotal - 100) < 0.05,
    needs_start_date: needsStart,
    source: d.source || opts.source || 'ai',
    source_files: d.source_files || opts.sourceFiles || [],
  };
}

/** Classify PDF page text as payment-plan related (cheap prefilter). */
export function pageLooksLikePaymentPlan(text) {
  if (!text || text.length < 20) return false;
  return /payment\s*plan|installment|down\s*payment|handover|due\s*date|schedule|booking|reservation|construction|percentage|%\s*|قسط|أقساط|دفعة|استلام|جدول\s*الدفع|نسبة|حجز|إنشاء|انشاء/i.test(
    text,
  );
}

/** Convert a frequency string to a month step. */
export function freqToMonths(frequency, customMonths = 1) {
  switch (frequency) {
    case 'yearly':
      return 12;
    case 'semi_annual':
      return 6;
    case 'quarterly':
      return 3;
    case 'bimonthly':
      return 2;
    case 'custom':
      return Math.max(1, Math.floor(Number(customMonths) || 1));
    default:
      return 1;
  }
}

/** Resolve the phase (pre/handover/post) of a stage definition. */
export function stagePhase(stage) {
  if (!stage) return 'pre_handover';
  if (stage.type === 'handover') return 'handover';
  if (stage.type === 'post_handover' || stage.type === 'post_equal' || stage.type === 'post_custom') return 'post_handover';
  if (stage.type === 'major_payment' && stage.dueMode === 'on_handover') return 'handover';
  if (stage.type === 'recurring' && stage.phase === 'post_handover') return 'post_handover';
  if (stage.type === 'bullet') return stage.phase === 'post_handover' ? 'post_handover' : 'pre_handover';
  if (stage.type === 'down') return 'pre_handover';
  return 'pre_handover';
}

function singleAmount(stage, totalPrice) {
  if (stage.amountMode === 'percent') {
    const p = Number(stage.percent) || 0;
    return totalPrice > 0 ? String(Math.round((totalPrice * p) / 100 * 100) / 100) : '';
  }
  return normalizeMoneyValue(stage.amount);
}

function recurringAmounts(stage, totalPrice, count) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  if (stage.recurringMode === 'per_installment') {
    const base = normalizeMoneyValue(stage.perAmount);
    return { base, last: base };
  }
  let total = 0;
  if (stage.recurringMode === 'percent') {
    const p = Number(stage.percent) || 0;
    total = totalPrice > 0 ? (totalPrice * p) / 100 : 0;
  } else {
    total = moneyNumber(stage.totalAmount);
  }
  if (!total || total <= 0) return { base: '', last: '' };
  const base = Math.floor((total / n) * 100) / 100;
  const remainder = Math.round((total - base * n) * 100) / 100;
  return {
    base: String(base),
    last: String(Math.round((base + remainder) * 100) / 100),
  };
}

/**
 * Convert a list of stage definitions into a flat installment schedule.
 * Supports: down payments (with topups), construction recurring installments,
 * bullet payments (single large payments that can override a regular
 * installment falling on the same date), handover payments, post-handover
 * equal installments, and post-handover custom schedules (list of
 * "after X months from handover" payments).
 *
 * Override logic: a bullet payment with overrideRegular=true (default) and
 * addAlongside=false replaces any recurring installment that falls on the
 * exact same due date. Bullets on a different date coexist with the recurring
 * schedule. Post-handover bullets resolve against the handover date.
 */
export function stagesToInstallments(stages, opts = {}) {
  const totalPrice = moneyNumber(opts.totalPrice);
  const handoverDate = parseFlexibleDate(opts.handoverDate);
  const start = parseFlexibleDate(opts.startDate);
  // Fixed (non-recurring) payments and the dates they occupy.
  const fixedPayments = [];
  const reservedDates = new Set();
  // Recurring installments skipped because their date was already reserved.
  const skipped = [];
  let needsHandoverDate = false;

  const resolveMajorDue = (stage) => {
    if (stage.dueMode === 'specific_date') return parseFlexibleDate(stage.dueDate);
    if (stage.dueMode === 'after_months')
      return start ? addMonthsIso(start, Number(stage.afterMonths) || 0) : '';
    if (stage.dueMode === 'after_years')
      return start ? addMonthsIso(start, (Number(stage.afterYears) || 0) * 12) : '';
    if (stage.dueMode === 'on_handover') return handoverDate;
    return '';
  };

  const resolveBulletDue = (stage) => {
    if (stage.phase === 'post_handover') {
      if (stage.dueMode === 'after_handover_months') {
        if (!handoverDate) {
          needsHandoverDate = true;
          return '';
        }
        return addMonthsIso(handoverDate, Number(stage.afterMonths) || 0);
      }
      return parseFlexibleDate(stage.dueDate);
    }
    if (stage.dueMode === 'after_months') {
      if (!start) return '';
      return addMonthsIso(start, Number(stage.afterMonths) || 0);
    }
    return parseFlexibleDate(stage.dueDate);
  };

  // Percentage string for a fixed payment: use explicit percent when in
  // percent mode, otherwise derive from amount / total price.
  const pctStrFor = (stage, amount) => {
    if (stage.amountMode === 'percent') return String(stage.percent || '');
    const amt = moneyNumber(amount);
    if (totalPrice > 0 && amt > 0) {
      return String(Math.round((amt / totalPrice) * 100 * 100) / 100);
    }
    return '';
  };

  const markReserved = (due) => {
    if (due) reservedDates.add(due);
  };

  // ---- Pass 1: collect fixed payments + reserved dates ----
  (stages || []).forEach((stage) => {
    if (!stage) return;
    const phase = stagePhase(stage);

    // Down payment / major payment / handover — single payment
    if (stage.type === 'major_payment' || stage.type === 'handover' || stage.type === 'down') {
      let due;
      if (stage.type === 'handover') {
        // Prefer an explicit override date, else anchor to property handover.
        due = parseFlexibleDate(stage.dueDate) || handoverDate;
        if (!due) needsHandoverDate = true;
      } else {
        due = resolveMajorDue(stage);
        if (stage.dueMode === 'on_handover' && !due) needsHandoverDate = true;
      }
      const amount = singleAmount(stage, totalPrice);
      const name =
        stage.name ||
        (stage.type === 'handover'
          ? 'Handover Payment'
          : stage.kind === 'topup'
            ? 'Top-up Payment'
            : 'Down Payment');
      fixedPayments.push({
        name,
        amount,
        percentage: pctStrFor(stage, amount),
        percent: pctStrFor(stage, amount),
        due_date: due,
        phase,
        payment_type: phase === 'handover' ? 'handover' : 'down_payment',
        status: 'unpaid',
        note: stage.note || '',
        isBullet: false,
        needs_review: !due || !amount,
      });
      markReserved(due);
      return;
    }

    // Bullet payment — single large payment that reserves its date.
    if (stage.type === 'bullet') {
      const due = resolveBulletDue(stage);
      const amount = singleAmount(stage, totalPrice);
      fixedPayments.push({
        name: stage.name || 'Bullet Payment',
        amount,
        percentage: pctStrFor(stage, amount),
        percent: pctStrFor(stage, amount),
        due_date: due,
        phase,
        payment_type: 'bullet',
        status: 'unpaid',
        note: stage.note || '',
        isBullet: true,
        overrideRegular: stage.overrideRegular !== false,
        addAlongside: !!stage.addAlongside,
        needs_review: !due || !amount,
      });
      markReserved(due);
      return;
    }

    // Post-handover custom schedule — list of "after X months from handover"
    if (stage.type === 'post_custom') {
      const items = Array.isArray(stage.items) ? stage.items : [];
      items.forEach((it) => {
        if (!handoverDate) needsHandoverDate = true;
        const due = handoverDate
          ? addMonthsIso(handoverDate, Number(it.afterMonths) || 0)
          : '';
        const amt =
          it.amountMode === 'percent'
            ? totalPrice > 0
              ? String(Math.round((totalPrice * (Number(it.percent) || 0)) / 100 * 100) / 100)
              : ''
            : normalizeMoneyValue(it.amount);
        const pct =
          it.amountMode === 'percent'
            ? String(it.percent || '')
            : totalPrice > 0 && moneyNumber(amt) > 0
              ? String(Math.round((moneyNumber(amt) / totalPrice) * 100 * 100) / 100)
              : '';
        fixedPayments.push({
          name: it.name || `After ${it.afterMonths} months`,
          amount: amt,
          percentage: pct,
          percent: pct,
          due_date: due,
          phase: 'post_handover',
          payment_type: 'post_handover',
          status: 'unpaid',
          note: it.note || '',
          isBullet: false,
          needs_review: !due || !amt,
        });
        markReserved(due);
      });
      return;
    }
    // recurring / post_handover / post_equal / construction → Pass 2
  });

  // ---- Pass 2: generate recurring installments, skipping reserved dates ----
  // The requested count is the number of ACTUAL installments to create.
  // Dates that collide with a reserved (fixed) date are skipped and do NOT
  // count toward the total — generation continues until `count` real
  // installments exist (with a safety cap to avoid infinite loops).
  const recurring = [];
  (stages || []).forEach((stage) => {
    if (!stage) return;
    const t = stage.type;
    if (t !== 'recurring' && t !== 'construction' && t !== 'post_equal' && t !== 'post_handover') {
      return;
    }
    const phase = stagePhase(stage);
    const count = Math.max(0, Math.min(500, Math.floor(Number(stage.count) || 0)));
    if (count <= 0) return;
    let firstDate = parseFlexibleDate(stage.firstDate);
    if ((t === 'post_equal' || t === 'post_handover') && !firstDate) {
      if (handoverDate) {
        firstDate = addMonthsIso(handoverDate, Number(stage.startAfterMonths) || 0);
      } else {
        needsHandoverDate = true;
      }
    }
    if (!firstDate) return; // no anchor → cannot generate dated installments
    const step = freqToMonths(stage.frequency, stage.customMonths);
    const { base, last } = recurringAmounts(stage, totalPrice, count);
    // per-installment percent (per_installment + percent modes carry it per row)
    const perInstPct = String(stage.percent || '');
    const stageName =
      stage.name ||
      (t === 'post_handover' || t === 'post_equal' ? 'Post Handover' : 'Installment');
    let generated = 0;
    let i = 0;
    const maxAttempts = count * 4 + 120;
    while (generated < count && i < maxAttempts) {
      const due = addMonthsIso(firstDate, i * step);
      if (due && reservedDates.has(due)) {
        skipped.push({ date: due, reason: 'reserved' });
        i += 1;
        continue;
      }
      const isLast = generated === count - 1;
      const amt = isLast && last !== '' ? last : base;
      recurring.push({
        name: `${stageName} ${generated + 1}`,
        amount: amt,
        percentage: perInstPct,
        percent: perInstPct,
        due_date: due,
        phase,
        payment_type: phase === 'post_handover' ? 'post_handover' : 'installment',
        status: 'unpaid',
        note: '',
        isBullet: false,
        needs_review: !due || !amt,
      });
      generated += 1;
      i += 1;
    }
  });

  // Merge and sort chronologically (undated rows sink to the bottom).
  const all = [...fixedPayments, ...recurring];
  all.sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
  all.forEach((r, i) => {
    r.number = i + 1;
  });

  return { installments: all, needsHandoverDate, skipped };
}

/** Live preview totals across all stages (count, total %, total amount). */
export function sumStagesPreview(stages, totalPrice) {
  const price = moneyNumber(totalPrice);
  let totalPct = 0;
  let totalAmount = 0;
  let count = 0;
  (stages || []).forEach((stage) => {
    if (!stage) return;
    if (stage.type === 'post_custom') {
      const items = Array.isArray(stage.items) ? stage.items : [];
      count += items.length;
      items.forEach((it) => {
        if (it.amountMode === 'percent') {
          const p = Number(it.percent) || 0;
          totalPct += p;
          if (price > 0) totalAmount += (price * p) / 100;
        } else {
          totalAmount += moneyNumber(it.amount);
        }
      });
      return;
    }
    if (
      stage.type === 'major_payment' ||
      stage.type === 'handover' ||
      stage.type === 'bullet' ||
      stage.type === 'down'
    ) {
      count += 1;
      if (stage.amountMode === 'percent') {
        const p = Number(stage.percent) || 0;
        totalPct += p;
        if (price > 0) totalAmount += (price * p) / 100;
      } else {
        const amt = moneyNumber(stage.amount);
        totalAmount += amt;
        if (price > 0) totalPct += (amt / price) * 100;
      }
    } else {
      const n = Math.floor(Number(stage.count) || 0);
      count += n;
      if (stage.recurringMode === 'percent') {
        const p = Number(stage.percent) || 0;
        totalPct += p;
        if (price > 0) totalAmount += (price * p) / 100;
      } else if (stage.recurringMode === 'total') {
        totalAmount += moneyNumber(stage.totalAmount);
      } else {
        // per_installment: perAmount + percent are PER installment.
        const each = moneyNumber(stage.perAmount);
        totalAmount += each * n;
        totalPct += (Number(stage.percent) || 0) * n;
      }
    }
  });
  return {
    count,
    totalPct: Math.round(totalPct * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

/** Per-stage summary for card display. */
export function stageSummary(stage, totalPrice) {
  const price = moneyNumber(totalPrice);
  if (!stage) return { count: 0, pct: 0, amount: 0, isPercent: false };
  if (stage.type === 'bullet' || stage.type === 'down') {
    if (stage.amountMode === 'percent') {
      const pct = Number(stage.percent) || 0;
      return {
        count: 1,
        pct,
        amount: price > 0 ? Math.round((price * pct) / 100 * 100) / 100 : 0,
        isPercent: true,
      };
    }
    const amt = moneyNumber(stage.amount);
    const pct = price > 0 ? Math.round((amt / price) * 100 * 100) / 100 : 0;
    return { count: 1, pct, amount: amt, isPercent: pct > 0 };
  }
  if (stage.type === 'post_custom') {
    const items = Array.isArray(stage.items) ? stage.items : [];
    let pct = 0;
    let amount = 0;
    items.forEach((it) => {
      if (it.amountMode === 'percent') {
        const p = Number(it.percent) || 0;
        pct += p;
        if (price > 0) amount += (price * p) / 100;
      } else {
        amount += moneyNumber(it.amount);
      }
    });
    return {
      count: items.length,
      pct: Math.round(pct * 100) / 100,
      amount: Math.round(amount * 100) / 100,
      isPercent: pct > 0,
    };
  }
  if (stage.type === 'major_payment' || stage.type === 'handover') {
    if (stage.amountMode === 'percent') {
      const pct = Number(stage.percent) || 0;
      return {
        count: 1,
        pct,
        amount: price > 0 ? Math.round((price * pct) / 100 * 100) / 100 : 0,
        isPercent: true,
      };
    }
    const amt = moneyNumber(stage.amount);
    const pct = price > 0 ? Math.round((amt / price) * 100 * 100) / 100 : 0;
    return { count: 1, pct, amount: amt, isPercent: pct > 0 };
  }
  const n = Math.floor(Number(stage.count) || 0);
  if (stage.recurringMode === 'percent') {
    const pct = Number(stage.percent) || 0;
    return {
      count: n,
      pct,
      amount: price > 0 ? Math.round((price * pct) / 100 * 100) / 100 : 0,
      isPercent: true,
    };
  }
  if (stage.recurringMode === 'total') {
    return { count: n, pct: 0, amount: moneyNumber(stage.totalAmount), isPercent: false };
  }
  // per_installment: perAmount + percent are PER installment.
  const each = moneyNumber(stage.perAmount);
  const eachPct = Number(stage.percent) || 0;
  return {
    count: n,
    pct: Math.round(eachPct * n * 100) / 100,
    amount: Math.round(each * n * 100) / 100,
    isPercent: eachPct > 0,
    each,
  };
}

/**
 * Phase breakdown for the live summary: returns { pre, handover, post } each
 * with { pct, amount, count }, plus totals. Used by the builder's live summary
 * card so the user sees how much is paid before / on / after handover.
 */
export function phaseBreakdown(stages, totalPrice) {
  const price = moneyNumber(totalPrice);
  const acc = {
    pre: { pct: 0, amount: 0, count: 0 },
    handover: { pct: 0, amount: 0, count: 0 },
    post: { pct: 0, amount: 0, count: 0 },
  };
  (stages || []).forEach((stage) => {
    if (!stage) return;
    const sum = stageSummary(stage, price);
    const ph = stagePhase(stage);
    const bucket = ph === 'handover' ? 'handover' : ph === 'post_handover' ? 'post' : 'pre';
    acc[bucket].pct += sum.pct;
    acc[bucket].amount += sum.amount;
    acc[bucket].count += sum.count;
  });
  Object.keys(acc).forEach((k) => {
    acc[k].pct = Math.round(acc[k].pct * 100) / 100;
    acc[k].amount = Math.round(acc[k].amount * 100) / 100;
  });
  const totalPct = Math.round((acc.pre.pct + acc.handover.pct + acc.post.pct) * 100) / 100;
  const totalAmount = Math.round((acc.pre.amount + acc.handover.amount + acc.post.amount) * 100) / 100;
  const totalCount = acc.pre.count + acc.handover.count + acc.post.count;
  return {
    pre: acc.pre,
    handover: acc.handover,
    post: acc.post,
    totalPct,
    totalAmount,
    totalCount,
  };
}

/**
 * Generate bullet-payment stage definitions for a recurring pattern, e.g.
 * "every 6 months add a 3% bullet instead of the regular installment".
 * Returns an array of bullet stage objects ready to append to the stage list.
 * The bullets use overrideRegular=true so they replace the regular installment
 * on the same date.
 */
export function generateRecurringBullets({
  intervalMonths = 6,
  count = 4,
  firstOffsetMonths = 6,
  percent = '',
  amount = '',
  amountMode = 'percent',
  phase = 'pre_handover',
  name = 'Bullet Payment',
}) {
  const bullets = [];
  for (let i = 0; i < count; i += 1) {
    const off = firstOffsetMonths + i * intervalMonths;
    bullets.push({
      id: `bullet-pat-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'bullet',
      name,
      amountMode,
      percent: percent !== '' ? String(percent) : '',
      amount: amount !== '' ? String(amount) : '',
      phase,
      dueMode: phase === 'post_handover' ? 'after_handover_months' : 'after_months',
      afterMonths: String(off),
      dueDate: '',
      overrideRegular: true,
      addAlongside: false,
      note: '',
    });
  }
  return bullets;
}

export default {
  parseFlexibleDate,
  formatPlanDateDisplay,
  formatPlanDateHuman,
  addMonthsIso,
  addDaysIso,
  resolveRelativeDate,
  mapPaymentStage,
  parseRelativeHandoverOffset,
  isFirstPaymentLabel,
  generateRecurringInstallments,
  previewInstallmentSummary,
  expandCompactPlan,
  sumPhasePercentages,
  normalizeInstallmentPlan,
  pageLooksLikePaymentPlan,
  stagesToInstallments,
  sumStagesPreview,
  stageSummary,
  freqToMonths,
  stagePhase,
  phaseBreakdown,
  generateRecurringBullets,
};
