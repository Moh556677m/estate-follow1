import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Building2, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/AppLayout';
import { useEditorAuth } from '@/contexts/EditorAuthContext';
import { fetchInsightsSettings } from '@/lib/cms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { verifyRecaptcha } from '@/lib/recaptcha';

const EditorLoginPage = () => {
  const { t, lang } = useLanguage();
  const { isEditorAuthed, login } = useEditorAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => { fetchInsightsSettings().then(setSettings).catch(() => {}); }, []);

  if (isEditorAuthed) return <Navigate to="/editor/dashboard" replace />;

  const portalName = settings?.editor_portal_name || t('editor_portal');
  const subtitle = settings ? (lang === 'ar' ? (settings.editor_login_subtitle_ar || settings.editor_login_subtitle_en) : (settings.editor_login_subtitle_en || settings.editor_login_subtitle_ar)) : t('editor_login_subtitle');
  const helpText = settings ? (lang === 'ar' ? (settings.editor_help_text_ar || settings.editor_help_text_en) : (settings.editor_help_text_en || settings.editor_help_text_ar)) : '';
  const bgStyle = settings?.editor_login_bg
    ? (settings.editor_login_bg.startsWith('http')
      ? { backgroundImage: `url(${settings.editor_login_bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: settings.editor_login_bg })
    : {};

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // reCAPTCHA v3 — verify the user is human before attempting an editor sign-in.
    const captcha = await verifyRecaptcha('login');
    if (!captcha.ok) {
      setLoading(false);
      setError(
        captcha.reason === 'recaptcha_error' ? t('recaptcha_error') : t('recaptcha_blocked'),
      );
      return;
    }
    try {
      await login(email.trim().toLowerCase(), password);
      navigate('/editor/dashboard', { replace: true });
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('account_inactive')) setError(lang === 'ar' ? 'هذا الحساب غير نشط.' : 'This account is inactive.');
      else if (msg.includes('invalid') || err?.status === 400) setError(t('err_invalid_credentials'));
      else setError(t('something_wrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4" style={bgStyle}>
      <Helmet>
        <title>{t('editor_login')} — {t('brand')} Insights</title>
        <meta name="description" content={subtitle} />
      </Helmet>
      <div className="w-full max-w-md rounded-2xl border bg-card/95 p-6 sm:p-8 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            {settings?.editor_login_logo ? (
              <img src={settings.editor_login_logo} alt={portalName} className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Building2 size={20} strokeWidth={1.8} />
              </span>
            )}
            <div>
              <p className="font-bold leading-tight">{t('brand')}</p>
              <p className="text-xs text-muted-foreground leading-tight">{portalName}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>

        <h1 className="text-2xl font-bold tracking-tight">{t('editor_login')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="e-email">{t('email')}</Label>
            <div className="relative">
              <Mail className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input id="e-email" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-[48px] ps-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-pass">{t('password')}</Label>
            <div className="relative">
              <Lock className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input id="e-pass" type={show ? 'text' : 'password'} dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-[48px] ps-10 pe-10" />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute end-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full min-h-[48px]" disabled={loading}>
            {loading ? t('loading') : t('login')}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <Link to="/insights" className="hover:text-primary">{t('insights_back_to_insights')}</Link>
          <span className="flex items-center gap-1.5"><ShieldCheck size={12} /> {t('secure_badge')}</span>
        </div>
        {helpText && <p className="mt-4 text-center text-xs text-muted-foreground">{helpText}</p>}
      </div>
    </div>
  );
};

export default EditorLoginPage;
