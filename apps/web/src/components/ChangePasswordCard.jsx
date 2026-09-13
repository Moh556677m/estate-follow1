import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import pb from '@/lib/pocketbaseClient';
import { logoutOtherSessions, currentDeviceId } from '@/lib/sessions';

const ChangePasswordCard = ({ basePath = '/dashboard' }) => {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [logoutOthers, setLogoutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next.length < 10) {
      setError(t('password_too_short'));
      return;
    }
    if (next !== confirm) {
      setError(t('passwords_no_match'));
      return;
    }
    if (next === current) {
      setError(t('admin_password_same_error'));
      return;
    }

    setBusy(true);
    const uid = pb.authStore.record?.id;
    const email = pb.authStore.record?.email;
    if (!uid) {
      setError(t('something_wrong'));
      setBusy(false);
      return;
    }

    // Verify the current password by re-authenticating before accepting the change.
    try {
      await pb.collection('users').authWithPassword(email, current, {
        requestKey: `pw-verify-${uid}-${Date.now()}`,
      });
    } catch (err) {
      setError(t('current_password_wrong'));
      setBusy(false);
      return;
    }

    try {
      await pb.collection('users').update(uid, {
        password: next,
        passwordConfirm: confirm,
      });

      // Optionally end every other active session.
      if (logoutOthers) {
        try {
          await logoutOtherSessions(currentDeviceId());
        } catch {
          /* ignore */
        }
      }

      // Send a confirmation security alert (best-effort).
      try {
        await pb.send('/ef/security-alert', {
          method: 'POST',
          body: {
            email,
            info: {
              userAgent: navigator.userAgent,
              time: new Date().toISOString(),
              event: 'password_changed',
            },
          },
        });
      } catch {
        /* ignore */
      }

      setDone(true);
      reset();
      // Force re-login so the new password takes effect cleanly.
      setTimeout(async () => {
        await logout();
        navigate(`${basePath === '/admin' ? '/admin/login' : '/login'}`, { replace: true });
      }, 1800);
    } catch (err) {
      setError(t('something_wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <KeyRound size={16} />
        </span>
        <div>
          <h3 className="text-base font-bold">{t('admin_change_password_title')}</h3>
          <p className="text-xs text-muted-foreground">{t('admin_change_password_hint')}</p>
        </div>
      </div>

      {done ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>{t('admin_password_changed_relogin')}</span>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cur-pw">{t('current_password')}</Label>
            <div className="relative">
              <Input
                id="cur-pw"
                type={showCur ? 'text' : 'password'}
                dir="ltr"
                required
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="min-h-[44px] pr-11"
              />
              <button
                type="button"
                onClick={() => setShowCur((s) => !s)}
                className="absolute top-1/2 -translate-y-1/2 right-2 text-muted-foreground hover:text-foreground p-1"
                aria-label={showCur ? t('hide') : t('show')}
              >
                {showCur ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-pw">{t('new_password_label')}</Label>
            <div className="relative">
              <Input
                id="new-pw"
                type={showNew ? 'text' : 'password'}
                dir="ltr"
                required
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="min-h-[44px] pr-11"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="absolute top-1/2 -translate-y-1/2 right-2 text-muted-foreground hover:text-foreground p-1"
                aria-label={showNew ? t('hide') : t('show')}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t('password_hint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conf-pw">{t('confirm_password_label')}</Label>
            <div className="relative">
              <Input
                id="conf-pw"
                type={showConf ? 'text' : 'password'}
                dir="ltr"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="min-h-[44px] pr-11"
              />
              <button
                type="button"
                onClick={() => setShowConf((s) => !s)}
                className="absolute top-1/2 -translate-y-1/2 right-2 text-muted-foreground hover:text-foreground p-1"
                aria-label={showConf ? t('hide') : t('show')}
              >
                {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirm && next !== confirm && (
              <p className="text-xs text-destructive">{t('passwords_no_match')}</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox checked={logoutOthers} onCheckedChange={(v) => setLogoutOthers(!!v)} />
            {t('admin_password_logout_others')}
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="min-h-[44px]" disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('loading')}
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                {t('admin_change_password_btn')}
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  );
};

export default ChangePasswordCard;
