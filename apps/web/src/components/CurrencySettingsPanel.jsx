import React, { useCallback, useEffect, useState } from 'react';
import { Coins, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { notify } from '@/lib/notify';
import {
  listCountryCurrencySettings,
  upsertCountryCurrencySetting,
  deleteCountryCurrencySetting,
} from '@/lib/countryCurrency';

// Currency-per-country system — admin panel. An empty list here means every
// country falls back to the single global currency configured on the
// Subscription Management page, exactly as before this feature existed.
// Adding a row here also unlocks per-currency PRICE overrides for that
// currency on each plan, edited from Subscription Management.
function SettingFormDialog({ open, onOpenChange, editing, onSaved }) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [country, setCountry] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('');
  const [currenciesText, setCurrenciesText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCountry(editing.country || '');
      setDefaultCurrency(editing.default_currency || '');
      setCurrenciesText((editing.currencies || []).join(', '));
    } else {
      setCountry('');
      setDefaultCurrency('');
      setCurrenciesText('');
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!country.trim() || !defaultCurrency.trim()) {
      notify.error(
        isAr ? 'بيانات ناقصة' : 'Missing information',
        isAr ? 'أدخل رمز الدولة والعملة الافتراضية' : 'Enter the country code and default currency',
      );
      return;
    }
    setSaving(true);
    try {
      const currencies = currenciesText
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      await upsertCountryCurrencySetting({
        id: editing?.id,
        country,
        defaultCurrency,
        currencies,
      });
      notify.success(isAr ? 'تم الحفظ' : 'Saved');
      onOpenChange(false);
      onSaved();
    } catch (err) {
      notify.error(isAr ? 'تعذر الحفظ' : 'Save failed', String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? isAr ? 'تعديل عملة الدولة' : 'Edit country currency'
              : isAr ? 'إضافة دولة' : 'Add country'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{isAr ? 'رمز الدولة (ISO، مثال: AE)' : 'Country code (ISO, e.g. AE)'}</Label>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="AE"
              className="min-h-[44px] font-mono"
              dir="ltr"
              maxLength={10}
              disabled={!!editing}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{isAr ? 'العملة الافتراضية (مثال: AED)' : 'Default currency (e.g. AED)'}</Label>
            <Input
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
              placeholder="AED"
              className="min-h-[44px] font-mono"
              dir="ltr"
              maxLength={10}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{isAr ? 'عملات مسموحة إضافية (اختياري، مفصولة بفاصلة)' : 'Additional allowed currencies (optional, comma separated)'}</Label>
            <Input
              value={currenciesText}
              onChange={(e) => setCurrenciesText(e.target.value)}
              placeholder="AED, USD"
              className="min-h-[44px] font-mono"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'العملة الافتراضية تُضاف تلقائيًا. لتحديد سعر مختلف لكل عملة، عدّل ذلك من صفحة إدارة الاشتراكات.'
                : 'The default currency is always included. To set a different price per currency, edit that from the Subscription Management page.'}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
            {saving ? <Loader2 size={16} className="animate-spin" /> : isAr ? 'حفظ' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CurrencySettingsPanel = () => {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listCountryCurrencySettings());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (row) => {
    if (
      !window.confirm(
        isAr
          ? `حذف إعداد العملة لدولة "${row.country}"؟ سترجع هذه الدولة لاستخدام العملة العامة الافتراضية.`
          : `Delete the currency setting for "${row.country}"? This country will fall back to the global default currency.`,
      )
    )
      return;
    setBusy(row.id);
    try {
      await deleteCountryCurrencySetting(row.id);
      notify.success(isAr ? 'تم الحذف' : 'Deleted');
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر الحذف' : 'Delete failed', String(err?.message || err));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Coins size={20} className="text-primary" />
            {isAr ? 'العملة حسب الدولة' : 'Currency by Country'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'حدّد العملة الافتراضية لكل دولة. الدول غير المُعرّفة هنا تستخدم العملة العامة تلقائيًا. لتحديد سعر مختلف لكل عملة، استخدم صفحة إدارة الاشتراكات.'
              : 'Set the default currency for each country. Any country not listed here automatically uses the global default currency. To set a different price per currency, use the Subscription Management page.'}
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="min-h-[44px]">
          <Plus size={16} className="me-1.5" />
          {isAr ? 'إضافة دولة' : 'Add country'}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-muted-foreground" size={28} />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {isAr
            ? 'لا توجد دول مُعرّفة بعد — كل الدول تستخدم العملة العامة الافتراضية.'
            : 'No countries configured yet — every country uses the global default currency.'}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold font-mono" dir="ltr">{row.country}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {isAr ? 'الافتراضية: ' : 'Default: '}{row.default_currency}
                  {Array.isArray(row.currencies) && row.currencies.length > 1
                    ? ` · ${isAr ? 'مسموح: ' : 'Allowed: '}${row.currencies.join(', ')}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditing(row); setDialogOpen(true); }}
                  className="min-h-[36px]"
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(row)}
                  disabled={busy === row.id}
                  className="min-h-[36px] text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  {busy === row.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SettingFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={load}
      />
    </div>
  );
};

export default CurrencySettingsPanel;
