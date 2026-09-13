// Insights SEO endpoints: sitemap.xml, news-sitemap.xml, rss.xml
// Queries published articles from PocketBase and emits XML. Public read.
import { Router } from 'express';

const router = Router();

const PB_BASE = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const SITE_ORIGIN = process.env.WEBSITE_URL || process.env.WEBSITE_DOMAIN || 'https://estatefollow.com';

const escapeXml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

async function fetchPublished(perPage = 500) {
  const url = `${PB_BASE}/api/collections/insights_articles/records?filter=${encodeURIComponent("status='published'")}&perPage=${perPage}&sort=-published_at&fields=id,title_ar,title_en,slug,published_at,updated,description_ar,description_en,content_type,country,indexable`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PocketBase ${res.status}`);
  const json = await res.json();
  return json.items || [];
}

router.get('/sitemap.xml', async (_req, res) => {
  try {
    const items = await fetchPublished();
    const urls = [
      `${SITE_ORIGIN}/`,
      `${SITE_ORIGIN}/about`,
      `${SITE_ORIGIN}/what-is-estate-follow`,
      `${SITE_ORIGIN}/insights`,
      `${SITE_ORIGIN}/insights/articles`,
      `${SITE_ORIGIN}/insights/news`,
      `${SITE_ORIGIN}/insights/videos`,
      `${SITE_ORIGIN}/insights/guides`,
      `${SITE_ORIGIN}/insights/countries`,
      `${SITE_ORIGIN}/insights/about`,
      `${SITE_ORIGIN}/insights/contact`,
    ];
    const staticUrls = urls
      .map((u) => `  <url><loc>${escapeXml(u)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`)
      .join('\n');
    const articleUrls = items
      .filter((a) => a.indexable !== false)
      .map(
        (a) =>
          `  <url><loc>${escapeXml(`${SITE_ORIGIN}/insights/article/${a.slug}`)}</loc><lastmod>${(a.updated || a.published_at || '').slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`,
      )
      .join('\n');
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticUrls}\n${articleUrls}\n</urlset>`);
  } catch (e) {
    res.status(500).send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

router.get('/news-sitemap.xml', async (_req, res) => {
  try {
    const items = await fetchPublished();
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
    const news = items
      .filter((a) => a.indexable !== false && a.content_type === 'news' && new Date(a.published_at || 0) >= twoDaysAgo)
      .map(
        (a) =>
          `  <url><loc>${escapeXml(`${SITE_ORIGIN}/insights/article/${a.slug}`)}</loc><news:news><news:publication><news:name>${escapeXml('Estate Follow Insights')}</news:name><news:language>ar</news:language></news:publication><news:publication_date>${a.published_at}</news:publication_date><news:title>${escapeXml(a.title_ar || a.title_en)}</news:title></news:news></url>`,
      )
      .join('\n');
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${news}\n</urlset>`);
  } catch {
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"></urlset>');
  }
});

router.get('/rss.xml', async (_req, res) => {
  try {
    const items = await fetchPublished(20);
    const channel = items
      .map(
        (a) =>
          `    <item><title>${escapeXml(a.title_ar || a.title_en)}</title><link>${escapeXml(`${SITE_ORIGIN}/insights/article/${a.slug}`)}</link><guid isPermaLink="true">${escapeXml(`${SITE_ORIGIN}/insights/article/${a.slug}`)}</guid><pubDate>${new Date(a.published_at || Date.now()).toUTCString()}</pubDate><description>${escapeXml(a.description_ar || a.description_en || '')}</description></item>`,
      )
      .join('\n');
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${escapeXml('Estate Follow Insights')}</title><link>${escapeXml(SITE_ORIGIN)}/insights</link><description>${escapeXml('Real estate articles, news and guides')}</description><language>ar</language>\n${channel}\n  </channel></rss>`);
  } catch {
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Estate Follow Insights</title></channel></rss>`);
  }
});

export default router;
