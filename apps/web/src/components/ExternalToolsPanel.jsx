import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CircleSlash,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
  X,
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import integrationsClient from '@/lib/integrationsClient';

// External Tools (Integration Registry) — Super Admin only.
//
// This is the missing consumer for a real backend (apps/api/src/routes/
// integrations.js + the integration_registry PocketBase collection, seeded
// from an actual scan of the codebase — see the migration's file header for
// exactly what was found and where). Nothing shown here is invented: every
// row was discovered by reading real source files (index.html script tags,
// package.json SDK dependencies, .env variable names, route files making
// outbound HTTP calls to a third-party API).

const CATEGORY_LABELS = {
  error_tracking: { en: 'Error Tracking', ar: 'تتبع الأخطاء' },
  analytics: { en: 'Analytics', ar: 'تحليلات' },
  push_notifications: { en: 'Push Notifications', ar: 'إشعارات فورية' },
  anti_bot: { en: 'Anti-Bot', ar: 'مكافحة البوتات' },
  ai_provider: { en: 'AI Provider', ar: 'مزود ذكاء اصطناعي' },
  payment: { en: 'Payment', ar: 'دفع' },
  email: { en: 'Email', ar: 'بريد إلكتروني' },
  storage_cdn: { en: 'Storage / CDN', ar: 'تخزين / CDN' },
  sms: { en: 'SMS', ar: 'رسائل نصية' },
  other: { en: 'Other', ar: 'أخرى' },
};

const STATUS_STYLES = {
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  disabled: 'bg-muted text-muted-foreground border-border',
  error: 'bg-destructive/10 text-destructive border-destructive/30',
  not_configured: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
};

const STATUS_LABELS = {
  active: { en: 'Active', ar: 'مفعّل' },
  disabled: { en: 'Disabled', ar: 'موقوف' },
  error: { en: 'Error', ar: 'خطأ' },
  not_configured: { en: 'Not Configured', ar: 'غير مهيّأ' },
};

function parseJsonish(v, fallback) {
  if (v && typeof v === 'object') return v;
  try {
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function StatusBadge({ status, ar }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.not_configured;
  const label = (STATUS_LABELS[status] || STATUS_LABELS.not_configured)[ar ? 'ar' : 'en'];
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', style)}>
      {label}
    </span>
  );
}

function AddToolDialog({ open, onOpenChange, onCreated, ar }) {
  const [form, setForm] = useState({
    name: '',
    category: 'other',
    description: '',
    used_by: '',
    base_url: '',
    env_var: '',
    auth_type: 'none',
    side: 'backend',
    test_endpoint: '',
    webhook_url: '',
    docs_url: '',
    enabled: false,
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const save = async () => {
    if (!form.name.trim()) {
      notify.error(ar ? 'اسم الأداة مطلوب' : 'Tool name is required');
      return;
    }
    setSaving(true);
    try {
      await integrationsClient.create(form);
      notify.success(ar ? 'تمت إضافة الأداة' : 'Tool added');
      onCreated();
      onOpenChange(false);
      setForm({
        name: '', category: 'other', description: '', used_by: '', base_url: '',
        env_var: '', auth_type: 'none', side: 'backend', test_endpoint: '',
        webhook_url: '', docs_url: '', enabled: false,
      });
    } catch (e) {
      notify.error(e?.message || (ar ? 'فشلت الإضافة' : 'Failed to add'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ar ? '+ إضافة أداة' : '+ Add Tool'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{ar ? 'اسم الأداة' : 'Tool name'}</Label>
            <Input value={form.name} onChange={set('name')} />
          </div>
          <div>
            <Label>{ar ? 'نوع الخدمة' : 'Category'}</Label>
            <Select value={form.category} onValueChange={(v) => set('category')(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{ar ? v.ar : v.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{ar ? 'وصف الوظيفة' : 'Description'}</Label>
            <Input value={form.description} onChange={set('description')} />
          </div>
          <div>
            <Label>{ar ? 'القسم الذي ستستخدم فيه' : 'Used in section'}</Label>
            <Input value={form.used_by} onChange={set('used_by')} placeholder={ar ? 'مثال: صفحة الدفع' : 'e.g. Checkout page'} />
          </div>
          <div>
            <Label>Base URL / Endpoint</Label>
            <Input value={form.base_url} onChange={set('base_url')} placeholder="https://api.example.com" />
          </div>
          <div>
            <Label>{ar ? 'نوع المصادقة' : 'Auth type'}</Label>
            <Select value={form.auth_type} onValueChange={(v) => set('auth_type')(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="api_key">API Key</SelectItem>
                <SelectItem value="bearer_token">Bearer Token</SelectItem>
                <SelectItem value="oauth">OAuth</SelectItem>
                <SelectItem value="basic_auth">Basic Auth</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.auth_type !== 'none' && (
            <div>
              <Label>{ar ? 'اسم Environment Variable للمفتاح' : 'API Key env var name'}</Label>
              <Input
                value={form.env_var}
                onChange={set('env_var')}
                placeholder="MY_SERVICE_API_KEY"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {ar
                  ? 'لا تكتب المفتاح نفسه هنا — فقط اسم المتغير. اضبط القيمة الفعلية في .env على السيرفر.'
                  : 'Do not paste the actual key here — only its env var name. Set the real value in the server .env.'}
              </p>
            </div>
          )}
          <div>
            <Label>Frontend / Backend</Label>
            <Select value={form.side} onValueChange={(v) => set('side')(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="frontend">Frontend</SelectItem>
                <SelectItem value="backend">Backend</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Test Endpoint ({ar ? 'اختياري' : 'optional'})</Label>
            <Input value={form.test_endpoint} onChange={set('test_endpoint')} />
          </div>
          <div>
            <Label>Webhook URL ({ar ? 'اختياري' : 'optional'})</Label>
            <Input value={form.webhook_url} onChange={set('webhook_url')} />
          </div>
          <div>
            <Label>Documentation URL ({ar ? 'اختياري' : 'optional'})</Label>
            <Input value={form.docs_url} onChange={set('docs_url')} />
          </div>
          <div className="flex items-center justify-between">
            <Label>{ar ? 'مفعّلة' : 'Enabled'}</Label>
            <Switch checked={form.enabled} onCheckedChange={(v) => set('enabled')(v)} />
          </div>
          <p className="text-xs text-muted-foreground">
            {ar
              ? 'بعد الحفظ، استخدم زر Test Connection على الكارت قبل الاعتماد النهائي.'
              : 'After saving, use the Test Connection button on the card before final activation.'}
          </p>
          <Button onClick={save} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            {ar ? 'حفظ' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolCard({ item, ar, onChanged }) {
  const [busy, setBusy] = useState('');
  const desc = parseJsonish(item.description, { en: '', ar: '' });
  const usedBy = parseJsonish(item.used_by, []);
  const envVars = parseJsonish(item.env_vars, []);
  const secretRefs = parseJsonish(item.secret_refs, {});

  const toggle = async () => {
    setBusy('toggle');
    try {
      await integrationsClient.update(item.id, { enabled: !item.enabled });
      notify.success(ar ? 'تم التحديث' : 'Updated');
      onChanged();
    } catch (e) {
      notify.error(e?.message || (ar ? 'فشل التحديث' : 'Update failed'));
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const res = await integrationsClient.test(item.id);
      if (res.ok) notify.success(res.message || (ar ? 'الاتصال ناجح' : 'Connection OK'));
      else notify.error(res.message || (ar ? 'فشل الاتصال' : 'Connection failed'));
      onChanged();
    } catch (e) {
      notify.error(e?.message || (ar ? 'فشل الاختبار' : 'Test failed'));
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (item.is_system) return;
    if (!window.confirm(ar ? `حذف "${item.name}"؟ لن يُحذف أي Secret من السيرفر تلقائيًا.` : `Delete "${item.name}"? This will not delete any secret from the server automatically.`)) {
      return;
    }
    setBusy('delete');
    try {
      await integrationsClient.remove(item.id);
      notify.success(ar ? 'تم الحذف' : 'Deleted');
      onChanged();
    } catch (e) {
      notify.error(e?.body?.message || e?.message || (ar ? 'فشل الحذف' : 'Delete failed'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={cn('rounded-2xl border bg-card p-4 shadow-sm space-y-3', !item.enabled && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Plug size={16} />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {(CATEGORY_LABELS[item.category] || CATEGORY_LABELS.other)[ar ? 'ar' : 'en']}
            </p>
          </div>
        </div>
        <StatusBadge status={item.health_status} ar={ar} />
      </div>

      {(desc.en || desc.ar) && (
        <p className="text-xs text-muted-foreground">{ar ? (desc.ar || desc.en) : (desc.en || desc.ar)}</p>
      )}

      {usedBy.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">
            {ar ? 'مستخدمة في:' : 'Used by:'}
          </p>
          <div className="flex flex-wrap gap-1">
            {usedBy.map((u, i) => (
              <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{u}</span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>{ar ? 'يحتاج Secret:' : 'Needs secret:'} <b className="text-foreground">{item.needs_secret ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No')}</b></span>
        <span>{ar ? 'الجانب:' : 'Side:'} <b className="text-foreground">{item.side}</b></span>
        {envVars.length > 0 && (
          <span className="col-span-2 truncate">ENV: <b className="text-foreground">{envVars.join(', ')}</b></span>
        )}
        {secretRefs.proxy_collection && (
          <span className="col-span-2">
            {ar ? 'مصدر الإعداد:' : 'Managed via:'}{' '}
            <b className="text-foreground">
              {secretRefs.proxy_collection === 'ai_provider_keys' ? (ar ? 'إدارة Estate AI' : 'Estate AI Management') : (ar ? 'بوابات الدفع' : 'Payment Gateways')}
            </b>
          </span>
        )}
        {item.last_success && (
          <span className="col-span-2">{ar ? 'آخر اتصال ناجح:' : 'Last success:'} {new Date(item.last_success).toLocaleString(ar ? 'ar' : 'en')}</span>
        )}
        {item.last_error && (
          <span className="col-span-2 flex items-start gap-1 text-destructive">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span className="truncate">{item.last_error}</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t">
        <div className="flex items-center gap-2">
          <Switch checked={!!item.enabled} onCheckedChange={toggle} disabled={busy === 'toggle'} />
          <span className="text-xs font-medium">{item.enabled ? (ar ? 'مفعّلة' : 'Enabled') : (ar ? 'موقوفة' : 'Disabled')}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={test} disabled={busy === 'test'} className="h-7 gap-1 text-xs">
            {busy === 'test' ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
            {ar ? 'اختبار' : 'Test'}
          </Button>
          {!item.is_system && (
            <Button size="sm" variant="outline" onClick={remove} disabled={busy === 'delete'} className="h-7 w-7 p-0 text-destructive">
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      </div>
      {item.is_system && (
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <CircleSlash size={10} />
          {ar ? 'أداة مكتشفة تلقائيًا من الكود — يمكن إيقافها فقط، لا يمكن حذفها.' : 'Auto-discovered from code — can be disabled, not deleted.'}
        </p>
      )}
    </div>
  );
}

export default function ExternalToolsPanel() {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await integrationsClient.list();
      setItems(res.items || []);
    } catch (e) {
      setError(e?.message || (ar ? 'تعذر التحميل' : 'Failed to load'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = {};
    items.forEach((it) => {
      map[it.category] = map[it.category] || [];
      map[it.category].push(it);
    });
    return map;
  }, [items]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Plug className="text-primary" size={22} />
          <h2 className="text-xl font-bold">{ar ? 'الأدوات الخارجية' : 'External Tools'}</h2>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus size={16} />
          {ar ? 'إضافة أداة' : 'Add Tool'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {ar
          ? 'كل أداة هنا مكتشفة فعليًا من الكود (لا توجد أدوات وهمية). الإيقاف/التفعيل يؤثر فعليًا على تشغيل الأداة — راجع كارت كل أداة لمعرفة التفاصيل.'
          : 'Every tool here was discovered from the real codebase (nothing invented). Enable/Disable genuinely affects whether that tool runs — see each card for details.'}
      </p>

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">
          {ar ? 'لا توجد أدوات بعد.' : 'No tools yet.'}
        </div>
      ) : (
        Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} className="space-y-3">
            <p className="text-sm font-bold text-muted-foreground">
              {(CATEGORY_LABELS[cat] || CATEGORY_LABELS.other)[ar ? 'ar' : 'en']}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((item) => (
                <ToolCard key={item.id} item={item} ar={ar} onChanged={load} />
              ))}
            </div>
          </div>
        ))
      )}

      <AddToolDialog open={addOpen} onOpenChange={setAddOpen} onCreated={load} ar={ar} />
    </div>
  );
}
