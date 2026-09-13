/**
 * AI Property Creator — frontend client.
 *
 * Calls the backend `/integrated-ai/extract-property` endpoint (which uses
 * the same Anthropic Claude engine as the Smart Payment Plan Reader) to
 * extract ONLY the allowed property/financial fields from an uploaded
 * contract. Forbidden personal/contract fields are never returned.
 *
 * DATES: Claude returns each date either as an absolute ISO date or as a
 * relative reference ({to:"booking_date"|"handover", offset_months:N}). The
 * real calendar date is computed HERE in plain code (addMonthsIso) — never by
 * the AI. If a start point (booking/handover date) is missing, the UI asks
 * the user for it before computing the schedule.
 */
import { addMonthsIso, parseFlexibleDate } from '@/lib/paymentPlanSmart';

const API_SERVER_URL = '/hcgi/api';

function getPocketbaseToken() {
  const raw = localStorage.getItem('pocketbase_auth');
  if (!raw) return null;
  try {
    const bytes = new TextEncoder().encode(raw);
    return btoa(String.fromCharCode(...bytes));
  } catch {
    return null;
  }
}

function makeExtractError(code, parsed) {
  const err = new Error(typeof code === 'string' ? code : 'PLAN_AI_PROXY');
  err.code = err.message;
  err.userMessageAr = parsed?.userMessageAr || '';
  err.userMessageEn = parsed?.userMessageEn || '';
  // Surface the REAL upstream reason (sanitized of keys server-side) so the
  // user sees the actual cause, not a generic constant message.
  err.detail = parsed?.detail || '';
  return err;
}

/**
 * Send files to the extraction endpoint and return the structured result.
 *
 * Multi-batch flow: the backend creates a durable job, splits any PDF >100
 * pages into ≤100-page batches, sends each batch as a separate Claude
 * request, and merges the results. This client POSTs the files, then polls
 * /extract-jobs/:id until the job completes (or fails), reporting per-batch
 * progress through `onProgress` so the UI can show which pages are being
 * processed in real time.
 *
 * @param {File[]} files
 * @param {{ purchaseType?: string, usageType?: string, lang?: string, onProgress?: (info) => void }} opts
 * @returns {Promise<object>}
 */
export async function extractPropertyFromFiles(files, opts = {}) {
  const { purchaseType = '', usageType = '', lang = 'ar', onProgress } = opts;
  const list = Array.from(files || []);
  if (!list.length) throw new Error('NO_FILES');

  const token = getPocketbaseToken();
  const fd = new FormData();
  const isAr = lang === 'ar';
  const isRental = purchaseType === 'rented';
  const promptText = isRental
    ? (isAr
      ? `اقرأ كل الملفات المرفقة كعقد إيجار واحد (عقد إيجار + جواز سفر/هوية المستأجر + ملحقات + شيكات + إيصالات + أي مستند مرتبط بنفس الإيجار). استخرج بيانات العقار، بيانات عقد الإيجار (اسم المستأجر، هاتف المستأجر، بريد المستأجر، جنسية المستأجر، تواريخ العقد، الإيجار السنوي والإجمالي، التأمين، الرسوم)، وكل الدفعات/الشيكات مع حالة الدفع (paid فقط عند وجود دليل صريح وإلا unpaid). التواريخ بصيغة YYYY-MM-DD. استخدم null لأي بيانة غير موجودة ولا تخترع شيئًا.${usageType ? ` نوع الاستخدام: ${usageType}.` : ''}`
      : `Read ALL attached files as ONE lease (lease contract + tenant passport/ID + annex + cheques + receipts + any related document). Extract the property data, the lease contract data (tenant name, tenant phone, tenant email, tenant nationality, contract dates, annual and total rent, deposit, fees), and every payment/cheque with payment_status (paid ONLY with explicit evidence, otherwise unpaid). Dates as YYYY-MM-DD. Use null for any missing field and never invent anything.${usageType ? ` Usage type: ${usageType}.` : ''}`)
    : (isAr
      ? `اقرأ المستند المرفق بالكامل. استخرج بيانات العقار المسموح بها فقط (اسم المشروع/البناية، رقم الوحدة، نوع العقار، المساحة مع وحدتها، المنطقة، السعر الإجمالي مع الخصم إن وجد، تاريخ التسليم، الرسوم الإضافية، وجدول الأقساط إن وُجد). لا تستخرج أي بيانات شخصية أو رقم العقد وتاريخه. أرجع التواريخ كما وردت في المستند (مطلقة أو نسبية مع نقطة البداية).${purchaseType ? ` طريقة الشراء المختارة: ${purchaseType}.` : ''}${usageType ? ` نوع الاستخدام: ${usageType}.` : ''}`
      : `Read the attached document in full. Extract ONLY the allowed property fields (project/building name, unit number, property type, area with its unit, community, total price with discount if any, delivery date, additional fees, and the installment schedule if present). Do NOT extract any personal data or contract number/date. Return dates exactly as stated in the document (absolute or relative with a start point).${purchaseType ? ` Selected purchase method: ${purchaseType}.` : ''}${usageType ? ` Usage type: ${usageType}.` : ''}`);
  const message = [{ type: 'text', text: promptText }];
  fd.append('message', JSON.stringify(message));
  fd.append('lang', lang);
  fd.append('purchaseType', purchaseType || '');
  // Diagnostic: log what is being sent to the server (no file content). The
  // server log adds the real media_type + base64 size + PDF page count that
  // actually reach Claude. This client log shows what the browser uploaded.
  console.info('[EstateAI] extract-property upload', {
    endpoint: `${API_SERVER_URL}/integrated-ai/extract-property`,
    fileCount: list.length,
    files: list.map((f) => ({
      name: f.name,
      type: f.type,
      sizeBytes: f.size,
      sizeMB: f.size ? (f.size / 1024 / 1024).toFixed(2) : '0.00',
    })),
    promptChars: promptText.length,
  });
  list.forEach((f) => fd.append('images', f));

  const authHeaders = { Accept: 'application/json', ...(token && { Authorization: `Bearer ${token}` }) };

  const response = await window.fetch(`${API_SERVER_URL}/integrated-ai/extract-property`, {
    method: 'POST',
    headers: authHeaders,
    body: fd,
  });

  const bodyText = await response.text().catch(() => '');
  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch { parsed = null; }

  if (response.status === 503 && parsed?.error === 'INTEGRATION_NOT_CONFIGURED') {
    throw makeExtractError('PLAN_NOT_CONFIGURED', parsed);
  }
  if (!response.ok) {
    throw makeExtractError(parsed?.error || `PLAN_HTTP_${response.status}`, parsed);
  }
  if (!parsed?.jobId) {
    throw makeExtractError('PLAN_AI_PROXY', parsed);
  }

  // ---- Poll the job until it completes or fails ----
  const jobId = parsed.jobId;
  const pollIntervalMs = 1500;
  const poll = async () => {
    const r = await window.fetch(`${API_SERVER_URL}/integrated-ai/extract-jobs/${jobId}`, {
      headers: authHeaders,
    });
    const t = await r.text().catch(() => '');
    let j = null;
    try { j = JSON.parse(t); } catch { j = null; }
    return j;
  };

  let info = await poll();
  if (onProgress && info) { try { onProgress(info); } catch { /* ignore */ } }

  // Safety cap so a runaway poll loop never hangs forever (~10 minutes).
  const deadline = Date.now() + 10 * 60 * 1000;
  while (info && (info.status === 'pending' || info.status === 'processing')) {
    if (Date.now() > deadline) {
      throw makeExtractError('PLAN_AI_TIMEOUT', null);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    // eslint-disable-next-line no-await-in-loop
    info = await poll();
    if (onProgress && info) { try { onProgress(info); } catch { /* ignore */ } }
  }

  if (!info) throw makeExtractError('PLAN_AI_PROXY', null);

  if (info.status === 'failed') {
    const code = info.error_code || 'PLAN_AI_PROXY';
    const err = new Error(code);
    err.code = code;
    err.userMessageAr = info.error_message_ar || '';
    err.userMessageEn = info.error_message_en || '';
    err.detail = '';
    throw err;
  }
  if (info.status !== 'completed') {
    throw makeExtractError('PLAN_AI_PROXY', null);
  }
  return info.result;
}

/**
 * Compute the real calendar date for a single row that may carry an absolute
 * due_date or a relative reference. Uses the provided start points
 * (bookingDate / handoverDate). Returns { date, needsStart } where needsStart
 * is the missing start point key ("booking_date"|"handover"|null).
 *
 * @param {{ due_date?: string|null, due_date_relative?: {to:string, offset_months:number}|null }} row
 * @param {{ bookingDate?: string, handoverDate?: string }} startPoints
 * @returns {{ date: string, needsStart: string|null, relative: object|null }}
 */
export function resolveRowDate(row, startPoints = {}) {
  const rel = row.due_date_relative;
  if (rel && typeof rel === 'object' && rel.offset_months != null) {
    const to = rel.to === 'booking_date' ? 'booking_date' : 'handover';
    const start = to === 'booking_date' ? startPoints.bookingDate : startPoints.handoverDate;
    if (start) {
      return { date: addMonthsIso(start, Number(rel.offset_months) || 0), needsStart: null, relative: rel };
    }
    return { date: '', needsStart: to, relative: rel };
  }
  if (row.due_date) {
    const iso = parseFlexibleDate(row.due_date);
    return { date: iso || '', needsStart: null, relative: null };
  }
  return { date: '', needsStart: null, relative: null };
}

/**
 * Walk every installment + fee + the delivery date and collect the set of
 * start points the document references but that are missing (not provided by
 * Claude's start_points and not yet supplied by the user).
 *
 * @param {object} extraction - raw extraction result
 * @param {{ bookingDate?: string, handoverDate?: string }} startPoints
 * @returns {string[]} e.g. ["booking_date"]
 */
export function findMissingStartPoints(extraction, startPoints = {}) {
  const missing = new Set();
  const check = (row) => {
    const { needsStart } = resolveRowDate(row, startPoints);
    if (needsStart) missing.add(needsStart);
  };
  (extraction?.schedule?.installments || []).forEach(check);
  (extraction?.fees || []).forEach(check);
  if (extraction?.property?.delivery_date_relative) {
    check({ due_date_relative: extraction.property.delivery_date_relative });
  }
  return Array.from(missing);
}

/**
 * Produce the final, fully-resolved installment list with real calendar
 * dates. Rows whose date still cannot be computed get due_date = '' and a
 * `needs_review` flag so the review UI can prompt for them.
 *
 * @param {object} extraction
 * @param {{ bookingDate?: string, handoverDate?: string }} startPoints
 * @returns {Array<object>}
 */
export function buildFinalInstallments(extraction, startPoints = {}) {
  const rows = extraction?.schedule?.installments || [];
  return rows.map((r, i) => {
    const { date, relative } = resolveRowDate(r, startPoints);
    return {
      number: r.number != null ? Number(r.number) || i + 1 : i + 1,
      name: r.name || r.label || '',
      percentage: r.percentage != null && r.percentage !== '' ? Number(r.percentage) : null,
      amount: r.amount != null && r.amount !== '' ? Number(r.amount) : null,
      due_date: date || '',
      relative: relative || null,
      needs_review: !date,
    };
  });
}

/**
 * Resolve the property's expected delivery date (absolute or relative to
 * booking date) into a real calendar date using the start points.
 */
export function resolveDeliveryDate(extraction, startPoints = {}) {
  const p = extraction?.property || {};
  if (p.delivery_date_relative) {
    const { date } = resolveRowDate({ due_date_relative: p.delivery_date_relative }, startPoints);
    return date || '';
  }
  if (p.expected_delivery_date) {
    return parseFlexibleDate(p.expected_delivery_date) || '';
  }
  return '';
}

export default {
  extractPropertyFromFiles,
  resolveRowDate,
  findMissingStartPoints,
  buildFinalInstallments,
  resolveDeliveryDate,
};
