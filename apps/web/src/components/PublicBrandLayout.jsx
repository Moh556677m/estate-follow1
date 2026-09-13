import React, { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/AppLayout';
import { useBrandEntity, brandName, brandLogo } from '@/lib/brandEntity';
import { cn } from '@/lib/utils';

/**
 * Public brand layout for Estate Follow's top-level public pages
 * (/about, /what-is-estate-follow). Header + footer read the central Brand
 * Entity so the official name, logo and identity are never hardcoded.
 */
// Renders the real uploaded brand logo (falling back to the official static
// logo, and finally to a generic icon only if the image URL itself fails to
// load — e.g. a stale/broken reference) instead of the hardcoded Building2
// icon this layout previously always showed regardless of what was uploaded.
function BrandMark({ brand, name }) {
  const [broken, setBroken] = useState(false);
  const logoSrc = brandLogo(brand);
  if (broken || !logoSrc) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 size={18} strokeWidth={1.8} />
      </span>
    );
  }
  return (
    <img
      src={logoSrc}
      alt={name}
      className="h-9 w-9 shrink-0 rounded-lg object-contain"
      onError={() => setBroken(true)}
    />
  );
}

const PublicBrandLayout = () => {
  const { t, lang, isRtl } = useLanguage();
  const { brand } = useBrandEntity();
  const name = brandName(brand, lang);

  return (
    <div className="flex min-h-[100svh] flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <BrandMark brand={brand} name={name} />
            <div className="leading-tight">
              <p className="font-bold text-sm sm:text-base">{name}</p>
              <p className="text-[10px] text-muted-foreground">{t('tagline')}</p>
            </div>
          </Link>
          <div className={cn('flex flex-1 items-center justify-end gap-2', isRtl && 'flex-row-reverse')}>
            <LanguageSwitcher />
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 min-h-[40px]"
            >
              {t('insights_login_cta')}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 border-t bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <BrandMark brand={brand} name={name} />
              <div>
                <p className="font-bold">{name}</p>
                <p className="text-xs text-muted-foreground">{t('tagline')}</p>
              </div>
            </div>
            <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <Link to="/about" className="hover:text-primary">{t('insights_about')}</Link>
              <Link to="/what-is-estate-follow" className="hover:text-primary">{lang === 'ar' ? 'ما هي إستيت فولو' : 'What is Estate Follow'}</Link>
              <Link to="/insights" className="hover:text-primary">{t('brand')} Insights</Link>
              <Link to="/login" className="hover:text-primary">{t('insights_login_cta')}</Link>
            </nav>
          </div>
          <div className="mt-8 border-t pt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} {name}. {lang === 'ar' ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicBrandLayout;
