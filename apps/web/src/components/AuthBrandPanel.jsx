import React from 'react';
import { Building2, Home, Wallet, CalendarClock, FileText } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

/** Pick the slogan / description / subline key for a given account type. */
function brandKeys(accountType) {
  return {
    slogan: 'brand_slogan',
    desc: 'brand_desc',
    subline: 'brand_subline',
  };
}

/** Desktop right-side brand panel (mint/green, no photo). */
export function AuthBrandPanel({ accountType } = {}) {
  const { t } = useLanguage();
  const keys = brandKeys(accountType);

  return (
    <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-b from-secondary to-background px-10 py-10 xl:px-12 xl:py-12">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden="true">
        <div className="absolute -top-10 -end-10 h-72 w-72 rounded-full border-[3px] border-primary" />
        <div className="absolute top-1/3 -start-16 h-56 w-56 rounded-full border-[3px] border-primary" />
        <div className="absolute bottom-10 end-1/4 h-40 w-40 rounded-2xl border-[3px] border-primary rotate-12" />
      </div>

      {/* Slogan block sits higher for balance with the form */}
      <div className="relative flex flex-col items-center text-center pt-6 xl:pt-10">
        <span className="flex h-20 w-20 xl:h-24 xl:w-24 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-xl shadow-primary/25">
          <Building2 size={46} strokeWidth={1.6} />
        </span>
        <p className="mt-5 text-2xl font-bold tracking-tight text-foreground">{t('brand')}</p>
        <h2 className="mt-3 text-3xl font-extrabold leading-tight text-primary xl:text-4xl max-w-md">
          {t(keys.slogan)}
        </h2>
        <p className="mt-3 max-w-md text-base text-muted-foreground">{t(keys.desc)}</p>
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          {t(keys.subline)}
        </p>
      </div>

      <div className="relative grid grid-cols-4 gap-3 mt-8">
        {[
          { icon: Home, label: t('nav_properties') },
          { icon: Wallet, label: t('nav_payments') },
          { icon: CalendarClock, label: t('nav_installments') },
          { icon: FileText, label: t('nav_documents') },
        ].map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-2 py-4 text-center backdrop-blur-sm"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Icon size={20} strokeWidth={1.6} />
            </span>
            <span className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact mobile slogan above the form (icons live in the page footer). */
export function AuthMobileBrand({ accountType } = {}) {
  const { t } = useLanguage();
  const keys = brandKeys(accountType);

  return (
    <div className="lg:hidden flex flex-col items-center text-center pt-4 pb-2">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
        <Building2 size={34} strokeWidth={1.6} />
      </span>
      <p className="mt-3 text-lg font-bold tracking-tight text-foreground">{t('brand')}</p>
      <h2 className="mt-3 max-w-xs text-2xl font-extrabold leading-[1.45] text-primary">
        {t(keys.slogan)}
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">{t(keys.desc)}</p>
      {/* Keep subline on its own clear line — never clipped or overlapped */}
      <p className="mt-4 px-2 text-[13px] font-semibold leading-relaxed tracking-wide text-primary sm:text-sm">
        {t(keys.subline)}
      </p>
    </div>
  );
}

/** Four feature icons for the mobile auth footer (next to Support & Help). */
export function AuthMobileFeatureRow() {
  const { t } = useLanguage();
  const features = [
    { icon: Wallet, label: t('nav_payments') },
    { icon: Home, label: t('nav_properties') },
    { icon: FileText, label: t('nav_documents') },
    { icon: CalendarClock, label: t('nav_installments') },
  ];

  return (
    <div className="grid w-full max-w-sm grid-cols-4 gap-0 mx-auto">
      {features.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex min-w-0 flex-col items-center gap-1 px-0.5 text-center"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Icon size={15} strokeWidth={1.6} />
          </span>
          <span className="text-[9px] font-medium leading-4 text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

/** Support hint for auth pages — never exposes the support mailbox. */
export function AuthSupportLink() {
  const { t } = useLanguage();

  return (
    <p className="text-sm text-muted-foreground text-start">
      {t('auth_need_help')}{' '}
      <span className="font-semibold text-primary">{t('auth_support_after_login')}</span>
    </p>
  );
}

export default AuthBrandPanel;
