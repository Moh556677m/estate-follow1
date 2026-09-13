import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  Bell,
  Volume2,
  Plus,
  Trash2,
  Star,
  Megaphone,
  BarChart3,
  Send,
  Clock,
  Check,
  FileText,
  Settings2,
  MessageCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import pb from '@/lib/pocketbaseClient';
import { loadConfig, loadSounds, playSound } from '@/lib/notifications';
import { formatDateTime } from '@/lib/api';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'general', ar: 'عام', en: 'General', icon: Settings2 },
  { key: 'sounds', ar: 'النغمات', en: 'Sounds', icon: Volume2 },
  { key: 'templates', ar: 'القوالب', en: 'Templates', icon: FileText },
  { key: 'announcements', ar: 'الإعلانات', en: 'Announcements', icon: Megaphone },
  { key: 'analytics', ar: 'التحليلات', en: 'Analytics', icon: BarChart3 },
  { key: 'history', ar: 'السجل', en: 'History', icon: Clock },
];

const TEMPLATE_TYPES = [
  ['installment_upcoming', 'قسط قادم', 'Upcoming Installment'],
  ['installment_due', 'قسط مستحق اليوم', 'Installment Due Today'],
  ['installment_overdue', 'قسط متأخر', 'Overdue Installment'],
  ['rent_upcoming', 'دفعة إيجار قادمة', 'Upcoming Rent'],
  ['rent_overdue', 'دفعة إيجار متأخرة', 'Overdue Rent'],
  ['service_upcoming', 'رسوم صيانة قادمة', 'Upcoming Service Fee'],
  ['service_due', 'رسوم مستحقة', 'Service Fee Due'],
  ['contract_expiring', 'عقد ينتهي', 'Contract Expiring'],
  ['handover_upcoming', 'استلام يقترب', 'Handover Approaching'],
  ['platform_announcement', 'إعلان منصة', 'Platform Announcement'],
  ['platform_update', 'تحديث منصة', 'Platform Update'],
  ['inactivity_reminder', 'تذكير عدم نشاط', 'Inactivity Reminder'],
  ['cheque_due', 'شيك مستحق', 'Cheque Due'],
  ['document_expiry', 'مستند ينتهي', 'Document Expiring'],
  ['custom_reminder', 'تذكير مخصص', 'Custom Reminder'],
];

// Task #14 — channels a template can dispatch through. WhatsApp is wired to
// a real provider as of Task #25 (Meta WhatsApp Cloud API — see
// lib-whatsapp-provider.js); sms/push still have no real provider (see
// lib-notification-providers.js) — enabling them here is honest about
// that, the engine logs a "requires_adapter" delivery attempt rather than
// pretending to send.
const CHANNEL_KEYS = [
  ['email', 'البريد الإلكتروني', 'Email'],
  ['in_app', 'داخل التطبيق', 'In-App'],
  ['whatsapp', 'واتساب', 'WhatsApp'],
  ['sms', 'رسالة نصية', 'SMS'],
  ['push', 'إشعار Push', 'Push'],
];

const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];

export default function NotificationManagementPanel() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const tr = (ar, en) => (lang === 'ar' ? ar : en);
  const [tab, setTab] = useState('general');
  const [config, setConfig] = useState(null);
  const [sounds, setSounds] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [c, s, tpl, ann] = await Promise.all([
        loadConfig(),
        loadSounds(),
        pb.collection('notification_templates').getFullList({ sort: 'type' }).catch(() => []),
        pb.collection('notification_announcements').getFullList({ sort: '-created' }).catch(() => []),
      ]);
      setConfig(c);
      setSounds(s);
      setTemplates(tpl);
      setAnnouncements(ann);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Live: templates, announcements, config, sounds, delivery logs and
  // notifications all refresh in real time across admin tabs.
  useRealtimeRefresh(loadAll, [
    'notification_templates',
    'notification_announcements',
    'notification_config',
    'notification_sounds',
    'notification_delivery_log',
    'notifications',
  ]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  };

  const saveConfig = async (patch) => {
    if (!config?.id) return;
    setBusy(true);
    try {
      const updated = await pb
        .collection('notification_config')
        .update(config.id, patch, { requestKey: `notif-cfg-${config.id}` });
      setConfig({ ...config, ...updated });
      flash(tr('تم الحفظ', 'Saved'));
    } catch {
      flash(tr('فشل الحفظ', 'Save failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Bell size={20} className="text-primary" />
          {tr('إدارة الإشعارات', 'Notification Management')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {tr(
            'تحكم كامل بنظام الإشعارات — النغمات، القوالب، الإعلانات، القواعد والتحليلات.',
            'Full control of the notification system — sounds, templates, announcements, rules and analytics.',
          )}
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[40px]',
                tab === tb.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              <Icon size={15} />
              {lang === 'ar' ? tb.ar : tb.en}
            </button>
          );
        })}
      </div>

      {tab === 'general' && config && (
        <GeneralTab config={config} saveConfig={saveConfig} busy={busy} tr={tr} t={t} />
      )}
      {tab === 'sounds' && (
        <SoundsTab sounds={sounds} reload={loadAll} tr={tr} t={t} />
      )}
      {tab === 'templates' && (
        <TemplatesTab templates={templates} reload={loadAll} tr={tr} t={t} />
      )}
      {tab === 'announcements' && (
        <AnnouncementsTab announcements={announcements} reload={loadAll} tr={tr} t={t} />
      )}
      {tab === 'analytics' && <AnalyticsTab tr={tr} t={t} />}
      {tab === 'history' && <HistoryTab tr={tr} t={t} />}
    </div>
  );
}

// ---- General tab ----
function GeneralTab({ config, saveConfig, busy, tr, t }) {
  const [inactivityDays, setInactivityDays] = useState(config.inactivity_days ?? 7);
  const [cooldown, setCooldown] = useState(config.inactivity_cooldown_days ?? 30);
  const [defaults, setDefaults] = useState(
    Array.isArray(config.reminder_defaults) ? config.reminder_defaults.join(', ') : '7, 1, 0',
  );

  useEffect(() => {
    setInactivityDays(config.inactivity_days ?? 7);
    setCooldown(config.inactivity_cooldown_days ?? 30);
    setDefaults(
      Array.isArray(config.reminder_defaults) ? config.reminder_defaults.join(', ') : '7, 1, 0',
    );
  }, [config]);

  const Row = ({ label, desc, checked, onChange }) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 space-y-1">
        <Row
          label={tr('تشغيل نظام الإشعارات', 'Enable notification system')}
          desc={tr('يوقف/يفعّل النظام بالكامل لجميع المستخدمين.', 'Toggles the whole system for all users.')}
          checked={config.system_enabled}
          onChange={(v) => saveConfig({ system_enabled: v })}
        />
        <Row
          label={tr('Push Notifications مفعّلة', 'Push notifications configured')}
          desc={tr('حدّد إذا كان مزوّد Push مربوطًا.', 'Mark whether a push provider is connected.')}
          checked={config.push_configured}
          onChange={(v) => saveConfig({ push_configured: v })}
        />
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <p className="font-bold">{tr('قواعد عدم النشاط', 'Inactivity Rules')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">{tr('عدد أيام عدم النشاط', 'Inactivity days')}</label>
            <Input
              type="number"
              value={inactivityDays}
              onChange={(e) => setInactivityDays(Number(e.target.value))}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">{tr('فترة التهدئة (أيام)', 'Cooldown (days)')}</label>
            <Input
              type="number"
              value={cooldown}
              onChange={(e) => setCooldown(Number(e.target.value))}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            saveConfig({
              inactivity_days: inactivityDays,
              inactivity_cooldown_days: cooldown,
            })
          }
          className="min-h-[36px]"
        >
          {tr('حفظ القواعد', 'Save rules')}
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <p className="font-bold">{tr('التذكيرات الافتراضية', 'Reminder Defaults')}</p>
        <p className="text-xs text-muted-foreground">
          {tr(
            'قائمة الأيام الافتراضية قبل الاستحقاق (مفصولة بفواصل) للمستخدمين الجدد.',
            'Default days-before-due list (comma separated) for new users.',
          )}
        </p>
        <Input value={defaults} onChange={(e) => setDefaults(e.target.value)} />
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            const arr = defaults
              .split(',')
              .map((x) => Number(x.trim()))
              .filter((n) => Number.isFinite(n));
            saveConfig({ reminder_defaults: arr });
          }}
          className="min-h-[36px]"
        >
          {tr('حفظ', 'Save')}
        </Button>
      </div>

      <ReminderEngineCard tr={tr} />
    </div>
  );
}

// Task #14 — manual trigger for the real, cron-scheduled Reminder Engine
// (reminder-scheduler.pb.js). The cron already runs every 30 minutes on its
// own; this is for immediate testing/catch-up without waiting for the next
// tick. Safe to click repeatedly — the engine is idempotent per channel.
function ReminderEngineCard({ tr }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const runNow = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const res = await pb.send('/ef/reminders/run-now', { method: 'POST', body: {} });
      setResult(res);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <p className="font-bold">{tr('محرك التذكيرات', 'Reminder Engine')}</p>
      <p className="text-xs text-muted-foreground">
        {tr(
          'يعمل تلقائيًا كل 30 دقيقة لجميع الملاك (Job: reminder-engine-sweep). استخدم الزر أدناه لتشغيله فورًا للاختبار أو كتعويض يدوي.',
          'Runs automatically every 30 minutes for every owner (job: reminder-engine-sweep). Use the button below to run it immediately for testing or as a manual catch-up.',
        )}
      </p>
      <Button size="sm" disabled={running} onClick={runNow} className="min-h-[36px]">
        {running ? tr('جارٍ التشغيل...', 'Running...') : tr('تشغيل الآن', 'Run Now')}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && (
        <p className="text-xs text-muted-foreground">
          {tr('الملاك', 'Owners')}: {result.owners} · {tr('محاولات', 'Attempted')}: {result.attempted} · {tr('أُرسلت', 'Sent')}: {result.sent} · {tr('أحداث', 'Events')}: {result.events}
        </p>
      )}
    </div>
  );
}

// ---- Sounds tab ----
function SoundsTab({ sounds, reload, tr, t }) {
  const [key, setKey] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [wave, setWave] = useState('sine');
  const [freq, setFreq] = useState(880);
  const [dur, setDur] = useState(0.25);

  const addSound = async () => {
    if (!key || !nameAr || !nameEn) return;
    try {
      await pb.collection('notification_sounds').create(
        {
          key: key.trim().toLowerCase().replace(/\s+/g, '_'),
          name_ar: nameAr,
          name_en: nameEn,
          waveform: wave,
          frequency: freq,
          duration: dur,
          is_default: false,
          is_builtin: false,
        },
        { requestKey: `sound-add-${Date.now()}` },
      );
      setKey('');
      setNameAr('');
      setNameEn('');
      reload();
    } catch {
      /* ignore */
    }
  };

  const setDefault = async (s) => {
    // unset others
    await Promise.all(
      sounds.map((x) =>
        x.is_default
          ? pb.collection('notification_sounds').update(x.id, { is_default: false }, { requestKey: `sd-unset-${x.id}` })
          : Promise.resolve(),
      ),
    );
    await pb.collection('notification_sounds').update(s.id, { is_default: true }, { requestKey: `sd-set-${s.id}` });
    // also update config default_sound
    try {
      const cfg = await pb.collection('notification_config').getFullList();
      if (cfg.length) {
        await pb.collection('notification_config').update(cfg[0].id, { default_sound: s.key }, { requestKey: `cfg-sound` });
      }
    } catch {
      /* ignore */
    }
    reload();
  };

  const remove = async (s) => {
    if (s.is_builtin) return;
    if (!window.confirm(tr('حذف هذه النغمة؟', 'Delete this sound?'))) return;
    await pb.collection('notification_sounds').delete(s.id, { requestKey: `sd-rm-${s.id}` });
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <p className="font-bold">{tr('إضافة نغمة', 'Add Sound')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder={tr('المعرّف (key)', 'Key')} value={key} onChange={(e) => setKey(e.target.value)} />
          <Input placeholder={tr('الاسم بالعربية', 'Arabic name')} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          <Input placeholder={tr('الاسم بالإنجليزية', 'English name')} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          <Select value={wave} onValueChange={setWave}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WAVEFORMS.map((w) => (
                <SelectItem key={w} value={w}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" placeholder={tr('التردد (Hz)', 'Frequency (Hz)')} value={freq} onChange={(e) => setFreq(Number(e.target.value))} />
          <Input type="number" step="0.01" placeholder={tr('المدة (ث)', 'Duration (s)')} value={dur} onChange={(e) => setDur(Number(e.target.value))} />
        </div>
        <Button size="sm" onClick={addSound} className="min-h-[36px]">
          <Plus size={14} className="me-1.5" /> {tr('إضافة', 'Add')}
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-2">
        <p className="font-bold">{tr('النغمات المتاحة', 'Available Sounds')}</p>
        {sounds.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              {s.is_default && <Star size={14} className="text-primary fill-primary shrink-0" />}
              <span className="text-sm font-medium truncate">{lang(s)}</span>
              {s.is_builtin && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-muted-foreground shrink-0">
                  {tr('مدمجة', 'built-in')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => playSound(s)}
                className="flex h-8 w-8 items-center justify-center rounded-md border bg-card hover:bg-accent"
                aria-label="Preview"
              >
                <Volume2 size={14} className="text-primary" />
              </button>
              {!s.is_default && (
                <button
                  type="button"
                  onClick={() => setDefault(s)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border bg-card hover:bg-accent"
                  aria-label={tr('افتراضي', 'Default')}
                >
                  <Star size={14} />
                </button>
              )}
              {!s.is_builtin && (
                <button
                  type="button"
                  onClick={() => remove(s)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border bg-card hover:bg-destructive/10 hover:text-destructive"
                  aria-label={tr('حذف', 'Delete')}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  function lang(s) {
    return (typeof window !== 'undefined' && document.documentElement.lang === 'ar') ? s.name_ar : s.name_en;
  }
}

// ---- Templates tab ----
function TemplatesTab({ templates, reload, tr, t }) {
  const tplByType = useMemo(
    () => Object.fromEntries(templates.map((x) => [x.type, x])),
    [templates],
  );

  const save = async (type, fields) => {
    const existing = tplByType[type];
    try {
      if (existing) {
        await pb.collection('notification_templates').update(existing.id, fields, { requestKey: `tpl-${existing.id}` });
      } else {
        await pb.collection('notification_templates').create({ type, ...fields }, { requestKey: `tpl-new-${type}` });
      }
      reload();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3">
      <WhatsAppStatusCard tr={tr} />
      <p className="text-xs text-muted-foreground">
        {tr(
          'متغيرات: {{owner_name}} {{property_name}} {{unit_number}} {{amount}} {{due_date}} {{days_overdue}} — تُؤخذ من البيانات الحقيقية فقط.',
          'Variables: {{owner_name}} {{property_name}} {{unit_number}} {{amount}} {{due_date}} {{days_overdue}} — taken from real data only.',
        )}
      </p>
      {TEMPLATE_TYPES.map(([type, ar, en]) => (
        <TemplateRow key={type} type={type} ar={ar} en={en} tpl={tplByType[type]} onSave={save} tr={tr} t={t} />
      ))}
    </div>
  );
}

// Task #25 — WhatsApp official notification channel (Meta Cloud API). Shows
// the real, live configured/not-configured status (never a guess) and lets
// a Super Admin send one real test template message to verify end-to-end
// delivery once real credentials + an approved Meta template exist.
function WhatsAppStatusCard({ tr }) {
  const [status, setStatus] = useState(null); // null = loading
  const [phone, setPhone] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [languageCode, setLanguageCode] = useState('ar');
  const [params, setParams] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    pb.send('/ef/whatsapp/status', { method: 'GET' })
      .then((res) => setStatus(!!res?.configured))
      .catch(() => setStatus(false));
  }, []);

  const sendTest = async () => {
    if (!phone.trim() || !templateName.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await pb.send('/ef/whatsapp/test-send', {
        method: 'POST',
        body: {
          phone: phone.trim(),
          templateName: templateName.trim(),
          languageCode: languageCode.trim() || 'ar',
          params: params.split(',').map((p) => p.trim()).filter(Boolean),
        },
      });
      setResult(res);
    } catch (err) {
      setResult(err?.data || { ok: false, reason: String(err?.message || err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold flex items-center gap-2">
          <MessageCircle size={16} className="text-primary" />
          {tr('واتساب (Meta WhatsApp Cloud API)', 'WhatsApp (Meta Cloud API)')}
        </p>
        {status === null ? (
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        ) : status ? (
          <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-semibold">
            {tr('متصل', 'Configured')}
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 text-xs font-semibold">
            {tr('يتطلب إعداد بيانات الاعتماد', 'Requires credential setup')}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {tr(
          'يعمل عبر Meta WhatsApp Business Cloud API. يتطلب ضبط WHATSAPP_ACCESS_TOKEN و WHATSAPP_PHONE_NUMBER_ID في بيئة تشغيل PocketBase، بالإضافة إلى قالب رسالة (Template) معتمد من Meta Business Manager لكل نوع تذكير (خانتا "اسم القالب" و"لغة القالب" أسفل كل نوع رسالة).',
          'Runs on the Meta WhatsApp Business Cloud API. Requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID set in the PocketBase process environment, plus a Meta Business Manager-approved message template per reminder type (the "Template name" / "Template language" fields under each message type below).',
        )}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        <Input placeholder={tr('رقم هاتف للاختبار (مع كود الدولة)', 'Test phone (with country code)')} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
        <Input placeholder={tr('اسم القالب المعتمد', 'Approved template name')} value={templateName} onChange={(e) => setTemplateName(e.target.value)} dir="ltr" />
        <Input placeholder={tr('لغة القالب (مثال: ar)', 'Template language (e.g. ar)')} value={languageCode} onChange={(e) => setLanguageCode(e.target.value)} dir="ltr" />
        <Input placeholder={tr('قيم المتغيرات مفصولة بفاصلة', 'Body params, comma-separated')} value={params} onChange={(e) => setParams(e.target.value)} dir="ltr" />
      </div>
      <Button size="sm" disabled={sending || !phone.trim() || !templateName.trim()} onClick={sendTest} className="min-h-[36px]">
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="me-1.5" />}
        {tr('إرسال رسالة اختبار حقيقية', 'Send real test message')}
      </Button>
      {result && (
        <div className={cn(
          'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700',
        )}>
          {result.ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span className="break-all">
            {result.ok
              ? tr('أُرسلت فعليًا عبر Meta.', 'Actually sent via Meta.')
              : `${result.reason || tr('فشل', 'failed')}${result.body ? ' — ' + String(result.body).slice(0, 200) : ''}`}
          </span>
        </div>
      )}
    </div>
  );
}

const DEFAULT_CHANNELS = { email: true, in_app: true, whatsapp: false, sms: false, push: false };

function parseChannels(tpl) {
  try {
    const raw = tpl?.channels;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') return { ...DEFAULT_CHANNELS, ...parsed };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CHANNELS };
}

function TemplateRow({ type, ar, en, tpl, onSave, tr, t }) {
  const [titleAr, setTitleAr] = useState(tpl?.title_ar || '');
  const [msgAr, setMsgAr] = useState(tpl?.message_ar || '');
  const [titleEn, setTitleEn] = useState(tpl?.title_en || '');
  const [msgEn, setMsgEn] = useState(tpl?.message_en || '');
  const [enabled, setEnabled] = useState(tpl ? tpl.enabled !== false : true);
  const [channels, setChannels] = useState(() => parseChannels(tpl));
  const [waName, setWaName] = useState(tpl?.whatsapp_template_name || '');
  const [waLang, setWaLang] = useState(tpl?.whatsapp_template_lang || 'ar');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTitleAr(tpl?.title_ar || '');
    setMsgAr(tpl?.message_ar || '');
    setTitleEn(tpl?.title_en || '');
    setMsgEn(tpl?.message_en || '');
    setEnabled(tpl ? tpl.enabled !== false : true);
    setChannels(parseChannels(tpl));
    setWaName(tpl?.whatsapp_template_name || '');
    setWaLang(tpl?.whatsapp_template_lang || 'ar');
  }, [tpl]);

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start"
      >
        <span className="text-sm font-semibold">{document.documentElement.lang === 'ar' ? ar : en}</span>
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
          <span className="text-xs text-muted-foreground">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="border-t p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{tr('مفعّل', 'Enabled')}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Title AR</label>
              <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">Title EN</label>
              <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">Message AR</label>
              <Textarea value={msgAr} onChange={(e) => setMsgAr(e.target.value)} className="mt-1" rows={3} />
            </div>
            <div>
              <label className="text-xs font-medium">Message EN</label>
              <Textarea value={msgEn} onChange={(e) => setMsgEn(e.target.value)} className="mt-1" rows={3} />
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">{tr('القنوات', 'Channels')}</p>
            <div className="flex flex-wrap gap-3">
              {CHANNEL_KEYS.map(([key, arLabel, enLabel]) => (
                <label key={key} className="flex items-center gap-1.5 text-xs">
                  <Switch
                    checked={!!channels[key]}
                    onCheckedChange={(v) => setChannels((c) => ({ ...c, [key]: v }))}
                  />
                  {tr(arLabel, enLabel)}
                  {(key === 'sms' || key === 'push') && channels[key] && (
                    <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 text-[10px]">
                      {tr('يتطلب مزوّد', 'Requires adapter')}
                    </span>
                  )}
                </label>
              ))}
            </div>
            {channels.whatsapp && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-dashed p-3">
                <div>
                  <label className="text-xs font-medium">{tr('اسم قالب واتساب المعتمد (Meta)', 'Approved WhatsApp template name (Meta)')}</label>
                  <Input value={waName} onChange={(e) => setWaName(e.target.value)} className="mt-1" dir="ltr" placeholder="e.g. installment_overdue_v1" />
                </div>
                <div>
                  <label className="text-xs font-medium">{tr('لغة القالب', 'Template language')}</label>
                  <Input value={waLang} onChange={(e) => setWaLang(e.target.value)} className="mt-1" dir="ltr" placeholder="ar" />
                </div>
                <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                  {tr(
                    'القيم تُرسَل للقالب بالترتيب: {{1}} اسم العقار، {{2}} المبلغ، {{3}} تاريخ الاستحقاق — كما تم إنشاء القالب في Meta Business Manager.',
                    'Values are sent to the template in order: {{1}} property name, {{2}} amount, {{3}} due date — matching how the template was built in Meta Business Manager.',
                  )}
                </p>
              </div>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => onSave(type, {
              title_ar: titleAr, message_ar: msgAr, title_en: titleEn, message_en: msgEn, enabled,
              channels: JSON.stringify(channels),
              whatsapp_template_name: waName, whatsapp_template_lang: waLang || 'ar',
            })}
            className="min-h-[36px]"
          >
            <Check size={14} className="me-1.5" /> {tr('حفظ', 'Save')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Announcements tab ----
function AnnouncementsTab({ announcements, reload, tr, t }) {
  const [form, setForm] = useState({
    title_ar: '', title_en: '', message_ar: '', message_en: '', link_url: '', category: 'platform', target: 'owners', scheduled_at: '',
  });

  const create = async (sendNow) => {
    try {
      const body = {
        ...form,
        status: sendNow ? 'sent' : 'draft',
        sent_at: sendNow ? new Date().toISOString() : '',
      };
      const rec = await pb.collection('notification_announcements').create(body, { requestKey: `ann-new-${Date.now()}` });
      // If send now → fan out an in-app notification to every owner.
      if (sendNow) {
        await fanOutAnnouncement(rec, tr);
      }
      setForm({ title_ar: '', title_en: '', message_ar: '', message_en: '', link_url: '', category: 'platform', target: 'owners', scheduled_at: '' });
      reload();
    } catch {
      /* ignore */
    }
  };

  const sendExisting = async (ann) => {
    try {
      await pb.collection('notification_announcements').update(ann.id, { status: 'sent', sent_at: new Date().toISOString() }, { requestKey: `ann-send-${ann.id}` });
      await fanOutAnnouncement(ann, tr);
      reload();
    } catch {
      /* ignore */
    }
  };

  const remove = async (ann) => {
    if (!window.confirm(tr('حذف هذا الإعلان؟', 'Delete this announcement?'))) return;
    await pb.collection('notification_announcements').delete(ann.id, { requestKey: `ann-rm-${ann.id}` });
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <p className="font-bold">{tr('إنشاء إعلان / إشعار منصة', 'Create Announcement')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder={tr('العنوان بالعربية', 'Title AR')} value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} />
          <Input placeholder={tr('العنوان بالإنجليزية', 'Title EN')} value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} />
          <Textarea placeholder={tr('الرسالة بالعربية', 'Message AR')} value={form.message_ar} onChange={(e) => setForm({ ...form, message_ar: e.target.value })} rows={2} />
          <Textarea placeholder={tr('الرسالة بالإنجليزية', 'Message EN')} value={form.message_en} onChange={(e) => setForm({ ...form, message_en: e.target.value })} rows={2} />
          <Input placeholder={tr('رابط اختياري', 'Optional link')} value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="platform">{tr('منصة', 'Platform')}</SelectItem>
              <SelectItem value="update">{tr('تحديث', 'Update')}</SelectItem>
              <SelectItem value="service">{tr('خدمة', 'Service')}</SelectItem>
              <SelectItem value="alert">{tr('تنبيه', 'Alert')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={form.target} onValueChange={(v) => setForm({ ...form, target: v })}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="owners">{tr('الملاك فقط', 'Owners only')}</SelectItem>
              <SelectItem value="all">{tr('الجميع', 'All')}</SelectItem>
            </SelectContent>
          </Select>
          <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => create(true)} className="min-h-[36px]">
            <Send size={14} className="me-1.5" /> {tr('إرسال الآن', 'Send Now')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => create(false)} className="min-h-[36px]">
            {form.scheduled_at ? tr('حفظ كمسودة مجدولة', 'Save as scheduled draft') : tr('حفظ كمسودة', 'Save draft')}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-2">
        <p className="font-bold">{tr('الإعلانات', 'Announcements')}</p>
        {announcements.length === 0 && (
          <p className="text-sm text-muted-foreground">{tr('لا توجد إعلانات.', 'No announcements.')}</p>
        )}
        {announcements.map((ann) => (
          <div key={ann.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {document.documentElement.lang === 'ar' ? ann.title_ar : ann.title_en}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {document.documentElement.lang === 'ar' ? ann.message_ar : ann.message_en}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  ann.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-accent text-muted-foreground',
                )}
              >
                {ann.status}
              </span>
              {ann.status !== 'sent' && (
                <button
                  type="button"
                  onClick={() => sendExisting(ann)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border bg-card hover:bg-accent"
                  aria-label={tr('إرسال', 'Send')}
                >
                  <Send size={14} className="text-primary" />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(ann)}
                className="flex h-8 w-8 items-center justify-center rounded-md border bg-card hover:bg-destructive/10 hover:text-destructive"
                aria-label={tr('حذف', 'Delete')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Fan out an announcement as an in-app notification to every owner.
async function fanOutAnnouncement(ann, tr) {
  try {
    const users = await pb.collection('users').getFullList({ filter: 'account_type = "owner" || account_type = ""' });
    const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
    const title = lang === 'ar' ? ann.title_ar : ann.title_en;
    const body = lang === 'ar' ? ann.message_ar : ann.message_en;
    await Promise.all(
      users.map((u, i) =>
        pb.collection('notifications').create(
          {
            user: u.id,
            title,
            body,
            type: 'system',
            category: 'platform',
            priority: 'normal',
            link: ann.link_url || '/dashboard/notifications',
            dedup_key: `announcement-${ann.id}`,
            read: false,
          },
          { requestKey: `ann-notif-${ann.id}-${i}` },
        ),
      ),
    );
  } catch {
    /* ignore */
  }
}

// ---- Analytics tab ----
function AnalyticsTab({ tr, t }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const logs = await pb.collection('notification_delivery_log').getFullList({ sort: '-created' });
        setRows(logs);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const agg = useMemo(() => {
    const a = { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, denied: 0 };
    rows.forEach((r) => {
      if (a[r.status] != null) a[r.status] += 1;
    });
    return a;
  }, [rows]);

  const pushEnabledUsers = useMemo(() => {
    // best-effort: count notification_settings with push_enabled
    return null;
  }, []);

  const cards = [
    { label: tr('Sent', 'Sent'), value: agg.sent, color: 'text-primary' },
    { label: tr('Delivered', 'Delivered'), value: agg.delivered, color: 'text-emerald-600' },
    { label: tr('Opened', 'Opened'), value: agg.opened, color: 'text-blue-600' },
    { label: tr('Clicked', 'Clicked'), value: agg.clicked, color: 'text-indigo-600' },
    { label: tr('Failed', 'Failed'), value: agg.failed, color: 'text-destructive' },
    { label: tr('Permission Denied', 'Permission Denied'), value: agg.denied, color: 'text-orange-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={cn('text-2xl font-bold tabular-nums', c.color)}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {tr(
          'تُحتسب التحليلات من سجل التسليم الفعلي. لا تُعرض بيانات وهمية.',
          'Analytics are computed from the real delivery log. No mock data is shown.',
        )}
      </p>
    </div>
  );
}

// ---- History tab ----
function HistoryTab({ tr, t }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const logs = await pb.collection('notification_delivery_log').getFullList({ sort: '-created', perPage: 100 });
        setRows(logs);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-accent/50 text-xs">
            <tr>
              <th className="px-3 py-2 text-start">{tr('القناة', 'Channel')}</th>
              <th className="px-3 py-2 text-start">{tr('الحالة', 'Status')}</th>
              <th className="px-3 py-2 text-start">{tr('الفئة', 'Category')}</th>
              <th className="px-3 py-2 text-start">{tr('التفاصيل', 'Detail')}</th>
              <th className="px-3 py-2 text-start">{tr('الوقت', 'Time')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">{t('loading')}</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">{tr('لا يوجد سجل.', 'No history.')}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.channel}</td>
                <td className="px-3 py-2">
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    r.status === 'sent' && 'bg-primary/10 text-primary',
                    r.status === 'delivered' && 'bg-emerald-100 text-emerald-700',
                    r.status === 'opened' && 'bg-blue-100 text-blue-700',
                    r.status === 'clicked' && 'bg-indigo-100 text-indigo-700',
                    r.status === 'failed' && 'bg-destructive/10 text-destructive',
                    r.status === 'denied' && 'bg-orange-100 text-orange-700',
                  )}>{r.status}</span>
                </td>
                <td className="px-3 py-2">{r.category || '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.detail || '—'}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDateTime(r.created, tr('ar', 'en'))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
