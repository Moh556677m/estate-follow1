import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Search, ArrowLeft, ArrowRight, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import Seo from '@/components/Seo';
import ArticleCard from '@/components/insights/ArticleCard';
import {
  fetchFeatured,
  fetchArticles,
  fetchMostRead,
  fetchCategories,
  articleTitle,
} from '@/lib/insights';
import { fetchInsightsSettings, fetchBannersForPlacement, fetchBannersForSlot, trackBannerEvent, DEFAULT_HOMEPAGE_SECTIONS, HOMEPAGE_SECTION_LABELS } from '@/lib/cms';
import pb from '@/lib/pocketbaseClient';

const InsightsHome = () => {
  const { t, lang, isRtl } = useLanguage();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [featured, setFeatured] = useState(null);
  const [latest, setLatest] = useState([]);
  const [news, setNews] = useState([]);
  const [videos, setVideos] = useState([]);
  const [mostRead, setMostRead] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sections, setSections] = useState(DEFAULT_HOMEPAGE_SECTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [feat, latestRes, newsRes, vidRes, mostRes, cats, settings] = await Promise.all([
          fetchFeatured(),
          fetchArticles({ perPage: 12, sort: '-published_at' }),
          fetchArticles({ perPage: 8, content_type: 'news', sort: '-published_at' }),
          fetchArticles({ perPage: 4, content_type: 'video', sort: '-published_at' }),
          fetchMostRead(10),
          fetchCategories(),
          fetchInsightsSettings(),
        ]);
        if (cancelled) return;
        setFeatured(feat);
        setLatest(latestRes.items || []);
        setNews(newsRes.items || []);
        setVideos(vidRes.items || []);
        setMostRead(mostRes.items || []);
        setCategories(cats || []);
        if (settings?.homepage_sections) setSections(settings.homepage_sections);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    navigate(q ? `/insights/articles?q=${encodeURIComponent(q)}` : '/insights/articles');
  };

  const Arrow = isRtl ? ArrowLeft : ArrowRight;
  const enabled = sections.filter((s) => s.enabled);
  const sectionTitle = (s) => (lang === 'ar' ? (s.title_ar || HOMEPAGE_SECTION_LABELS[s.key]?.ar) : (s.title_en || HOMEPAGE_SECTION_LABELS[s.key]?.en)) || '';
  const limit = (s, fallback) => (s.limit && s.limit > 0 ? s.limit : fallback);

  return (
    <>
      <Helmet>
        <title>{t('brand')} Insights — {t('insights_articles')} و{t('insights_news')}</title>
        <meta name="description" content={t('brand_desc')} />
      </Helmet>
      <Seo title={`${t('brand')} Insights`} description={t('brand_desc')} type="website" />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-14">
        {enabled.map((s) => {
          if (s.key === 'hero') {
            return (
              <section key={s.key} className="border-b bg-gradient-to-b from-primary/5 to-background -mx-4 px-4 py-12 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 sm:py-16 lg:py-20">
                <div className="mx-auto max-w-3xl text-center">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
                    {t('brand')} <span className="text-primary">Insights</span>
                  </h1>
                  <p className="mt-4 text-base sm:text-lg text-muted-foreground">{t('brand_desc')}</p>
                </div>
              </section>
            );
          }
          if (s.key === 'search') {
            return (
              <section key={s.key} className="-mt-8">
                <form onSubmit={onSearch} className="mx-auto flex max-w-2xl items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('insights_search_placeholder')} className="h-12 w-full rounded-xl border bg-background ps-10 pe-4 text-base shadow-sm outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <button type="submit" className="h-12 shrink-0 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{t('insights_search')}</button>
                </form>
              </section>
            );
          }
          if (s.key === 'featured' && featured) {
            return (
              <section key={s.key}>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl sm:text-2xl font-bold">{sectionTitle(s) || t('insights_featured')}</h2>
                </div>
                <ArticleCard article={featured} featured />
              </section>
            );
          }
          if (s.key === 'latest') {
            return (
              <section key={s.key}>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl sm:text-2xl font-bold">{sectionTitle(s) || t('insights_latest')}</h2>
                  <Link to="/insights/articles" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">{t('insights_view_all')} <Arrow size={16} /></Link>
                </div>
                {loading ? (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2,3,4,5].map((i) => <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />)}</div>
                ) : (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{latest.slice(0, limit(s, 6)).map((a) => <ArticleCard key={a.id} article={a} />)}</div>
                )}
              </section>
            );
          }
          if (s.key === 'news' && news.length > 0) {
            return (
              <section key={s.key}>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl sm:text-2xl font-bold">{sectionTitle(s) || t('insights_property_news')}</h2>
                  <Link to="/insights/news" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">{t('insights_view_all')} <Arrow size={16} /></Link>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{news.slice(0, limit(s, 4)).map((a) => <ArticleCard key={a.id} article={a} />)}</div>
              </section>
            );
          }
          if (s.key === 'videos' && videos.length > 0) {
            return (
              <section key={s.key}>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl sm:text-2xl font-bold">{sectionTitle(s) || t('insights_videos')}</h2>
                  <Link to="/insights/videos" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">{t('insights_view_all')} <Arrow size={16} /></Link>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{videos.slice(0, limit(s, 4)).map((a) => <ArticleCard key={a.id} article={a} />)}</div>
              </section>
            );
          }
          if (s.key === 'most_read') {
            return (
              <section key={s.key}>
                <h2 className="mb-5 text-xl sm:text-2xl font-bold flex items-center gap-2"><TrendingUp size={20} className="text-primary" /> {sectionTitle(s) || t('insights_most_read')}</h2>
                <ol className="space-y-3">
                  {mostRead.slice(0, limit(s, 5)).map((a, i) => (
                    <li key={a.id}><Link to={`/insights/article/${a.slug}`} className="group flex gap-3">
                      <span className="text-2xl font-extrabold text-primary/30 leading-none w-7 shrink-0">{i + 1}</span>
                      <span className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{articleTitle(a, lang)}</span>
                    </Link></li>
                  ))}
                </ol>
              </section>
            );
          }
          if (s.key === 'categories' && categories.length > 0) {
            return (
              <section key={s.key}>
                <h2 className="mb-5 text-xl sm:text-2xl font-bold">{sectionTitle(s) || t('insights_by_category')}</h2>
                <div className="flex flex-wrap gap-3">
                  {categories.slice(0, limit(s, 8)).map((c) => (
                    <Link key={c.id} to={`/insights/articles?category=${c.id}`} className="rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-sm hover:border-primary hover:text-primary transition-colors">{lang === 'ar' ? c.name_ar : c.name_en}</Link>
                  ))}
                </div>
              </section>
            );
          }
          if (s.key === 'ads') {
            return <BannerSlot key={s.key} placement="home_hero" />;
          }
          return null;
        })}
      </div>
    </>
  );
};

/** Renders an active banner for a placement (manual image or AdSense). */
const BannerSlot = ({ placement, slot }) => {
  const [banners, setBanners] = useState([]);
  useEffect(() => {
    if (slot) fetchBannersForSlot(slot).then(setBanners).catch(() => {});
    else fetchBannersForPlacement(placement).then(setBanners).catch(() => {});
  }, [placement, slot]);
  if (!banners.length) return null;
  const b = banners[0];
  const imgUrl = b.image ? (() => { try { return pb.files.getURL(b, b.image); } catch { return ''; } })() : '';
  return (
    <section className="rounded-xl border bg-card p-4 text-center">
      {b.ad_type === 'adsense' ? (
        <div className="min-h-[90px] flex items-center justify-center text-xs text-muted-foreground">AdSense: {b.adsense_slot}</div>
      ) : b.link_url ? (
        <a href={b.link_url} target={b.open_new_tab ? '_blank' : undefined} rel="noreferrer" onClick={() => trackBannerEvent(b.id, 'click', placement)} className="block">
          <img src={imgUrl} alt={b.alt_text || b.name} className="mx-auto max-h-[120px] w-full rounded-lg object-cover" loading={b.lazy_load ? 'lazy' : 'eager'} onLoad={() => trackBannerEvent(b.id, 'impression', placement)} />
        </a>
      ) : (
        <img src={imgUrl} alt={b.alt_text || b.name} className="mx-auto max-h-[120px] w-full rounded-lg object-cover" loading={b.lazy_load ? 'lazy' : 'eager'} onLoad={() => trackBannerEvent(b.id, 'impression', placement)} />
      )}
    </section>
  );
};

export default InsightsHome;
