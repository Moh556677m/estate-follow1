import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Building2, Menu, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/AppLayout';
import { fetchHeaderMenu, fetchFooterMenu, fetchInsightsSettings } from '@/lib/cms';
import { cn } from '@/lib/utils';

const FALLBACK_NAV = [
  { to: '/insights', labelKey: 'insights_home', end: true },
  { to: '/insights/articles', labelKey: 'insights_articles' },
  { to: '/insights/news', labelKey: 'insights_news' },
  { to: '/insights/guides', labelKey: 'insights_guides' },
  { to: '/insights/videos', labelKey: 'insights_videos' },
  { to: '/insights/about', labelKey: 'insights_about' },
  { to: '/insights/contact', labelKey: 'insights_contact' },
];

export const InsightsHeader = ({ onSearch }) => {
  const { t, lang, isRtl } = useLanguage();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [navItems, setNavItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    fetchHeaderMenu().then((items) => {
      if (items && items.length) {
        setNavItems(items.map((m) => ({ to: m.url, label: lang === 'ar' ? (m.label_ar || m.label_en) : (m.label_en || m.label_ar), open_new_tab: !!m.open_new_tab })));
      } else {
        setNavItems(FALLBACK_NAV.map((n) => ({ to: n.to, label: t(n.labelKey), end: n.end })));
      }
    }).catch(() => setNavItems(FALLBACK_NAV.map((n) => ({ to: n.to, label: t(n.labelKey), end: n.end }))));
    fetchInsightsSettings().then(setSettings).catch(() => {});
  }, [lang, t]);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const siteName = settings ? (lang === 'ar' ? (settings.site_name_ar || settings.site_name_en) : (settings.site_name_en || settings.site_name_ar)) : null;

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        scrolled ? 'shadow-sm' : '',
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/insights" className="flex shrink-0 items-center gap-2.5">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt={siteName || 'Estate Follow'} className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 size={18} strokeWidth={1.8} />
            </span>
          )}
          <div className="leading-tight">
            <p className="font-bold text-sm sm:text-base">{siteName || t('brand')}</p>
            <p className="text-[10px] text-muted-foreground">Insights</p>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 mx-2">
          {navItems.map((item, i) => (
            <NavLink
              key={item.to + i}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-primary bg-primary/10' : 'text-foreground/70 hover:text-foreground hover:bg-accent',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={cn('flex flex-1 items-center justify-end gap-2', isRtl && 'flex-row-reverse')}>
          <LanguageSwitcher />
          <Link
            to="/login"
            className="hidden sm:inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 min-h-[40px]"
          >
            {t('insights_login_cta')}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t bg-background">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-3 sm:px-6">
            {navItems.map((item, i) => (
              <NavLink
                key={item.to + i}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-3 text-sm font-medium min-h-[44px] flex items-center',
                    isActive ? 'text-primary bg-primary/10' : 'text-foreground/80 hover:bg-accent',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Link
              to="/login"
              className="mt-2 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground min-h-[48px]"
            >
              {t('insights_login_cta')}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
};

export const InsightsFooter = () => {
  const { t, lang } = useLanguage();
  const [footerItems, setFooterItems] = useState([]);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetchFooterMenu().then(setFooterItems).catch(() => {});
    fetchInsightsSettings().then(setSettings).catch(() => {});
  }, []);

  const siteName = settings ? (lang === 'ar' ? (settings.site_name_ar || settings.site_name_en) : (settings.site_name_en || settings.site_name_ar)) : null;
  const footerText = settings ? (lang === 'ar' ? (settings.footer_text_ar || settings.footer_text_en) : (settings.footer_text_en || settings.footer_text_ar)) : t('brand_desc');
  const copyright = settings?.copyright_text || `© ${new Date().getFullYear()} ${t('brand')} Insights`;

  return (
    <footer className="mt-16 border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt={siteName || 'Estate Follow'} className="h-9 w-9 rounded-lg object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Building2 size={18} strokeWidth={1.8} />
                </span>
              )}
              <div>
                <p className="font-bold">{siteName ? `${siteName} Insights` : `${t('brand')} Insights`}</p>
                <p className="text-xs text-muted-foreground">{t('tagline')}</p>
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">{footerText}</p>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3">{t('insights_articles')}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/insights/articles" className="hover:text-primary">{t('insights_articles')}</Link></li>
              <li><Link to="/insights/news" className="hover:text-primary">{t('insights_news')}</Link></li>
              <li><Link to="/insights/videos" className="hover:text-primary">{t('insights_videos')}</Link></li>
              <li><Link to="/insights/guides" className="hover:text-primary">{t('insights_guides')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3">{t('brand')}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {footerItems.length > 0 ? footerItems.map((m, i) => (
                <li key={i}><Link to={m.url} className="hover:text-primary">{lang === 'ar' ? (m.label_ar || m.label_en) : (m.label_en || m.label_ar)}</Link></li>
              )) : (
                <>
                  <li><Link to="/insights/about" className="hover:text-primary">{t('insights_about')}</Link></li>
                  <li><Link to="/insights/contact" className="hover:text-primary">{t('insights_contact')}</Link></li>
                  <li><Link to="/login" className="hover:text-primary">{t('insights_login_cta')}</Link></li>
                  <li><Link to="/editor/login" className="hover:text-primary">{t('editor_portal')}</Link></li>
                </>
              )}
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t pt-6 text-center text-xs text-muted-foreground">{copyright}</div>
      </div>
    </footer>
  );
};

const InsightsLayout = ({ children }) => {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background">
      <InsightsHeader />
      <main className="flex-1">{children || <Outlet />}</main>
      <InsightsFooter />
    </div>
  );
};

export default InsightsLayout;
