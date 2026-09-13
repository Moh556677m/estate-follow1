import React, { useEffect, useState } from 'react';
import {
  Banknote,
  Bell,
  CalendarClock,
  CreditCard,
  FileText,
  HardHat,
  KeyRound,
  Receipt,
  Repeat,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/MoneyInput';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ALERT_TYPES,
  REPEAT_OPTIONS,
  OVERDUE_REPEAT_OPTIONS,
  REMINDER_PRESETS,
  createManualAlert,
  updateManualAlert,
} from '@/lib/alertsClient';
import { cn } from '@/lib/utils';

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

const DOC_FIELDS = [
  { value: 'title_deed_pdf', label_en: 'Title Deed', label_ar: 'صك الملكية' },
  { value: 'lease_contract', label_en: 'Lease Contract', label_ar: 'عقد الإيجار' },
  { value: 'tenant_document', label_en: 'Tenant Document', label_ar: 'مستند المستأجر' },
  { value: 'passport_pdf', label_en: 'Passport', label_ar: 'جواز السفر' },
  { value: 'residence_pdf', label_en: 'Residence', label_ar: 'الإقامة' },
];

const AlertForm = ({ open, onOpenChange, onSaved, properties = [], editing = null, fixedPropertyId = null }) => {
  const { t, lang } = useLanguage();
  const [form, setForm] = useState({
    title: '',
    property: fixedPropertyId || '',
    alert_type: 'custom',
    event_date: '',
    event_time: '',
    amount: '',
    is_financial: false,
    repeat: 'none',
    reminders: [7, 1],
    overdue_repeat: 'none',
    notes: '',
    related_doc_field: '',
    enabled: true,
    status: 'upcoming',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (editing) {
        const rem = editing.reminders;
        const reminders = Array.isArray(rem) && rem.length
          ? rem.map((r) => (typeof r === 'object' ? r.days_before : r))
          : [7, 1];
        setForm({
          title: editing.title || '',
          property: editing.propertyId || editing.property || '',
          alert_type: editing.type || editing.alert_type || 'custom',
          event_date: editing.event_date || (editing.eventDate ? editing.eventDate.toISOString().slice(0, 10) : ''),
          event_time: editing.event_time || editing.eventTime || '',
          amount: editing.amount != null ? editing.amount : '',
          is_financial: !!(editing.is_financial ?? editing.isFinancial),
          repeat: editing.repeat || 'none',
          reminders,
          overdue_repeat: editing.overdue_repeat || editing.overdueRepeat || 'none',
          notes: editing.notes || '',
          related_doc_field: editing.related_doc_field || editing.relatedDocField || '',
          enabled: editing.enabled !== false,
          status: editing.status || 'upcoming',
        });
      } else {
        setForm({
          title: '',
          property: fixedPropertyId || '',
          alert_type: 'custom',
          event_date: '',
          event_time: '',
          amount: '',
          is_financial: false,
          repeat: 'none',
          reminders: [7, 1],
          overdue_repeat: 'none',
          notes: '',
          related_doc_field: '',
          enabled: true,
          status: 'upcoming',
        });
      }
      setError('');
    }
  }, [open, editing, fixedPropertyId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleReminder = (off) => {
    setForm((f) => {
      const has = f.reminders.includes(off);
      return { ...f, reminders: has ? f.reminders.filter((x) => x !== off) : [...f.reminders, off].sort((a, b) => b - a) };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError(t('alerts_field_title')); return; }
    if (!form.event_date) { setError(t('alerts_field_date')); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        property: form.property || null,
        alert_type: form.alert_type,
        event_date: form.event_date,
        event_time: form.event_time || '',
        amount: form.amount ? Number(form.amount) : 0,
        is_financial: !!form.is_financial,
        repeat: form.repeat,
        reminders: form.reminders,
        overdue_repeat: form.overdue_repeat,
        notes: form.notes || '',
        related_doc_field: form.related_doc_field || '',
        enabled: form.enabled,
        status: form.status,
      };
      if (editing && editing.id) {
        await updateManualAlert(editing.id, payload);
      } else {
        await createManualAlert(payload);
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t('alerts_edit') : t('alerts_add')}</DialogTitle>
          <DialogDescription>{t('alerts_reminder_hint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('alerts_field_title')} <span className="text-destructive">*</span></Label>
            <Input value={form.title} onChange={set('title')} required className="min-h-[44px]" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('alerts_field_property')}</Label>
              <Select
                value={form.property || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, property: v === 'none' ? '' : v }))}
                disabled={!!fixedPropertyId}
              >
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">—</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.building} / {p.unit_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('alerts_field_type')}</Label>
              <Select value={form.alert_type} onValueChange={(v) => setForm((f) => ({ ...f, alert_type: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALERT_TYPES.map((tp) => {
                    const Icon = TYPE_ICONS[tp] || Bell;
                    return (
                      <SelectItem key={tp} value={tp}>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon size={14} /> {t(`alerts_type_${tp}`)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('alerts_field_date')} <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.event_date} onChange={set('event_date')} required className="min-h-[44px]" />
            </div>
            <div className="space-y-2">
              <Label>{t('alerts_field_time')}</Label>
              <Input type="time" value={form.event_time} onChange={set('event_time')} className="min-h-[44px]" />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <Banknote size={16} className="text-muted-foreground" />
            <Label className="flex-1">{t('alerts_admin_type_financial')}</Label>
            <Switch checked={form.is_financial} onCheckedChange={(v) => setForm((f) => ({ ...f, is_financial: v }))} />
          </div>

          {form.is_financial && (
            <div className="space-y-2">
              <Label>{t('alerts_field_amount')}</Label>
              <MoneyInput min="0" value={form.amount} onChange={set('amount')} className="min-h-[44px]" />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('alerts_field_repeat')}</Label>
              <Select value={form.repeat} onValueChange={(v) => setForm((f) => ({ ...f, repeat: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPEAT_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{t(`alerts_repeat_${r}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('alerts_overdue_repeat')}</Label>
              <Select value={form.overdue_repeat} onValueChange={(v) => setForm((f) => ({ ...f, overdue_repeat: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OVERDUE_REPEAT_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{t(`alerts_overdue_repeat_${r}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('alerts_field_reminders')}</Label>
            <p className="text-xs text-muted-foreground">{t('alerts_reminder_hint')}</p>
            <div className="flex flex-wrap gap-2">
              {REMINDER_PRESETS.map((off) => {
                const active = form.reminders.includes(off);
                return (
                  <button
                    key={off}
                    type="button"
                    onClick={() => toggleReminder(off)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px]',
                      active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent',
                    )}
                  >
                    {off === 0 ? t('alerts_reminder_presets_0') : t(`alerts_reminder_presets_${off}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('alerts_field_doc')}</Label>
            <Select
              value={form.related_doc_field || 'none'}
              onValueChange={(v) => setForm((f) => ({ ...f, related_doc_field: v === 'none' ? '' : v }))}
            >
              <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {DOC_FIELDS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {lang === 'ar' ? d.label_ar : d.label_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('alerts_field_notes')}</Label>
            <Textarea value={form.notes} onChange={set('notes')} rows={2} className="min-h-[44px]" />
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <Bell size={16} className="text-muted-foreground" />
            <Label className="flex-1">{t('alerts_enable')}</Label>
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving} className="min-h-[44px]">
              {saving ? t('loading') : t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AlertForm;
