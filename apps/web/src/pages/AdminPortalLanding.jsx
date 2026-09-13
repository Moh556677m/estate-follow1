import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Lock, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/AppLayout';
import { isStaff } from '@/lib/permissions';
import AuthPageSeo from '@/components/AuthPageSeo';
import pb from '@/lib/pocketbaseClient';

// Public, indexable landing page for the Admin & Staff Portal at /admin.
// Simple and secure: portal name/slogan + a single "Sign in" CTA to /admin/login.
// Authenticated staff are redirected straight to the console.
function useAdminPortalBranding() {
  const [brand, setBrand] = useState(null);
  useEffect(() => {
    const read = () => {
      const ap = window.__EF_CMS__?.admin_portal;
      if (ap && typeof ap === 'object') setBrand(ap);
    };
    read();
    const onCms = () => read();
    window.addEventListener('estatefollow-cms-updated', onCms);
    pb
      .send('/ef/admin-portal-branding', { method: 'GET' })
      .then((res) => {
        if (res?.portal) setBrand(res.portal);
      })
      .catch(() => {});
    return () => window.removeEventListener('estatefollow-cms-updated', onCms);
  }, []);
  return brand || {};
}

const AdminPortalLanding = () => {
  const { user } = useAuth();
  const { t, lang, isRtl } = useLanguage();
  const navigate = useNavigate();
  const brand = useAdminPortalBranding();

  // Authenticated staff skip the landing and go to the console.
  useEffect(() => {
    if (user && isStaff(user)) navigate('/admin/overview', { replace: true });
  }, [user, navigate]);

  const portalName = lang === 'ar' ? brand.name_ar || t('admin_portal_landing_title') : brand.name_en || t('admin_portal_landing_title');
  const slogan = lang === 'ar' ? brand.slogan_ar || t('admin_portal_landing_subtitle') : brand.slogan_en || t('admin_portal_landing_subtitle');
  const logoUrl = brand.logo_url || '';

  const Arrow = ArrowRight;

  return (
    <div className="min-h-[100svh] w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <AuthPageSeo pageKey="admin-portal" path="/admin" />

      {/* Ambient security-themed background */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-32 -start-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -end-32 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-6 sm:p-8 space-y-6 text-center">
          <div className="flex flex-col items-center space-y-3">
            {logoUrl ? (
              <img src={logoUrl} alt={portalName} className="h-14 w-auto" loading="lazy" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                <ShieldCheck size={28} strokeWidth={1.8} />
              </span>
            )}
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{portalName}</h1>
              <p className="text-sm text-slate-400 max-w-xs mx-auto">{slogan}</p>
            </div>
          </div>

          <div className="space-y-3">
            <Link to="/admin/login">
              <Button type="button" className="w-full min-h-[48px] text-base font-semibold">
                <ShieldCheck size={18} />
                {t('admin_portal_landing_enter')}
                <Arrow size={16} className={isRtl ? 'rotate-180' : ''} />
              </Button>
            </Link>
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
              <Building2 size={14} />
              {t('admin_portal_landing_back')}
            </Link>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <Lock size={12} />
            {t('admin_portal_secure_note')}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-600">{t('admin_portal_authorized_only')}</p>
      </div>
    </div>
  );
};

export default AdminPortalLanding;
