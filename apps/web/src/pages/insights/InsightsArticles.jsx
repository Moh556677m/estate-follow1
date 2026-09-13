import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import Seo from '@/components/Seo';
import ArticleCard from '@/components/insights/ArticleCard';
import {
  fetchArticles,
  fetchCategories,
  CONTENT_TYPES,
  contentTypeLabel,
} from '@/lib/insights';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ArticlesListPage = ({ fixedType, pageTitle, pageDescription, seoTitle }) => {
  const { t, lang } = useLanguage();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState(params.get('q') || '');
  const [category, setCategory] = useState(params.get('category') || 'all');
  const [contentType, setContentType] = useState(fixedType || params.get('type') || 'all');
  const [sort, setSort] = useState(params.get('sort') || '-published_at');
  const [showFilters, setShowFilters] = useState(false);

  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  // Sync URL params when filters change.
  useEffect(() => {
    const next = {};
    if (search) next.q = search;
    if (category !== 'all') next.category = category;
    if (contentType !== 'all') next.type = contentType;
    if (sort !== '-published_at') next.sort = sort;
    setParams(next, { replace: true });
    setPage(1);
  }, [search, category, contentType, sort, setParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetchArticles({
          page,
          perPage: 12,
          sort,
          search: search.trim(),
          category: category !== 'all' ? category : '',
          content_type: contentType !== 'all' ? contentType : '',
        });
        if (cancelled) return;
        setItems(res.items || []);
        setTotalPages(res.totalPages || 1);
        setTotalItems(res.totalItems || 0);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [search, category, contentType, sort, page]);

  const clearFilters = () => {
    setSearch('');
    setCategory('all');
    setContentType(fixedType || 'all');
    setSort('-published_at');
  };

  const hasFilters = search || category !== 'all' || contentType !== 'all';

  return (
    <>
      <Helmet>
        <title>{seoTitle || pageTitle} — {t('brand')} Insights</title>
        <meta name="description" content={pageDescription || t('brand_desc')} />
      </Helmet>
      <Seo title={pageTitle} description={pageDescription} type="website" />

      <div className="border-b bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <nav className="text-xs text-muted-foreground mb-2">
            <Link to="/insights" className="hover:text-primary">{t('insights_home')}</Link>
            <span className="mx-1">/</span>
            <span>{pageTitle}</span>
          </nav>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{pageTitle}</h1>
          {pageDescription && <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{pageDescription}</p>}

          {/* Search + filter toggle */}
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('insights_search_placeholder')}
                className="h-11 w-full rounded-lg border bg-background ps-10 pe-4 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                'inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium',
                showFilters ? 'border-primary text-primary' : 'bg-background',
              )}
            >
              <SlidersHorizontal size={16} /> {t('insights_filter_category')}
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 rounded-lg border bg-background p-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('insights_filter_category')}</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('insights_all')}</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!fixedType && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t('insights_filter_type')}</label>
                  <Select value={contentType} onValueChange={setContentType}>
                    <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('insights_all')}</SelectItem>
                      {CONTENT_TYPES.map((ct) => (
                        <SelectItem key={ct} value={ct}>{contentTypeLabel(ct, t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('insights_filter_date')}</label>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-published_at">{lang === 'ar' ? 'الأحدث' : 'Newest'}</SelectItem>
                    <SelectItem value="published_at">{lang === 'ar' ? 'الأقدم' : 'Oldest'}</SelectItem>
                    <SelectItem value="-views">{lang === 'ar' ? 'الأكثر قراءة' : 'Most read'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasFilters && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1 text-sm text-destructive hover:underline self-end">
                  <X size={14} /> {lang === 'ar' ? 'مسح الفلاتر' : 'Clear filters'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="mb-6 text-sm text-muted-foreground">{totalItems} {lang === 'ar' ? 'مقال' : 'articles'}</p>
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-muted-foreground">{t('insights_no_results')}</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-10 rounded-lg border px-4 text-sm disabled:opacity-40"
            >
              {lang === 'ar' ? 'السابق' : 'Prev'}
            </button>
            <span className="px-3 text-sm text-muted-foreground">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-10 rounded-lg border px-4 text-sm disabled:opacity-40"
            >
              {lang === 'ar' ? 'التالي' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default ArticlesListPage;
