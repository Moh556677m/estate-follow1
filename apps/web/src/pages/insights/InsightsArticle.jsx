import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  Clock,
  MapPin,
  User,
  Calendar,
  Edit3,
  Link2,
  MessageSquare,
  Send,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import Seo from '@/components/Seo';
import { officialSiteUrl } from '@/lib/siteLogo';
import ArticleCard from '@/components/insights/ArticleCard';
import {
  fetchArticleBySlug,
  fetchRelated,
  fetchComments,
  submitComment,
  trackView,
  articleTitle,
  articleDescription,
  articleContent,
  coverUrl,
  authorPhotoUrl,
  contentTypeLabel,
  formatDateLong,
  extractHeadings,
  estimateReadTime,
  fetchSpamConfig,
  detectSpam,
  commentRateLimit,
} from '@/lib/insights';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import pb from '@/lib/pocketbaseClient';

const ShareBar = ({ article }) => {
  const { t, isRtl } = useLanguage();
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const title = articleTitle(article, isRtl ? 'ar' : 'en');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const share = (platform) => {
    const u = encodeURIComponent(url);
    const ti = encodeURIComponent(title);
    const map = {
      whatsapp: `https://wa.me/?text=${ti}%20${u}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      x: `https://twitter.com/intent/tweet?text=${ti}&url=${u}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    };
    if (platform === 'native' && navigator.share) {
      navigator.share({ title, url }).catch(() => {});
      return;
    }
    window.open(map[platform], '_blank', 'noopener,noreferrer,width=600,height=500');
  };

  const btn = 'inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-card text-sm font-medium hover:bg-accent transition-colors';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-muted-foreground me-1">{t('insights_share')}:</span>
      <button onClick={copy} className={btn} aria-label={t('insights_copy_link')} title={t('insights_copy_link')}>
        <Link2 size={16} /> {copied && <span className="ms-1 text-xs text-primary">{t('insights_link_copied')}</span>}
      </button>
      <button onClick={() => share('whatsapp')} className={btn} aria-label="WhatsApp" title="WhatsApp">WhatsApp</button>
      <button onClick={() => share('facebook')} className={btn} aria-label="Facebook" title="Facebook">Facebook</button>
      <button onClick={() => share('x')} className={btn} aria-label="X" title="X">X</button>
      <button onClick={() => share('linkedin')} className={btn} aria-label="LinkedIn" title="LinkedIn">LinkedIn</button>
      {typeof navigator !== 'undefined' && navigator.share && (
        <button onClick={() => share('native')} className={btn} aria-label="Share" title="Share">
          <Send size={16} />
        </button>
      )}
    </div>
  );
};

const CommentsSection = ({ articleId }) => {
  const { t } = useLanguage();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', body: '', website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [spamCfg, setSpamCfg] = useState({ enabled: true, blockedWords: [] });

  const load = () => {
    fetchComments(articleId)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetchSpamConfig().then(setSpamCfg).catch(() => {});
  }, [articleId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.body.trim()) {
      setError(t('insights_your_comment'));
      return;
    }
    // Honeypot: hidden "website" field — bots fill it, humans don't.
    if (form.website.trim()) {
      setError(t('something_wrong'));
      return;
    }
    // Rate limiting (client-side, per article).
    if (spamCfg.enabled && !commentRateLimit(articleId)) {
      setError(t('insights_comment_rate_limit') || 'Too many comments. Please try again later.');
      return;
    }
    // Spam detection (blocked words + link flood).
    if (spamCfg.enabled) {
      const check = detectSpam(`${form.name} ${form.body}`, spamCfg.blockedWords);
      if (check.spam) {
        setError(t('insights_comment_spam') || 'Your comment was flagged as spam.');
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      await submitComment({ article: articleId, name: form.name, email: form.email, body: form.body });
      setDone(true);
      setForm({ name: '', email: '', body: '', website: '' });
    } catch {
      setError(t('something_wrong'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-12 border-t pt-8">
      <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
        <MessageSquare size={20} className="text-primary" /> {t('insights_comments')} ({comments.length})
      </h2>

      <form onSubmit={submit} className="rounded-xl border bg-card p-5 space-y-3">
        {/* Honeypot field — hidden from real users via sr-only + aria-hidden */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
          <label>Website (leave empty)
            <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('insights_your_name')}</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" required />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('insights_your_email')}</label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" required />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('insights_your_comment')}</label>
          <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} className="mt-1" required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {done && <p className="text-sm text-primary">{t('insights_comment_pending')}</p>}
        <Button type="submit" disabled={submitting} className="min-h-[44px]">
          {submitting ? t('loading') : t('insights_submit_comment')}
        </Button>
      </form>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{/* no comments yet */}</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{c.name}</p>
                <p className="text-xs text-muted-foreground">{formatDateLong(c.created, 'en')}</p>
              </div>
              <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">{c.body}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

/** Fixed top reading-progress bar — fills as the reader scrolls the article. */
const ReadingProgress = () => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const scrollTop = el.scrollTop || document.body.scrollTop;
      const scrollHeight = (el.scrollHeight || document.body.scrollHeight) - el.clientHeight;
      setProgress(scrollHeight > 0 ? Math.min(100, (scrollTop / scrollHeight) * 100) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className="fixed top-0 inset-x-0 z-[60] h-1 bg-transparent pointer-events-none" aria-hidden="true">
      <div
        className="h-full bg-primary transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

const ArticleDetail = () => {
  const { slug } = useParams();
  const { t, lang } = useLanguage();
  const [article, setArticle] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const a = await fetchArticleBySlug(slug);
        if (cancelled) return;
        if (!a) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setArticle(a);
        setLoading(false);
        trackView(a.id);
        fetchRelated(a, 4).then((r) => { if (!cancelled) setRelated(r); });
      } catch {
        if (!cancelled) setNotFound(true);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const headings = useMemo(() => extractHeadings(articleContent(article, lang)), [article, lang]);

  if (notFound) return <Navigate to="/insights/articles" replace />;

  return (
    <>
      {article && (
        <>
          <Helmet>
            <title>{(lang === 'ar' ? article.seo_title_ar : article.seo_title_en) || articleTitle(article, lang)} — {t('brand')} Insights</title>
            <meta name="description" content={(lang === 'ar' ? article.meta_description_ar : article.meta_description_en) || articleDescription(article, lang)} />
            {article.indexable === false && <meta name="robots" content="noindex,nofollow" />}
            {article.canonical && <link rel="canonical" href={officialSiteUrl(article.canonical)} />}
          </Helmet>
          <Seo
            title={(lang === 'ar' ? article.seo_title_ar : article.seo_title_en) || articleTitle(article, lang)}
            description={(lang === 'ar' ? article.meta_description_ar : article.meta_description_en) || articleDescription(article, lang)}
            image={coverUrl(article) || undefined}
            type="article"
          />
          {/* Article schema */}
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'NewsArticle',
              headline: articleTitle(article, lang),
              image: coverUrl(article) ? [coverUrl(article)] : undefined,
              datePublished: article.published_at || article.created,
              dateModified: article.updated,
              author: article.expand?.author ? { '@type': 'Person', name: article.expand.author.name } : { '@type': 'Organization', name: t('brand') },
              publisher: { '@type': 'Organization', name: t('brand') },
              description: articleDescription(article, lang),
            })}
          </script>
        </>
      )}

      {loading ? (
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <div className="h-8 w-2/3 animate-pulse rounded bg-muted mb-4" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted mb-8" />
          <div className="aspect-[16/9] animate-pulse rounded-xl bg-muted mb-8" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-muted" />)}
          </div>
        </div>
      ) : article ? (
        <article>
          <ReadingProgress />
          {/* Breadcrumb */}
          <div className="border-b bg-muted/20">
            <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6 text-xs text-muted-foreground">
              <Link to="/insights" className="hover:text-primary">{t('insights_home')}</Link>
              <span className="mx-1">/</span>
              <Link to="/insights/articles" className="hover:text-primary">{t('insights_articles')}</Link>
              <span className="mx-1">/</span>
              <span className="text-foreground/70 line-clamp-1 inline-block max-w-[200px] align-bottom">{articleTitle(article, lang)}</span>
            </div>
          </div>

          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            {/* Header */}
            <header className="mb-6">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {contentTypeLabel(article.content_type, t)}
                </span>
                {article.expand?.category && (
                  <Link to={`/insights/articles?category=${article.expand.category.id}`} className="rounded-full border px-3 py-1 text-xs font-medium hover:text-primary">
                    {lang === 'ar' ? article.expand.category.name_ar : article.expand.category.name_en}
                  </Link>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">
                {articleTitle(article, lang)}
              </h1>
              {articleDescription(article, lang) && (
                <p className="mt-4 text-lg text-muted-foreground">{articleDescription(article, lang)}</p>
              )}

              {/* Meta row */}
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {article.expand?.author && (
                  <span className="flex items-center gap-2">
                    {authorPhotoUrl(article.expand.author) ? (
                      <img src={authorPhotoUrl(article.expand.author)} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary"><User size={14} /></span>
                    )}
                    <span className="font-medium text-foreground/80">{article.expand.author.name}</span>
                  </span>
                )}
                {article.published_at && (
                  <span className="flex items-center gap-1.5"><Calendar size={15} /> {formatDateLong(article.published_at, lang)}</span>
                )}
                {article.updated && article.updated !== article.published_at && article.updated !== article.created && (
                  <span className="flex items-center gap-1.5"><Edit3 size={15} /> {t('insights_updated')} {formatDateLong(article.updated, lang)}</span>
                )}
                {article.country && (
                  <span className="flex items-center gap-1.5"><MapPin size={15} /> {article.country}</span>
                )}
                <span className="flex items-center gap-1.5"><Clock size={15} /> {article.read_time || estimateReadTime(articleContent(article, lang))} {t('insights_min_read')}</span>
              </div>
            </header>

            {/* Cover image */}
            {coverUrl(article) && (
              <div className="mb-8 overflow-hidden rounded-xl">
                <img src={coverUrl(article)} alt={articleTitle(article, lang)} className="w-full aspect-[16/9] object-cover" />
              </div>
            )}

            {/* Embed video */}
            {article.embed_video && (
              <div className="mb-8 aspect-video overflow-hidden rounded-xl" dangerouslySetInnerHTML={{ __html: article.embed_video }} />
            )}
            {article.video_url && !article.embed_video && (
              <div className="mb-8 aspect-video overflow-hidden rounded-xl">
                <iframe src={article.video_url} title={articleTitle(article, lang)} className="h-full w-full" allowFullScreen frameBorder="0" />
              </div>
            )}

            {/* TOC for long articles */}
            {headings.length >= 3 && (
              <details className="mb-8 rounded-xl border bg-muted/30 p-4" open>
                <summary className="cursor-pointer font-semibold text-sm">{t('insights_toc')}</summary>
                <ol className="mt-3 space-y-1.5 text-sm">
                  {headings.map((h) => (
                    <li key={h.id} style={{ paddingInlineStart: h.level === 3 ? '1.25rem' : 0 }}>
                      <a href={`#${h.id}`} className="text-muted-foreground hover:text-primary">{h.text}</a>
                    </li>
                  ))}
                </ol>
              </details>
            )}

            {/* Content */}
            <div
              className="ef-article-content prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-primary prose-img:rounded-xl"
              dangerouslySetInnerHTML={{ __html: articleContent(article, lang) || articleContent(article, lang === 'ar' ? 'en' : 'ar') }}
            />

            {/* Gallery images */}
            {article.images && article.images.length > 0 && (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {article.images.map((img) => (
                  <img key={img} src={pb.files.getURL(article, img)} alt="" className="w-full rounded-xl object-cover" loading="lazy" />
                ))}
              </div>
            )}

            {/* Sources */}
            {article.sources && Array.isArray(article.sources) && article.sources.length > 0 && (
              <div className="mt-10 rounded-xl border bg-muted/30 p-5">
                <h2 className="font-bold mb-3">{t('insights_sources')}</h2>
                <ul className="space-y-1.5 text-sm">
                  {article.sources.map((s, i) => (
                    <li key={i} className="text-muted-foreground">
                      {typeof s === 'string' ? (s.startsWith('http') ? <a href={s} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{s}</a> : s) : JSON.stringify(s)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Share */}
            <div className="mt-8 border-t pt-6">
              <ShareBar article={article} />
            </div>

            {/* Comments */}
            <CommentsSection articleId={article.id} />
          </div>

          {/* Related */}
          {related.length > 0 && (
            <section className="border-t bg-muted/20">
              <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
                <h2 className="text-xl sm:text-2xl font-bold mb-6">{t('insights_related')}</h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {related.map((a) => <ArticleCard key={a.id} article={a} />)}
                </div>
              </div>
            </section>
          )}
        </article>
      ) : null}
    </>
  );
};

export default ArticleDetail;
