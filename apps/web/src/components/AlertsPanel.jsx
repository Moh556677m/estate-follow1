import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  HardHat,
  KeyRound,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { formatDate, formatMoney, propertyLabel } from '@/lib/api';
import { DocButton, EmptyState, StatCard } from '@/components/shared';
import { cn } from '@/lib/utils';
import AlertForm from '@/components/AlertForm';
import {
  buildEvents,
  summarize,
  needsAttention,
  loadManualAlerts,
  loadAlertSettings,
  loadAlertTypes,
  loadAdminAlertSettings,
  ensureAlertSettings,
  processAlerts,
  deleteManualAlert,
  markManualAlertDone,
  markPaymentPaid,
  savePropertyAlertOverride,
  STATUS_ORDER,
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

const STATUS_STYLES = {
  upcoming: 'bg-blue-50 text-blue-700 border-blue-200',
  due_soon: 'bg-amber-50 text-amber-700 border-amber-200',
  due_today: 'bg-orange-100 text-orange-800 border-orange-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  overdue: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

const AlertsPanel = ({ properties = [], payments = [], propertyFilter = null, onOpenProperty, onClearFilter }) => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [manualAlerts, setManualAlerts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [adminSettings, setAdminSettings] = useState(null);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProp, setFilterProp] = useState(propertyFilter || 'all');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [manual, st, at, admin] = await Promise.all([
      loadManualAlerts(),
      loadAlertSettings(),
      loadAlertTypes(),
      loadAdminAlertSettings(),
    ]);
    setManualAlerts(manual);
    setSettings(st);
    setTypes(at);
    setAdminSettings(admin);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Trigger backend processor on mount (pull-based scheduler).
    setProcessing(true);
    processAlerts().finally(() => setProcessing(false));
  }, [load]);

  // Realtime: refresh when manual alerts / payments / properties change.
  useEffect(() => {
    const cols = ['property_alerts', 'payments', 'properties'];
    let debounce = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => load(), 400);
    };
    cols.forEach((c) => { void pb.collection(c).subscribe('*', schedule).catch(() => {}); });
    return () => {
      if (debounce) clearTimeout(debounce);
      cols.forEach((c) => { void pb.collection(c).unsubscribe('*').catch(() => {}); });
    };
  }, [load]);

  const adminDefaults = useMemo(() => {
    const d = adminSettings?.default_reminders;
    return d && typeof d === 'object' ? d : {};
  }, [adminSettings]);

  const events = useMemo(
    () => buildEvents({ properties, payments, manualAlerts, adminDefaults }),
    [properties, payments, manualAlerts, adminDefaults],
  );

  const summary = useMemo(() => summarize(events), [events]);
  const attention = useMemo(() => needsAttention(events, t), [events, t]);

  const filtered = useMemo(() => {
    let list = events;
    if (propertyFilter) list = list.filter((e) => e.propertyId === propertyFilter);
    if (filterProp !== 'all') list = list.filter((e) => e.propertyId === filterProp);
    if (filterType !== 'all') list = list.filter((e) => e.type === filterType);
    if (filterStatus !== 'all') list = list.filter((e) => e.status === filterStatus);
    return list.slice().sort((a, b) => a.eventDate - b.eventDate);
  }, [events, filterProp, filterType, filterStatus, propertyFilter]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (ev) => {
    if (ev.source !== 'manual') return;
    setEditing({ ...ev.raw, id: ev.refId, propertyId: ev.propertyId, eventDate: ev.eventDate });
    setFormOpen(true);
  };

  const handleDelete = async (ev) => {
    if (ev.source !== 'manual') return;
    if (!window.confirm(t('alerts_delete') + '?')) return;
    try {
      await deleteManualAlert(ev.refId);
      load();
    } catch (_) { /* ignore */ }
  };

  const handleDone = async (ev) => {
    try {
      if (ev.source === 'manual') {
        await markManualAlertDone(ev.refId, ev.isFinancial);
      } else if (ev.refCollection === 'payments') {
        await markPaymentPaid(ev.raw);
      }
      load();
    } catch (_) { /* ignore */ }
  };

  const toggleChannel = async (key) => {
    const s = settings || (await ensureAlertSettings());
    if (!s) return;
    try {
      const updated = await pb.collection('alert_settings').update(s.id, { [key]: !s[key] }, {
        requestKey: `alert-set-${key}-${Date.now()}`,
      });
      setSettings(updated);
    } catch (_) { /* ignore */ }
  };

  const propLabel = (ev) => ev.propertyLabel || (ev.propertyId ? propertyLabel(properties.find((p) => p.id === ev.propertyId)) : '');

  const renderEventRow = (ev) => {
    const Icon = TYPE_ICONS[ev.type] || Bell;
    return (
      <div
        key={ev.id}
        className="rounded-xl border bg-card p-4 shadow-sm space-y-3 cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => setSelected(ev)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Icon size={16} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold truncate">{ev.title}</p>
              <p className="text-xs text-muted-foreground truncate">{propLabel(ev)}</p>
            </div>
          </div>
          <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS_STYLES[ev.status])}>
            {t(`alerts_status_${ev.status}`)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CalendarClock size={12} /> {formatDate(ev.eventDate, lang)}
            {ev.eventTime ? ` · ${ev.eventTime}` : ''}
          </span>
          {ev.isFinancial && Number(ev.amount) > 0 && (
            <span className="font-semibold tabular-nums" dir="ltr">{formatMoney(ev.amount, lang)}</span>
          )}
          <span className={cn('rounded-full px-2 py-0.5', ev.source === 'auto' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700')}>
            {ev.source === 'auto' ? t('alerts_source_auto') : t('alerts_source_manual')}
          </span>
          {!ev.done && ev.daysUntil < 0 && (
            <span className="text-red-600 font-medium">{t('alerts_days_late').replace('{n}', Math.abs(ev.daysUntil))}</span>
          )}
          {!ev.done && ev.daysUntil >= 0 && ev.daysUntil <= 30 && (
            <span className="text-muted-foreground">
              {ev.daysUntil === 0 ? t('alerts_due_now') : t('alerts_due_in_days').replace('{n}', ev.daysUntil)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          {!ev.done && (
            <Button
              size="sm"
              onClick={() => handleDone(ev)}
              className="min-h-[36px] bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 size={13} className="me-1" />
              {ev.isFinancial ? t('alerts_mark_paid') : t('alerts_mark_completed')}
            </Button>
          )}
          {ev.source === 'manual' && (
            <>
              <Button size="sm" variant="outline" onClick={() => openEdit(ev)} className="min-h-[36px]">
                <Pencil size={13} className="me-1" /> {t('edit')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(ev)} className="min-h-[36px] text-destructive hover:bg-red-50">
                <Trash2 size={13} />
              </Button>
            </>
          )}
          {ev.relatedDocField && ev.raw && ev.raw[ev.relatedDocField] && (
            <DocButton record={ev.raw} field={ev.relatedDocField} label={t('alerts_event_document')} />
          )}
        </div>
      </div>
    );
  };

  const attentionLabel = (key) => {
    if (key === 'overdue') return t('alerts_overdue');
    if (key === 'due_today') return t('alerts_due_today');
    if (key === 'week') return t('alerts_next_7');
    if (key === 'month') return t('alerts_next_30');
    return key;
  };

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {propertyFilter && onClearFilter && (
            <button
              type="button"
              onClick={onClearFilter}
              className="mb-1 text-xs text-muted-foreground hover:text-primary underline underline-offset-2"
            >
              {lang === 'ar' ? '← كل العقارات' : '← All properties'}
            </button>
          )}
          <h2 className="text-xl font-bold tracking-tight">{t('alerts_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('alerts_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {processing && <span className="text-xs text-muted-foreground">{t('loading')}</span>}
          <Button onClick={openAdd} className="min-h-[40px]">
            <Plus size={15} className="me-1" /> {t('alerts_add')}
          </Button>
        </div>
      </div>

      {/* Quick summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Clock} label={t('alerts_due_today')} value={summary.dueToday} />
        <StatCard icon={CalendarClock} label={t('alerts_next_7')} value={summary.next7} />
        <StatCard icon={CalendarClock} label={t('alerts_next_30')} value={summary.next30} />
        <StatCard icon={AlertTriangle} label={t('alerts_overdue')} value={summary.overdue} />
      </div>

      {/* Needs your attention */}
      {!propertyFilter && attention.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            <h3 className="font-bold">{t('alerts_needs_attention')}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {attention.map((grp) => (
              <button
                key={grp.key}
                type="button"
                onClick={() => setFilterStatus(grp.key === 'overdue' ? 'overdue' : grp.key === 'due_today' ? 'due_today' : 'all')}
                className="flex items-center justify-between rounded-lg border bg-accent/40 px-3 py-2.5 text-start hover:bg-accent transition-colors"
              >
                <span className="text-sm font-medium">{attentionLabel(grp.key)}</span>
                <span className="text-sm font-bold tabular-nums text-primary">{grp.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Channel settings */}
      {!propertyFilter && settings && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
          <h3 className="font-bold">{t('alerts_channels')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { key: 'in_app_enabled', label: t('alerts_channel_in_app') },
              { key: 'email_enabled', label: t('alerts_channel_email') },
              { key: 'whatsapp_enabled', label: t('alerts_channel_whatsapp') },
              { key: 'sms_enabled', label: t('alerts_channel_sms') },
              { key: 'push_enabled', label: t('alerts_channel_push') },
            ].map((c) => (
              <div key={c.key} className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2">
                <span className="text-xs font-medium">{c.label}</span>
                <Switch checked={!!settings[c.key]} onCheckedChange={() => toggleChannel(c.key)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {!propertyFilter && (
          <Select value={filterProp} onValueChange={setFilterProp}>
            <SelectTrigger className="w-[160px] min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">{t('alerts_filter_property')}: {t('alerts_filter_all')}</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.building} / {p.unit_number}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[150px] min-h-[40px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('alerts_filter_type')}: {t('alerts_filter_all')}</SelectItem>
            {['installment', 'rent', 'cheque', 'contract_expiry', 'service_fee', 'handover', 'document_expiry', 'custom'].map((tp) => (
              <SelectItem key={tp} value={tp}>{t(`alerts_type_${tp}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] min-h-[40px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('alerts_filter_status')}: {t('alerts_filter_all')}</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>{t(`alerts_status_${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <p className="py-12 text-center text-muted-foreground">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <EmptyState message={propertyFilter ? t('alerts_empty_property') : t('alerts_empty')} icon={Bell} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(renderEventRow)}
        </div>
      )}

      <AlertForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={load}
        properties={properties}
        editing={editing}
        fixedPropertyId={propertyFilter}
      />

      {/* Event details dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('alerts_event_details')}</DialogTitle>
            <DialogDescription>{selected?.title}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_property')}</span><span className="font-medium">{propLabel(selected)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_type')}</span><span className="font-medium">{t(`alerts_type_${selected.type}`)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_date')}</span><span className="font-medium" dir="ltr">{formatDate(selected.eventDate, lang)}{selected.eventTime ? ` · ${selected.eventTime}` : ''}</span></div>
              {selected.isFinancial && Number(selected.amount) > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_amount')}</span><span className="font-medium tabular-nums" dir="ltr">{formatMoney(selected.amount, lang)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_repeat')}</span><span className="font-medium">{t(`alerts_repeat_${selected.repeat}`)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_reminders')}</span><span className="font-medium">{(selected.reminders || []).map((r) => r === 0 ? t('alerts_reminder_presets_0') : `${r} ${t('alerts_days_before')}`).join('، ')}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_source')}</span><span className="font-medium">{selected.source === 'auto' ? t('alerts_source_auto') : t('alerts_source_manual')}</span></div>
              {selected.notes && <div className="rounded-lg bg-accent/40 p-3"><p className="text-xs text-muted-foreground mb-1">{t('alerts_event_notes')}</p><p className="whitespace-pre-line">{selected.notes}</p></div>}
              {selected.relatedDocField && selected.raw && selected.raw[selected.relatedDocField] && (
                <DocButton record={selected.raw} field={selected.relatedDocField} label={t('alerts_event_document')} />
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {!selected.done && (
                  <Button onClick={() => { handleDone(selected); setSelected(null); }} className="min-h-[40px] bg-emerald-600 hover:bg-emerald-700">
                    <CheckCircle2 size={15} className="me-1" />
                    {selected.isFinancial ? t('alerts_mark_paid') : t('alerts_mark_completed')}
                  </Button>
                )}
                {selected.source === 'manual' && (
                  <Button variant="outline" onClick={() => { openEdit(selected); setSelected(null); }} className="min-h-[40px]">
                    <Pencil size={15} className="me-1" /> {t('alerts_edit')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AlertsPanel;
