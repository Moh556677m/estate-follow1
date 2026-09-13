import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import aiProvidersClient from '@/lib/aiProvidersClient';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

const EstateAiManagementPanel = () => {
  const { t, lang } = useLanguage();
  const ar = lang === 'ar';
  const { user } = useAuth();
  const isSuperAdmin = !!user?.is_super_admin;

  const [keys, setKeys] = useState([]);
  const [catalog, setCatalog] = useState({ sections: [], providers: [] });
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = closed; {} = new; record = edit
  const [form, setForm] = useState(emptyForm());
  const [showSecret, setShowSecret] = useState(false);
  const [status, setStatus] = useState([]); // per-section resolution

  function emptyForm() {
    return {
      id: null,
      name: '',
      provider: 'claude',
      env_var: 'ANTHROPIC_API_KEY',
      sections: [],
      enabled: true,
      key_value: '',
      notes: '',
    };
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, list] = await Promise.all([
        aiProvidersClient.getCatalog(),
        aiProvidersClient.list(),
      ]);
      setCatalog(cat || { sections: [], providers: [] });
      setKeys(list?.keys || []);
      // Overall Estate AI enabled flag (not a secret — stored on settings).
      try {
        const rows = await pb.collection('estate_ai_settings').getFullList({ sort: 'created' });
        if (rows[0]) setEnabled(rows[0].enabled !== false);
      } catch {
        /* keep default */
      }
      // Per-section activation status.
      const sections = (cat && cat.sections) || [];
      const statuses = await Promise.all(
        sections.map((s) =>
          aiProvidersClient
            .resolve(s.key)
            .then((r) => ({ ...s, active: !!r.active, provider: r.provider }))
            .catch(() => ({ ...s, active: false, provider: null })),
        ),
      );
      setStatus(statuses);
    } catch (err) {
      notify.error(ar ? 'تعذر تحميل مفاتيح المزودين.' : 'Could not load provider keys.', String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => {
    load();
  }, [load]);

  const sectionLabel = (key) => {
    const s = catalog.sections.find((x) => x.key === key);
    return s ? (ar ? s.ar : s.en) : key;
  };
  const providerLabel = (key) => {
    const p = catalog.providers.find((x) => x.key === key);
    return p ? (ar ? p.ar : p.en) : key;
  };

  const toggleEnabled = async (v) => {
    setEnabled(v);
    try {
      const rows = await pb.collection('estate_ai_settings').getFullList({ sort: 'created' });
      if (rows[0]) {
        await pb.collection('estate_ai_settings').update(rows[0].id, { enabled: v }, { requestKey: `ai-enabled-${rows[0].id}` });
        notify.success(v ? (ar ? 'تم تفعيل Estate AI.' : 'Estate AI enabled.') : (ar ? 'تم تعطيل Estate AI.' : 'Estate AI disabled.'));
      }
    } catch (err) {
      notify.error(ar ? 'تعذر تحديث الحالة.' : 'Could not update status.', String(err?.message || err));
      setEnabled(!v);
    }
  };

  const openNew = () => {
    setEditing({});
    setForm(emptyForm());
    setShowSecret(false);
    setDialogOpen(true);
  };

  const openEdit = (rec) => {
    setEditing(rec);
    setForm({
      id: rec.id,
      name: rec.name || '',
      provider: rec.provider || 'custom',
      env_var: rec.env_var || '',
      sections: Array.isArray(rec.sections) ? rec.sections : [],
      enabled: !!rec.enabled,
      key_value: '',
      notes: rec.notes || '',
    });
    setShowSecret(false);
    setDialogOpen(true);
  };

  const onProviderChange = (providerKey) => {
    const p = catalog.providers.find((x) => x.key === providerKey);
    setForm((f) => ({
      ...f,
      provider: providerKey,
      env_var: f.env_var && f.env_var !== 'ANTHROPIC_API_KEY' ? f.env_var : (p?.defaultEnv || f.env_var || 'CUSTOM_AI_API_KEY'),
    }));
  };

  const toggleSection = (key, checked) => {
    setForm((f) => ({
      ...f,
      sections: checked ? [...new Set([...f.sections, key])] : f.sections.filter((s) => s !== key),
    }));
  };

  const saveForm = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      notify.error(ar ? 'أدخل اسمًا واضحًا للمفتاح.' : 'Enter a clear key name.');
      return;
    }
    if (!form.env_var.trim()) {
      notify.error(ar ? 'أدخل اسم متغير البيئة.' : 'Enter an env var name.');
      return;
    }
    if (form.sections.length === 0) {
      notify.error(ar ? 'اختر قسمًا واحدًا على الأقل.' : 'Select at least one section.');
      return;
    }
    const isNew = !editing || !editing.id;
    if (isNew && !form.key_value.trim()) {
      notify.error(ar ? 'أدخل قيمة المفتاح (لن تُحفظ في الواجهة).' : 'Enter the key value (not stored in the UI).');
      return;
    }
    setBusy('save');
    try {
      if (isNew) {
        await aiProvidersClient.create({
          name: form.name.trim(),
          provider: form.provider,
          env_var: form.env_var.trim().toUpperCase(),
          sections: form.sections,
          enabled: form.enabled,
          key_value: form.key_value.trim(),
          notes: form.notes.trim(),
        });
        notify.success(ar ? 'تمت إضافة المفتاح.' : 'Key added.');
      } else {
        await aiProvidersClient.update(form.id, {
          name: form.name.trim(),
          provider: form.provider,
          env_var: form.env_var.trim().toUpperCase(),
          sections: form.sections,
          enabled: form.enabled,
          notes: form.notes.trim(),
          ...(form.key_value.trim() ? { key_value: form.key_value.trim() } : {}),
        });
        notify.success(ar ? 'تم تحديث المفتاح.' : 'Key updated.');
      }
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      notify.error(ar ? 'تعذر حفظ المفتاح.' : 'Could not save key.', String(err?.message || err?.code || err));
    } finally {
      setBusy('');
    }
  };

  const toggleKey = async (rec) => {
    setBusy(`toggle-${rec.id}`);
    try {
      await aiProvidersClient.update(rec.id, { enabled: !rec.enabled });
      notify.success(!rec.enabled ? (ar ? 'تم تفعيل المفتاح.' : 'Key enabled.') : (ar ? 'تم تعطيل المفتاح.' : 'Key disabled.'));
      await load();
    } catch (err) {
      notify.error(ar ? 'تعذر تغيير الحالة.' : 'Could not toggle key.', String(err?.message || err));
    } finally {
      setBusy('');
    }
  };

  const removeKey = async (rec) => {
      if (!window.confirm(ar ? `حذف المفتاح «${rec.name}»؟ سيُحذف من إعدادات الخادم.` : `Delete key "${rec.name}"? It will be removed from server settings.`)) return;
      setBusy(`del-${rec.id}`);
      try {
        await aiProvidersClient.remove(rec.id);
        notify.success(ar ? 'تم حذف المفتاح.' : 'Key deleted.');
        await load();
      } catch (err) {
        notify.error(ar ? 'تعذر الحذف.' : 'Could not delete key.', String(err?.message || err));
      } finally {
        setBusy('');
      }
    };

  const rotateKey = (rec) => {
    openEdit(rec);
    // pre-flag that admin intends to rotate
    setForm((f) => ({ ...f, _rotate: true }));
  };

  const sectionsForProvider = useMemo(() => catalog.sections, [catalog]);

  if (!isSuperAdmin) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        {ar ? 'هذا القسم مخصص للمشرف الأعلى فقط.' : 'Super Admin only.'}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="animate-spin me-2" size={18} /> {t('loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Helmet>
        <title>Estate AI Management — Estate Follow | إدارة Estate AI</title>
        <meta name="description" content="Super Admin control for AI providers and API keys" />
      </Helmet>

      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles size={22} />
        </span>
        <div>
          <h2 className="text-xl font-bold">{ar ? 'إدارة Estate AI' : 'Estate AI Management'}</h2>
          <p className="text-sm text-muted-foreground">
            {ar
              ? 'إدارة مزوّدي الذكاء الاصطناعي ومفاتيحهم. القسم الوحيد المدعوم هو «إضافة عقار بالذكاء الاصطناعي» — لا يُستخدم أي مفتاح AI في أي وظيفة أخرى. كل مفتاح يُخزَّن بأمان على الخادم ولا يظهر في الواجهة، وأي تغيير يُطبَّق فورًا عند الطلب التالي دون إعادة نشر.'
              : 'Manage AI providers and their keys. The only supported section is "AI Add Property" — no AI key is used in any other feature. Each key is stored securely on the server and never shown in the UI, and any change takes effect immediately on the next request with no redeploy.'}
          </p>
        </div>
      </div>

      {/* Overall Estate AI toggle */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <span className="text-sm font-medium">{ar ? 'تفعيل Estate AI' : 'Estate AI ON/OFF'}</span>
          </div>
          <Switch checked={enabled} onCheckedChange={toggleEnabled} />
        </div>
      </section>

      {/* API Keys management */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-primary" />
            <h3 className="font-bold">{ar ? 'إدارة مفاتيح API' : 'API Keys Management'}</h3>
          </div>
          <Button size="sm" onClick={openNew} className="min-h-[36px]">
            <Plus size={14} className="me-1" /> {ar ? 'إضافة مفتاح' : 'Add Key'}
          </Button>
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          {ar
            ? 'كل مفتاح يُربط بقسم أو أكثر من أقسام الموقع، ويمكن تفعيله/تعطيله باستقلال عن الباقي. قيمة المفتاح تُحفظ في إعدادات الخادم (متغير بيئة) ولا تُعرض أبدًا في الواجهة.'
            : 'Each key is linked to one or more site sections and can be enabled/disabled independently. The key value is stored in server settings (an env var) and is never shown in the UI.'}
        </p>

        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {ar ? 'لا توجد مفاتيح بعد. اضغط «إضافة مفتاح» للبدء.' : 'No keys yet. Click "Add Key" to start.'}
          </p>
        ) : (
          <div className="space-y-3">
            {keys.map((rec) => (
              <div key={rec.id} className="rounded-xl border bg-background p-4 space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold">{rec.name}</p>
                      <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold bg-primary/10 text-primary border-primary/30">
                        {providerLabel(rec.provider)}
                      </span>
                      {rec.configured ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 size={12} /> {ar ? 'مُعد' : 'Configured'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          <XCircle size={12} /> {ar ? 'غير مُعد' : 'Not configured'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1" dir="ltr">
                      {rec.env_var}
                      {rec.masked_key ? ` · ${rec.masked_key}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!rec.enabled}
                      onCheckedChange={() => toggleKey(rec)}
                      disabled={busy === `toggle-${rec.id}`}
                    />
                    <button
                      type="button"
                      title={ar ? 'تعديل' : 'Edit'}
                      aria-label={ar ? 'تعديل' : 'Edit'}
                      onClick={() => openEdit(rec)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      title={ar ? 'تدوير المفتاح' : 'Rotate key'}
                      aria-label={ar ? 'تدوير' : 'Rotate'}
                      onClick={() => rotateKey(rec)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <RotateCw size={15} />
                    </button>
                    <button
                      type="button"
                      title={ar ? 'حذف' : 'Delete'}
                      aria-label={ar ? 'حذف' : 'Delete'}
                      onClick={() => removeKey(rec)}
                      disabled={busy === `del-${rec.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-destructive hover:bg-destructive/10"
                    >
                      {busy === `del-${rec.id}` ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rec.sections.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">{ar ? 'لا أقسام مخصصة' : 'No sections assigned'}</span>
                  ) : (
                    rec.sections.map((s) => (
                      <span key={s} className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-foreground">
                        {sectionLabel(s)}
                      </span>
                    ))
                  )}
                </div>
                {rec.notes && (
                  <p className="text-[11px] text-muted-foreground border-t pt-2">{rec.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Provider status per section */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-primary" />
          <h3 className="font-bold">{ar ? 'حالة المزوّد لكل قسم' : 'Provider Status per Section'}</h3>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {ar
            ? 'يعرض أي مفتاح نشط ومُعد مسؤول عن كل قسم. أي تغيير للمزوّد أو التفعيل أو الأقسام يُطبَّق فورًا عند الطلب التالي — دون إعادة نشر. ملاحظة: مزوّد OpenAI يدعم الصور فقط (ملفات PDF تتطلب Anthropic Claude أو Google Gemini).'
            : 'Shows which active, configured key is responsible for each section. Any change to the provider, enable flag, or section assignment takes effect immediately on the next request — no redeploy. Note: the OpenAI provider supports images only (PDF files require Anthropic Claude or Google Gemini).'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {status.map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{ar ? s.ar : s.en}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {s.active
                    ? (ar ? `المزوّد: ${s.provider?.name || '—'}` : `Provider: ${s.provider?.name || '—'}`)
                    : (ar ? 'لا يوجد مزوّد نشط' : 'No active provider')}
                </p>
              </div>
              {s.active ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              ) : (
                <XCircle size={18} className="text-amber-500 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing && editing.id ? (ar ? 'تعديل مفتاح API' : 'Edit API Key') : (ar ? 'إضافة مفتاح API' : 'Add API Key')}
            </DialogTitle>
            <DialogDescription>
              {ar
                ? 'قيمة المفتاح تُحفظ بأمان على الخادم فقط. عند التعديل يمكنك ترك حقل القيمة فارغًا للإبقاء على المفتاح الحالي.'
                : 'The key value is stored securely on the server only. When editing, leave the value field empty to keep the current key.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveForm} className="space-y-4">
            <div>
              <Label className="text-xs">{ar ? 'الاسم' : 'Name'}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={ar ? 'مثال: Claude — إضافة عقار' : 'e.g. Claude — Add Property'}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{ar ? 'المزوّد' : 'Provider'}</Label>
                <Select value={form.provider} onValueChange={onProviderChange}>
                  <SelectTrigger className="mt-1 min-h-[40px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.providers.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {ar ? p.ar : p.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{ar ? 'متغير البيئة' : 'Env Var'}</Label>
                <Input
                  value={form.env_var}
                  onChange={(e) => setForm((f) => ({ ...f, env_var: e.target.value.toUpperCase() }))}
                  placeholder="ANTHROPIC_API_KEY"
                  dir="ltr"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">{ar ? 'الأقسام المسؤول عنها' : 'Responsible Sections'}</Label>
              <div className="mt-1 grid grid-cols-1 gap-2 rounded-lg border bg-accent/20 p-3">
                {sectionsForProvider.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.sections.includes(s.key)}
                      onCheckedChange={(v) => toggleSection(s.key, !!v)}
                    />
                    <span>{ar ? s.ar : s.en}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">
                {editing && editing.id
                  ? (ar ? 'قيمة المفتاح (اختياري — للتدوير)' : 'Key value (optional — to rotate)')
                  : (ar ? 'قيمة المفتاح' : 'Key value')}
              </Label>
              <div className="relative mt-1">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={form.key_value}
                  onChange={(e) => setForm((f) => ({ ...f, key_value: e.target.value }))}
                  placeholder={editing && editing.id ? (ar ? 'اتركه فارغًا للإبقاء على الحالي' : 'Leave empty to keep current') : 'sk-...'}
                  dir="ltr"
                  className="pe-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showSecret ? 'hide' : 'show'}
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {ar ? 'لا يُحفظ في الواجهة — يُخزَّن فقط في إعدادات الخادم.' : 'Not stored in the UI — stored only in server settings.'}
              </p>
            </div>

            <div>
              <Label className="text-xs">{ar ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-accent/30 px-3 py-2.5">
              <span className="text-sm font-medium">{ar ? 'تفعيل المفتاح' : 'Enable key'}</span>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); }} className="min-h-[40px]">
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button type="submit" disabled={busy === 'save'} className="min-h-[40px]">
                {busy === 'save' ? <Loader2 size={16} className="animate-spin me-2" /> : <Save size={16} className="me-2" />}
                {editing && editing.id ? (ar ? 'حفظ' : 'Save') : (ar ? 'إضافة' : 'Add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EstateAiManagementPanel;
