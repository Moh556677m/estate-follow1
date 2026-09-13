import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Loader2,
  RotateCw,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/AppLayout';
import pb from '@/lib/pocketbaseClient';
import AuthPageSeo from '@/components/AuthPageSeo';
import { verifyRecaptcha } from '@/lib/recaptcha';

const OTP_DURATION = 210; // 3 minutes 30 seconds

const AdminForgotPasswordPage = () => {
  const { t, isRtl, lang } = useLanguage();
  const navigate = useNavigate();

  const [step, setStep] = useState('email'); // email | otp | password | done
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sending, setSending] = useState(false);

  const [otpId, setOtpId] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [secondsLeft, setSecondsLeft] = useState(OTP_DURATION);
  const [otpError, setOtpError] = useState('');
  const [otpInfo, setOtpInfo] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (step !== 'otp') return;
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

  // Fire a security-alert email to the account's inbox when recovery starts.
  // Best-effort: never blocks the reset flow.
  const sendSecurityAlert = async (accountEmail) => {
    try {
      const info = {
        userAgent: navigator.userAgent,
        time: new Date().toISOString(),
      };
      await pb.send('/ef/security-alert', {
        method: 'POST',
        body: { email: accountEmail, info },
      });
    } catch {
      /* ignore — alert is best-effort */
    }
  };

  const requestResetOtp = async () => {
    setSending(true);
    setEmailError('');
    try {
      const result = await pb
        .collection('users')
        .requestOTP(email.trim(), { body: { email: email.trim(), mode: 'reset' } });
      setOtpId(result.otpId);
      setCode(['', '', '', '', '', '']);
      setSecondsLeft(OTP_DURATION);
      setOtpError('');
      setOtpInfo(t('code_sent'));
      setStep('otp');
      sendSecurityAlert(email.trim());
    } catch (err) {
      const msg = (err?.response?.message || err?.message || '').toLowerCase();
      if (msg.includes('no account') || msg.includes('not registered') || err?.status === 400) {
        setEmailError(t('no_account_found'));
      } else {
        setEmailError(t('something_wrong'));
      }
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
            captcha.reason === 'recaptcha_error' ? t('recaptcha_error') : t('recaptcha_blocked'),
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
      const result = await pb
        .collection('users')
        .requestOTP(email.trim(), { body: { email: email.trim(), mode: 'reset' } });
      setOtpId(result.otpId);
      setCode(['', '', '', '', '', '']);
      setSecondsLeft(OTP_DURATION);
      setOtpInfo(t('otp_resend_sent'));
    } catch (err) {
      const msg = (err?.response?.message || err?.message || '').toLowerCase();
      if (msg.includes('no account') || msg.includes('not registered')) {
        setOtpError(t('no_account_found'));
      } else {
        setOtpError(t('something_wrong'));
      }
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
      await pb.collection('users').authWithOTP(otpId, entered);
      setStep('password');
    } catch (err) {
      const msg = (err?.response?.message || err?.message || '').toLowerCase();
      if (msg.includes('expired') || msg.includes('invalid') || err?.status === 400) {
        setOtpError(t('otp_invalid'));
      } else {
        setOtpError(t('something_wrong'));
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
      const uid = pb.authStore.record?.id;
      if (!uid) {
        setPwError(t('something_wrong'));
        setResetting(false);
        return;
      }
      await pb.collection('users').update(uid, {
        password: newPassword,
        passwordConfirm: confirmPassword,
      });
      pb.authStore.clear();
      setStep('done');
    } catch (err) {
      setPwError(t('something_wrong'));
    } finally {
      setResetting(false);
    }
  };

  const expired = secondsLeft <= 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  const portalName = lang === 'ar' ? 'بوابة الإدارة' : 'Admin Portal';

  return (
    <div className="min-h-[100svh] w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <AuthPageSeo pageKey="admin-portal" path="/admin/forgot-password" noindex />

      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-32 -start-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -end-32 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <ShieldCheck size={24} strokeWidth={1.8} />
            </span>
            <h1 className="text-lg font-bold tracking-tight text-white">{portalName}</h1>
          </div>

          {step === 'email' && (
            <div className="space-y-5">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <KeyRound size={22} strokeWidth={1.8} />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white">
                  {t('admin_forgot_title')}
                </h2>
                <p className="text-sm text-slate-400">{t('admin_forgot_subtitle')}</p>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2.5 text-xs text-amber-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{t('admin_forgot_alert_note')}</span>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-slate-200">
                    {t('email')}
                  </Label>
                  <div className="relative">
                    <Mail size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
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
                      className="min-h-[48px] ps-10 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                    />
                  </div>
                </div>

                {emailError && (
                  <p className="text-sm text-amber-300">{emailError}</p>
                )}

                <Button
                  type="submit"
                  className="w-full min-h-[48px] text-base font-semibold"
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
                to="/admin/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
              >
                <BackIcon size={14} className={isRtl ? '' : 'rotate-180'} />
                {t('back_to_login')}
              </Link>
            </div>
          )}

          {step === 'otp' && (
            <div className="space-y-5">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Mail size={22} strokeWidth={1.8} />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white">{t('otp_title')}</h2>
                <p className="text-sm text-slate-400">
                  {t('forgot_otp_subtitle')}{' '}
                  <span className="font-semibold text-white">{email}</span>
                </p>
              </div>

              <div className="space-y-4">
                <OtpInput value={code} onChange={setCode} disabled={expired} />

                <div className="flex items-center justify-center gap-1.5 text-sm">
                  {expired ? (
                    <span className="font-medium text-amber-300">{t('otp_expired')}</span>
                  ) : (
                    <span className="text-slate-400">
                      {t('otp_timer')}{' '}
                      <span className="font-mono font-semibold text-white" dir="ltr">
                        {mm}:{ss}
                      </span>
                    </span>
                  )}
                </div>

                {otpError && <p className="text-center text-sm text-amber-300">{otpError}</p>}
                {otpInfo && !otpError && (
                  <p className="text-center text-sm text-emerald-400">{otpInfo}</p>
                )}

                <Button
                  type="button"
                  onClick={verifyOtp}
                  className="w-full min-h-[48px] text-base font-semibold"
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
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
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
                    {resending ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                    {t('otp_resend')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'password' && (
            <div className="space-y-5">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <ShieldCheck size={22} strokeWidth={1.8} />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-white">{t('new_password')}</h2>
                <p className="text-sm text-slate-400">{t('forgot_new_subtitle')}</p>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-slate-200">
                    {t('new_password')}
                  </Label>
                  <div className="relative">
                    <Lock size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
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
                      className="min-h-[48px] ps-10 pe-11 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-400 hover:text-white p-1"
                      aria-label={showPw ? t('hide') : t('show')}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">{t('password_hint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-new-password" className="text-slate-200">
                    {t('confirm_new_password')}
                  </Label>
                  <div className="relative">
                    <Lock size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500" />
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
                      className="min-h-[48px] ps-10 pe-11 bg-slate-800/60 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((s) => !s)}
                      className="absolute top-1/2 -translate-y-1/2 end-2 text-slate-400 hover:text-white p-1"
                      aria-label={showConfirmPw ? t('hide') : t('show')}
                    >
                      {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-amber-300">{t('passwords_no_match')}</p>
                  )}
                </div>

                {pwError && <p className="text-sm text-amber-300">{pwError}</p>}

                <Button
                  type="submit"
                  className="w-full min-h-[48px] text-base font-semibold"
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

          {step === 'done' && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 size={34} strokeWidth={1.8} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  {t('password_updated')}
                </h2>
                <p className="text-sm text-slate-400">{t('password_updated_msg')}</p>
              </div>
              <Button
                type="button"
                onClick={() => navigate('/admin/login', { replace: true })}
                className="w-full min-h-[48px] text-base font-semibold"
              >
                {t('login')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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
    if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
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
          className="h-14 w-12 rounded-lg border border-slate-700 bg-slate-800/60 text-center text-2xl font-bold text-white shadow-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
      ))}
    </div>
  );
};

export default AdminForgotPasswordPage;
