/**
 * Smart Payment Plan Reader — frontend client.
 *
 * The REAL document reading happens on the backend (apps/api route
 * /integrated-ai/analyze-plan): storage upload → storage fetch → PDF page
 * render → Vision/Document AI → JSON parse → deterministic validator.
 *
 * This module is now a thin client: it uploads the ORIGINAL files (PDF /
 * images / HEIC) to the backend endpoint and returns the final structured
 * installment list the backend produces. No frontend OCR, no client-side
 * PDF rendering, no client-side JSON parsing/normalization.
 *
 * The result maps onto the SAME Payment Plan Engine records used by manual
 * entry (payment_type / amount / percentage / due_date / relative / phase /
 * source / confidence). source = "AI_IMPORT".
 */
import { formatPlanDateDisplay, addMonthsIso } from '@/lib/paymentPlanSmart';
import { moneyNumber } from '@/lib/money';

const API_SERVER_URL = '/hcgi/api';

/* ------------------------------------------------------------------ */
/* Auth token (PocketBase JWT) for the backend request                 */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* File hashing (duplicate detection — kept client-side for the UI)    */
/* ------------------------------------------------------------------ */

export async function sha256File(file) {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `${file.name || 'x'}|${file.size || 0}|${file.lastModified || 0}`;
  }
}

/* ------------------------------------------------------------------ */
/* Image enhancement — kept as a no-op-friendly export for callers that
   still import it. The backend now does all real processing.           */
/* ------------------------------------------------------------------ */

export async function enhanceImageFile(file) {
  return file;
}

/* ------------------------------------------------------------------ */
/* Payment type mapping (used by PropertyForm)                          */
/* ------------------------------------------------------------------ */

const PAYMENT_TYPE_MAP = {
  down_payment: 'first_payment',
  installment: 'recurring_installment',
  bullet: 'bullet_payment',
  handover: 'handover_payment',
  post_handover: 'post_handover_installment',
  custom: 'custom_payment',
};

export function mapPaymentType(raw) {
  const k = String(raw || '').toLowerCase();
  if (PAYMENT_TYPE_MAP[k]) return PAYMENT_TYPE_MAP[k];
  if (Object.values(PAYMENT_TYPE_MAP).includes(k)) return k;
  return 'custom_payment';
}

/* ------------------------------------------------------------------ */
/* Live validation (used by the preview summary as the user edits)      */
/* ------------------------------------------------------------------ */

export function validatePlan(rows, totalPrice) {
  const price = moneyNumber(totalPrice);
  let sumPct = 0;
  let sumAmt = 0;
  rows.forEach((r) => {
    sumPct += Number(r.percentage || 0);
    sumAmt += moneyNumber(r.amount);
  });
  sumPct = Math.round(sumPct * 100) / 100;
  sumAmt = Math.round(sumAmt * 100) / 100;
  const pctDiff = Math.round((sumPct - 100) * 100) / 100;
  const amtDiff = price > 0 ? Math.round((sumAmt - price) * 100) / 100 : null;
  return {
    sumPct,
    sumAmt,
    price,
    pctOk: Math.abs(pctDiff) < 0.05,
    pctDiff,
    amtDiff,
    amtOk: amtDiff == null || Math.abs(amtDiff) < 0.5,
  };
}

/* ------------------------------------------------------------------ */
/* Display label for a row's due date, honoring relative dates          */
/* ------------------------------------------------------------------ */

export function rowDueLabel(row, { lang = 'ar', handoverDate = '', bookingDate = '' } = {}) {
  if (row.due_date) return formatPlanDateDisplay(row.due_date);
  if (row.relative) {
    const ar = lang === 'ar';
    const m = row.relative.offset_months;
    const to = row.relative.to || 'handover';
    if (to === 'booking_date') {
      if (bookingDate) {
        const computed = addMonthsIso(bookingDate, m);
        if (computed) return `${formatPlanDateDisplay(computed)} (${ar ? `بعد ${m} شهر من تاريخ الحجز` : `${m} months from booking date`})`;
      }
      return ar ? `بعد ${m} شهر من تاريخ الحجز` : `${m} months from booking date`;
    }
    if (handoverDate) {
      const computed = addMonthsIso(handoverDate, m);
      if (computed) return `${formatPlanDateDisplay(computed)} (${ar ? `بعد ${m} أشهر من الاستلام` : `${m} months after handover`})`;
    }
    return ar ? `بعد ${m} أشهر من الاستلام` : `${m} months after handover`;
  }
  return '—';
}

/* ------------------------------------------------------------------ */
/* Backward-compat exports (other modules may import these)             */
/* ------------------------------------------------------------------ */

export const extractJsonFromText = () => null;
export const mergeBatches = (b) => (b || []).flat();
export const normalizeAiRow = (r) => r;
export const dedupeBulletsVsRecurring = (r) => r;
export const renderPdfPagesToImages = async () => [];

/* ------------------------------------------------------------------ */
/* Main pipeline — async background job (upload → poll → result)        */
/* ------------------------------------------------------------------ */
/*
 * The backend now runs the (slow) Claude call as a durable background job
 * stored in the `payment_plan_jobs` PocketBase collection. This client:
 *   1. POSTs the files to /analyze-plan → gets { jobId } back immediately
 *      (the gateway can never 504, because it does NOT wait for Claude).
 *   2. Polls GET /plan-jobs/:id every ~2.5s, reporting stage + progress.
 *   3. Resolves with the persisted result once the job is "completed".
 *
 * Because the result lives in PocketBase, it survives a dropped connection
 * or a page reload — resumePlanJob() / getActivePlanJob() pick it back up.
 */

const STAGE_PROGRESS = { upload: 10, read: 25, extract: 45, validate: 85, ready: 100 };

function stageDetail(stage, isAr) {
  const map = isAr
    ? { upload: 'جاري رفع الملفات', read: 'جاري قراءة المستند', extract: 'جاري استخراج الجدول', validate: 'جاري التحقق من البيانات', ready: 'جاهز للمراجعة' }
    : { upload: 'Uploading files', read: 'Reading document', extract: 'Extracting table', validate: 'Validating data', ready: 'Ready for review' };
  return map[stage] || (isAr ? 'جاري المعالجة' : 'Processing');
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('abort'));
      return;
    }
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new Error('abort'));
        },
        { once: true },
      );
    }
  });
}

/**
 * Poll a plan job until it completes or fails. Shared by the main flow and
 * the resume-after-reload flow.
 */
async function pollPlanJob(jobId, { lang = 'ar', onProgress = () => {}, signal, token, totalPrice = '' } = {}) {
  const isAr = lang === 'ar';
  const interval = 2500;
  // Overall client-side cap (the server has its own stale detection too).
  const maxWaitMs = 6 * 60 * 1000;
  const start = Date.now();

  while (true) {
    if (signal?.aborted) {
      const e = new Error('abort'); e.code = 'PLAN_ABORTED'; throw e;
    }
    if (Date.now() - start > maxWaitMs) {
      const e = new Error('PLAN_AI_TIMEOUT'); e.code = 'PLAN_AI_TIMEOUT'; throw e;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(interval, signal).catch(() => {
      const e = new Error('abort'); e.code = 'PLAN_ABORTED'; throw e;
    });

    let j = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await window.fetch(`${API_SERVER_URL}/integrated-ai/plan-jobs/${jobId}`, {
        headers: { Accept: 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        signal,
      });
      if (r.ok) j = await r.json().catch(() => null);
    } catch (e) {
      if (signal?.aborted || /abort/i.test(String(e?.message || ''))) {
        const err = new Error('abort'); err.code = 'PLAN_ABORTED'; throw err;
      }
      // Transient poll failure — keep trying.
      continue;
    }
    if (!j) continue;

    const stage = j.stage || 'read';
    const progress = typeof j.progress === 'number' && j.progress > 0
      ? j.progress
      : (STAGE_PROGRESS[stage] || 30);
    onProgress(stage, stageDetail(stage, isAr), progress);

    if (j.status === 'completed') {
      const data = j.result || {};
      const installments = Array.isArray(data.installments) ? data.installments : [];
      if (!installments.length || data.found === false) {
        const e = new Error('PLAN_NO_PLAN'); e.code = 'PLAN_NO_PLAN'; throw e;
      }
      onProgress('validate', stageDetail('validate', isAr), 90);
      onProgress('ready', stageDetail('ready', isAr), 100);
      const needsReviewCount = data.needsReviewCount != null
        ? data.needsReviewCount
        : installments.filter((r) => r.needs_review).length;
      return {
        installments,
        validation: data.validation || validatePlan(installments, totalPrice),
        currency: data.currency || null,
        totalPrice: data.totalPrice || null,
        sourceFiles: data.sourceFiles || [],
        raw: null,
        partial: needsReviewCount > 0 || (data.failedFiles && data.failedFiles.length > 0),
        totalFound: installments.length,
        needsReviewCount,
        failedFiles: Array.isArray(data.failedFiles) ? data.failedFiles : [],
        uploadedCount: data.uploadedCount || 0,
        totalFiles: data.totalFiles || 0,
        pdfPageErrors: Array.isArray(data.pageErrors) ? data.pageErrors : [],
      };
    }
    if (j.status === 'failed') {
      const code = j.error_code || 'PLAN_AI_PROXY';
      const e = new Error(code); e.code = code;
      e.userMessageAr = j.error_message_ar || '';
      e.userMessageEn = j.error_message_en || '';
      throw e;
    }
  }
}

/**
 * Upload the original files and return the final structured installment
 * list. The backend runs Claude as a background job; this function polls
 * until the result is ready. All parsing/validation runs server-side.
 *
 * @param {File[]} files
 * @param {{ totalPrice?: string, handoverDate?: string, lang?: string, onProgress?: (stage:string, detail?:string, progress?:number)=>void, signal?: AbortSignal, skipEnhance?: boolean }} opts
 * @returns {Promise<object>}
 */
export async function extractPlanFromFiles(files, opts = {}) {
  const { totalPrice = '', lang = 'ar', onProgress = () => {}, signal } = opts;
  const list = Array.from(files || []);
  if (!list.length) throw new Error('NO_FILES');

  const isAr = lang === 'ar';
  onProgress('upload', stageDetail('upload', isAr), 5);

  const token = getPocketbaseToken();
  const fd = new FormData();
  const promptText = isAr
    ? `اقرأ المستندات المرفقة بالكامل وابحث عن أي جدول أو معلومات خاصة بخطة الدفع. حدد نوع كل دفعة من السياق وأرجع الجدول ككائن JSON منظم فقط.${totalPrice ? ` سعر العقار للتحقق فقط: ${totalPrice}.` : ''}`
    : `Read the attached documents in full and search for any payment plan table or information. Determine each payment type from context and return the table as a valid JSON object only.${totalPrice ? ` Property total price for validation only: ${totalPrice}.` : ''}`;
  const message = [{ type: 'text', text: promptText }];
  fd.append('message', JSON.stringify(message));
  list.forEach((f) => fd.append('images', f));

  // POST: upload files + create a background job. Returns { jobId } quickly,
  // BEFORE the slow Claude call — so the gateway can never 504.
  const response = await window.fetch(`${API_SERVER_URL}/integrated-ai/analyze-plan`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: fd,
    signal,
  });

  const bodyText = await response.text().catch(() => '');
  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch { parsed = null; }

  if (response.status === 503 && parsed?.error === 'INTEGRATION_NOT_CONFIGURED') {
    const err = new Error('PLAN_NOT_CONFIGURED');
    err.code = 'PLAN_NOT_CONFIGURED';
    err.userMessageAr = parsed?.userMessageAr;
    err.userMessageEn = parsed?.userMessageEn;
    throw err;
  }
  if (!response.ok) {
    const code = parsed?.error || parsed?.message || `PLAN_HTTP_${response.status}`;
    const err = new Error(typeof code === 'string' ? code : `PLAN_HTTP_${response.status}`);
    err.code = err.message;
    err.status = response.status;
    err.detail = typeof parsed?.detail === 'string' ? parsed.detail : '';
    err.userMessageAr = parsed?.userMessageAr || '';
    err.userMessageEn = parsed?.userMessageEn || '';
    throw err;
  }

  const jobId = parsed?.jobId;
  if (!jobId) {
    const e = new Error('PLAN_NO_JOB'); e.code = 'PLAN_NO_JOB'; throw e;
  }

  onProgress('read', stageDetail('read', isAr), 20);

  return pollPlanJob(jobId, { lang, onProgress, signal, token, totalPrice });
}

/**
 * Check whether the current user has an in-flight plan job (pending or
 * processing). Used on mount to resume an analysis after a reload / dropped
 * connection. Returns { jobId, status, stage, progress } or null.
 */
export async function getActivePlanJob() {
  const token = getPocketbaseToken();
  try {
    const r = await window.fetch(`${API_SERVER_URL}/integrated-ai/plan-jobs/active`, {
      headers: { Accept: 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j || !j.jobId) return null;
    return j;
  } catch {
    return null;
  }
}

/**
 * Resume polling an existing job (after a reload / reconnect). Same return
 * shape as extractPlanFromFiles.
 */
export async function resumePlanJob(jobId, opts = {}) {
  const { lang = 'ar', onProgress = () => {}, signal, totalPrice = '' } = opts;
  const token = getPocketbaseToken();
  return pollPlanJob(jobId, { lang, onProgress, signal, token, totalPrice });
}

export default {
  extractPlanFromFiles,
  resumePlanJob,
  getActivePlanJob,
  sha256File,
  enhanceImageFile,
  validatePlan,
  rowDueLabel,
  mapPaymentType,
  extractJsonFromText,
  mergeBatches,
  normalizeAiRow,
  dedupeBulletsVsRecurring,
  renderPdfPagesToImages,
};
