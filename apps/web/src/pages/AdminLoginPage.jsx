import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff, Lock, Mail, Loader2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/AppLayout';
import { isStaff } from '@/lib/permissions';
import AuthPageSeo from '@/components/AuthPageSeo';
import pb from '@/lib/pocketbaseClient';
import { verifyRecaptcha } from '@/lib/recaptcha';

// Reads Admin Portal branding stored in platform_settings.cms.admin_portal.
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
    // Fallback: fetch public admin-portal branding (no auth required).
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

const AdminLoginPage = () => {
  const { login, logout } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const brand = useAdminPortalBranding();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const portalName =
    lang === 'ar'
      ? brand.name_ar || 'بوابة الإدارة'
      : brand.name_en || 'Admin & Staff Portal';
  const slogan =
    lang === 'ar'
      ? brand.slogan_ar || 'بوابة الإدارة والموظفين — وصول آمن للمخوّلين فقط.'
      : brand.slogan_en ||
        'Administration & staff portal — secure access for authorized personnel only.';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // TEMP DEBUG (remove): pinpointing a CI-only hang before /admin/overview.
    console.error('[EFDEBUG] handleSubmit start', Date.now());
    // reCAPTCHA v3 — verify the user is human before attempting a staff sign-in.
    const captcha = await verifyRecaptcha('login');
    console.error('[EFDEBUG] recaptcha resolved', Date.now(), JSON.stringify(captcha));
    if (!captcha.ok) {
      setLoading(false);
      setError(
        captcha.reason === 'recaptcha_error' ? t('recaptcha_error') : t('recaptcha_blocked'),
      );
      return;
    }
    try {
      // Tags this request as coming from the admin portal so PocketBase's
      // own login hook (pb_hooks/portal-login-separation.pb.js) rejects it
      // server-side if the account turns out to be a regular owner — not
      // just via the isStaff() check below, which only runs after a
      // successful PocketBase auth.
      console.error('[EFDEBUG] calling login()', Date.now());
      await login(email, password, { portal: 'admin' });
      console.error('[EFDEBUG] login() returned', Date.now());
      const rec = pb.authStore.record;
      if (!isStaff(rec)) {
        // A regular owner/broker/company tried to use the admin portal.
        await logout();
        setError(t('admin_portal_not_authorized'));
        setLoading(false);
        return;
      }
      console.error('[EFDEBUG] navigating', Date.now());
      navigate('/admin/overview', { replace: true });
    } catch (err) {
      console.error('[EFDEBUG] caught error', Date.now(), err?.code, err?.message);
      const code = err?.code || '';
      if (code === 'ACCOUNT_SUSPENDED') setError(t('err_account_suspended'));
      else if (code === 'ACCOUNT_INACTIVE') setError(t('err_account_inactive'));
      else if (code === 'ACCOUNT_PENDING') setError(t('admin_portal_not_authorized'));
      else if (code === 'OWNER_PORTAL_ONLY') setError(t('admin_portal_not_authorized'));
      else if (code === 'MAX_SESSIONS' || code === 'MAX_DEVICES') setError(t('err_max_sessions'));
      else if (code === 'INVALID_CREDENTIALS') setError(t('err_invalid_credentials'));
      // AUTH_ERROR/SESSION_ERROR are NOT credential failures (e.g. a shared
      // rate limit, a transient network/proxy error) — showing them as
      // "incorrect email or password" here was misleading staff into
      // thinking correct credentials were wrong. Previously this whole
      // branch fell through to err_invalid_credentials unconditionally.
      else if (code === 'AUTH_ERROR' || code === 'SESSION_ERROR') setError(t('something_wrong'));
      else setError(t('err_invalid_credentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <AuthPageSeo pageKey="admin-portal" path="/admin/login" noindex />
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

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-6 sm:p-8 space-y-6">
          {/* Header / logo */}
          <div className="flex flex-col items-center text-center space-y-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <ShieldCheck size={28} strokeWidth={1.8} />
            </span>
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {portalName}
              </h1>
              <p className="text-sm text-slate-400 max-w-xs mx-auto">{slogan}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email" className="text-slate-200">
                {t('email')}
              </Label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500"
                />
                <Input
                  id="admin-email"
                  type="email"
                  dir="ltr"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-[48px] ps-10 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-password" className="text-slate-200">
                {t('password')}
              </Label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500"
                />
                <Input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-[48px] ps-10 pe-11 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('hide') : t('show')}
                  className="absolute top-1/2 -translate-y-1/2 end-2 flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="remember"
                className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none"
              >
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(!!v)}
                />
                {t('admin_remember_me')}
              </label>
              <Link
                to="/admin/forgot-password"
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('forgot_password')}
              </Link>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-900/30 px-3 py-2.5 text-sm text-amber-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full min-h-[48px] text-base font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {t('loading')}
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  {t('admin_portal_signin')}
                </>
              )}
            </Button>
          </form>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <Lock size={12} />
            {t('admin_portal_secure_note')}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-600">
          {t('admin_portal_authorized_only')}
        </p>
      </div>
    </div>
  );
};

export default AdminLoginPage;
