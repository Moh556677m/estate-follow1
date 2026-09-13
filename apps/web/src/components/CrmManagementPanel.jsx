import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Building2,
  Globe2,
  Handshake,
  Loader2,
  Save,
  TrendingUp,
  Users as UsersIcon,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { notify } from '@/lib/notify';
import { getAdminCrmSettings, saveAdminCrmSettings, getAdminCrmStats } from '@/lib/crmClient';

// CRM Management — Super Admin panel.
//
// This is real, not cosmetic: `getAdminCrmSettings`/`saveAdminCrmSettings`/
// `getAdminCrmStats` (lib/crmClient.js) already existed and already call
// genuine, working PocketBase routes (pb_hooks/crm.pb.js: `crm_admin_settings`
// feature toggles + real `crm_leads` stats) — there was simply no Admin UI
// panel wired up to call them, so every toggle here has been live since the
// backend was written; this panel is the missing consumer.
//
// Feature toggles here gate the CRM system for every broker/company account
// site-wide (checked server-side inside the CRM lead-capture/routes — see
// crm.pb.js — so disabling one here actually stops that feature working,
// it does not just hide a button).

function ToggleRow({ label, checked, onChange, hint }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={16} />
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BreakdownList({ title, data }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-sm font-bold mb-3">{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <div className="space-y-1.5">
          {entries.slice(0, 8).map(([key, count]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate">{key}</span>
              <span className="font-semibold">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CrmManagementPanel() {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, st] = await Promise.all([getAdminCrmSettings(), getAdminCrmStats()]);
      setSettings(s);
      setStats(st);
    } catch (e) {
      setError(e?.message || (ar ? 'تعذر تحميل بيانات CRM' : 'Failed to load CRM data'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev?.[key] }));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await saveAdminCrmSettings(settings);
      notify.success(ar ? 'تم حفظ إعدادات CRM' : 'CRM settings saved');
      load();
    } catch (e) {
      notify.error(e?.message || (ar ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2">
        <Handshake className="text-primary" size={22} />
        <h2 className="text-xl font-bold">{ar ? 'إدارة CRM' : 'CRM Management'}</h2>
      </div>

      {/* Real, live stats from crm_leads — not mock data */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={UsersIcon} label={ar ? 'إجمالي العملاء المحتملين' : 'Total Leads'} value={stats?.total ?? 0} />
        <StatCard icon={TrendingUp} label={ar ? 'اليوم' : 'Today'} value={stats?.today ?? 0} />
        <StatCard icon={BarChart3} label={ar ? 'هذا الأسبوع' : 'This Week'} value={stats?.week ?? 0} />
        <StatCard icon={BarChart3} label={ar ? 'هذا الشهر' : 'This Month'} value={stats?.month ?? 0} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Building2} label={ar ? 'حسابات نشطة' : 'Active Accounts'} value={stats?.active_accounts ?? 0} />
        <StatCard icon={UsersIcon} label={ar ? 'عملاء الوسطاء' : 'Broker Leads'} value={stats?.broker_leads ?? 0} />
        <StatCard icon={Building2} label={ar ? 'عملاء الشركات' : 'Company Leads'} value={stats?.company_leads ?? 0} />
        <StatCard
          icon={TrendingUp}
          label={ar ? 'نسبة التحويل' : 'Conversion Rate'}
          value={`${stats?.conversion_rate ?? 0}%`}
          sub={ar ? `${stats?.purchased ?? 0} تم إغلاقها` : `${stats?.purchased ?? 0} won`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <BreakdownList title={ar ? 'حسب الحالة' : 'By Status'} data={stats?.by_status} />
        <BreakdownList title={ar ? 'حسب المصدر' : 'By Source'} data={stats?.by_source} />
        <BreakdownList title={ar ? 'حسب الدولة' : 'By Country'} data={stats?.by_country} />
      </div>

      {/* Feature toggles — real, server-enforced (see crm.pb.js) */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-sm font-bold mb-1">{ar ? 'تفعيل النظام' : 'System Toggles'}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {ar
            ? 'هذه المفاتيح تتحكم فعليًا في تشغيل ميزات CRM على مستوى الموقع بالكامل — ليست شكلية.'
            : 'These toggles genuinely control whether each CRM feature runs site-wide — not cosmetic.'}
        </p>
        <ToggleRow
          label={ar ? 'نظام CRM' : 'CRM System'}
          checked={settings?.system_enabled}
          onChange={() => toggle('system_enabled')}
          hint={ar ? 'إيقافه يوقف صفحات جذب العملاء العامة بالكامل' : 'Disabling stops the public lead-capture pages entirely'}
        />
        <ToggleRow
          label={ar ? 'حسابات الوسطاء' : 'Broker Accounts'}
          checked={settings?.broker_enabled}
          onChange={() => toggle('broker_enabled')}
        />
        <ToggleRow
          label={ar ? 'حسابات الشركات' : 'Company Accounts'}
          checked={settings?.company_enabled}
          onChange={() => toggle('company_enabled')}
        />
        <ToggleRow
          label={ar ? 'تحليل العملاء بالذكاء الاصطناعي' : 'AI Lead Analysis'}
          checked={settings?.ai_enabled}
          onChange={() => toggle('ai_enabled')}
        />
        <ToggleRow
          label={ar ? 'تصدير البيانات' : 'Data Export'}
          checked={settings?.export_enabled}
          onChange={() => toggle('export_enabled')}
        />
        <ToggleRow
          label={ar ? 'تتبع الروابط' : 'Link Tracking'}
          checked={settings?.tracking_enabled}
          onChange={() => toggle('tracking_enabled')}
        />
        <ToggleRow
          label={ar ? 'واتساب' : 'WhatsApp'}
          checked={settings?.whatsapp_enabled}
          onChange={() => toggle('whatsapp_enabled')}
        />
        <ToggleRow
          label={ar ? 'التذكيرات' : 'Reminders'}
          checked={settings?.reminders_enabled}
          onChange={() => toggle('reminders_enabled')}
        />
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {ar ? 'حفظ' : 'Save'}
          </Button>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe2 size={13} />
        {ar
          ? 'صفحة جذب العملاء العامة لكل وسيط/شركة على /connect/:slug تبقى كما هي — هذه الشاشة تتحكم فقط في تفعيل/تعطيل الميزات على مستوى المنصة.'
          : 'The public per-broker/company lead page at /connect/:slug is unaffected — this screen only controls platform-wide feature enablement.'}
      </p>
    </div>
  );
}
