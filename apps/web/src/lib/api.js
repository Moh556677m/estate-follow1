import pb from '@/lib/pocketbaseClient';
import { formatDisplayDate, toIsoDate, formatDateTime } from '@/lib/dateFormat';

export { formatDateTime };

// Protected file URLs require a short-lived file token.
let fileToken = null;
let fileTokenAt = 0;

export async function getFileUrl(record, filename) {
  if (!filename) return null;
  const now = Date.now();
  if (!fileToken || now - fileTokenAt > 90 * 60 * 1000) {
    fileToken = await pb.files.getToken();
    fileTokenAt = now;
  }
  return `${pb.files.getURL(record, filename)}?token=${fileToken}`;
}

export function formatMoney(value, lang) {
  // Unified thousands separators (1,000) for AR + EN — visual only.
  // eslint-disable-next-line no-unused-vars
  const _lang = lang;
  if (value == null || value === '') return '—';
  // Prefer natural-money parse so AI phrases still display correctly if leaked.
  try {
    // Inline to avoid circular imports at module init in some bundles
    const cleaned = String(value)
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/,/g, '')
      .replace(/\s/g, '');
    let n = Number(cleaned);
    if (!Number.isFinite(n)) {
      // fallback: strip non-digits except dot
      const raw = cleaned.replace(/[^\d.-]/g, '');
      n = Number(raw);
    }
    if (!Number.isFinite(n)) return '—';
    const hasFraction = Math.abs(n % 1) > 1e-9;
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: hasFraction ? 2 : 0,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return '—';
  }
}

export function formatDate(value, _lang) {
  if (!value) return '—';
  // Global platform format: DD/MM/YYYY (consistent across AR/EN).
  const iso = toIsoDate(value);
  if (iso) return formatDisplayDate(iso) || '—';
  return '—';
}

export function daysUntil(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(' ', 'T'));
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export function propertyLabel(p) {
  if (!p) return '—';
  return `${p.building} / ${p.unit_number} — ${p.area}`;
}

export function waLink(phone, text) {
  const clean = String(phone || '').replace(/[^0-9]/g, '');
  if (!clean) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}
