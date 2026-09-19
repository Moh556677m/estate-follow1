import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/AppLayout';
import { AuthBrandPanel, AuthMobileFeatureRow } from '@/components/AuthBrandPanel';
import PublicSupportLink from '@/components/PublicSupportLink';
import AuthPageSeo from '@/components/AuthPageSeo';
import pb from '@/lib/pocketbaseClient';
import { verifyRecaptcha } from '@/lib/recaptcha';

const LoginPage = () => {
  const { login, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const accountType = 'owner';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const titleKey = 'login_title_owner';
  const sloganKey = 'brand_slogan';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // reCAPTCHA v3 — verify the user is human before attempting login.
      const captcha = await verifyRecaptcha('login');
      if (!captcha.ok) {
        setError(
          captcha.reason === 'recaptcha_error'
            ? t('recaptcha_error')
            : t('recaptcha_blocked'),
        );
        return;
      }
      // Tags this request as coming from the regular login page so
      // PocketBase's own login hook (pb_hooks/portal-login-separation.pb.js)
      // rejects it server-side if the account turns out to be staff/admin —
      // not just via the isStaff() check below, which only runs after a
      // successful PocketBase auth.
      await login(email, password, { portal: 'user' });

      // Enforce the selected account type — not just a visual change.
      const rec = pb.authStore.record;
      const isStaff =
        !!rec?.is_super_admin ||
        ['admin', 'editor', 'support', 'custom'].includes(rec?.role);
      if (isStaff) {
        // A staff/admin account tried to sign in from the regular user
        // login page — it must only ever be usable from /admin/login.
        await logout();
        setError(t('err_staff_portal_only'));
        setLoading(false);
        return;
      }
      const actual = String(rec?.account_type || 'owner').toLowerCase();
      if (actual !== accountType) {
        await logout();
        setError(t('err_account_type_mismatch'));
        setLoading(false);
        return;
      }

      navigate('/dashboard');
    } catch (err) {
      const code = err?.code || '';
      if (code === 'ACCOUNT_SUSPENDED') setError(t('err_account_suspended'));
      else if (code === 'ACCOUNT_INACTIVE') setError(t('err_account_inactive'));
      else if (code === 'ACCOUNT_PENDING') setError(t('err_invalid_credentials'));
      else if (code === 'STAFF_PORTAL_ONLY') setError(t('err_staff_portal_only'));
      else if (code === 'MAX_SESSIONS' || code === 'MAX_DEVICES') setError(t('err_max_sessions'));
      else if (code === 'SESSION_ERROR') setError(t('something_wrong'));
      else if (code === 'INVALID_CREDENTIALS') setError(t('err_invalid_credentials'));
      else if (code === 'RATE_LIMITED') setError(t('err_rate_limited'));
      else if (code === 'AUTH_ERROR') setError(t('something_wrong'));
      else setError(t('err_invalid_credentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] grid lg:grid-cols-2 bg-background">
      <AuthPageSeo pageKey="login" />
      <div className="relative flex flex-col p-5 sm:p-6 md:p-10 lg:p-12 min-h-[100svh]">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 size={20} strokeWidth={1.8} />
            </span>
            <div>
              <p className="font-bold leading-tight">{t('brand')}</p>
              <p className="text-xs text-muted-foreground leading-tight">{t('tagline')}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>

        <div className="flex flex-1 flex-col justify-start lg:justify-center pt-4 sm:pt-6 lg:pt-4 pb-4">
          <div className="w-full max-w-sm mx-auto space-y-5 sm:space-y-6">
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t(titleKey)}</h1>
              <p className="hidden lg:block text-sm sm:text-base text-muted-foreground">{t(sloganKey)}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-[48px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="min-h-[48px] pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={
                      showPassword
                        ? 'Hide password / إخفاء كلمة المرور'
                        : 'Show password / إظهار كلمة المرور'
                    }
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t('forgot_password')}
                </Link>
              </div>

              <Button type="submit" className="w-full min-h-[48px] text-base" disabled={loading}>
                {loading ? t('loading') : t('login')}
              </Button>
            </form>

            <p className="text-sm text-muted-foreground text-center">
              {t('no_account')}{' '}
              <Link to="/signup" className="font-semibold text-primary hover:underline">
                {t('signup')}
              </Link>
            </p>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck size={12} />
              </span>
              {t('secure_badge')}
            </div>
          </div>
        </div>

        <div className="shrink-0 pt-3 pb-2 mt-auto lg:pt-2 lg:pb-1 space-y-3">
          <div className="lg:hidden">
            <AuthMobileFeatureRow />
          </div>
          <div className="flex justify-center lg:justify-start [&_button]:text-xs [&_button]:min-h-[32px] [&_button]:gap-1 lg:[&_button]:text-sm lg:[&_button]:min-h-[40px]">
            <PublicSupportLink
              accountType={accountType}
              pageLabel="Owner Login"
            />
          </div>
        </div>
      </div>

      <AuthBrandPanel accountType={accountType} />
    </div>
  );
};

export default LoginPage;
