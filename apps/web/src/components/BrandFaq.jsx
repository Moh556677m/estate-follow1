import React from 'react';
import { Helmet } from 'react-helmet';
import { HelpCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useBrandEntity, buildFaqJsonLd } from '@/lib/brandEntity';

/**
 * Public FAQ section — reads the central Brand Entity FAQ (cms.seo_faq),
 * renders the questions/answers for the given page, and injects FAQPage
 * schema.org JSON-LD only when there are real answered questions.
 *
 * `page` filters the FAQ items (e.g. '/about'). Omit to show all.
 */
const BrandFaq = ({ page }) => {
  const { t, lang } = useLanguage();
  const { faq } = useBrandEntity();

  const items = (faq || [])
    .filter((f) => (page ? f.page === page || !f.page : true))
    .filter((f) => (lang === 'ar' ? f.question_ar && f.answer_ar : f.question_en && f.answer_en));

  if (!items.length) return null;

  const jsonLd = buildFaqJsonLd(items, lang);

  return (
    <>
      {jsonLd && (
        <Helmet>
          <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        </Helmet>
      )}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <HelpCircle size={22} className="text-primary" />
          {lang === 'ar' ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}
        </h2>
        <div className="mt-6 space-y-3">
          {items.map((f) => (
            <details key={f.id} className="group rounded-xl border bg-card p-4 shadow-sm">
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold sm:text-base">
                <span>{lang === 'ar' ? f.question_ar : f.question_en}</span>
                <span className="text-muted-foreground transition-transform group-open:rotate-45 text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {lang === 'ar' ? f.answer_ar : f.answer_en}
              </p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
};

export default BrandFaq;
