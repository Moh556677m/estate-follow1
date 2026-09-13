import React, { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import Seo from '@/components/Seo';
import { officialSiteUrl } from '@/lib/siteLogo';
import { fetchPublicPageBySlug } from '@/lib/sitePagesClient';

// Task #22 Site Editor — public renderer for any custom page created in the
// Site Editor admin panel (About / What-is-Estate-Follow keep their own
// hand-authored routes/JSX untouched; this is only for NEW pages the Super
// Admin creates, e.g. /page/pricing, /page/terms).
//
// Unlike AboutPage/WhatIsEstateFollowPage, these pages have no pre-existing
// literal <title>/<meta name="description"> to protect (they didn't exist
// before this task), so their SEO is set dynamically from the record here.

function Block({ block, lang }) {
  if (block.visible === false) return null;
  const isAr = lang === 'ar';
  const heading = isAr ? block.heading_ar : block.heading_en;
  const body = isAr ? block.body_ar : block.body_en;

  if (block.type === 'hero') {
    return (
      <section className="border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 text-center">
          {block.image_url && (
            <img src={block.image_url} alt={heading || ''} className="mx-auto mb-6 max-h-56 rounded-xl object-cover" />
          )}
          {heading && <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{heading}</h1>}
          {body && <p className="mt-4 text-lg text-muted-foreground whitespace-pre-line">{body}</p>}
        </div>
      </section>
    );
  }
  if (block.type === 'text') {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {heading && <h2 className="text-2xl font-bold mb-3">{heading}</h2>}
        {body && <p className="text-base leading-relaxed whitespace-pre-line text-muted-foreground">{body}</p>}
      </section>
    );
  }
  if (block.type === 'image') {
    return (
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        {block.image_url && <img src={block.image_url} alt={body || ''} className="w-full rounded-xl object-cover" />}
        {body && <p className="mt-3 text-center text-sm text-muted-foreground">{body}</p>}
      </section>
    );
  }
  if (block.type === 'cta') {
    const label = isAr ? block.cta_label_ar : block.cta_label_en;
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 text-center">
        {heading && <h2 className="text-2xl font-bold mb-4">{heading}</h2>}
        {block.cta_url && label && (
          <Link
            to={block.cta_url}
            className="inline-flex items-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {label}
          </Link>
        )}
      </section>
    );
  }
  if (block.type === 'faq') {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {heading && <h2 className="text-2xl font-bold mb-4">{heading}</h2>}
        <div className="space-y-4">
          {(block.faq_items || []).map((item, idx) => (
            <div key={idx} className="rounded-lg border p-4">
              <p className="font-semibold">{isAr ? item.q_ar : item.q_en}</p>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{isAr ? item.a_ar : item.a_en}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return null;
}

const SitePageView = () => {
  const { slug } = useParams();
  const { lang } = useLanguage();
  const [page, setPage] = useState(undefined); // undefined = loading, null = not found
  const isAr = lang === 'ar';

  useEffect(() => {
    let cancelled = false;
    setPage(undefined);
    fetchPublicPageBySlug(slug).then((rec) => {
      if (!cancelled) setPage(rec || null);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (page === undefined) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }
  if (page === null) {
    return <Navigate to="/about" replace />;
  }

  const title = (isAr ? page.title_ar : page.title_en) || slug;
  const metaTitle = (isAr ? page.meta_title_ar : page.meta_title_en) || title;
  const metaDesc = (isAr ? page.meta_description_ar : page.meta_description_en) || '';
  const blocks = (page.blocks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        {metaDesc && <meta name="description" content={metaDesc} />}
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={officialSiteUrl(`/page/${slug}`)} />
      </Helmet>
      <Seo title={metaTitle} description={metaDesc} image={page.og_image_url} url={officialSiteUrl(`/page/${slug}`)} />
      {blocks.length === 0 ? (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">{title}</div>
      ) : (
        blocks.map((b) => <Block key={b.id} block={b} lang={lang} />)
      )}
    </>
  );
};

export default SitePageView;
