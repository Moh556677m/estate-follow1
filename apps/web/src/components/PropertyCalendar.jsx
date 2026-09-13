import React, { useMemo, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  HardHat,
  KeyRound,
  Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDate, formatMoney, propertyLabel } from '@/lib/api';
import { DocButton } from '@/components/shared';
import { cn } from '@/lib/utils';
import {
  buildEvents,
  loadManualAlerts,
  loadAdminAlertSettings,
  markManualAlertDone,
  markPaymentPaid,
  markRentPaymentCollected,
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

const STATUS_DOT = {
  upcoming: 'bg-blue-500',
  due_soon: 'bg-amber-500',
  due_today: 'bg-orange-500',
  completed: 'bg-emerald-500',
  paid: 'bg-emerald-500',
  overdue: 'bg-red-500',
  cancelled: 'bg-slate-400',
};

const WD = (lang) => (lang === 'ar'
  ? ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
  : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

const MO = (lang) => (lang === 'ar'
  ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const PropertyCalendar = ({ properties = [], payments = [], tenancies = [], rentPayments = [] }) => {
  const { t, lang } = useLanguage();
  const [view, setView] = useState('month'); // month | week | day
  const [cursor, setCursor] = useState(new Date());
  const [manualAlerts, setManualAlerts] = useState([]);
  const [adminDefaults, setAdminDefaults] = useState({});
  const [selectedDay, setSelectedDay] = useState(null);
  const [selected, setSelected] = useState(null);

  React.useEffect(() => {
    loadManualAlerts().then(setManualAlerts).catch(() => {});
    loadAdminAlertSettings().then((a) => setAdminDefaults(a?.default_reminders || {})).catch(() => {});
  }, []);

  // Live: manual alerts + admin alert defaults refresh in real time.
  // properties/payments arrive live as props from the dashboard.
  useRealtimeRefresh(() => {
    loadManualAlerts().then(setManualAlerts).catch(() => {});
    loadAdminAlertSettings().then((a) => setAdminDefaults(a?.default_reminders || {})).catch(() => {});
  }, ['property_alerts', 'alert_admin_settings', 'alert_types']);

  const events = useMemo(
    () => buildEvents({ properties, payments, manualAlerts, adminDefaults, tenancies, rentPayments }),
    [properties, payments, manualAlerts, adminDefaults, tenancies, rentPayments],
  );

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      const k = ymd(ev.eventDate);
      (map[k] = map[k] || []).push(ev);
    });
    return map;
  }, [events]);

  const propLabel = (ev) => ev.propertyLabel || (ev.propertyId ? propertyLabel(properties.find((p) => p.id === ev.propertyId)) : '');

  const today = new Date();
  const todayKey = ymd(today);

  const shift = (n) => {
    const c = new Date(cursor);
    if (view === 'month') c.setMonth(c.getMonth() + n);
    else if (view === 'week') c.setDate(c.getDate() + n * 7);
    else c.setDate(c.getDate() + n);
    setCursor(c);
  };

  const headerLabel = useMemo(() => {
    if (view === 'month') return `${MO(lang)[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === 'day') return formatDate(cursor, lang);
    // week
    const start = new Date(cursor);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${formatDate(start, lang)} — ${formatDate(end, lang)}`;
  }, [view, cursor, lang]);

  const handleDone = async (ev) => {
    try {
      if (ev.source === 'manual') await markManualAlertDone(ev.refId, ev.isFinancial);
      else if (ev.refCollection === 'payments') await markPaymentPaid(ev.raw);
      else if (ev.refCollection === 'rent_payments') await markRentPaymentCollected(ev.raw);
      setSelected(null);
      loadManualAlerts().then(setManualAlerts).catch(() => {});
    } catch (_) { /* ignore */ }
  };

  const renderEventChip = (ev) => {
    const Icon = TYPE_ICONS[ev.type] || Bell;
    return (
      <button
        key={ev.id}
        type="button"
        onClick={() => setSelected(ev)}
        className="flex w-full items-center gap-1.5 rounded-md bg-accent/60 px-2 py-1 text-start text-[11px] hover:bg-accent transition-colors"
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[ev.status])} />
        <Icon size={11} className="shrink-0 text-muted-foreground" />
        <span className="truncate">{ev.title}</span>
      </button>
    );
  };

  const renderDayList = (day) => {
    const list = eventsByDay[ymd(day)] || [];
    return (
      <div className="space-y-2">
        <p className="text-sm font-bold">{formatDate(day, lang)}</p>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('alerts_no_events_day')}</p>
        ) : (
          list.map((ev) => {
            const Icon = TYPE_ICONS[ev.type] || Bell;
            return (
              <div key={ev.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[ev.status])} />
                    <Icon size={14} className="text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold truncate">{ev.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate">{propLabel(ev)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {ev.isFinancial && Number(ev.amount) > 0 && <span className="tabular-nums" dir="ltr">{formatMoney(ev.amount, lang)}</span>}
                  <span>{t(`alerts_status_${ev.status}`)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!ev.done && (
                    <Button size="sm" onClick={() => handleDone(ev)} className="min-h-[34px] bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle2 size={12} className="me-1" />
                      {ev.isFinancial ? t('alerts_mark_paid') : t('alerts_mark_completed')}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setSelected(ev)} className="min-h-[34px]">{t('edit')}</Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  // Month grid
  const monthGrid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [cursor]);

  // Week grid
  const weekGrid = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(start.getDate() - start.getDay());
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [cursor]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t('alerts_calendar_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('alerts_calendar_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-card p-0.5">
            {['month', 'week', 'day'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors min-h-[34px]',
                  view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`alerts_view_${v}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => shift(-1)} className="min-h-[40px] min-w-[40px]">
          <ChevronLeft size={18} className={lang === 'ar' ? 'rotate-180' : ''} />
        </Button>
        <p className="text-lg font-bold">{headerLabel}</p>
        <Button variant="outline" size="icon" onClick={() => shift(1)} className="min-h-[40px] min-w-[40px]">
          <ChevronRight size={18} className={lang === 'ar' ? 'rotate-180' : ''} />
        </Button>
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())} className="min-h-[36px]">
          <CalendarDays size={14} className="me-1" /> {t('alerts_today')}
        </Button>
      </div>

      {view === 'month' && (
        <div className="rounded-2xl border bg-card p-2 sm:p-3 shadow-sm">
          <div className="grid grid-cols-7 mb-1">
            {WD(lang).map((w) => (
              <div key={w} className="text-center text-xs font-semibold text-muted-foreground py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthGrid.map((d, i) => {
              const k = ymd(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const list = eventsByDay[k] || [];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    'min-h-[78px] rounded-lg border p-1.5 text-start transition-colors hover:border-primary/40',
                    inMonth ? 'bg-card' : 'bg-accent/20',
                    k === todayKey && 'border-primary ring-1 ring-primary/40',
                  )}
                >
                  <span className={cn('text-xs font-semibold', k === todayKey ? 'text-primary' : 'text-muted-foreground')}>
                    {d.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 3).map((ev) => {
                      const Icon = TYPE_ICONS[ev.type] || Bell;
                      return (
                        <span key={ev.id} className="flex items-center gap-1 rounded bg-accent/60 px-1 py-0.5 text-[10px] truncate">
                          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[ev.status])} />
                          <Icon size={9} className="shrink-0" />
                          <span className="truncate">{ev.title}</span>
                        </span>
                      );
                    })}
                    {list.length > 3 && <span className="text-[10px] text-muted-foreground">+{list.length - 3}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === 'week' && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {weekGrid.map((d, i) => {
            const k = ymd(d);
            const list = eventsByDay[k] || [];
            return (
              <div key={i} className={cn('rounded-xl border bg-card p-2 min-h-[120px]', k === todayKey && 'border-primary ring-1 ring-primary/40')}>
                <p className={cn('text-xs font-bold mb-1.5', k === todayKey ? 'text-primary' : 'text-muted-foreground')}>
                  {WD(lang)[d.getDay()]} · {d.getDate()}
                </p>
                <div className="space-y-1">
                  {list.length === 0 ? <p className="text-[10px] text-muted-foreground">—</p> : list.map(renderEventChip)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'day' && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          {renderDayList(cursor)}
        </div>
      )}

      {/* Day detail (from month view) */}
      <Dialog open={!!selectedDay} onOpenChange={(o) => { if (!o) setSelectedDay(null); }}>
        <DialogContent className="max-w-md max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedDay ? formatDate(selectedDay, lang) : ''}</DialogTitle>
            <DialogDescription>{t('alerts_calendar_subtitle')}</DialogDescription>
          </DialogHeader>
          {selectedDay && renderDayList(selectedDay)}
        </DialogContent>
      </Dialog>

      {/* Event detail */}
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
              <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_date')}</span><span className="font-medium" dir="ltr">{formatDate(selected.eventDate, lang)}</span></div>
              {selected.isFinancial && Number(selected.amount) > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_amount')}</span><span className="font-medium tabular-nums" dir="ltr">{formatMoney(selected.amount, lang)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">{t('alerts_event_source')}</span><span className="font-medium">{selected.source === 'auto' ? t('alerts_source_auto') : t('alerts_source_manual')}</span></div>
              {selected.notes && <div className="rounded-lg bg-accent/40 p-3"><p className="text-xs text-muted-foreground mb-1">{t('alerts_event_notes')}</p><p className="whitespace-pre-line">{selected.notes}</p></div>}
              {selected.relatedDocField && selected.raw && selected.raw[selected.relatedDocField] && (
                <DocButton record={selected.raw} field={selected.relatedDocField} label={t('alerts_event_document')} />
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {!selected.done && (
                  <Button onClick={() => handleDone(selected)} className="min-h-[40px] bg-emerald-600 hover:bg-emerald-700">
                    <CheckCircle2 size={15} className="me-1" />
                    {selected.isFinancial ? t('alerts_mark_paid') : t('alerts_mark_completed')}
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

export default PropertyCalendar;
