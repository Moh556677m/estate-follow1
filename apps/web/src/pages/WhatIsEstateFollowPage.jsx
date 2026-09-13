import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { HelpCircle, Building2, CheckCircle2, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import Seo from '@/components/Seo';
import { officialSiteUrl } from '@/lib/siteLogo';
import BrandFaq from '@/components/BrandFaq';
import { useCorePageSeoOverride } from '@/lib/sitePagesSeoHook';
import {
  useBrandEntity,
  brandName,
  brandLongDesc,
  brandShortDesc,
  brandServices,
} from '@/lib/brandEntity';

const WhatIsEstateFollowPage = () => {
  const { t, lang, isRtl } = useLanguage();
  const isAr = lang === 'ar';
  const { brand } = useBrandEntity();
  // Task #22 Site Editor: optional Super-Admin social-preview override
  // (og:/twitter: tags only — never the literal <title>/<meta
  // name="description"> below, which the llms.txt build step reads from
  // source and must stay literal).
  const seoOverride = useCorePageSeoOverride('/what-is-estate-follow', lang);

  const name = brandName(brand, lang);
  const longDesc = brandLongDesc(brand, lang);
  const shortDesc = brandShortDesc(brand, lang);
  const services = brandServices(brand, lang);

  const seoTitle = isAr
    ? `ما هي ${brandName(brand, 'ar')}؟ خدمات ذكية لإدارة العقارات`
    : `What is ${brandName(brand, 'en')}? Smart Services for Property Owners`;
  const seoDesc = isAr
    ? `ما هي ${name}، لمن هي، وكيف تساعد الملاك والمستثمرين على إدارة العقارات والأقساط والإيجارات والمستندات.`
    : `What is ${name}, who it is for, and how it helps property owners and investors manage properties, installments, rentals and documents.`;

  const qa = isAr
    ? [
        {
          q: `ما هي ${name}؟`,
          a: longDesc,
        },
        {
          q: 'لمن هي Estate Follow؟',
          a: 'لأصحاب العقارات والمستثمرين الذين يديرون محافظ عقارية (جاهزة، تحت الإنشاء، وإيجارية).',
        },
        {
          q: 'ما الخدمات التي تقدمها Estate Follow؟',
          a: 'إدارة المحفظة العقارية، متابعة العقارات والأقساط والإيجارات، تذكيرات المدفوعات، إدارة العقود والمستندات، تقويم العقارات، والتنبيهات والمتابعة.',
        },
        {
          q: 'كيف تساعد Estate Follow الملاك؟',
          a: 'تتيح للملاك إدارة عقاراتهم ومتابعة الأقساط والإيجارات والمدفوعات والعقود والمستندات والتنبيهات من مكان واحد.',
        },
        {
          q: 'هل تصلح Estate Follow لإدارة أنواع عقارات متعددة؟',
          a: 'نعم، تدعم المنصة العقارات الجاهزة، والعقارات تحت الإنشاء (على الخارطة)، والعقارات الإيجارية — مع بيانات المستأجرين والعقود والشيكات وتذكيرات الاستحقاق.',
        },
      ]
    : [
        {
          q: `What is ${name}?`,
          a: longDesc,
        },
        {
          q: 'Who is Estate Follow for?',
          a: 'Property owners and investors managing real estate portfolios (ready, off-plan and rental).',
        },
        {
          q: 'What services does Estate Follow provide?',
          a: 'Property portfolio management, property and installment tracking, rental management, payment reminders, contract and document management, property calendar, and alerts and follow-up.',
        },
        {
          q: 'How does Estate Follow help property owners?',
          a: 'Owners can manage their properties and track installments, rentals, payments, contracts, documents and reminders from one place.',
        },
        {
          q: 'Can Estate Follow manage multiple property types?',
          a: 'Yes, the platform supports ready properties, off-plan properties, and rented properties — including tenant data, contracts, cheques and due-date reminders.',
        },
      ];

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={officialSiteUrl('/what-is-estate-follow')} />
      </Helmet>
      <Seo
        title={seoOverride.title || seoTitle}
        description={seoOverride.description || seoDesc}
        image={seoOverride.image}
        url={officialSiteUrl('/what-is-estate-follow')}
      />

      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <HelpCircle size={26} strokeWidth={1.8} />
          </span>
          <h1 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight">
            {isAr ? `ما هي ${name}؟` : `What is ${name}?`}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {shortDesc}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Q&A blocks — answers real questions clearly, no keyword stuffing */}
        <section className="py-12 space-y-6">
          {qa.map((item, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="text-base sm:text-lg font-bold flex items-start gap-2">
                <Building2 size={18} className="text-primary mt-1 shrink-0" />
                {item.q}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
            </div>
          ))}
        </section>

        {/* Services list */}
        <section className="py-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <CheckCircle2 size={20} className="text-primary" />
            {isAr ? 'الخدمات' : 'Services'}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <li key={s} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <div className="my-12 rounded-2xl border bg-primary/5 p-8 text-center">
          <h2 className="text-xl font-bold">{isAr ? 'جرّب Estate Follow' : 'Try Estate Follow'}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{shortDesc}</p>
          <Link
            to="/signup"
            className={`mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 ${isRtl ? 'flex-row-reverse' : ''}`}
          >
            {t('insights_login_cta')} <ArrowRight size={16} className={isRtl ? 'rotate-180' : ''} />
          </Link>
        </div>
      </div>

      <BrandFaq page="/what-is-estate-follow" />
    </>
  );
};

export default WhatIsEstateFollowPage;
