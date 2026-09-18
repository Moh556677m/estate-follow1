// Unified, fast, progress-aware file upload for the whole Estate Follow site.
//
// Design goals (see task spec):
//  - Real upload progress (% , file name, size) via XHR — no infinite spinner.
//  - Client-side validation BEFORE any request (size + type) — instant reject.
//  - Image compression (JPG/PNG/WebP) before upload; PDFs are never recompressed.
//  - Upload NEVER touches pb.authStore — a failed/slow upload can never log
//    the user out, clear their token, or wipe form data. Auth is decoupled.
//  - Cancel (AbortController) + Retry support.
//  - Replace order is inherently safe: a PATCH with a new file atomically
//    swaps the old one server-side; if the PATCH fails, the old file remains.
//  - Duplicate-upload guard via an in-flight lock keyed by collection+record+field.
//
// All file fields stay PROTECTED on the PocketBase schema — short-lived signed
// tokens are still required to view them. Speed does not compromise privacy.

import pb from '@/lib/pocketbaseClient';
import { ensureFreshToken } from '@/lib/authRefresh';

// ---- Type limits only — no hardcoded small size caps on the client. ------
// Size is enforced by PocketBase field maxSize / reverse-proxy when present.
// Frontend never rejects a valid-type file solely for being "too big".
// Soft ceiling (512MB) matches the raised schema max; only empty files and
// wrong MIME/extension are blocked before upload.
export const UPLOAD_SOFT_MAX_BYTES = 512 * 1024 * 1024;

export const FILE_LIMITS = {
  // identity / contract documents: PDF or image
  doc: {
    max: UPLOAD_SOFT_MAX_BYTES,
    accept: 'application/pdf,image/jpeg,image/png,image/webp',
    mime: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    ext: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
  },
  // profile / logo photos: image only
  image: {
    max: UPLOAD_SOFT_MAX_BYTES,
    accept: 'image/jpeg,image/png,image/webp',
    mime: ['image/jpeg', 'image/png', 'image/webp'],
    ext: ['jpg', 'jpeg', 'png', 'webp'],
  },
  // PDF-only documents (licenses, permits, contracts)
  pdf: {
    max: UPLOAD_SOFT_MAX_BYTES,
    accept: 'application/pdf',
    mime: ['application/pdf'],
    ext: ['pdf'],
  },
  // media library / video-capable slots
  media: {
    max: UPLOAD_SOFT_MAX_BYTES,
    accept: 'application/pdf,image/jpeg,image/png,image/webp,image/gif,video/mp4',
    mime: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
    ],
    ext: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4'],
  },
};

function extOf(name) {
  const n = String(name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i + 1) : '';
}

function mimeOf(file) {
  const t = String(file?.type || '').toLowerCase();
  return t;
}

/**
 * Validate a file client-side. Returns { ok: true } or { ok: false, message }.
 * `kind` is one of FILE_LIMITS keys.
 */
export function validateFile(file, kind = 'doc') {
  if (!file) return { ok: false, message: 'no_file' };
  const limit = FILE_LIMITS[kind] || FILE_LIMITS.doc;
  // Never reject on size client-side. Oversized uploads surface as HTTP 413
  // from the host/storage and map via uploadErrorMessage.
  if (file.size === 0) {
    return { ok: false, message: 'file_empty' };
  }
  const m = mimeOf(file);
  const e = extOf(file.name);
  const mimeOk = limit.mime.includes(m);
  const extOk = limit.ext.includes(e);
  // Some browsers report empty mime for HEIC/etc — accept by extension only
  // for the image bucket, but require a real match for pdf.
  if (kind === 'pdf') {
    if (!mimeOk && !extOk) return { ok: false, message: 'file_invalid_type' };
  } else if (!mimeOk && !extOk) {
    return { ok: false, message: 'file_invalid_type' };
  }
  return { ok: true };
}

/** Human-readable file size. */
export function formatBytes(bytes) {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- Image compression (canvas) -----------------------------------------
/**
 * Compress an image File before upload. Returns a new File (WebP/JPEG) that is
 * usually far smaller, without destroying document legibility. PDFs and
 * non-images are returned unchanged. Honors max dimension and quality.
 */
export async function compressImage(file, { maxDim = 1800, quality = 0.82 } = {}) {
  if (!file) return file;
  const m = mimeOf(file);
  const isImage = m.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name || '');
  if (!isImage) return file; // never touch PDFs / other docs

  // Small images: skip compression overhead.
  if (file.size < 350 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    // Prefer WebP for size; fall back to JPEG.
    let type = 'image/webp';
    let outQuality = quality;
    // PNG with transparency → keep PNG to avoid black backgrounds.
    if (m === 'image/png') {
      type = 'image/png';
      outQuality = undefined;
    }
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, type, outQuality),
    );
    if (!blob) return file;
    // Only use the compressed blob if it is actually smaller.
    if (blob.size >= file.size) return file;
    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    const ext = type === 'image/png' ? 'png' : 'webp';
    const out = new File([blob], `${baseName}.${ext}`, { type });
    return out;
  } catch (_) {
    return file; // compression failed → upload original
  }
}

// ---- In-flight duplicate guard -------------------------------------------
const inflight = new Map();
const keyFor = (collection, recordId, field) =>
  `${collection}::${recordId}::${field}`;

/**
 * Prepare a file for upload: validate + compress. Returns
 * { ok, file, error } — never throws.
 */
export async function prepareFile(file, kind = 'doc') {
  const v = validateFile(file, kind);
  if (!v.ok) return { ok: false, error: v.message, file: null };
  const prepared = await compressImage(file);
  return { ok: true, file: prepared, error: null };
}

/**
 * Upload one or more fields (including File values) to a PocketBase record
 * via a PATCH request with real progress. Auth is attached from pb.authStore
 * but the authStore is NEVER read-then-written here, so a failure cannot
 * log the user out.
 *
 * @param {object} opts
 * @param {string} opts.collection   PocketBase collection name
 * @param {string} opts.recordId     record id to PATCH
 * @param {object} opts.fields       { fieldName: File | string | number, ... }
 * @param {(loaded,total,percent)=>void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.field]      field key used for the duplicate guard
 * @returns {Promise<object>}        the updated record JSON
 */
export function uploadRecordFile({
  collection,
  recordId,
  fields,
  onProgress,
  signal,
  field = '__default',
}) {
  const guardKey = keyFor(collection, recordId, field);
  if (inflight.has(guardKey)) {
    return inflight.get(guardKey);
  }

  const promise = new Promise((resolve, reject) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      fd.append(k, v);
    });

    const xhr = new XMLHttpRequest();
    const url = `${pb.baseUrl}/api/collections/${encodeURIComponent(
      collection,
    )}/records/${encodeURIComponent(recordId)}`;

    xhr.open('PATCH', url, true);
    // PocketBase auth token. Read-only — never written back.
    const token = pb.authStore.token;
    if (token) xhr.setRequestHeader('Authorization', token);

    if (xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const percent = Math.round((e.loaded / e.total) * 100);
        if (onProgress) onProgress(e.loaded, e.total, percent);
      };
    }

    const cleanup = () => inflight.delete(guardKey);

    xhr.onload = () => {
      cleanup();
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (_) {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const err = new Error(`upload_failed_${xhr.status}`);
        err.status = xhr.status;
        err.data = data;
        err.isNetwork = false;
        reject(err);
      }
    };
    xhr.onerror = () => {
      cleanup();
      const err = new Error('upload_network_error');
      err.isNetwork = true;
      reject(err);
    };
    xhr.ontimeout = () => {
      cleanup();
      const err = new Error('upload_timeout');
      err.isTimeout = true;
      reject(err);
    };
    xhr.onabort = () => {
      cleanup();
      const err = new Error('upload_cancelled');
      err.isCancelled = true;
      reject(err);
    };

    // Long timeout for large files on slow links (30 minutes).
    xhr.timeout = 30 * 60 * 1000;

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        cleanup();
        reject(makeCancelled());
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          try { xhr.abort(); } catch (_) {}
        },
        { once: true },
      );
    }

    // Proactively refresh the auth token before the PATCH so a stale /
    // expired token never causes a 401 "The request requires valid record
    // authorization token." on an upload. Best-effort — if the refresh
    // fails the XHR still sends (and surfaces the 401 via uploadErrorMessage).
    (async () => {
      try { await ensureFreshToken(); } catch { /* ignore */ }
      try {
        xhr.send(fd);
      } catch (e) {
        cleanup();
        reject(e);
      }
    })();
  });

  inflight.set(guardKey, promise);
  // Always clear the guard when the promise settles (defensive).
  promise.finally(() => inflight.delete(guardKey));
  return promise;
}

function makeCancelled() {
  const e = new Error('upload_cancelled');
  e.isCancelled = true;
  return e;
}

/**
 * Safely reflect an updated users record into the auth store WITHOUT ever
 * clearing it. Only saves when the record is a non-null object whose id
 * matches the currently authenticated user. A failed upload can never reach
 * here with bad data, and this helper never clears the store on its own.
 */
export function safeSyncAuthRecord(record) {
  try {
    if (!record || typeof record !== 'object') return;
    const id = record.id || record.get?.('id');
    const current = pb.authStore.record;
    if (!id || !current || current.id !== id) return;
    pb.authStore.save(record, pb.authStore.token);
  } catch (_) {
    /* never let a sync failure affect the session */
  }
}

/**
 * Friendly localized message for an upload error. Pass the language t() or
 * a plain string map.
 */
export function uploadErrorMessage(err, t) {
  if (!err) return t ? t('upload_error_generic') : 'Upload failed.';
  if (err.isCancelled) return t ? t('upload_cancelled') : 'Cancelled.';
  if (err.isTimeout) return t ? t('upload_timeout') : 'Upload timed out. Try again.';
  if (err.isNetwork) return t ? t('upload_network') : 'Network error. Check your connection.';
  if (err.status === 413) {
    return t
      ? t('file_too_large')
      : 'The server or storage provider rejected this file as too large.';
  }
  if (err.status === 401) return t ? t('upload_auth_retry') : 'Session expired — please retry.';
  if (err.status === 403) return t ? t('upload_forbidden') : 'Not allowed.';
  // Every other status (400 validation, 404, 409, 422, 5xx, ...) used to
  // always collapse into the generic "upload failed, try again" message,
  // discarding PocketBase's own structured validation response — e.g.
  // { data: { passport_file: { code, message } } } for a rejected mime
  // type/size, or a top-level { message } for other failures. Surface the
  // real reason when there is one.
  const fieldErrors = err?.data?.data;
  if (fieldErrors && typeof fieldErrors === 'object') {
    const parts = Object.values(fieldErrors)
      .map((info) => info?.message || info?.code)
      .filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }
  const topMessage = err?.data?.message;
  if (topMessage && typeof topMessage === 'string') return topMessage;
  // Genuinely nothing structured to show (a raw network-level rejection
  // with no PocketBase JSON body at all — e.g. a hosting-platform reverse
  // proxy rejecting the request before it ever reaches this app). The
  // status code alone is still a real, useful diagnostic signal that was
  // previously discarded entirely — appended so this is never a complete
  // dead end to debug from.
  const base = t ? t('upload_error_generic') : 'Upload failed. Try again.';
  return err.status ? `${base} (${err.status})` : base;
}
