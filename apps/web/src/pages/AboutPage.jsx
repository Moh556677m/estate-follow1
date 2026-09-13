import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Building2, Target, Users, CheckCircle2, ArrowRight } from 'lucide-react';
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
  brandAudience,
} from '@/lib/brandEntity';

const AboutPage = () => {
  const { t, lang, isRtl } = useLanguage();
  const isAr = lang === 'ar';
  const { brand } = useBrandEntity();
  // Task #22 Site Editor: optional Super-Admin social-preview override
  // (og:/twitter: tags only — never the literal <title>/<meta
  // name="description"> below, which the llms.txt build step reads from
  // source and must stay literal).
  const seoOverride = useCorePageSeoOverride('/about', lang);

  const name = brandName(brand, lang);
  const longDesc = brandLongDesc(brand, lang);
  const shortDesc = brandShortDesc(brand, lang);
  const services = brandServices(brand, lang);
  const audience = brandAudience(brand, lang);

  const seoTitle = isAr
    ? `من نحن | ${brandName(brand, 'ar')} — منصة ذكية لإدارة العقارات`
    : `About ${brandName(brand, 'en')} — Smart Property Management Platform`;
  const seoDesc = shortDesc;

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={officialSiteUrl('/about')} />
      </Helmet>
      <Seo
        title={seoOverride.title || seoTitle}
        description={seoOverride.description || seoDesc}
        image={seoOverride.image}
        url={officialSiteUrl('/about')}
      />

      {/* Hero — official definition first */}
      <section className="border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Building2 size={26} strokeWidth={1.8} />
          </span>
          <h1 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight">
            {isAr ? `من نحن | ${name}` : `About ${name}`}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {longDesc}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* What is Estate Follow */}
        <section className="py-12">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Building2 size={20} className="text-primary" />
            {isAr ? `ما هي ${name}؟` : `What is ${name}?`}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{longDesc}</p>
        </section>

        {/* Who is it for */}
        <section className="py-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Users size={20} className="text-primary" />
            {isAr ? 'من تستهدف؟' : 'Who is it for?'}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{audience}</p>
        </section>

        {/* Services */}
        <section className="py-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Target size={20} className="text-primary" />
            {isAr ? 'الخدمات' : 'Services'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <div key={s} className="flex items-start gap-2.5 rounded-xl border bg-card p-4 shadow-sm">
                <CheckCircle2 size={18} className="text-primary mt-0.5 shrink-0" />
                <span className="text-sm font-medium">{s}</span>
              </div>
            ))}
          </div>
        </section>

        {/* How it helps owners */}
        <section className="py-6 space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Target size={20} className="text-primary" />
            {isAr ? 'كيف تساعد؟' : 'How it helps'}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                title: isAr ? 'إدارة كل عقاراتك من مكان واحد' : 'All your properties in one place',
                body: isAr
                  ? 'إدارة العقارات الجاهزة وتحت الإنشاء والإيجارية، متابعة الأقساط والإيجارات والمدفوعات، حفظ العقود والمستندات، وتنبيهات الاستحقاق — من مكان واحد.'
                  : 'Manage ready, off-plan and rental properties, track installments, rents and payments, store contracts and documents, and get due-date reminders — all in one place.',
              },
              {
                title: isAr ? 'متابعة ذكية وتنبيهات تلقائية' : 'Smart follow-up & automatic alerts',
                body: isAr
                  ? 'تقويم عقاراتك، تنبيهات بمواعيد الأقساط والإيجارات وانتهاء العقود، وتقارير محدّثة لحظيًا لمحفظتك العقارية.'
                  : 'A property calendar, alerts for installment, rent and contract expiry dates, and live reports for your real estate portfolio.',
              },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border bg-card p-5 shadow-sm">
                <p className="font-semibold">{c.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="my-12 rounded-2xl border bg-primary/5 p-8 text-center">
          <h2 className="text-xl font-bold">{isAr ? 'ابدأ معنا' : 'Get started'}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{shortDesc}</p>
          <Link
            to="/signup"
            className={`mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 ${isRtl ? 'flex-row-reverse' : ''}`}
          >
            {t('insights_login_cta')} <ArrowRight size={16} className={isRtl ? 'rotate-180' : ''} />
          </Link>
        </div>
      </div>

      <BrandFaq page="/about" />
    </>
  );
};

export default AboutPage;
