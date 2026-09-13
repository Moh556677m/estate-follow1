// Estate Follow Insights — CMS helpers.
// Audit logging, settings single-record fetch/save, banner event tracking,
// and homepage section defaults. Used by the Super Admin Content Management
// panel and the public Insights portal.
import pb from '@/lib/pocketbaseClient';

/** Default homepage section order (mirrors the seeded insights_settings row). */
export const DEFAULT_HOMEPAGE_SECTIONS = [
  { key: 'hero', enabled: true, title_ar: '', title_en: '', limit: 1 },
  { key: 'search', enabled: true, title_ar: '', title_en: '', limit: 0 },
  { key: 'featured', enabled: true, title_ar: 'المقال المميز', title_en: 'Featured Article', limit: 1 },
  { key: 'latest', enabled: true, title_ar: 'أحدث المقالات', title_en: 'Latest Articles', limit: 8 },
  { key: 'news', enabled: true, title_ar: 'أخبار العقارات', title_en: 'Property News', limit: 6 },
  { key: 'categories', enabled: true, title_ar: 'حسب التصنيف', title_en: 'By Category', limit: 8 },
  { key: 'videos', enabled: true, title_ar: 'فيديوهات', title_en: 'Videos', limit: 4 },
  { key: 'most_read', enabled: true, title_ar: 'الأكثر قراءة', title_en: 'Most Read', limit: 5 },
  { key: 'ads', enabled: false, title_ar: '', title_en: '', limit: 0 },
];

export const HOMEPAGE_SECTION_LABELS = {
  hero: { ar: 'البطل (Hero)', en: 'Hero' },
  search: { ar: 'البحث', en: 'Search' },
  featured: { ar: 'المقال المميز', en: 'Featured Article' },
  latest: { ar: 'أحدث المقالات', en: 'Latest Articles' },
  news: { ar: 'الأخبار', en: 'News' },
  categories: { ar: 'التصنيفات', en: 'Categories' },
  videos: { ar: 'الفيديوهات', en: 'Videos' },
  most_read: { ar: 'الأكثر قراءة', en: 'Most Read' },
  recommended: { ar: 'موصى به', en: 'Recommended' },
  ads: { ar: 'إعلانات', en: 'Ads' },
};

/** Fetch the single insights_settings row (creates nothing on the public side). */
export async function fetchInsightsSettings() {
  try {
    const list = await pb.collection('insights_settings').getFullList({ sort: 'created' });
    return list[0] || null;
  } catch {
    return null;
  }
}

/** Fetch visible header menu items. */
export async function fetchHeaderMenu() {
  try {
    return await pb.collection('insights_menu_items').getFullList({
      filter: "location = 'header' && visible = true",
      sort: 'order',
    });
  } catch {
    return [];
  }
}

/** Fetch visible footer menu items. */
export async function fetchFooterMenu() {
  try {
    return await pb.collection('insights_menu_items').getFullList({
      filter: "location = 'footer' && visible = true",
      sort: 'order',
    });
  } catch {
    return [];
  }
}

/** Fetch active banners for a placement (public). Respects scheduling + status. */
export async function fetchBannersForPlacement(placement) {
  try {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return await pb.collection('insights_banners').getFullList({
      filter: `placement = "${placement}" && status = 'active' && (start_date = "" || start_date <= "${now}") && (end_date = "" || end_date >= "${now}")`,
      sort: '-priority,-created',
    });
  } catch {
    return [];
  }
}

/** Fetch active banners for a custom slot name (public). */
export async function fetchBannersForSlot(slot) {
  try {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return await pb.collection('insights_banners').getFullList({
      filter: `placement = 'custom_slot' && custom_slot = "${slot}" && status = 'active' && (start_date = "" || start_date <= "${now}") && (end_date = "" || end_date >= "${now}")`,
      sort: '-priority,-created',
    });
  } catch {
    return [];
  }
}

/** Log a banner impression or click (fire-and-forget, public create allowed). */
export function trackBannerEvent(bannerId, event, placement = '') {
  if (!bannerId || !event) return;
  let readerId = '';
  try {
    readerId = localStorage.getItem('ef_reader_id') || '';
    if (!readerId) {
      readerId = 'r_' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('ef_reader_id', readerId);
    }
  } catch { /* ignore */ }
  const device = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
    ? 'mobile' : 'desktop';
  pb.collection('insights_banner_events')
    .create({ banner: bannerId, event, placement, reader_id: readerId, device }, { requestKey: `be-${bannerId}-${event}-${Date.now()}` })
    .catch(() => {});
  // Best-effort increment counter on the banner record.
  const field = event === 'click' ? 'clicks' : 'impressions';
  pb.collection('insights_banners')
    .update(bannerId, { [field]: 1 }, { requestKey: `binc-${bannerId}-${field}-${Date.now()}` })
    .catch(() => {});
}

/** Write an audit-log entry (fire-and-forget). */
export function logAudit(action, entity = '', entity_id = '', details = {}) {
  const rec = pb.authStore.record;
  const actor = rec?.name || rec?.email || 'system';
  const actorEmail = rec?.email || '';
  pb.collection('insights_audit_log')
    .create({ actor, actor_email: actorEmail, action, entity, entity_id, details }, { requestKey: `audit-${action}-${Date.now()}` })
    .catch(() => {});
}

/** Detect device type from user agent. */
export function detectDevice() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Build a date-range filter fragment for PocketBase `created` field. */
export function dateRangeFilter(range, customStart, customEnd) {
  const now = new Date();
  let start = null;
  switch (range) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7days':
      start = new Date(now.getTime() - 7 * 86400000);
      break;
    case '30days':
      start = new Date(now.getTime() - 30 * 86400000);
      break;
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'this_year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'custom':
      if (customStart) start = new Date(customStart);
      break;
    case 'all_time':
    default:
      return '';
  }
  if (!start) return '';
  const s = start.toISOString().replace('T', ' ').slice(0, 19);
  let f = `created >= "${s}"`;
  if (range === 'custom' && customEnd) {
    const e = new Date(customEnd + 'T23:59:59').toISOString().replace('T', ' ').slice(0, 19);
    f += ` && created <= "${e}"`;
  }
  return f;
}
