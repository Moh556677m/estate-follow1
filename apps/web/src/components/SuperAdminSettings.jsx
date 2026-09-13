import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { formatDate } from '@/lib/api';
import { EmptyState } from '@/components/shared';
import {
  confirmPasswordChange,
  confirmRecoveryEmailChange,
  getRecoveryEmail,
  requestPasswordChange,
  requestRecoveryEmailChange,
} from '@/lib/securityApi';
import { cn } from '@/lib/utils';
import { isMainSuperAdmin, isSuperAdmin } from '@/lib/permissions';

const DualOtpFields = ({ code1, code2, setCode1, setCode2, t, adminHint, recoveryHint }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div className="space-y-2">
      <Label>{t('otp_code_1')}</Label>
      <p className="text-[11px] text-muted-foreground">{adminHint}</p>
      <Input
        value={code1}
        onChange={(e) => setCode1(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        maxLength={6}
        dir="ltr"
        className="min-h-[44px] tracking-widest text-center text-lg font-semibold"
        placeholder="••••••"
        autoComplete="one-time-code"
      />
    </div>
    <div className="space-y-2">
      <Label>{t('otp_code_2')}</Label>
      <p className="text-[11px] text-muted-foreground">{recoveryHint}</p>
      <Input
        value={code2}
        onChange={(e) => setCode2(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        maxLength={6}
        dir="ltr"
        className="min-h-[44px] tracking-widest text-center text-lg font-semibold"
        placeholder="••••••"
        autoComplete="one-time-code"
      />
    </div>
  </div>
);

export function ChangeAdminPasswordPanel() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const allowed = isMainSuperAdmin(user);

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [step, setStep] = useState('form'); // form | otp
  const [challengeId, setChallengeId] = useState('');
  const [code1, setCode1] = useState('');
  const [code2, setCode2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [meta, setMeta] = useState(null);

  if (!allowed) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        {t('settings_sensitive_only_super')}
      </div>
    );
  }

  const requestOtps = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (newPwd.length < 10) {
      setError(t('password_too_short'));
      return;
    }
    if (newPwd !== confirmPwd) {
      setError(t('passwords_no_match'));
      return;
    }
    setBusy(true);
    try {
      const res = await requestPasswordChange({
        currentPassword: curPwd,
        newPassword: newPwd,
      });
      setChallengeId(res.challengeId);
      setMeta(res);
      setStep('otp');
      setNotice(t('dual_otp_sent'));
    } catch (err) {
      const msg = String(err?.message || '');
      if (/incorrect|current password/i.test(msg)) setError(t('current_password_wrong'));
      else setError(msg || t('something_wrong'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setError('');
    if (code1.length !== 6 || code2.length !== 6) {
      setError(t('both_codes_required'));
      return;
    }
    if (!challengeId) {
      setError(t('password_change_expired'));
      setStep('form');
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordChange({ challengeId, code1, code2 });
      setNotice(t('password_changed_success'));
      setStep('form');
      setCurPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setCode1('');
      setCode2('');
      setChallengeId('');
      setMeta(null);
    } catch (err) {
      const msg = String(err?.message || '');
      if (/expired|payload|new challenge|request new/i.test(msg)) {
        setError(t('password_change_expired'));
        setStep('form');
        setCode1('');
        setCode2('');
        setChallengeId('');
      } else if (/both verification|must be correct/i.test(msg)) {
        setError(t('both_codes_required'));
      } else {
        setError(msg || t('both_codes_required'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-xl font-bold">{t('change_admin_password')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('change_admin_password_hint')}</p>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {step === 'form' ? (
        <form onSubmit={requestOtps} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <div className="space-y-2">
            <Label>{t('current_password')}</Label>
            <Input
              type="password"
              value={curPwd}
              onChange={(e) => setCurPwd(e.target.value)}
              required
              dir="ltr"
              className="min-h-[44px]"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('new_password_label')}</Label>
            <Input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              dir="ltr"
              className="min-h-[44px]"
              placeholder={t('password_hint')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('confirm_password_label')}</Label>
            <Input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
              dir="ltr"
              className="min-h-[44px]"
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('dual_otp_password_explain')}</p>
          <Button type="submit" disabled={busy} className="min-h-[44px]">
            {busy ? <Loader2 size={16} className="animate-spin me-1" /> : <KeyRound size={16} className="me-1" />}
            {t('send_dual_otp')}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirm} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('dual_otp_enter_both')}
            {meta?.adminEmail ? ` · ${meta.adminEmail}` : ''}
            {meta?.recoveryMasked ? ` · ${meta.recoveryMasked}` : ''}
          </p>
          <DualOtpFields
            code1={code1}
            code2={code2}
            setCode1={setCode1}
            setCode2={setCode2}
            t={t}
            adminHint={t('otp_sent_to_admin')}
            recoveryHint={t('otp_sent_to_recovery')}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy} className="min-h-[44px]">
              {busy ? <Loader2 size={16} className="animate-spin me-1" /> : null}
              {t('verify_and_change_password')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                setStep('form');
                setCode1('');
                setCode2('');
                setError('');
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function SuperAdminSecurityPanel() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const allowed = isMainSuperAdmin(user);

  const [recovery, setRecovery] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('view'); // view | otp
  const [challengeId, setChallengeId] = useState('');
  const [code1, setCode1] = useState('');
  const [code2, setCode2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [meta, setMeta] = useState(null);

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getRecoveryEmail();
      setRecovery(res.recoveryEmail || 'ceo@madproperties.ae');
    } catch {
      setRecovery('ceo@madproperties.ae');
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    load();
  }, [load]);

  if (!allowed) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        {t('settings_sensitive_only_super')}
      </div>
    );
  }

  const requestOtps = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await requestRecoveryEmailChange({ newEmail: newEmail.trim() });
      setChallengeId(res.challengeId);
      setMeta(res);
      setStep('otp');
      setNotice(t('dual_otp_sent'));
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setError('');
    if (code1.length !== 6 || code2.length !== 6) {
      setError(t('both_codes_required'));
      return;
    }
    setBusy(true);
    try {
      const res = await confirmRecoveryEmailChange({ challengeId, code1, code2 });
      setRecovery(res.recoveryEmail || newEmail);
      setNotice(t('recovery_email_changed'));
      setStep('view');
      setNewEmail('');
      setCode1('');
      setCode2('');
      setChallengeId('');
    } catch (err) {
      setError(String(err?.message || t('both_codes_required')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-xl font-bold">{t('nav_security')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('super_security_subtitle')}</p>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : (
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90">
              <Mail size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t('security_recovery_email')}</p>
              <p className="text-xs text-muted-foreground mb-2">{t('security_recovery_email_hint')}</p>
              <p className="font-mono text-sm break-all" dir="ltr">
                {recovery}
              </p>
            </div>
          </div>

          {step === 'view' ? (
            <form onSubmit={requestOtps} className="space-y-3 border-t pt-4">
              <Label>{t('new_recovery_email')}</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                dir="ltr"
                className="min-h-[44px]"
                placeholder="name@example.com"
              />
              <p className="text-xs text-muted-foreground">{t('dual_otp_recovery_explain')}</p>
              <Button type="submit" disabled={busy || !newEmail.trim()} className="min-h-[44px]">
                {busy ? <Loader2 size={16} className="animate-spin me-1" /> : <ShieldCheck size={16} className="me-1" />}
                {t('send_dual_otp')}
              </Button>
            </form>
          ) : (
            <form onSubmit={confirm} className="space-y-4 border-t pt-4">
              <p className="text-sm text-muted-foreground">{t('dual_otp_enter_both')}</p>
              <DualOtpFields
                code1={code1}
                code2={code2}
                setCode1={setCode1}
                setCode2={setCode2}
                t={t}
                adminHint={t('otp_sent_to_admin')}
                recoveryHint={
                  meta?.currentRecoveryMasked
                    ? `${t('otp_sent_to_current_recovery')} (${meta.currentRecoveryMasked})`
                    : t('otp_sent_to_current_recovery')
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy} className="min-h-[44px]">
                  {busy ? <Loader2 size={16} className="animate-spin me-1" /> : null}
                  {t('verify_and_change_recovery')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => {
                    setStep('view');
                    setCode1('');
                    setCode2('');
                    setError('');
                  }}
                >
                  {t('cancel')}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export function SettingsActivityLog() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const allowed = isSuperAdmin(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    pb.collection('activity_logs')
      .getFullList({ sort: '-created', expand: 'user' })
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        {t('settings_sensitive_only_super')}
      </div>
    );
  }

  const actionLabel = (a) => t(a.action) || a.action;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{t('nav_activity')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('settings_activity_subtitle')}</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState message={t('empty_activity')} icon={Activity} />
      ) : (
        <div className="space-y-2">
          {rows.map((a) => {
            const when = a.created ? new Date(a.created) : null;
            const timeStr =
              when && !Number.isNaN(when.getTime())
                ? when.toLocaleTimeString(lang === 'ar' ? 'ar-AE' : 'en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';
            const account =
              a.admin ||
              a.expand?.user?.email ||
              a.expand?.user?.name ||
              '—';
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-start gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Activity size={15} />
                </span>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-semibold">{actionLabel(a)}</p>
                  <p className="text-xs text-muted-foreground break-words">
                    <span className="font-medium text-foreground/80">{t('activity_account')}:</span>{' '}
                    {account}
                    {a.device ? (
                      <>
                        {' · '}
                        <span className="font-medium text-foreground/80">{t('activity_device')}:</span>{' '}
                        {a.device}
                      </>
                    ) : null}
                    {a.details ? ` · ${a.details}` : ''}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground text-end whitespace-nowrap">
                  <p>{formatDate(a.created, lang)}</p>
                  {timeStr ? <p dir="ltr">{timeStr}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SettingsHub({ sub, onSubChange, platformPanel }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const mainSuper = isMainSuperAdmin(user);
  const isSuper = isSuperAdmin(user);

  const tabs = [
    {
      key: 'platform',
      label: lang === 'ar' ? 'مركز التحكم' : 'Control Center',
      icon: null,
      superOnly: false,
    },
    { key: 'password', label: t('change_admin_password'), icon: KeyRound, superOnly: true },
    { key: 'security', label: t('nav_security'), icon: ShieldCheck, superOnly: true },
    { key: 'activity', label: t('nav_activity'), icon: Activity, superOnly: false },
  ].filter((tab) => {
    if (tab.key === 'password' || tab.key === 'security') return mainSuper;
    if (tab.key === 'activity') return isSuper || mainSuper;
    return true;
  });

  const active = tabs.some((x) => x.key === sub) ? sub : tabs[0]?.key || 'platform';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t('nav_settings_hub')}</h2>
        <p className="text-sm text-muted-foreground">
          {lang === 'ar'
            ? 'مركز تحكم كامل للمنصة — الهوية، الصفحات، القوائم، الباقات والمميزات.'
            : 'Full platform CMS — branding, pages, menus, plans and features.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSubChange(tab.key)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[40px] inline-flex items-center gap-1.5',
              active === tab.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card hover:bg-accent',
            )}
          >
            {tab.icon ? <tab.icon size={14} /> : null}
            {tab.label}
          </button>
        ))}
      </div>
      {active === 'password' && <ChangeAdminPasswordPanel />}
      {active === 'security' && <SuperAdminSecurityPanel />}
      {active === 'activity' && <SettingsActivityLog />}
      {active === 'platform' && platformPanel}
    </div>
  );
}

export default SettingsHub;
