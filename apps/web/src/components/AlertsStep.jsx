import React, { useState } from 'react';
import { Bell, CalendarClock, CalendarPlus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { REMINDER_PRESETS } from '@/lib/alertsClient';
import DateField from '@/components/DateField';
import SectionAiAssistant from '@/components/SectionAiAssistant';
import { cn } from '@/lib/utils';

// Compact "Alerts & Follow-up" step rendered inside PropertyForm.
// value: { enabled: bool, reminders: number[], customDate?: string } — saved
// by PropertyForm after the property record exists (writes to
// alert_settings.property_overrides). The custom date works alongside the
// ready-made presets; automatic alerts from recorded dates keep working.
const AlertsStep = ({ value, onChange, aiOpen = false, onAiOpenChange, onAiApply }) => {
  const { t } = useLanguage();
  const [showCustom, setShowCustom] = useState(false);
  const enabled = !!value?.enabled;
  const reminders = Array.isArray(value?.reminders) ? value.reminders : [7, 1];
  const customDate = value?.customDate || '';

  const toggleReminder = (off) => {
    const has = reminders.includes(off);
    const next = has ? reminders.filter((x) => x !== off) : [...reminders, off].sort((a, b) => b - a);
    onChange({ enabled, reminders: next, customDate });
  };

  const setCustom = (date) => {
    onChange({ enabled, reminders, customDate: date || '' });
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Bell size={16} className="shrink-0 text-primary" />
            <p className="text-sm font-bold leading-snug text-foreground">{t('alerts_step_title')}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('alerts_step_hint')}</p>
        <p className="text-xs text-muted-foreground">{t('alerts_step_auto')}</p>
      </div>

      {aiOpen && (
        <SectionAiAssistant
          section="alerts"
          open
          onOpenChange={(o) => onAiOpenChange?.(o)}
          currentValues={{
            alerts_enabled: enabled,
            alerts_reminders: reminders,
            alerts_custom_date: customDate,
          }}
          onApply={(fields) => onAiApply?.(fields)}
        />
      )}

      <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
        <CalendarClock size={16} className="text-muted-foreground" />
        <Label className="flex-1">{t('alerts_enable')}</Label>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onChange({ enabled: v, reminders, customDate })}
        />
      </div>

      {enabled && (
        <div className="space-y-2">
          <Label>{t('alerts_field_reminders')}</Label>
          <p className="text-xs text-muted-foreground">{t('alerts_reminder_hint')}</p>
          <div className="flex flex-wrap gap-2">
            {REMINDER_PRESETS.map((off) => {
              const active = reminders.includes(off);
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
            {/* Custom date toggle — works alongside the ready-made presets */}
            <button
              type="button"
              onClick={() => setShowCustom((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px]',
                customDate ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent',
              )}
            >
              <CalendarPlus size={13} />
              {t('alerts_custom_date')}
            </button>
          </div>

          {showCustom && (
            <div className="rounded-lg border bg-card p-3">
              <DateField
                label={t('alerts_custom_date_pick')}
                value={customDate}
                onChange={setCustom}
                heightClass="min-h-[44px]"
              />
              {customDate && (
                <button
                  type="button"
                  onClick={() => setCustom('')}
                  className="mt-2 text-xs text-muted-foreground hover:text-destructive underline underline-offset-2"
                >
                  {t('cancel')}
                </button>
              )}
            </div>
          )}

          {customDate && !showCustom && (
            <p className="text-xs text-primary">
              {t('alerts_custom_date')}: {customDate}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertsStep;
