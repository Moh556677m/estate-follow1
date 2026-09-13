import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, User } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  articleTitle,
  articleDescription,
  coverUrl,
  authorPhotoUrl,
  contentTypeLabel,
  countryLabel,
  formatDateLong,
} from '@/lib/insights';
import { cn } from '@/lib/utils';

const TYPE_COLORS = {
  article: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  news: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  guide: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  legal_update: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  video: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  photo_article: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  official_statement: 'bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200',
};

const ArticleCard = ({ article, featured = false }) => {
  const { t, lang } = useLanguage();
  if (!article) return null;
  const title = articleTitle(article, lang);
  const desc = articleDescription(article, lang);
  const img = coverUrl(article);
  const author = article.expand?.author;
  const cat = article.expand?.category;
  const readTime = article.read_time || 1;
  const typeColor = TYPE_COLORS[article.content_type] || TYPE_COLORS.article;

  if (featured) {
    return (
      <Link
        to={`/insights/article/${article.slug}`}
        className="group relative block overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <div className="grid md:grid-cols-2">
          <div className="relative aspect-[16/10] md:aspect-auto overflow-hidden bg-muted">
            {img ? (
              <img
                src={img}
                alt={title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <MapPin size={40} />
              </div>
            )}
            <span className={cn('absolute top-4 start-4 rounded-full px-3 py-1 text-xs font-semibold', typeColor)}>
              {contentTypeLabel(article.content_type, t)}
            </span>
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-8">
            {cat && (
              <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                {lang === 'ar' ? cat.name_ar : cat.name_en}
              </p>
            )}
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight group-hover:text-primary transition-colors">
              {title}
            </h2>
            {desc && <p className="mt-3 text-sm sm:text-base text-muted-foreground line-clamp-3">{desc}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {author && (
                <span className="flex items-center gap-1.5">
                  {authorPhotoUrl(author) ? (
                    <img src={authorPhotoUrl(author)} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <User size={14} />
                  )}
                  {author.name}
                </span>
              )}
              {article.country && <span className="flex items-center gap-1"><MapPin size={14} />{countryLabel(article.country, t)}</span>}
              <span className="flex items-center gap-1"><Clock size={14} />{readTime} {t('insights_min_read')}</span>
              {article.published_at && <span>{formatDateLong(article.published_at, lang)}</span>}
            </div>
            <span className="mt-5 inline-flex w-fit items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              {t('insights_read_article')}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/insights/article/${article.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {img ? (
          <img
            src={img}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <MapPin size={32} />
          </div>
        )}
        <span className={cn('absolute top-3 start-3 rounded-full px-2.5 py-1 text-[11px] font-semibold', typeColor)}>
          {contentTypeLabel(article.content_type, t)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        {cat && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary mb-1.5">
            {lang === 'ar' ? cat.name_ar : cat.name_en}
          </p>
        )}
        <h3 className="font-bold leading-snug tracking-tight line-clamp-2 group-hover:text-primary transition-colors">
          {title}
        </h3>
        {desc && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{desc}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {author && <span className="flex items-center gap-1"><User size={12} />{author.name}</span>}
          {article.country && <span className="flex items-center gap-1"><MapPin size={12} />{countryLabel(article.country, t)}</span>}
          <span className="flex items-center gap-1"><Clock size={12} />{readTime} {t('insights_min_read')}</span>
        </div>
        {article.published_at && (
          <p className="mt-2 text-[11px] text-muted-foreground">{formatDateLong(article.published_at, lang)}</p>
        )}
      </div>
    </Link>
  );
};

export default ArticleCard;
