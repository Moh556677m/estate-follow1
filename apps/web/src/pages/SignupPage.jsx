import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  Mail,
  RotateCw,
  ArrowRight,
  Home,
} from 'lucide-react';
import { AuthBrandPanel, AuthMobileBrand } from '@/components/AuthBrandPanel';
import PublicSupportLink from '@/components/PublicSupportLink';
import AuthPageSeo from '@/components/AuthPageSeo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import PhoneField from '@/components/PhoneField';
import NationalityField from '@/components/NationalityField';
import GenderField from '@/components/GenderField';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/AppLayout';
import pb from '@/lib/pocketbaseClient';
import { registerSession } from '@/lib/sessions';
import { finalizeSignup } from '@/lib/authApi';
import { trackReferralClick } from '@/lib/referralClient';
import { verifyRecaptcha } from '@/lib/recaptcha';
import { detectCountry } from '@/hooks/useGeoIp';

const OTP_DURATION = 300; // seconds (5 minutes)
// Required code length, read from the system that actually issues it: the
// `users.otp.length` field set in
// apps/pocketbase/pb_migrations/1787862388_signup_otp_fields.js. Kept as one
// named constant (instead of a hardcoded 6 in several places) so the input
// below, the submit-button guard, and the validation check can never drift
// out of sync with each other.
const OTP_LENGTH = 6;

const SignupPage = () => {
  const { isAuthed, bootstrapped, signup, verifySignupOtp, resendSignupOtp } = useAuth();
  const { t, isRtl } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Referral attribution — captured from ?ref=<userId> on the signup link and
  // persisted across the OTP flow so it survives the email verification step.
  const [referredBy, setReferredBy] = useState(() => {
    try { return localStorage.getItem('ef_ref') || ''; } catch { return ''; }
  });

  useEffect(() => {
    const ref = (searchParams.get('ref') || '').trim();
    if (ref) {
      setReferredBy(ref);
      try { localStorage.setItem('ef_ref', ref); } catch { /* ignore */ }
      // Record the link-open click (best-effort, anonymous).
      trackReferralClick(ref);
    }
  }, [searchParams]);

  const [form, setForm] = useState({
    account_type: 'owner',
    name: '',
    nationality: '',
    gender: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  // GeoIP default for nationality (requirement: GeoIP auto-detect at signup).
  // DEFAULT ONLY — runs once, never overrides a value the user already
  // typed/picked (same pattern PhoneField uses for the calling code).
  const nationalityTouchedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    detectCountry()
      .then((iso) => {
        if (cancelled || !iso) return;
        if (nationalityTouchedRef.current) return;
        setForm((f) => (f.nationality ? f : { ...f, nationality: iso }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  // OTP modal state
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpId, setOtpId] = useState('');
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(OTP_DURATION);
  const [otpError, setOtpError] = useState('');
  const [otpInfo, setOtpInfo] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);

  // If already signed in, go to the dashboard. Use isAuthed (not the raw
  // authStore.record) so a stale/expired token in localStorage — where
  // authStore.record is still truthy but authStore.isValid is false — does
  // NOT redirect to /dashboard and immediately bounce back to /login. That
  // bounce was what made the "إنشاء حساب" link on the login page appear
  // completely dead: the click did navigate to /signup, but SignupPage
  // redirected to /dashboard, ProtectedRoute redirected back to /login, and
  // the user never saw the signup form. Wait for bootstrap so a valid token
  // refresh never flashes the signup form either.
  useEffect(() => {
    if (bootstrapped && isAuthed) navigate('/dashboard', { replace: true });
  }, [bootstrapped, isAuthed, navigate]);

  // OTP expiration countdown.
  useEffect(() => {
    if (!otpOpen || verified) return;
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [otpOpen, secondsLeft, verified]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError('');
  };

  const validate = () => {
    if (!form.name.trim()) return t('name') + ' ' + '—';
    if (!form.nationality) return t('nationality_select');
    if (!form.gender) return t('gender_select');
    if (!form.phone) return t('phone');
    if (!form.email.trim()) return t('email');
    if (form.password.length < 10) return t('password_too_short');
    if (form.password !== form.confirmPassword) return t('passwords_no_match');
    return '';
  };

  const postSignupPath = () => '/dashboard';

  const startOtpFlow = async () => {
    setSending(true);
    setError('');
    try {
      // Sends the Resend OTP for this email — the real PocketBase account
      // itself isn't created until the code is verified (see verifyOtp()
      // below).
      await signup(form.email.trim(), form.password);
      setCode('');
      setSecondsLeft(OTP_DURATION);
      setOtpError('');
      setOtpInfo('');
      setVerified(false);
      setOtpOpen(true);
    } catch (err) {
      if (err?.code === 'ACCOUNT_EXISTS') {
        setError(t('account_exists'));
      } else {
        setError(err?.message || t('something_wrong'));
      }
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    // reCAPTCHA v3 — verify the user is human before sending the OTP email.
    setSending(true);
    setError('');
    const captcha = await verifyRecaptcha('signup');
    if (!captcha.ok) {
      setSending(false);
      setError(
        captcha.reason === 'recaptcha_error'
          ? t('recaptcha_error')
          : t('recaptcha_blocked'),
      );
      return;
    }
    setSending(false);
    await startOtpFlow();
  };

  const resendOtp = async () => {
    setResending(true);
    setOtpError('');
    setOtpInfo('');
    try {
      await resendSignupOtp(form.email.trim());
      setCode('');
      setSecondsLeft(OTP_DURATION);
      setOtpInfo(t('otp_resend_sent'));
    } catch (err) {
      setOtpError(err?.message || t('something_wrong'));
    } finally {
      setResending(false);
    }
  };

  const changeEmail = () => {
    setOtpOpen(false);
    setOtpId('');
    setCode('');
    setOtpError('');
    setOtpInfo('');
  };

  const completeSignup = async () => {
    setVerified(true);
    setOtpError('');
    try {
      // Register this device as an active session.
      try {
        await registerSession();
      } catch (err) {
        if (err?.code === 'MAX_SESSIONS' || err?.code === 'MAX_DEVICES') {
          pb.authStore.clear();
          setVerified(false);
          setOtpError(t(err.code === 'MAX_SESSIONS' ? 'err_max_sessions' : 'err_max_devices'));
          return;
        }
        /* non-fatal for other errors */
      }
      navigate(postSignupPath(), { replace: true });
    } catch (err) {
      setVerified(false);
      setOtpError(err?.response?.message || err?.message || t('something_wrong'));
    }
  };

  const verifyOtp = async () => {
    const entered = code.trim();
    setOtpError('');
    setOtpInfo('');
    if (entered.length !== OTP_LENGTH) {
      setOtpError(t('otp_enter_code'));
      return;
    }
    if (secondsLeft <= 0) {
      setOtpError(t('otp_expired'));
      return;
    }
    setVerifying(true);
    try {
      // 1) Verify the Resend-delivered signup code — this both proves the
      //    email and creates the real PocketBase user record directly with
      //    the real password, then authenticates as it (pb.authStore) in
      //    one step. See AuthContext.jsx's verifySignupOtp().
      await verifySignupOtp(form.email.trim(), entered, form.password);

      // 2) Commit the profile fields the signup form collected (name,
      //    nationality, gender, phone, referral) onto that same PocketBase
      //    record. No password here — it's already set; finalize-signup.pb.js
      //    treats password as optional for exactly this case (see its own
      //    comment).
      await finalizeSignup({
        name: form.name.trim(),
        nationality: form.nationality,
        gender: form.gender,
        phone: form.phone,
        account_type: form.account_type || 'owner',
        referred_by: referredBy || '',
      });

      // finalize-signup.pb.js commits the real profile + subscription/trial
      // fields (nationality, gender, phone, account_type, profile_complete,
      // subscription_package, trial_start/trial_end, account_state, ...)
      // server-side, but only ever returns { ok, id } — it never sends the
      // updated record back. Without this refresh, pb.authStore.record (and
      // therefore useAuth().user everywhere, including the dashboard this
      // page is about to navigate to) stays on the bare placeholder record
      // created a moment earlier — missing every one of those fields
      // entirely. Any code on the very next screen that expects them to
      // exist would be reading an incomplete record purely due to this
      // timing gap, not an actual data problem. authRefresh() pulls the
      // just-committed record and (via pb.authStore.onChange in
      // AuthContext.jsx) updates useAuth().user too, so nothing downstream
      // ever sees the stale placeholder.
      try {
        await pb.collection('users').authRefresh();
      } catch {
        /* best-effort — the account is already fully created either way;
           the next natural refresh (heartbeat / realtime sync) still
           catches this up if this one call happens to fail. */
      }

      try { localStorage.removeItem('ef_ref'); } catch { /* ignore */ }
      await completeSignup();
    } catch (err) {
      setVerifying(false);
      if (err?.code === 'OTP_INVALID') {
        setOtpError(t('otp_invalid'));
        return;
      }
      const msg = String(err?.response?.message || err?.message || '');
      const lower = msg.toLowerCase();
      if (lower.includes('otp') || lower.includes('expired') || lower.includes('token')) {
        setOtpError(t('otp_invalid'));
      } else {
        setOtpError(msg || t('something_wrong'));
      }
    }
  };

  const expired = secondsLeft <= 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-[100svh] grid lg:grid-cols-2 bg-background">
      <AuthPageSeo pageKey="signup" />
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

        <AuthMobileBrand accountType={form.account_type} />

        <div className="flex flex-1 flex-col justify-start lg:justify-center pt-4 sm:pt-6 lg:pt-4 pb-4">
          <div className="w-full max-w-sm mx-auto space-y-5 sm:space-y-6">
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {t('create_owner_account')}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">{t('signup_subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('name')}</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={set('name')}
                  className="min-h-[48px]"
                />
              </div>

              <NationalityField
                id="nationality"
                label={t('nationality')}
                required
                value={form.nationality}
                onChange={(v) => {
                  nationalityTouchedRef.current = true;
                  setForm((f) => ({ ...f, nationality: v }));
                  setError('');
                }}
              />

              <GenderField
                id="gender"
                label={t('gender')}
                required
                value={form.gender}
                onChange={(v) => {
                  setForm((f) => ({ ...f, gender: v }));
                  setError('');
                }}
              />

              <PhoneField
                label={t('phone')}
                value={form.phone}
                onChange={(v) => {
                  setForm((f) => ({ ...f, phone: v }));
                  setError('');
                }}
                heightClass="min-h-[48px]"
              />

              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  dir="ltr"
                  autoComplete="email"
                  value={form.email}
                  onChange={set('email')}
                  className="min-h-[48px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    required
                    dir="ltr"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={set('password')}
                    className="min-h-[48px] pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute top-1/2 -translate-y-1/2 right-2 text-muted-foreground hover:text-foreground p-1"
                    aria-label={showPw ? t('hide') : t('show')}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{t('password_hint')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('confirm_password')}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPw ? 'text' : 'password'}
                    required
                    dir="ltr"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={set('confirmPassword')}
                    className="min-h-[48px] pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw((s) => !s)}
                    className="absolute top-1/2 -translate-y-1/2 right-2 text-muted-foreground hover:text-foreground p-1"
                    aria-label={showConfirmPw ? t('hide') : t('show')}
                  >
                    {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-xs text-destructive">{t('passwords_no_match')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="referralCode">
                  {t('referral_code_label') || (isRtl ? 'كود الإحالة (اختياري)' : 'Referral code (optional)')}
                </Label>
                <Input
                  id="referralCode"
                  value={referredBy}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setReferredBy(v);
                    try { if (v) localStorage.setItem('ef_ref', v); else localStorage.removeItem('ef_ref'); } catch { /* ignore */ }
                    setError('');
                  }}
                  placeholder={t('referral_code_placeholder') || (isRtl ? 'كود صديقك الذي دعاك' : "Your friend's code")}
                  className="min-h-[48px]"
                  dir="ltr"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  {t('referral_code_hint') || (isRtl
                    ? 'إذا جئت من رابط دعوة، يُملأ تلقائيًا. يمنحك خصمًا على أول اشتراك.'
                    : 'If you came from an invite link it is filled automatically. It gives you a discount on your first subscription.')}
                </p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                className="w-full min-h-[48px] text-base"
                disabled={sending}
              >
                {sending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {t('otp_sending')}
                  </>
                ) : (
                  t('signup_owner')
                )}
              </Button>
            </form>

            <p className="text-sm text-muted-foreground text-center">
              {t('have_account')}{' '}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                {t('login')}
              </Link>
            </p>

            <p className="text-sm text-muted-foreground text-center">
              <Link to="/forgot-password" className="font-medium text-primary hover:underline">
                {t('forgot_password')}
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

        <div className="shrink-0 pt-2 pb-1 mt-auto">
          <PublicSupportLink
            accountType={form.account_type}
            pageLabel="Owner Sign Up"
          />
        </div>
      </div>

      <AuthBrandPanel accountType={form.account_type} />

      {/* OTP verification modal */}
      <Dialog open={otpOpen} onOpenChange={(o) => !verified && setOtpOpen(o)}>
        <DialogContent className="sm:max-w-md" dir={isRtl ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Mail size={22} strokeWidth={1.8} />
            </div>
            <DialogTitle className="text-center text-xl">{t('otp_title')}</DialogTitle>
            <DialogDescription className="text-center">
              {t('otp_subtitle')}{' '}
              <span className="font-semibold text-foreground">{form.email}</span>
            </DialogDescription>
          </DialogHeader>

          {verified ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">{t('otp_verified')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <OtpInput value={code} onChange={setCode} disabled={expired} length={OTP_LENGTH} />

              <p className="text-center text-xs text-muted-foreground">
                {isRtl
                  ? 'لم يصلك الرمز خلال دقيقة؟ تحقق من مجلد الرسائل غير المرغوب فيها (Spam/Junk).'
                  : "Didn't get the code within a minute? Check your spam/junk folder."}
              </p>

              <div className="flex items-center justify-center gap-1.5 text-sm">
                {expired ? (
                  <span className="font-medium text-destructive">{t('otp_expired')}</span>
                ) : (
                  <span className="text-muted-foreground">
                    {t('otp_timer')}{' '}
                    <span className="font-mono font-semibold text-foreground" dir="ltr">
                      {mm}:{ss}
                    </span>
                  </span>
                )}
              </div>

              {otpError && (
                <p className="text-center text-sm text-destructive">{otpError}</p>
              )}
              {otpInfo && !otpError && (
                <p className="text-center text-sm text-emerald-600">{otpInfo}</p>
              )}

              <Button
                type="button"
                onClick={verifyOtp}
                className="w-full min-h-[48px] text-base"
                disabled={verifying || expired || code.length !== OTP_LENGTH}
              >
                {verifying ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {t('loading')}
                  </>
                ) : (
                  t('otp_verify')
                )}
              </Button>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={changeEmail}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowRight size={14} className={isRtl ? '' : 'rotate-180'} />
                  {t('otp_change_email')}
                </button>
                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={resending}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  {resending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RotateCw size={14} />
                  )}
                  {t('otp_resend')}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Single-field OTP input (replaces the previous 6-separate-box layout).
// One real <input>, so a full code pasted at once lands in it exactly as
// pasted — no splitting across boxes, no per-character focus juggling.
// `length` sets maxLength/validation from OTP_LENGTH above (the actual
// system-configured code length), never a hardcoded number here.
const OtpInput = ({ value, onChange, disabled, length }) => {
  const handleChange = (e) => {
    // Digits only, and never longer than the code the system issues — this
    // is what makes a full paste "just work": the browser drops the pasted
    // text straight into the input's value, and this only trims it down to
    // digits/length rather than rejecting or splitting it.
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, length);
    onChange(digitsOnly);
  };

  return (
    <div className="flex justify-center" dir="ltr">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        placeholder={'•'.repeat(length)}
        aria-label="OTP"
        className="h-14 w-full max-w-[220px] rounded-lg border border-input bg-card text-center text-2xl font-bold tracking-[0.4em] shadow-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
    </div>
  );
};

export default SignupPage;
