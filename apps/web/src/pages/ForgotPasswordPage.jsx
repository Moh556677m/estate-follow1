import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  Mail,
  RotateCw,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import { AuthBrandPanel, AuthMobileBrand } from '@/components/AuthBrandPanel';
import PublicSupportLink from '@/components/PublicSupportLink';
import AuthPageSeo from '@/components/AuthPageSeo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { LanguageSwitcher } from '@/components/AppLayout';
import { verifyRecaptcha } from '@/lib/recaptcha';

const OTP_DURATION = 300; // 5 minutes

const ForgotPasswordPage = () => {
  const { t, isRtl } = useLanguage();
  const navigate = useNavigate();
  const { requestPasswordReset, resendPasswordResetOtp, verifyPasswordResetOtp, completePasswordReset } = useAuth();

  const [step, setStep] = useState('email'); // email | otp | password | done
  const accountType = 'owner';
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sending, setSending] = useState(false);

  // OTP state
  const [otpId, setOtpId] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [secondsLeft, setSecondsLeft] = useState(OTP_DURATION);
  const [otpError, setOtpError] = useState('');
  const [otpInfo, setOtpInfo] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  // New password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [resetting, setResetting] = useState(false);

  // OTP countdown
  useEffect(() => {
    if (step !== 'otp') return;
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

  const requestResetOtp = async () => {
    setSending(true);
    setEmailError('');
    try {
      // Supabase's resetPasswordForEmail() deliberately never reveals
      // whether the address is actually registered (avoids account
      // enumeration) — it always "succeeds" from the caller's point of
      // view, so there is no more "no account found" branch to handle here.
      await requestPasswordReset(email.trim());
      setCode(['', '', '', '', '', '']);
      setSecondsLeft(OTP_DURATION);
      setOtpError('');
      setOtpInfo(t('code_sent'));
      setStep('otp');
    } catch (err) {
      setEmailError(err?.message || t('something_wrong'));
    } finally {
      setSending(false);
    }
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setEmailError(t('email'));
      return;
    }
    // reCAPTCHA v3 — verify the user is human before sending the reset code.
    setSending(true);
    setEmailError('');
    verifyRecaptcha('forgot_password')
      .then((captcha) => {
        if (!captcha.ok) {
          setSending(false);
          setEmailError(
            captcha.reason === 'recaptcha_error'
              ? t('recaptcha_error')
              : t('recaptcha_blocked'),
          );
          return;
        }
        // requestResetOtp manages its own sending state.
        requestResetOtp();
      })
      .catch(() => {
        setSending(false);
        setEmailError(t('recaptcha_error'));
      });
  };

  const resendOtp = async () => {
    setResending(true);
    setOtpError('');
    setOtpInfo('');
    try {
      await resendPasswordResetOtp(email.trim());
      setCode(['', '', '', '', '', '']);
      setSecondsLeft(OTP_DURATION);
      setOtpInfo(t('otp_resend_sent'));
    } catch (err) {
      setOtpError(err?.message || t('something_wrong'));
    } finally {
      setResending(false);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setOtpId('');
    setCode(['', '', '', '', '', '']);
    setOtpError('');
    setOtpInfo('');
  };

  const verifyOtp = async () => {
    const entered = code.join('').trim();
    setOtpError('');
    setOtpInfo('');
    if (entered.length !== 6) {
      setOtpError(t('otp_enter_code'));
      return;
    }
    if (secondsLeft <= 0) {
      setOtpError(t('otp_expired'));
      return;
    }
    setVerifying(true);
    try {
      // Opens a temporary Supabase "recovery" session — proves the code is
      // correct, just enough to set a new password next. Not a real
      // sign-in: no PocketBase bridging happens here.
      await verifyPasswordResetOtp(email.trim(), entered);
      setStep('password');
    } catch (err) {
      if (err?.code === 'OTP_INVALID') {
        setOtpError(t('otp_invalid'));
      } else {
        setOtpError(err?.message || t('something_wrong'));
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (newPassword.length < 10) {
      setPwError(t('password_too_short'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t('passwords_no_match'));
      return;
    }
    setResetting(true);
    try {
      await completePasswordReset(newPassword);
      setStep('done');
    } catch (err) {
      setPwError(err?.message || t('something_wrong'));
    } finally {
      setResetting(false);
    }
  };

  const expired = secondsLeft <= 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  const forgotTitleKey = 'forgot_title_owner';

  const sloganKey = 'brand_slogan';

  return (
    <div className="min-h-[100svh] grid lg:grid-cols-2 bg-background">
      <AuthPageSeo pageKey="forgot-password" />
      <div className="relative flex flex-col p-5 sm:p-6 md:p-10 lg:p-12 min-h-[100svh]">
        <div className="flex items-center justify-between shrink-0">
          <Link to="/login" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 size={20} strokeWidth={1.8} />
            </span>
            <div>
              <p className="font-bold leading-tight">{t('brand')}</p>
              <p className="text-xs text-muted-foreground leading-tight">{t('tagline')}</p>
            </div>
          </Link>
          <LanguageSwitcher />
        </div>

        <AuthMobileBrand accountType={accountType} />

        <div className="flex flex-1 flex-col justify-start lg:justify-center pt-4 sm:pt-6 lg:pt-4 pb-4">
          <div className="w-full max-w-sm mx-auto space-y-5 sm:space-y-6">
            {/* ---------- STEP: EMAIL ---------- */}
            {step === 'email' && (
              <div className="space-y-7">
                <div className="space-y-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <KeyRound size={22} strokeWidth={1.8} />
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight">{t(forgotTitleKey)}</h1>
                  <p className="text-muted-foreground">{t(sloganKey)}</p>
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">{t('email')}</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      required
                      dir="ltr"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError('');
                      }}
                      className="min-h-[48px]"
                    />
                  </div>

                  {emailError && <p className="text-sm text-destructive">{emailError}</p>}

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
                      t('send_code')
                    )}
                  </Button>
                </form>

                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <BackIcon size={14} className={isRtl ? '' : 'rotate-180'} />
                  {t('back_to_login')}
                </Link>
              </div>
            )}

            {/* ---------- STEP: OTP ---------- */}
            {step === 'otp' && (
              <div className="space-y-7">
                <div className="space-y-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Mail size={22} strokeWidth={1.8} />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-center">{t('otp_title')}</h1>
                  <p className="text-muted-foreground text-center">
                    {t('forgot_otp_subtitle')}{' '}
                    <span className="font-semibold text-foreground">{email}</span>
                  </p>
                </div>

                <div className="space-y-4">
                  <OtpInput value={code} onChange={setCode} disabled={expired} />

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

                  {otpError && <p className="text-center text-sm text-destructive">{otpError}</p>}
                  {otpInfo && !otpError && (
                    <p className="text-center text-sm text-emerald-600">{otpInfo}</p>
                  )}

                  <Button
                    type="button"
                    onClick={verifyOtp}
                    className="w-full min-h-[48px] text-base"
                    disabled={verifying || expired || code.join('').length !== 6}
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
              </div>
            )}

            {/* ---------- STEP: NEW PASSWORD ---------- */}
            {step === 'password' && (
              <div className="space-y-7">
                <div className="space-y-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <ShieldCheck size={22} strokeWidth={1.8} />
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight">{t('new_password')}</h1>
                  <p className="text-muted-foreground">{t('forgot_new_subtitle')}</p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t('new_password')}</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showPw ? 'text' : 'password'}
                        required
                        dir="ltr"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          setPwError('');
                        }}
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
                    <Label htmlFor="confirm-new-password">{t('confirm_new_password')}</Label>
                    <div className="relative">
                      <Input
                        id="confirm-new-password"
                        type={showConfirmPw ? 'text' : 'password'}
                        required
                        dir="ltr"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setPwError('');
                        }}
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
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive">{t('passwords_no_match')}</p>
                    )}
                  </div>

                  {pwError && <p className="text-sm text-destructive">{pwError}</p>}

                  <Button
                    type="submit"
                    className="w-full min-h-[48px] text-base"
                    disabled={resetting}
                  >
                    {resetting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        {t('loading')}
                      </>
                    ) : (
                      t('reset_password')
                    )}
                  </Button>
                </form>
              </div>
            )}

            {/* ---------- STEP: DONE ---------- */}
            {step === 'done' && (
              <div className="space-y-7 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={34} strokeWidth={1.8} />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight">{t('password_updated')}</h1>
                  <p className="text-muted-foreground">{t('password_updated_msg')}</p>
                </div>
                <Button
                  type="button"
                  onClick={() => navigate('/login', { replace: true })}
                  className="w-full min-h-[48px] text-base"
                >
                  {t('login')}
                </Button>
              </div>
            )}

            {step !== 'done' && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <ShieldCheck size={12} />
                </span>
                {t('secure_badge')}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 pt-2 pb-1 mt-auto">
          <PublicSupportLink
            accountType={accountType}
            pageLabel="Owner Forgot Password"
          />
        </div>
      </div>

      <AuthBrandPanel accountType={accountType} />
    </div>
  );
};

// 6-box OTP input with auto-advance, backspace, and paste support.
const OtpInput = ({ value, onChange, disabled }) => {
  const refs = useRef([]);

  const updateAt = (i, v) => {
    const digit = v.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[i] = digit;
    onChange(next);
    if (digit && i < 5) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (!pasted.length) return;
    const next = ['', '', '', '', '', ''];
    pasted.forEach((d, idx) => (next[idx] = d));
    onChange(next);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div className="flex items-center justify-center gap-2" dir="ltr">
      {value.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={(e) => updateAt(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          className="h-14 w-12 rounded-lg border border-input bg-card text-center text-2xl font-bold shadow-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      ))}
    </div>
  );
};

export default ForgotPasswordPage;
