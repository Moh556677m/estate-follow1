import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Volume2, VolumeX, Vibrate, Smartphone, Monitor, Eye, EyeOff, Play, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  loadSettings,
  saveSettings,
  loadSounds,
  playSound,
  requestPushPermission,
  pushPermission,
  pushSupported,
  DEFAULT_SETTINGS,
  CATEGORY_GROUPS,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';

const REMINDER_OPTIONS = [
  { value: 3, ar: '3 أيام', en: '3 days' },
  { value: 7, ar: '7 أيام', en: '7 days' },
  { value: 14, ar: '14 يوم', en: '14 days' },
  { value: 30, ar: '30 يوم', en: '30 days' },
];

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [sounds, setSounds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [perm, setPerm] = useState(pushPermission());

  const tr = (ar, en) => (lang === 'ar' ? ar : en);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [s, snd] = await Promise.all([loadSettings(user.id), loadSounds()]);
      if (cancelled) return;
      setSettings(s);
      setSounds(snd);
      setPerm(pushPermission());
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = (patch) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };

  const persist = async () => {
    if (!user || !settings) return;
    setSaving(true);
    try {
      const next = await saveSettings(user.id, settings);
      setSettings(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const toggleReminder = (value) => {
    const cur = new Set(settings.reminder_days || []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    update({ reminder_days: Array.from(cur).sort((a, b) => a - b) });
  };

  const toggleCategory = (key) => {
    update({
      categories: { ...(settings.categories || {}), [key]: !settings.categories?.[key] },
    });
  };

  const enablePush = async () => {
    const result = await requestPushPermission();
    setPerm(result);
    update({ push_permission: result, push_enabled: result === 'granted' });
  };

  if (!settings) {
    return <p className="py-16 text-center text-muted-foreground">{t('loading')}</p>;
  }

  const Section = ({ icon: Icon, title, desc, children }) => (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon size={18} />
        </span>
        <div>
          <p className="font-bold">{title}</p>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );

  const Row = ({ label, desc, checked, onChange, disabled }) => (
    <div className={cn('flex items-center justify-between gap-4 py-2', disabled && 'opacity-60')}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={!!checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">{tr('إعدادات الإشعارات', 'Notification Settings')}</h2>
          <p className="text-sm text-muted-foreground">
            {tr(
              'تحكّم بكل تفضيلات الإشعارات — الأصوات، القنوات، التذكيرات والخصوصية.',
              'Control all notification preferences — sounds, channels, reminders and privacy.',
            )}
          </p>
        </div>
        <Button onClick={persist} disabled={saving} className="min-h-[40px]">
          {saved ? <Check size={16} className="me-1.5" /> : null}
          {saving ? t('loading') : saved ? tr('تم الحفظ', 'Saved') : tr('حفظ', 'Save')}
        </Button>
      </div>

      {/* Channels */}
      <Section
        icon={Bell}
        title={tr('طرق وصول الإشعار', 'Delivery Channels')}
        desc={tr(
          'اختر كيف تصلك الإشعارات. الإشعارات الأمنية الضرورية تصل دائمًا حسب إعدادات الأدمن.',
          'Choose how notifications reach you. Critical security notifications always arrive per admin settings.',
        )}
      >
        <Row
          label={tr('إشعار داخل الموقع', 'In-site notification')}
          desc={tr('يظهر في مركز الإشعارات داخل الحساب', 'Shows in the in-account Notification Center')}
          checked={settings.in_app_enabled}
          onChange={(v) => update({ in_app_enabled: v })}
        />
        <Row
          label={tr('Push Notification على الهاتف', 'Phone Push Notification')}
          desc={tr('إشعارات المتصفح/النظام على الأجهزة المدعومة', 'Browser/system notifications on supported devices')}
          checked={settings.push_enabled}
          onChange={(v) => update({ push_enabled: v })}
        />
        <Row
          label={tr('الصوت', 'Sound')}
          checked={settings.sound_enabled}
          onChange={(v) => update({ sound_enabled: v })}
        />
        <Row
          label={tr('الاهتزاز', 'Vibration')}
          desc={tr('إذا كان الجهاز والمتصفح يدعمانه', 'If the device and browser support it')}
          checked={settings.vibration_enabled}
          onChange={(v) => update({ vibration_enabled: v })}
        />

        {/* Push permission status */}
        <div className="rounded-lg border bg-accent/40 p-3 text-sm space-y-2">
          {!pushSupported() && (
            <p className="text-muted-foreground">
              {tr(
                'متصفحك لا يدعم إشعارات Push. استخدم متصفحًا حديثًا أو ثبّت التطبيق كـ PWA.',
                'Your browser does not support push notifications. Use a modern browser or install the app as a PWA.',
              )}
            </p>
          )}
          {pushSupported() && perm === 'granted' && (
            <p className="text-emerald-700 font-medium">
              {tr('✓ إشعارات Push مفعّلة على هذا الجهاز.', '✓ Push notifications enabled on this device.')}
            </p>
          )}
          {pushSupported() && perm === 'default' && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-muted-foreground">
                {tr('فعّل إشعارات Push لاستقبال التنبيهات على هاتفك.', 'Enable push to receive alerts on your phone.')}
              </p>
              <Button size="sm" onClick={enablePush} className="min-h-[36px]">
                {tr('تفعيل الإشعارات', 'Enable Notifications')}
              </Button>
            </div>
          )}
          {pushSupported() && perm === 'denied' && (
            <p className="text-muted-foreground">
              {tr(
                'تم رفض إذن الإشعارات. لتفعيله: افتح إعدادات المتصفح/الجهاز → الإشعارات → اسمح لموقع Estate Follow.',
                'Notification permission was denied. To enable: open browser/device Settings → Notifications → allow Estate Follow.',
              )}
            </p>
          )}
        </div>
      </Section>

      {/* Sound selection */}
      <Section
        icon={Volume2}
        title={tr('صوت الإشعارات', 'Notification Sound')}
        desc={tr('اختر نغمة قصيرة احترافية. اضغط Preview لسماعها.', 'Pick a short professional tone. Click Preview to hear it.')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sounds.map((s) => (
            <div
              key={s.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 transition-colors',
                settings.selected_sound === s.key
                  ? 'border-primary bg-primary/5'
                  : 'bg-card hover:bg-accent/40',
              )}
            >
              <button
                type="button"
                onClick={() => update({ selected_sound: s.key })}
                className="flex items-center gap-2 text-start flex-1 min-h-[36px]"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    settings.selected_sound === s.key
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40',
                  )}
                >
                  {settings.selected_sound === s.key && <Check size={10} className="text-primary-foreground" />}
                </span>
                <span className="text-sm font-medium">{lang === 'ar' ? s.name_ar : s.name_en}</span>
              </button>
              <button
                type="button"
                onClick={() => playSound(s)}
                className="flex h-8 w-8 items-center justify-center rounded-md border bg-card hover:bg-accent transition-colors"
                aria-label="Preview"
              >
                <Play size={14} className="text-primary" />
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* Silent + mute all */}
      <Section
        icon={settings.silent ? VolumeX : Volume2}
        title={tr('الوضع الصامت والإيقاف', 'Silent & Mute')}
      >
        <Row
          label={tr('صامت', 'Silent')}
          desc={tr(
            'تصل Push Notification بدون صوت من داخل النظام عند الإمكان.',
            'Push arrives but no sound is played by the system when possible.',
          )}
          checked={settings.silent}
          onChange={(v) => update({ silent: v })}
        />
        <div className="border-t pt-3">
          <Row
            label={tr('إيقاف جميع الإشعارات', 'Mute All Notifications')}
            desc={tr(
              'يوقف الإشعارات الاختيارية. لا يوقف إشعارات الأمان الحرجة أو OTP أو استعادة الحساب.',
              'Stops optional notifications. Does not stop critical security, OTP or account recovery notifications.',
            )}
            checked={settings.mute_all}
            onChange={(v) => update({ mute_all: v })}
          />
        </div>
      </Section>

      {/* Per-category toggles */}
      <Section
        icon={Bell}
        title={tr('تحكم تفصيلي بالمجموعات', 'Per-Category Control')}
        desc={tr('شغّل أو أوقف كل مجموعة إشعارات بشكل مستقل.', 'Enable or disable each notification group independently.')}
      >
        <div className="divide-y">
          {CATEGORY_GROUPS.map((c) => (
            <Row
              key={c.key}
              label={lang === 'ar' ? c.label_ar : c.label_en}
              checked={settings.categories?.[c.key]}
              onChange={() => toggleCategory(c.key)}
            />
          ))}
        </div>
      </Section>

      {/* Reminder timing */}
      <Section
        icon={Bell}
        title={tr('وقت التذكير', 'Reminder Timing')}
        desc={tr(
          'اربط التذكيرات بالتواريخ الحقيقية. اختر متى تُنشأ الإشعارات قبل/في يوم الاستحقاق.',
          'Tie reminders to real dates. Choose when notifications are created before/on the due date.',
        )}
      >
        <div className="flex flex-wrap gap-2">
          {REMINDER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggleReminder(o.value)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[40px]',
                (settings.reminder_days || []).includes(o.value)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {lang === 'ar' ? o.ar : o.en}
            </button>
          ))}
          <button
            type="button"
            onClick={() => toggleReminder(1)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[40px]',
              (settings.reminder_days || []).includes(1)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card hover:bg-accent',
            )}
          >
            {tr('قبل يوم', '1 day before')}
          </button>
          <button
            type="button"
            onClick={() => toggleReminder(0)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[40px]',
              (settings.reminder_days || []).includes(0)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card hover:bg-accent',
            )}
          >
            {tr('في يوم الاستحقاق', 'On due date')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {tr(
            'عند دفع القسط تُلغى التذكيرات المستقبلية تلقائيًا. عند تغيير التاريخ تتحدث الإشعارات تلقائيًا.',
            'When an installment is paid, future reminders are auto-cancelled. When a date changes, notifications auto-update.',
          )}
        </p>
      </Section>

      {/* Privacy */}
      <Section
        icon={settings.hide_amount_lock ? EyeOff : Eye}
        title={tr('خصوصية شاشة القفل', 'Lock Screen Privacy')}
      >
        <Row
          label={tr('إخفاء تفاصيل المبلغ في شاشة القفل', 'Hide amount details on lock screen')}
          desc={tr(
            'بدل «لديك قسط 50,000 لعقار X» → «لديك تذكير جديد متعلق بأحد عقاراتك.»',
            'Replaces "Installment 50,000 for X" → "You have a new reminder related to one of your properties."',
          )}
          checked={settings.hide_amount_lock}
          onChange={(v) => update({ hide_amount_lock: v })}
        />
      </Section>

      <div className="flex justify-end">
        <Button onClick={persist} disabled={saving} className="min-h-[40px]">
          {saved ? <Check size={16} className="me-1.5" /> : null}
          {saving ? t('loading') : saved ? tr('تم الحفظ', 'Saved') : tr('حفظ', 'Save')}
        </Button>
      </div>
    </div>
  );
}
