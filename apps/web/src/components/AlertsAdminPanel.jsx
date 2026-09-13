import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  HardHat,
  KeyRound,
  Pencil,
  Plus,
  Receipt,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { formatDate } from '@/lib/api';
import { EmptyState, StatCard } from '@/components/shared';
import { cn } from '@/lib/utils';
import {
  buildEvents,
  summarize,
  REMINDER_PRESETS,
} from '@/lib/alertsClient';

const TYPE_ICONS = {
  installment: CreditCard,
  rent: KeyRound,
  cheque: Receipt,
  contract_expiry: FileText,
  service_fee: Receipt,
  handover: HardHat,
  document_expiry: FileText,
  custom: Bell,
};

const TOGGLES = [
  { key: 'system_enabled', label: 'alerts_admin_system' },
  { key: 'owner_alerts_enabled', label: 'alerts_admin_owner' },
  { key: 'email_alerts_enabled', label: 'alerts_admin_email' },
  { key: 'in_app_enabled', label: 'alerts_admin_in_app' },
  { key: 'upcoming_enabled', label: 'alerts_admin_upcoming' },
  { key: 'overdue_enabled', label: 'alerts_admin_overdue' },
  { key: 'repeated_overdue_enabled', label: 'alerts_admin_repeated' },
  { key: 'calendar_enabled', label: 'alerts_admin_calendar' },
];

const TYPE_KEYS = ['installment', 'rent', 'cheque', 'contract_expiry', 'service_fee', 'handover', 'document_expiry', 'custom'];

const AlertsAdminPanel = () => {
  const { t, lang } = useLanguage();
  const [admin, setAdmin] = useState(null);
  const [types, setTypes] = useState([]);
  const [audit, setAudit] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [allProps, setAllProps] = useState([]);
  const [allPays, setAllPays] = useState([]);
  const [allManual, setAllManual] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [typeDialog, setTypeDialog] = useState(null); // null | {open, editing}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, ty, au, ex, props, pays, manual] = await Promise.all([
        pb.collection('alert_admin_settings').getFullList({ requestKey: `aa-admin-${Date.now()}` }).catch(() => []),
        pb.collection('alert_types').getFullList({ sort: 'order', requestKey: `aa-types-${Date.now()}` }).catch(() => []),
        pb.collection('alert_audit_log').getFullList({ sort: '-created', requestKey: `aa-audit-${Date.now()}` }).catch(() => []),
        pb.collection('alert_executions').getFullList({ sort: '-created', requestKey: `aa-exec-${Date.now()}` }).catch(() => []),
        pb.collection('properties').getFullList({ requestKey: `aa-props-${Date.now()}` }).catch(() => []),
        pb.collection('payments').getFullList({ requestKey: `aa-pays-${Date.now()}` }).catch(() => []),
        pb.collection('property_alerts').getFullList({ requestKey: `aa-manual-${Date.now()}` }).catch(() => []),
      ]);
      setAdmin(a[0] || null);
      setTypes(ty);
      setAudit(au.slice(0, 50));
      setExecutions(ex);
      setAllProps(props);
      setAllPays(pays);
      setAllManual(manual);
    } catch (_) { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live: alert config, types, audit, executions, properties, payments and
  // manual property alerts all refresh in real time across admin tabs.
  useRealtimeRefresh(load, [
    'alert_admin_settings',
    'alert_types',
    'alert_audit_log',
    'alert_executions',
    'properties',
    'payments',
    'property_alerts',
  ]);

  const adminDefaults = useMemo(() => {
    const d = admin?.default_reminders;
    return d && typeof d === 'object' ? d : {};
  }, [admin]);

  const analytics = useMemo(() => {
    const events = buildEvents({ properties: allProps, payments: allPays, manualAlerts: allManual, adminDefaults });
    const s = summarize(events);
    const sent = executions.filter((e) => e.status === 'sent').length;
    const failed = executions.filter((e) => e.status === 'failed').length;
    return { ...s, sent, failed, total: events.length };
  }, [allProps, allPays, allManual, adminDefaults, executions]);

  const toggleAdmin = (key) => {
    setAdmin((a) => (a ? { ...a, [key]: !a[key] } : a));
  };

  const setDefaultReminders = (typeKey, off) => {
    setAdmin((a) => {
      if (!a) return a;
      const d = { ...(a.default_reminders || {}) };
      const cur = Array.isArray(d[typeKey]) ? d[typeKey] : [];
      const has = cur.includes(off);
      d[typeKey] = has ? cur.filter((x) => x !== off) : [...cur, off].sort((x, y) => y - x);
      return { ...a, default_reminders: d };
    });
  };

  const saveAdmin = async () => {
    if (!admin) return;
    setSaving(true);
    try {
      const updated = await pb.collection('alert_admin_settings').update(admin.id, {
        system_enabled: admin.system_enabled,
        owner_alerts_enabled: admin.owner_alerts_enabled,
        email_alerts_enabled: admin.email_alerts_enabled,
        in_app_enabled: admin.in_app_enabled,
        upcoming_enabled: admin.upcoming_enabled,
        overdue_enabled: admin.overdue_enabled,
        repeated_overdue_enabled: admin.repeated_overdue_enabled,
        calendar_enabled: admin.calendar_enabled,
        default_reminders: admin.default_reminders,
      }, { requestKey: `aa-save-${Date.now()}` });
      setAdmin(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (_) { /* ignore */ }
    setSaving(false);
  };

  const saveType = async (data) => {
    try {
      if (data.id) {
        await pb.collection('alert_types').update(data.id, {
          name_en: data.name_en,
          name_ar: data.name_ar,
          icon: data.icon,
          is_financial: data.is_financial,
          active: data.active,
          default_reminders: data.default_reminders,
          channels: data.channels,
          order: data.order,
        }, { requestKey: `aa-type-up-${data.id}-${Date.now()}` });
      } else {
        await pb.collection('alert_types').create({
          key: data.key,
          name_en: data.name_en,
          name_ar: data.name_ar,
          icon: data.icon,
          is_financial: data.is_financial,
          active: data.active,
          default_reminders: data.default_reminders,
          channels: data.channels,
          order: data.order,
        }, { requestKey: `aa-type-cr-${Date.now()}` });
      }
      setTypeDialog(null);
      load();
    } catch (_) { /* ignore */ }
  };

  const deleteType = async (tp) => {
    if (!window.confirm(t('alerts_delete') + '?')) return;
    try {
      await pb.collection('alert_types').delete(tp.id, { requestKey: `aa-type-del-${tp.id}-${Date.now()}` });
      load();
    } catch (_) { /* ignore */ }
  };

  if (loading) return <p className="py-12 text-center text-muted-foreground">{t('loading')}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{t('alerts_admin_title')}</h2>
        <p className="text-sm text-muted-foreground">{t('alerts_admin_subtitle')}</p>
      </div>

      {/* Control toggles */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{t('alerts_admin_title')}</h3>
          <Button size="sm" onClick={saveAdmin} disabled={saving} className="min-h-[36px]">
            <Save size={14} className="me-1" /> {saving ? t('loading') : t('save')}
          </Button>
        </div>
        {saved && <p className="text-xs font-semibold text-emerald-700">{t('alerts_settings_saved')}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TOGGLES.map((tg) => (
            <div key={tg.key} className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2.5">
              <span className="text-sm font-medium">{t(tg.label)}</span>
              <Switch checked={!!admin?.[tg.key]} onCheckedChange={() => toggleAdmin(tg.key)} />
            </div>
          ))}
        </div>
      </div>

      {/* Default reminder settings */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
        <div>
          <h3 className="font-bold">{t('alerts_admin_defaults')}</h3>
          <p className="text-xs text-muted-foreground">{t('alerts_admin_defaults_hint')}</p>
        </div>
        <div className="space-y-2">
          {TYPE_KEYS.map((tk) => {
            const cur = Array.isArray(adminDefaults[tk]) ? adminDefaults[tk] : [];
            return (
              <div key={tk} className="rounded-lg border bg-accent/20 p-3">
                <p className="text-sm font-semibold mb-2">{t(`alerts_type_${tk}`)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {REMINDER_PRESETS.map((off) => {
                    const active = cur.includes(off);
                    return (
                      <button
                        key={off}
                        type="button"
                        onClick={() => setDefaultReminders(tk, off)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors min-h-[30px]',
                          active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent',
                        )}
                      >
                        {off === 0 ? t('alerts_reminder_presets_0') : `${off} ${t('alerts_days_before')}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <Button size="sm" onClick={saveAdmin} disabled={saving} className="min-h-[36px]">
          <Save size={14} className="me-1" /> {t('save')}
        </Button>
      </div>

      {/* Analytics */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
        <h3 className="font-bold">{t('alerts_admin_analytics')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Bell} label={t('alerts_admin_total_scheduled')} value={analytics.total} />
          <StatCard icon={CheckCircle2} label={t('alerts_admin_sent')} value={analytics.sent} />
          <StatCard icon={Clock} label={t('alerts_admin_upcoming_count')} value={analytics.next30} />
          <StatCard icon={AlertTriangle} label={t('alerts_admin_overdue_count')} value={analytics.overdue} />
          <StatCard icon={CheckCircle2} label={t('alerts_admin_completed_count')} value={analytics.completed} />
          <StatCard icon={XCircle} label={t('alerts_admin_failed')} value={analytics.failed} />
        </div>
      </div>

      {/* System health */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
        <h3 className="font-bold">{t('alerts_admin_health')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2.5">
            <span>{t('alerts_admin_scheduler')}</span>
            <span className={cn('font-semibold', admin?.system_enabled ? 'text-emerald-700' : 'text-red-600')}>
              {admin?.system_enabled ? t('alerts_health_active') : t('alerts_health_inactive')}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2.5">
            <span>{t('alerts_admin_email_status')}</span>
            <span className={cn('font-semibold', admin?.email_alerts_enabled ? 'text-emerald-700' : 'text-muted-foreground')}>
              {admin?.email_alerts_enabled ? t('alerts_health_ok') : t('alerts_health_inactive')}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2.5">
            <span>{t('alerts_admin_notif_status')}</span>
            <span className={cn('font-semibold', admin?.in_app_enabled ? 'text-emerald-700' : 'text-muted-foreground')}>
              {admin?.in_app_enabled ? t('alerts_health_ok') : t('alerts_health_inactive')}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2.5">
            <span>{t('alerts_admin_failed_jobs')}</span>
            <span className="font-semibold tabular-nums">{analytics.failed}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2.5 sm:col-span-2">
            <span>{t('alerts_admin_last_run')}</span>
            <span className="font-medium" dir="ltr">{admin?.last_run ? formatDate(admin.last_run, lang) : '—'}</span>
          </div>
        </div>
      </div>

      {/* Alert types management */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{t('alerts_admin_types')}</h3>
          <Button size="sm" onClick={() => setTypeDialog({ open: true, editing: null })} className="min-h-[36px]">
            <Plus size={14} className="me-1" /> {t('alerts_admin_add_type')}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {types.map((tp) => {
            const Icon = TYPE_ICONS[tp.key] || Bell;
            return (
              <div key={tp.id} className="flex items-center gap-3 rounded-lg border bg-accent/20 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{lang === 'ar' ? tp.name_ar : tp.name_en} <span className="text-muted-foreground font-normal">({tp.key})</span></p>
                  <p className="text-xs text-muted-foreground">{tp.is_financial ? t('alerts_admin_type_financial') : '—'} · {(tp.default_reminders || []).join(', ')} {t('alerts_days_before')}</p>
                </div>
                <Switch checked={!!tp.active} onCheckedChange={async (v) => { try { await pb.collection('alert_types').update(tp.id, { active: v }, { requestKey: `aa-type-act-${tp.id}-${Date.now()}` }); load(); } catch (_) {} }} />
                <Button size="icon" variant="ghost" onClick={() => setTypeDialog({ open: true, editing: tp })} className="min-h-[36px] min-w-[36px]"><Pencil size={14} /></Button>
                <Button size="icon" variant="ghost" onClick={() => deleteType(tp)} className="min-h-[36px] min-w-[36px] text-destructive hover:bg-red-50"><Trash2 size={14} /></Button>
              </div>
            );
          })}
          {types.length === 0 && <EmptyState message={t('alerts_admin_types')} icon={Bell} />}
        </div>
      </div>

      {/* Audit log */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
        <h3 className="font-bold">{t('alerts_admin_audit')}</h3>
        {audit.length === 0 ? (
          <EmptyState message={t('alerts_admin_audit')} icon={Activity} />
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {audit.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/20 px-3 py-2 text-xs">
                <span className="font-semibold">{t(`alerts_audit_${a.action}`)}</span>
                <span className="text-muted-foreground">{a.details}</span>
                <span className="text-muted-foreground" dir="ltr">{formatDate(a.created, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Type dialog */}
      <TypeDialog
        state={typeDialog}
        onClose={() => setTypeDialog(null)}
        onSave={saveType}
      />
    </div>
  );
};

const TypeDialog = ({ state, onClose, onSave }) => {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  useEffect(() => {
    if (state) {
      const e = state.editing;
      setData({
        id: e?.id || null,
        key: e?.key || '',
        name_en: e?.name_en || '',
        name_ar: e?.name_ar || '',
        icon: e?.icon || 'Bell',
        is_financial: !!e?.is_financial,
        active: e?.active !== false,
        default_reminders: e?.default_reminders || [7, 1],
        channels: e?.channels || { in_app: true, email: true, whatsapp: false, sms: false },
        order: e?.order || 99,
      });
    }
  }, [state]);

  if (!state || !data) return null;
  const set = (k) => (ev) => setData((d) => ({ ...d, [k]: ev.target.value }));

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('alerts_admin_add_type')}</DialogTitle>
          <DialogDescription>{t('alerts_admin_types')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!data.id && (
            <div className="space-y-2">
              <Label>{t('alerts_admin_type_key')}</Label>
              <Input value={data.key} onChange={set('key')} className="min-h-[40px]" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('alerts_admin_type_name_en')}</Label>
              <Input value={data.name_en} onChange={set('name_en')} className="min-h-[40px]" />
            </div>
            <div className="space-y-2">
              <Label>{t('alerts_admin_type_name_ar')}</Label>
              <Input value={data.name_ar} onChange={set('name_ar')} className="min-h-[40px]" dir="rtl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('alerts_admin_type_icon')}</Label>
              <Input value={data.icon} onChange={set('icon')} className="min-h-[40px]" />
            </div>
            <div className="space-y-2">
              <Label>{t('alerts_admin_type_default_schedule')}</Label>
              <Input value={(data.default_reminders || []).join(',')} onChange={(e) => setData((d) => ({ ...d, default_reminders: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n)) }))} className="min-h-[40px]" dir="ltr" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={data.is_financial} onCheckedChange={(v) => setData((d) => ({ ...d, is_financial: v }))} /> {t('alerts_admin_type_financial')}</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={data.active} onCheckedChange={(v) => setData((d) => ({ ...d, active: v }))} /> {t('alerts_admin_type_active')}</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="min-h-[40px]">{t('cancel')}</Button>
            <Button onClick={() => onSave(data)} className="min-h-[40px]">{t('save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AlertsAdminPanel;
