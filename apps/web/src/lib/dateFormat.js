/**
 * Central date parse/format for the whole app.
 * Storage (API / PocketBase): YYYY-MM-DD
 * Display (UI): DD/MM/YYYY
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_RE = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/;

function clampIso(y, m, d) {
  const yi = Number(y);
  const mi = Number(m);
  const di = Number(d);
  if (!yi || mi < 1 || mi > 12 || di < 1 || di > 31) return '';
  const dt = new Date(Date.UTC(yi, mi - 1, di));
  if (dt.getUTCFullYear() !== yi || dt.getUTCMonth() !== mi - 1 || dt.getUTCDate() !== di) {
    return '';
  }
  return `${yi}-${String(mi).padStart(2, '0')}-${String(di).padStart(2, '0')}`;
}

/** Normalize any common date string → YYYY-MM-DD or ''. Never invents. */
export function toIsoDate(raw) {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return clampIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  let s = String(raw).trim();
  if (!s) return '';
  // Arabic-Indic digits → Latin
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  // Strip time portion
  if (s.includes('T') || s.includes(' ')) s = s.slice(0, 10).replace(' ', '');

  let m = s.match(ISO_RE);
  if (m) return clampIso(+m[1], +m[2], +m[3]);

  m = s.match(DMY_RE);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    // Prefer DMY (MENA). If first > 12 treat as day.
    if (a > 12 && b <= 12) return clampIso(y, b, a);
    if (b > 12 && a <= 12) return clampIso(y, a, b);
    // Ambiguous: assume DD/MM/YYYY
    if (a <= 31 && b <= 12) return clampIso(y, b, a);
  }

  // Compact YYYYMMDD
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return clampIso(+m[1], +m[2], +m[3]);

  // Broken patterns like "252026/06/" or "25/06/2026extra"
  m = s.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    if (a <= 31 && b <= 12) return clampIso(y, b, a);
  }
  m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return clampIso(+m[1], +m[2], +m[3]);

  return '';
}

/** Display format DD/MM/YYYY from ISO or any parseable input. */
export function formatDisplayDate(raw) {
  const iso = toIsoDate(raw);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Alias used across payment-plan UI. */
export function formatPlanDateDisplay(raw) {
  const out = formatDisplayDate(raw);
  return out || (raw ? '' : '');
}

/**
 * Parse a typed display string (DD/MM/YYYY or DD-MM-YYYY) → ISO or null.
 */
export function parseDisplayDate(str) {
  const s = String(str || '').trim();
  if (!s) return '';
  const iso = toIsoDate(s);
  return iso || null;
}

export function isoToLocalDate(iso) {
  const s = toIsoDate(iso);
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function localDateToIso(date) {
  if (!date || Number.isNaN(date.getTime?.() ?? NaN)) return '';
  return clampIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Display format for a full timestamp (date + time), e.g. system-health
 * "last event at" / notification "created at" columns. `formatDate` above
 * intentionally drops time-of-day (it only ever needs to show a day), so it
 * is the wrong helper for these — this is the shared alternative for call
 * sites that previously each had their own raw `new Date(x).toLocaleString()`
 * (no shared empty-value fallback, inconsistent locale argument between
 * call sites). Never invents a value: returns '—' for anything unparsable.
 */
export function formatDateTime(value, lang) {
  if (value == null || value === '') return '—';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(lang === 'ar' ? 'ar' : 'en-GB');
  } catch {
    return '—';
  }
}
