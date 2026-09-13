// Insights data helpers — fetch published articles, categories, authors,
// comments, ad settings, and track views. All public reads use the PocketBase
// SDK directly; access rules enforce published-only for anonymous visitors.
import pb from '@/lib/pocketbaseClient';

export const CONTENT_TYPES = [
  'article',
  'news',
  'guide',
  'legal_update',
  'video',
  'photo_article',
  'official_statement',
];

export const ARTICLE_STATUSES = [
  'draft',
  'in_review',
  'scheduled',
  'published',
  'unpublished',
  'archived',
];

// Countries surfaced in the portal (ISO code -> label keys).
export const INSIGHTS_COUNTRIES = [
  { code: 'AE', key: 'insights_country_uae' },
  { code: 'EG', key: 'insights_country_egypt' },
  { code: 'GE', key: 'insights_country_georgia' },
  { code: 'SA', key: 'insights_country_saudi' },
  { code: 'QA', key: 'insights_country_qatar' },
];

/** Build a filter string for published articles with optional search/filters.
 *  Country/city are intentionally NOT exposed as filters in Insights (per
 *  product decision — no Country section or Country Filter in the content
 *  system). The DB fields remain for optional editorial use only. */
export function buildArticleFilter({
  search = '',
  content_type = '',
  category = '',
} = {}) {
  const parts = ["status = 'published'"];
  if (content_type) parts.push(`content_type = "${content_type}"`);
  if (category) parts.push(`category = "${category}"`);
  if (search) {
    const q = search.replace(/"/g, '');
    parts.push(
      `(title_ar ~ "${q}" || title_en ~ "${q}" || description_ar ~ "${q}" || description_en ~ "${q}" || content_ar ~ "${q}" || content_en ~ "${q}")`,
    );
  }
  return parts.join(' && ');
}

/** Fetch a single published article by slug (with expand). */
export async function fetchArticleBySlug(slug) {
  const list = await pb.collection('insights_articles').getList(1, 1, {
    filter: `slug = "${slug}" && status = 'published'`,
    expand: 'category,author,related_articles',
  });
  return list.items?.[0] || null;
}

/** Fetch published articles list with filters + expand. */
export async function fetchArticles(options = {}) {
  const {
    page = 1,
    perPage = 12,
    sort = '-published_at',
    expand = 'category,author',
    ...filters
  } = options;
  return pb.collection('insights_articles').getList(page, perPage, {
    filter: buildArticleFilter(filters),
    sort,
    expand,
  });
}

/** Featured = most viewed published article (fallback to latest). */
export async function fetchFeatured() {
  try {
    const list = await pb.collection('insights_articles').getList(1, 1, {
      filter: "status = 'published'",
      sort: '-views,-published_at',
      expand: 'category,author',
    });
    return list.items?.[0] || null;
  } catch {
    return null;
  }
}

export async function fetchCategories() {
  return pb.collection('insights_categories').getFullList({ sort: 'name_en' });
}

export async function fetchAuthors() {
  return pb.collection('insights_authors').getFullList({ sort: 'name' });
}

export async function fetchMostRead(perPage = 5) {
  return pb.collection('insights_articles').getList(1, perPage, {
    filter: "status = 'published'",
    sort: '-views,-published_at',
    expand: 'category,author',
  });
}

export async function fetchRelated(article, perPage = 4) {
  if (!article) return [];
  const related = article.expand?.related_articles;
  if (related && related.length) return related;
  // fallback: same category, then same content type (no country fallback —
  // Insights has no Country section/filter by design).
  const parts = ["status = 'published'", `id != "${article.id}"`];
  if (article.category) parts.push(`category = "${article.category}"`);
  try {
    const list = await pb.collection('insights_articles').getList(1, perPage, {
      filter: parts.join(' && '),
      sort: '-published_at',
      expand: 'category,author',
    });
    if (list.items && list.items.length) return list.items;
  } catch { /* fall through */ }
  // second fallback: same content type
  try {
    const list2 = await pb.collection('insights_articles').getList(1, perPage, {
      filter: `status = 'published' && id != "${article.id}" && content_type = "${article.content_type || 'article'}"`,
      sort: '-published_at',
      expand: 'category,author',
    });
    return list2.items || [];
  } catch {
    return [];
  }
}

export async function fetchComments(articleId) {
  return pb.collection('insights_comments').getFullList({
    filter: `article = "${articleId}" && status = 'approved'`,
    sort: '-created',
  });
}

export async function submitComment({ article, name, email, body }) {
  return pb.collection('insights_comments').create({
    article,
    name,
    email,
    body,
    status: 'pending',
  });
}

export async function fetchAdSettings() {
  try {
    const list = await pb.collection('insights_ad_settings').getFullList({ sort: 'created' });
    return list[0] || null;
  } catch {
    return null;
  }
}

export async function submitContact({ name, email, subject, message }) {
  return pb.collection('insights_contact_messages').create({
    name,
    email,
    subject,
    message,
    handled: false,
  });
}

/** Track a view (fire-and-forget). Increments article.views + logs a row. */
export function trackView(articleId) {
  if (!articleId) return;
  let readerId = '';
  try {
    readerId = localStorage.getItem('ef_reader_id') || '';
    if (!readerId) {
      readerId = 'r_' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('ef_reader_id', readerId);
    }
  } catch {
    /* ignore */
  }
  // Log view row (public create allowed).
  pb
    .collection('insights_article_views')
    .create({ article: articleId, reader_id: readerId, country: '', source: document.referrer || 'direct' })
    .catch(() => {});
  // Best-effort increment views counter.
  pb
    .collection('insights_articles')
    .update(articleId, { views: 1 }, { requestKey: `view-${articleId}-${Date.now()}` })
    .catch(() => {});
}

/** Resolve a localized title/description for an article given current lang. */
export function localized(article, field, lang) {
  if (!article) return '';
  const ar = article[`${field}_ar`];
  const en = article[`${field}_en`];
  if (lang === 'ar') return ar || en || '';
  return en || ar || '';
}

export function articleTitle(article, lang) {
  return localized(article, 'title', lang);
}

export function articleDescription(article, lang) {
  return localized(article, 'description', lang);
}

export function articleContent(article, lang) {
  return localized(article, 'content', lang);
}

export function coverUrl(article) {
  if (!article?.cover_image) return null;
  try {
    return pb.files.getURL(article, article.cover_image);
  } catch {
    return null;
  }
}

export function authorPhotoUrl(author) {
  if (!author?.photo) return null;
  try {
    return pb.files.getURL(author, author.photo);
  } catch {
    return null;
  }
}

export function imageUrl(record, field) {
  if (!record?.[field]) return null;
  try {
    return pb.files.getURL(record, record[field]);
  } catch {
    return null;
  }
}

/** Estimate read time in minutes from HTML content. */
export function estimateReadTime(html) {
  if (!html) return 1;
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  return Math.max(1, Math.round(words / 200));
}

/** Extract H2/H3 headings from HTML for a table of contents. */
export function extractHeadings(html) {
  if (!html) return [];
  const out = [];
  const re = /<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ level: Number(m[1]), id: m[2], text: m[3].replace(/<[^>]+>/g, '').trim() });
  }
  return out;
}

export function contentTypeLabel(type, t) {
  const map = {
    article: 'ct_article',
    news: 'ct_news',
    guide: 'ct_guide',
    legal_update: 'ct_legal_update',
    video: 'ct_video',
    photo_article: 'ct_photo_article',
    official_statement: 'ct_official_statement',
  };
  return t(map[type] || 'ct_article');
}

export function countryLabel(code, t) {
  const found = INSIGHTS_COUNTRIES.find((c) => c.code === code);
  return found ? t(found.key) : code;
}

/* ============ TEMPLATES ============ */

/** Fetch all article templates (built-in + custom). */
export async function fetchTemplates() {
  try {
    return await pb.collection('insights_templates').getFullList({ sort: 'is_builtin,-created' });
  } catch {
    return [];
  }
}

/** Create a new custom template (Super Admin / Content Manager). */
export async function createTemplate(data) {
  return pb.collection('insights_templates').create({ ...data, is_builtin: false }, { requestKey: `tpl-new-${Date.now()}` });
}

/** Delete a custom template (built-in templates are protected). */
export async function deleteTemplate(id) {
  return pb.collection('insights_templates').delete(id, { requestKey: `tpl-del-${id}` });
}

/* ============ SPAM PROTECTION ============ */

/** Default blocked words list (can be overridden in Insights Settings). */
export const DEFAULT_BLOCKED_WORDS = [
  'viagra', 'casino', 'porn', 'sex', 'loan', 'crypto giveaway',
  'free money', 'bitcoin doubler', 'http://', 'https://',
];

/** Fetch blocked-words config from settings (falls back to defaults). */
export async function fetchSpamConfig() {
  try {
    const list = await pb.collection('insights_settings').getFullList({ sort: 'created' });
    const s = list[0];
    const words = s?.blocked_words;
    let arr = DEFAULT_BLOCKED_WORDS;
    if (words) {
      try { arr = typeof words === 'string' ? JSON.parse(words) : words; } catch { /* keep default */ }
    }
    return { enabled: s?.spam_protection !== false, blockedWords: Array.isArray(arr) ? arr : DEFAULT_BLOCKED_WORDS };
  } catch {
    return { enabled: true, blockedWords: DEFAULT_BLOCKED_WORDS };
  }
}

/** Check a comment body/name for spam. Returns { spam, reason }. */
export function detectSpam(text, blockedWords) {
  const lower = String(text || '').toLowerCase();
  if (lower.length > 5000) return { spam: true, reason: 'too_long' };
  // repeated characters / links flood
  const links = (lower.match(/https?:\/\//g) || []).length;
  if (links > 3) return { spam: true, reason: 'too_many_links' };
  for (const w of blockedWords || []) {
    const word = String(w).toLowerCase().trim();
    if (word && lower.includes(word)) return { spam: true, reason: 'blocked_word' };
  }
  return { spam: false, reason: '' };
}

/** Client-side rate limit: max N submissions per window (ms) per article. */
export function commentRateLimit(articleId, maxPerHour = 3) {
  try {
    const key = `ef_comment_rl_${articleId}`;
    const now = Date.now();
    const raw = localStorage.getItem(key);
    const times = raw ? JSON.parse(raw) : [];
    const recent = times.filter((t) => now - t < 3600000);
    if (recent.length >= maxPerHour) return false;
    recent.push(now);
    localStorage.setItem(key, JSON.stringify(recent));
    return true;
  } catch {
    return true;
  }
}

export function formatDateLong(dateStr, lang) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
