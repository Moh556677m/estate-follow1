import React, { useCallback, useEffect, useState } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  LogOut,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  Circle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import {
  listSessions,
  logoutSession,
  logoutOtherSessions,
  logoutAllSessions,
  removeSession,
  currentDeviceId,
} from '@/lib/sessions';
import { formatDate } from '@/lib/api';
import { cn } from '@/lib/utils';

const TYPE_ICON = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

const SecurityPanel = () => {
  const { user, logout } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const myDeviceId = currentDeviceId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listSessions();
      setSessions(rows);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleLogoutThis = async (s) => {
    setBusy(`out-${s.id}`);
    try {
      await logoutSession(s.id);
      // This is the current device — clear auth and go to login.
      await logout();
      navigate('/login', { replace: true });
    } catch {
      flash(t('something_wrong'));
    } finally {
      setBusy('');
    }
  };

  const handleLogoutOthers = async () => {
    setBusy('others');
    try {
      const n = await logoutOtherSessions(myDeviceId);
      flash(n > 0 ? t('logged_out_others') : t('no_other_sessions'));
      await load();
    } catch {
      flash(t('something_wrong'));
    } finally {
      setBusy('');
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm(t('confirm_logout_all'))) return;
    setBusy('all');
    try {
      await logoutAllSessions();
      await logout();
      navigate('/login', { replace: true });
    } catch {
      flash(t('something_wrong'));
      setBusy('');
    }
  };

  const handleRemove = async (s) => {
    if (!window.confirm(t('confirm_remove_device'))) return;
    setBusy(`rm-${s.id}`);
    try {
      await removeSession(s.id);
      await load();
    } catch {
      flash(t('something_wrong'));
    } finally {
      setBusy('');
    }
  };

  const activeCount = sessions.filter((s) => s.active).length;
  const deviceCount = sessions.length;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck size={16} />
          </span>
          <h2 className="text-2xl font-bold tracking-tight">{t('security_title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('security_subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleLogoutOthers}
          disabled={busy === 'others' || activeCount <= 1}
          className="min-h-[40px]"
        >
          {busy === 'others' ? <Loader2 size={14} className="animate-spin me-1" /> : null}
          {t('logout_all_others')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleLogoutAll}
          disabled={busy === 'all'}
          className="min-h-[40px]"
        >
          {busy === 'all' ? <Loader2 size={14} className="animate-spin me-1" /> : null}
          {t('logout_all_devices')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t('registered_devices')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {deviceCount}
            <span className="text-sm font-medium text-muted-foreground"> / 5</span>
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{t('active_sessions')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {activeCount}
            <span className="text-sm font-medium text-muted-foreground"> / 5</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold">{t('devices_list')}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleLogoutOthers}
            disabled={busy === 'others' || activeCount <= 1}
            className="min-h-[36px]"
          >
            {busy === 'others' ? (
              <Loader2 size={14} className="animate-spin me-1" />
            ) : (
              <LogOut size={14} className="me-1" />
            )}
            {t('logout_all_others')}
          </Button>
        </div>

        {notice && (
          <p className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700">
            {notice}
          </p>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('loading')}</p>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('no_devices')}</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const isCurrent = s.device_id === myDeviceId;
              const Icon = TYPE_ICON[s.device_type] || Monitor;
              return (
                <div
                  key={s.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3',
                    isCurrent ? 'border-primary/40 bg-primary/5' : 'bg-card',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      s.active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-primary/70 text-primary-foreground',
                    )}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-[160px] flex-1">
                    <p className="text-sm font-semibold">
                      {s.device_name || t('unknown_device')}
                      {isCurrent && (
                        <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {t('this_device')}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.browser} · {t('last_active')}: {formatDate(s.last_active, lang)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                      s.active
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-600',
                    )}
                  >
                    {s.active ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                    {s.active ? t('active_flag') : t('inactive_session')}
                  </span>
                  <div className="flex items-center gap-2">
                    {isCurrent ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLogoutThis(s)}
                        disabled={busy === `out-${s.id}`}
                        className="min-h-[36px]"
                      >
                        {busy === `out-${s.id}` ? (
                          <Loader2 size={13} className="animate-spin me-1" />
                        ) : (
                          <LogOut size={13} className="me-1" />
                        )}
                        {t('logout_this_device')}
                      </Button>
                    ) : (
                      <>
                        {s.active && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setBusy(`out-${s.id}`);
                              logoutSession(s.id)
                                .then(() => load())
                                .catch(() => flash(t('something_wrong')))
                                .finally(() => setBusy(''));
                            }}
                            disabled={busy === `out-${s.id}`}
                            className="min-h-[36px]"
                          >
                            {busy === `out-${s.id}` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <LogOut size={13} />
                            )}
                            {t('logout')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemove(s)}
                          disabled={busy === `rm-${s.id}`}
                          className="min-h-[36px] text-destructive hover:text-destructive"
                        >
                          {busy === `rm-${s.id}` ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                          {t('remove_device')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t('devices_hint')}</p>
      </div>
    </div>
  );
};

export default SecurityPanel;
