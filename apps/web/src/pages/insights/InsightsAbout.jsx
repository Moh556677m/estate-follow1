import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Building2, Target, Eye, Users, Mail } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import Seo from '@/components/Seo';

const InsightsAbout = () => {
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';

  const services = isAr
    ? [
        { title: 'إدارة العقارات', desc: 'تتبّع عقاراتك الجاهزة وتحت الإنشاء والإيجارية من مكان واحد.' },
        { title: 'الأقساط والمدفوعات', desc: 'متابعة الأقساط والإيجارات والشيكات وتذكيرات الدفع.' },
        { title: 'التنبيهات والمتابعة', desc: 'تنبيهات بمواعيد الأقساط والإيجارات وانتهاء العقود وتقويم عقاراتك.' },
        { title: 'المحتوى العقاري', desc: 'مقالات وأخبار وأدلة تساعد الملاك والمستثمرين على اتخاذ قرارات أفضل.' },
      ]
    : [
        { title: 'Property Management', desc: 'Track your ready, off-plan and rented properties in one place.' },
        { title: 'Installments & Payments', desc: 'Follow installments, rents, cheques and payment reminders.' },
        { title: 'Alerts & Follow-up', desc: 'Alerts for installment, rent and contract expiry dates plus a property calendar.' },
        { title: 'Real Estate Content', desc: 'Articles, news and guides that help owners and investors make better decisions.' },
      ];

  return (
    <>
      <Helmet>
        <title>{t('insights_about')} — {t('brand')} Insights</title>
        <meta name="description" content={t('brand_desc')} />
      </Helmet>
      <Seo title={t('insights_about')} description={t('brand_desc')} />

      <section className="border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Building2 size={26} strokeWidth={1.8} />
          </span>
          <h1 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight">{t('insights_about_title')}</h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">{t('brand_desc')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-12">
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Target size={20} className="text-primary" /> {isAr ? 'خدماتنا' : 'Our Services'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((s) => (
              <div key={s.title} className="rounded-xl border bg-card p-5 shadow-sm">
                <p className="font-semibold">{s.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Eye size={20} className="text-primary" /> {isAr ? 'رؤيتنا' : 'Our Vision'}</h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {isAr
              ? 'أن نكون المنصة العربية الأولى التي تجمع بين إدارة العقارات والمحتوى العقاري الموثوق، بحيث يجد المالك والمستثمر كل ما يحتاجه في مكان واحد.'
              : 'To be the leading platform that brings property management and trusted real estate content together, so owners and investors find everything they need in one place.'}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Users size={20} className="text-primary" /> {isAr ? 'جمهورنا' : 'Our Audience'}</h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {isAr
              ? 'أصحاب العقارات، المستثمرون، الوسطاء، وشركات الوساطة في الإمارات ومصر وجورجيا ودول أخرى.'
              : 'Property owners, investors, brokers and brokerage companies across the UAE, Egypt, Georgia and beyond.'}
          </p>
        </section>

        <div className="rounded-2xl border bg-primary/5 p-8 text-center">
          <h2 className="text-xl font-bold">{isAr ? 'تواصل معنا' : 'Get in touch'}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{isAr ? 'هل لديك سؤال أو اقتراح؟ نحن هنا لمساعدتك.' : 'Have a question or suggestion? We are here to help.'}</p>
          <Link to="/insights/contact" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Mail size={16} /> {t('insights_contact')}
          </Link>
        </div>
      </div>
    </>
  );
};

export default InsightsAbout;
