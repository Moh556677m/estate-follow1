import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  AlertTriangle,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import {
  GATEWAY_TYPES,
  GATEWAY_TYPE_OPTIONS,
  approveManualOrder,
  checkGatewayFields,
  confirmCryptoOrder,
  createGateway,
  deleteGateway,
  formatIncompleteFields,
  gatewayTypeLabel,
  getGatewayType,
  getStripeStatus,
  isProviderSupported,
  listGateways,
  listPendingCryptoOrders,
  listPendingManualOrders,
  listPendingStripeOrders,
  reconcileStripeOrders,
  rejectCryptoOrder,
  rejectManualOrder,
  updateGateway,
} from '@/lib/paymentGateways';

const MASK_MARKER = '••••';

function maskHint(isAr) {
  return isAr
    ? 'اتركه كما هو للحفاظ على المفتاح الحالي، أو الصق قيمة جديدة لاستبداله.'
    : 'Leave as-is to keep the current key, or paste a new value to replace it.';
}

// ---- Add / Edit dialog -----------------------------------------------------
function GatewayFormDialog({ open, onOpenChange, editing, onSaved }) {
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';

  const [typeKey, setTypeKey] = useState('stripe');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState('test');
  const [active, setActive] = useState(true);
  const [fields, setFields] = useState({});
  const [wallets, setWallets] = useState([]);
  const [allowedCountriesText, setAllowedCountriesText] = useState('');
  const [blockedCountriesText, setBlockedCountriesText] = useState('');
  const [allowedCurrenciesText, setAllowedCurrenciesText] = useState('');
  const [reveal, setReveal] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Reset form whenever the dialog opens (for add) or editing target changes.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTypeKey(editing.type || 'stripe');
      setLabel(editing.label || '');
      setMode(editing.mode || 'test');
      setActive(editing.active !== false);
      const f = {};
      const type = getGatewayType(editing.type);
      if (type) {
        type.fields.forEach((fd) => {
          f[fd.name] = editing.fields?.[fd.name] || '';
        });
      }
      setFields(f);
      setWallets(Array.isArray(editing.wallets) ? editing.wallets : []);
      setAllowedCountriesText((editing.allowedCountries || []).join(', '));
      setBlockedCountriesText((editing.blockedCountries || []).join(', '));
      setAllowedCurrenciesText((editing.allowedCurrencies || []).join(', '));
    } else {
      setTypeKey('stripe');
      setLabel('');
      setMode('test');
      setActive(true);
      setFields({});
      setWallets([]);
      setAllowedCountriesText('');
      setBlockedCountriesText('');
      setAllowedCurrenciesText('');
    }
    setReveal({});
    setErrors({});
  }, [open, editing]);

  const typeDef = getGatewayType(typeKey);
  const supported = isProviderSupported(typeKey);

  // Live hint shown under the active toggle when the user tries to mark an
  // incomplete gateway active inside the form. The actual force-inactive
  // happens on save; this just tells them why.
  const activeIncompleteHint = (() => {
    if (!active || !typeDef) return '';
    if (!supported) {
      return isAr
        ? 'هذا المزوّد غير متصل بعد (يتطلب تطوير برمجي) — لن يمكن تفعيله أبدًا حتى تتم إضافة كود معالجة دفع حقيقي له.'
        : 'This provider is not connected yet (requires development) — it can never be activated until real payment-processing code is added for it.';
    }
    const effectiveFields = typeDef.walletBased ? { wallets: JSON.stringify(wallets) } : fields;
    const check = checkGatewayFields(typeKey, effectiveFields);
    if (check.complete) return '';
    if (typeDef.walletBased) {
      return isAr
        ? 'لن تُفعّل البوابة عند الحفظ لأنه لا يوجد محفظة واحدة مكتملة (أصل + شبكة + عنوان).'
        : 'This gateway will be saved inactive because no wallet is fully configured (asset + network + address).';
    }
    const list = formatIncompleteFields(check, lang);
    return isAr
      ? `لن تُفعّل البوابة عند الحفظ لأن هذه الحقول ناقصة أو غير صحيحة: ${list}`
      : `This gateway will be saved inactive because these fields are missing or invalid: ${list}`;
  })();

  const setField = (name, value) => {
    setFields((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const addWallet = () => setWallets((prev) => [...prev, { asset: '', network: '', address: '' }]);
  const removeWallet = (idx) => setWallets((prev) => prev.filter((_, i) => i !== idx));
  const setWalletField = (idx, key, value) =>
    setWallets((prev) => prev.map((w, i) => (i === idx ? { ...w, [key]: value } : w)));

  const parseCsv = (text) =>
    text
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

  const validate = () => {
    const errs = {};
    if (!label.trim()) errs.label = isAr ? 'الاسم مطلوب' : 'Label is required';
    if (!typeDef) errs.type = isAr ? 'اختر نوع البوابة' : 'Select a gateway type';
    // Gateway fields are optional on save — a gateway can be saved incomplete
    // (it will be forced inactive). Completeness is enforced at activation
    // time, not at save time.
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const secretFields = typeDef && !typeDef.walletBased
        ? typeDef.fields.filter((f) => f.secret).map((f) => f.name)
        : [];
      const fieldsPayload = {};
      if (typeDef?.walletBased) {
        const cleanWallets = wallets
          .map((w) => ({
            asset: String(w.asset || '').trim().toUpperCase(),
            network: String(w.network || '').trim().toUpperCase(),
            address: String(w.address || '').trim(),
          }))
          .filter((w) => w.asset && w.network && w.address);
        fieldsPayload.wallets = JSON.stringify(cleanWallets);
      } else {
        (typeDef?.fields || []).forEach((fd) => {
          fieldsPayload[fd.name] = String(fields[fd.name] || '').trim();
        });
      }
      // Activation gate: if the user toggled the gateway active but the
      // essential fields are not all present/correct, or this provider has
      // no real payment-processing code yet, force it inactive on save and
      // warn them why — instead of rejecting the save.
      const check = checkGatewayFields(typeKey, fieldsPayload);
      let finalActive = active;
      if (active && !check.complete) finalActive = false;
      const payload = {
        type: typeKey,
        label: label.trim(),
        mode,
        active: finalActive,
        fields: fieldsPayload,
        secretFields,
        allowedCountries: parseCsv(allowedCountriesText),
        blockedCountries: parseCsv(blockedCountriesText),
        allowedCurrencies: parseCsv(allowedCurrenciesText),
      };
      if (editing) {
        await updateGateway(editing.id, payload);
      } else {
        await createGateway(payload);
      }
      if (active && !check.complete && check.unsupported) {
        notify.warning(
          isAr ? 'تم الحفظ كغير مفعّلة — يتطلب تطوير برمجي' : 'Saved as inactive — requires development',
          isAr
            ? 'هذا المزوّد لم يُربط بعد بكود معالجة دفع حقيقي.'
            : 'This provider is not yet wired to real payment-processing code.',
        );
      } else if (active && !check.complete) {
        const list = formatIncompleteFields(check, lang);
        notify.warning(
          isAr
            ? 'تم الحفظ كغير مفعّلة — حقول ناقصة أو غير صحيحة'
            : 'Saved as inactive — missing or invalid fields',
          list,
        );
      } else {
        notify.success(
          editing
            ? isAr
              ? 'تم تحديث بوابة الدفع'
              : 'Payment gateway updated'
            : isAr
              ? 'تمت إضافة بوابة الدفع'
              : 'Payment gateway added',
        );
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      notify.error(
        isAr ? 'تعذر الحفظ' : 'Save failed',
        String(err?.message || err),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? isAr
                ? 'تعديل بوابة الدفع'
                : 'Edit payment gateway'
              : isAr
                ? 'إضافة بوابة دفع جديدة'
                : 'Add a new payment gateway'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>{isAr ? 'نوع البوابة' : 'Gateway type'}</Label>
            <Select
              value={typeKey}
              onValueChange={setTypeKey}
              disabled={!!editing}
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GATEWAY_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {isAr ? o.labelAr : o.label}
                    {o.status !== 'active' ? (isAr ? ' — يتطلب تطوير' : ' — requires development') : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-xs text-destructive">{errors.type}</p>
            )}
            {!supported && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {isAr
                  ? 'هذا المزوّد غير متصل بعد بكود معالجة دفع حقيقي — يمكنك حفظ بيانات الاعتماد للمستقبل، لكن لن يمكن تفعيله أو ظهوره للمستخدمين.'
                  : 'This provider has no real payment-processing code yet — you can save credentials for later, but it can never be activated or shown to users.'}
              </p>
            )}
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label>
              {isAr ? 'اسم مخصص للبوابة' : 'Custom label'}
            </Label>
            <Input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setErrors((p) => ({ ...p, label: undefined }));
              }}
              placeholder={
                isAr ? 'مثال: Stripe الرئيسي' : 'e.g. Main Stripe'
              }
              className="min-h-[44px]"
            />
            {errors.label && (
              <p className="text-xs text-destructive">{errors.label}</p>
            )}
          </div>

          {/* Mode */}
          <div className="space-y-1.5">
            <Label>{isAr ? 'الوضع' : 'Mode'}</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">
                  {isAr ? 'تجريبي (Test)' : 'Test'}
                </SelectItem>
                <SelectItem value="live">
                  {isAr ? 'فعلي (Live)' : 'Live'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic fields */}
          {/* Wallet list editor (crypto only) */}
          {typeDef?.walletBased && (
            <div className="space-y-2">
              <Label>{isAr ? 'محافظ الاستلام (أصل + شبكة + عنوان)' : 'Deposit wallets (asset + network + address)'}</Label>
              {wallets.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'لا توجد محافظ بعد. أضف واحدة على الأقل لتفعيل البوابة.' : 'No wallets yet. Add at least one to activate this gateway.'}
                </p>
              )}
              <div className="space-y-2">
                {wallets.map((w, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg border p-2">
                    <Input
                      value={w.asset}
                      onChange={(e) => setWalletField(idx, 'asset', e.target.value)}
                      placeholder={isAr ? 'الأصل (USDT)' : 'Asset (USDT)'}
                      className="min-h-[40px]"
                      dir="ltr"
                    />
                    <Input
                      value={w.network}
                      onChange={(e) => setWalletField(idx, 'network', e.target.value)}
                      placeholder={isAr ? 'الشبكة (TRC20)' : 'Network (TRC20)'}
                      className="min-h-[40px]"
                      dir="ltr"
                    />
                    <div className="flex gap-1">
                      <Input
                        value={w.address}
                        onChange={(e) => setWalletField(idx, 'address', e.target.value)}
                        placeholder={isAr ? 'عنوان المحفظة' : 'Wallet address'}
                        className="min-h-[40px] font-mono text-xs"
                        dir="ltr"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeWallet(idx)} className="h-10 w-10 shrink-0 text-destructive">
                        <X size={15} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addWallet} className="min-h-[36px]">
                <Plus size={13} className="me-1" />
                {isAr ? 'إضافة محفظة' : 'Add wallet'}
              </Button>
            </div>
          )}

          {typeDef &&
            !typeDef.walletBased &&
            typeDef.fields.map((fd) => {
              const isSecret = fd.secret;
              const shown = reveal[fd.name];
              const val = fields[fd.name] || '';
              const isMasked = val.includes(MASK_MARKER);
              return (
                <div key={fd.name} className="space-y-1.5">
                  <Label>
                    {isAr ? fd.labelAr : fd.label}
                  </Label>
                  <div className="relative">
                    <Input
                      type={isSecret && !shown ? 'password' : 'text'}
                      value={val}
                      onChange={(e) => setField(fd.name, e.target.value)}
                      placeholder={fd.prefix ? `${fd.prefix}…` : ''}
                      className={cn(
                        'min-h-[44px] pe-10',
                        isSecret && 'font-mono',
                      )}
                      dir="ltr"
                    />
                    {isSecret && (
                      <button
                        type="button"
                        onClick={() =>
                          setReveal((p) => ({ ...p, [fd.name]: !p[fd.name] }))
                        }
                        className="absolute end-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                        aria-label={shown ? 'hide' : 'show'}
                      >
                        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    )}
                  </div>
                  {isSecret && editing && isMasked && (
                    <p className="text-xs text-muted-foreground">
                      {maskHint(isAr)}
                    </p>
                  )}
                  {errors[fd.name] && (
                    <p className="text-xs text-destructive">{errors[fd.name]}</p>
                  )}
                </div>
              );
            })}

          {/* Country / currency visibility (optional — empty = no restriction) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{isAr ? 'الدول المسموحة (اختياري)' : 'Allowed countries (optional)'}</Label>
              <Input
                value={allowedCountriesText}
                onChange={(e) => setAllowedCountriesText(e.target.value)}
                placeholder={isAr ? 'مثال: AE, SA, EG — فارغ = بلا قيود' : 'e.g. AE, SA, EG — empty = no restriction'}
                className="min-h-[40px]"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                {isAr ? 'إن تُرك فارغًا: تظهر في كل الدول (ما لم تُحظر أدناه).' : 'If empty: shows in every country (unless blocked below).'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? 'الدول المحظورة (اختياري)' : 'Blocked countries (optional)'}</Label>
              <Input
                value={blockedCountriesText}
                onChange={(e) => setBlockedCountriesText(e.target.value)}
                placeholder={isAr ? 'مثال: EG — تظهر بكل مكان ما عدا هذه الدول' : 'e.g. EG — shows everywhere except these'}
                className="min-h-[40px]"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                {isAr ? 'الحظر له الأولوية دائمًا على السماح.' : 'A blocked country always wins over the allow-list.'}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{isAr ? 'العملات المسموحة (اختياري)' : 'Allowed currencies (optional)'}</Label>
              <Input
                value={allowedCurrenciesText}
                onChange={(e) => setAllowedCurrenciesText(e.target.value)}
                placeholder={isAr ? 'مثال: USD, AED — فارغ = بلا قيود' : 'e.g. USD, AED — empty = no restriction'}
                className="min-h-[40px]"
                dir="ltr"
              />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">
                {isAr ? 'تفعيل البوابة' : 'Activate gateway'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? 'البوابات المفعّلة فقط تظهر كخيار دفع للمستخدمين.'
                  : 'Only active gateways appear as payment options for users.'}
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          {activeIncompleteHint && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {activeIncompleteHint}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="min-h-[44px]"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="min-h-[44px]">
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <Save size={15} className="me-1.5" />
                {editing ? (isAr ? 'حفظ' : 'Save') : isAr ? 'إضافة' : 'Add'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main panel ------------------------------------------------------------
const PaymentGatewaysPanel = () => {
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';

  const [gateways, setGateways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const [stripeStatus, setStripeStatus] = useState(null);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [reconcileBusy, setReconcileBusy] = useState('');
  const [cryptoPending, setCryptoPending] = useState([]);
  const [cryptoBusy, setCryptoBusy] = useState('');
  const [manualPending, setManualPending] = useState([]);
  const [manualBusy, setManualBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, status, pending, cryptoRows, manualRows] = await Promise.all([
        listGateways(),
        getStripeStatus().catch(() => null),
        listPendingStripeOrders().catch(() => []),
        listPendingCryptoOrders().catch(() => []),
        listPendingManualOrders().catch(() => []),
      ]);
      setGateways(rows);
      setStripeStatus(status);
      setPendingOrders(Array.isArray(pending) ? pending : []);
      setCryptoPending(Array.isArray(cryptoRows) ? cryptoRows : []);
      setManualPending(Array.isArray(manualRows) ? manualRows : []);
    } catch {
      setGateways([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live: gateway changes (add/edit/delete/toggle) and new/reviewed orders
  // refresh the list + pending-submission panels instantly.
  useRealtimeRefresh(load, ['payment_gateways', 'subscription_orders']);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (gw) => {
    setEditing(gw);
    setDialogOpen(true);
  };

  const toggleActive = async (gw) => {
    // Activation gate: refuse to activate an incomplete gateway and tell the
    // admin exactly which essential fields are missing/invalid. Deactivation
    // is always allowed.
    if (!gw.active) {
      const check = checkGatewayFields(gw.type, gw.fields);
      if (!check.complete) {
        const list = formatIncompleteFields(check, lang);
        notify.error(
          isAr ? 'لا يمكن تفعيل البوابة' : 'Cannot activate gateway',
          isAr
            ? `حقول ناقصة أو غير صحيحة: ${list}`
            : `Missing or invalid fields: ${list}`,
        );
        return;
      }
    }
    setBusy(`toggle-${gw.id}`);
    try {
      const updated = await updateGateway(gw.id, { active: !gw.active });
      setGateways((prev) => prev.map((g) => (g.id === gw.id ? updated : g)));
      notify.success(
        !gw.active
          ? isAr
            ? 'تم تفعيل البوابة'
            : 'Gateway activated'
          : isAr
            ? 'تم إيقاف البوابة'
            : 'Gateway deactivated',
      );
    } catch (err) {
      notify.error(isAr ? 'تعذر التحديث' : 'Update failed', String(err?.message || err));
    } finally {
      setBusy('');
    }
  };

  const handleDelete = async (gw) => {
    if (
      !window.confirm(
        isAr
          ? `حذف بوابة الدفع "${gw.label}" نهائيًا؟`
          : `Delete payment gateway "${gw.label}" permanently?`,
      )
    )
      return;
    setBusy(`del-${gw.id}`);
    try {
      await deleteGateway(gw.id);
      setGateways((prev) => prev.filter((g) => g.id !== gw.id));
      notify.success(isAr ? 'تم حذف البوابة' : 'Gateway deleted');
    } catch (err) {
      notify.error(isAr ? 'تعذر الحذف' : 'Delete failed', String(err?.message || err));
    } finally {
      setBusy('');
    }
  };

  const pkgLabel = (k) => {
    const m = {
      annual: isAr ? 'سنوي' : 'Annual',
      premium: isAr ? 'بريميوم' : 'Premium',
      unlimited: isAr ? 'غير محدود' : 'Unlimited',
      extra_property: isAr ? 'عقار إضافي' : 'Extra Property',
    };
    return m[k] || k;
  };

  const handleReconcile = async (orderId = '') => {
    setReconcileBusy(orderId || 'all');
    try {
      const resp = await reconcileStripeOrders(orderId);
      const results = resp?.results || [];
      const activated = results.filter((r) => r.activated).length;
      if (activated > 0) {
        notify.success(
          isAr
            ? `تم تفعيل ${activated} باقة بنجاح بعد التحقق من Stripe.`
            : `${activated} package(s) activated after verifying with Stripe.`,
        );
      } else {
        notify.info(
          isAr
            ? 'لم يجد Stripe أي دفعة مؤكدة لهذه الطلبات.'
            : 'Stripe did not find any confirmed payment for these orders.',
        );
      }
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر التحقق' : 'Reconcile failed', String(err?.message || err));
    } finally {
      setReconcileBusy('');
    }
  };

  const handleCryptoConfirm = async (orderId) => {
    setCryptoBusy(orderId);
    try {
      const resp = await confirmCryptoOrder(orderId);
      if (resp?.activated) {
        notify.success(isAr ? 'تم تأكيد الدفعة وتفعيل الباقة' : 'Payment confirmed and package activated');
      } else {
        notify.info(
          isAr ? `لم يتم التفعيل: ${resp?.reason || ''}` : `Not activated: ${resp?.reason || ''}`,
        );
      }
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر التأكيد' : 'Confirm failed', String(err?.message || err));
    } finally {
      setCryptoBusy('');
    }
  };

  const handleCryptoReject = async (orderId) => {
    if (
      !window.confirm(
        isAr
          ? 'رفض هذه الدفعة؟ لن يتم تفعيل أي باقة لها.'
          : 'Reject this payment? No package will be activated for it.',
      )
    )
      return;
    setCryptoBusy(orderId);
    try {
      await rejectCryptoOrder(orderId);
      notify.success(isAr ? 'تم رفض الدفعة' : 'Payment rejected');
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر الرفض' : 'Reject failed', String(err?.message || err));
    } finally {
      setCryptoBusy('');
    }
  };

  const handleManualApprove = async (orderId) => {
    setManualBusy(orderId);
    try {
      const resp = await approveManualOrder(orderId);
      if (resp?.activated) {
        notify.success(isAr ? 'تمت الموافقة وتفعيل الباقة' : 'Approved and package activated');
      } else {
        notify.info(
          isAr ? `لم يتم التفعيل: ${resp?.reason || ''}` : `Not activated: ${resp?.reason || ''}`,
        );
      }
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذرت الموافقة' : 'Approve failed', String(err?.message || err));
    } finally {
      setManualBusy('');
    }
  };

  const handleManualReject = async (orderId) => {
    const reason = window.prompt(
      isAr ? 'سبب الرفض (سيظهر للمستخدم):' : 'Rejection reason (shown to the user):',
      '',
    );
    if (reason === null) return; // cancelled
    setManualBusy(orderId);
    try {
      await rejectManualOrder(orderId, reason);
      notify.success(isAr ? 'تم رفض الدفعة' : 'Payment rejected');
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر الرفض' : 'Reject failed', String(err?.message || err));
    } finally {
      setManualBusy('');
    }
  };

  const activeCount = useMemo(
    () => gateways.filter((g) => g.active).length,
    [gateways],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            {isAr ? 'بوابات الدفع' : 'Payment Gateways'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'أضف وعدّل واحذف بوابات الدفع. البوابات المفعّلة تظهر تلقائيًا كخيارات دفع في صفحة الاشتراك.'
              : 'Add, edit and remove payment gateways. Active gateways automatically appear as payment options on the subscription page.'}
          </p>
        </div>
        <Button onClick={openAdd} className="min-h-[44px]">
          <Plus size={16} className="me-1.5" />
          {isAr ? 'إضافة بوابة دفع جديدة' : 'Add new gateway'}
        </Button>
      </div>

      {/* Webhook setup banner — the #1 reason activation never happens. */}
      {stripeStatus && (
        <div
          className={cn(
            'rounded-xl border p-4 space-y-2',
            stripeStatus.configured
              ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900'
              : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900',
          )}
        >
          <p className="text-sm font-bold">
            {stripeStatus.configured
              ? isAr
                ? '✅ Stripe مُهيأ بالكامل'
                : '✅ Stripe is fully configured'
              : isAr
                ? '⚠️ إعداد Stripe غير مكتمل'
                : '⚠️ Stripe setup is incomplete'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? 'لكي تُفعّل الباقات تلقائيًا بعد الدفع، يجب تسجيل رابط Webhook التالي في لوحة تحكم Stripe (Developers → Webhooks → Add endpoint) مع الأحداث أدناه، ووضع سر التوقيع (whsec_…) في حقل Webhook Signing Secret بالأعلى.'
              : 'For packages to activate automatically after payment, register the webhook URL below in your Stripe dashboard (Developers → Webhooks → Add endpoint) with the events listed below, and put the signing secret (whsec_…) in the Webhook Signing Secret field above.'}
          </p>
          <div className="rounded-lg bg-card/80 px-3 py-2 border">
            <p className="text-[11px] text-muted-foreground mb-0.5">
              {isAr ? 'رابط Webhook' : 'Webhook URL'}
            </p>
            <code className="text-xs break-all" dir="ltr">
              {stripeStatus.webhookUrl}
            </code>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stripeStatus.events.map((ev) => (
              <span
                key={ev}
                className="rounded-full bg-card/80 border px-2 py-0.5 text-[10px] font-mono"
                dir="ltr"
              >
                {ev}
              </span>
            ))}
          </div>
          {!stripeStatus.configured && (
            <ul className="text-xs text-muted-foreground list-disc ps-5 space-y-0.5">
              {!stripeStatus.activeGateway && (
                <li>{isAr ? 'لا توجد بوابة Stripe مفعّلة.' : 'No active Stripe gateway.'}</li>
              )}
              {stripeStatus.activeGateway && !stripeStatus.hasSecretKey && (
                <li>{isAr ? 'المفتاح السري (sk_) غير مُدخل.' : 'Secret key (sk_) is missing.'}</li>
              )}
              {stripeStatus.activeGateway && !stripeStatus.hasWebhookSecret && (
                <li>
                  {isAr
                    ? 'سر Webhook (whsec_) غير مُدخل — ستحصل عليه بعد تسجيل الرابط في Stripe.'
                    : 'Webhook signing secret (whsec_) is missing — you get it after registering the URL in Stripe.'}
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      ) : gateways.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
          <CreditCard size={32} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {isAr
              ? 'لا توجد بوابات دفع بعد. اضغط «إضافة بوابة دفع جديدة» للبدء.'
              : 'No payment gateways yet. Click "Add new gateway" to get started.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `${gateways.length} بوابة · ${activeCount} مفعّلة`
              : `${gateways.length} gateway(s) · ${activeCount} active`}
          </p>
          {gateways.map((gw) => {
            const typeDef = getGatewayType(gw.type);
            return (
              <div
                key={gw.id}
                className={cn(
                  'rounded-xl border bg-card p-5 shadow-sm space-y-4',
                  !gw.active && 'opacity-70',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <CreditCard size={22} strokeWidth={1.8} />
                    </span>
                    <div>
                      <p className="font-bold">{gw.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {gatewayTypeLabel(gw.type, lang)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        gw.mode === 'live'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200',
                      )}
                    >
                      {gw.mode === 'live'
                        ? isAr
                          ? 'فعلي'
                          : 'Live'
                        : isAr
                          ? 'تجريبي'
                          : 'Test'}
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        gw.active
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-muted text-muted-foreground border-border',
                      )}
                    >
                      {gw.active
                        ? isAr
                          ? 'مفعّلة'
                          : 'Active'
                        : isAr
                          ? 'متوقفة'
                          : 'Inactive'}
                    </span>
                    {!isProviderSupported(gw.type) && (
                      <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                        {isAr ? 'يتطلب تطوير' : 'Requires development'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Country/currency visibility, when set */}
                {((gw.allowedCountries && gw.allowedCountries.length > 0) ||
                  (gw.blockedCountries && gw.blockedCountries.length > 0) ||
                  (gw.allowedCurrencies && gw.allowedCurrencies.length > 0)) && (
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {gw.allowedCountries?.length > 0 && (
                      <span dir="ltr">{isAr ? 'الدول:' : 'Countries:'} {gw.allowedCountries.join(', ')}</span>
                    )}
                    {gw.blockedCountries?.length > 0 && (
                      <span dir="ltr">{isAr ? 'محظورة:' : 'Blocked:'} {gw.blockedCountries.join(', ')}</span>
                    )}
                    {gw.allowedCurrencies?.length > 0 && (
                      <span dir="ltr">{isAr ? 'العملات:' : 'Currencies:'} {gw.allowedCurrencies.join(', ')}</span>
                    )}
                  </div>
                )}

                {/* Field summary (secrets masked) — wallets for crypto */}
                {typeDef?.walletBased ? (
                  <div className="space-y-1.5">
                    {(gw.wallets || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {isAr ? 'لا توجد محافظ مُعدّة.' : 'No wallets configured.'}
                      </p>
                    ) : (
                      (gw.wallets || []).map((w, i) => (
                        <div key={i} className="rounded-lg bg-muted/50 px-3 py-2 flex flex-wrap items-center gap-2 text-xs" dir="ltr">
                          <span className="font-semibold">{w.asset}</span>
                          <span className="text-muted-foreground">{w.network}</span>
                          <span className="font-mono truncate">{w.address}</span>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  typeDef && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {typeDef.fields.map((fd) => (
                        <div
                          key={fd.name}
                          className="rounded-lg bg-muted/50 px-3 py-2"
                        >
                          <p className="text-[11px] text-muted-foreground">
                            {isAr ? fd.labelAr : fd.label}
                          </p>
                          <p
                            className={cn(
                              'text-sm font-medium truncate',
                              fd.secret && 'font-mono',
                            )}
                            dir="ltr"
                          >
                            {gw.fields?.[fd.name] || '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(gw)}
                    className="min-h-[36px]"
                  >
                    <Pencil size={13} className="me-1" />
                    {isAr ? 'تعديل' : 'Edit'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive(gw)}
                    disabled={busy === `toggle-${gw.id}`}
                    className="min-h-[36px]"
                  >
                    {busy === `toggle-${gw.id}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Power size={13} className="me-1" />
                    )}
                    {gw.active
                      ? isAr
                        ? 'إيقاف'
                        : 'Deactivate'
                      : isAr
                        ? 'تفعيل'
                        : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(gw)}
                    disabled={busy === `del-${gw.id}`}
                    className="min-h-[36px] text-destructive hover:text-destructive"
                  >
                    {busy === `del-${gw.id}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} className="me-1" />
                    )}
                    {isAr ? 'حذف' : 'Delete'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment recovery — safely reconcile customers whose webhook never
          fired. The admin does NOT guess: Stripe's API is queried for each
          pending order and the package is activated only when Stripe
          confirms payment_status === 'paid'. */}
      {pendingOrders.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-bold text-amber-800 dark:text-amber-200">
                  {isAr ? 'مدفوعات معلّقة بانتظار التأكيد' : 'Pending payments awaiting confirmation'}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {isAr
                    ? `${pendingOrders.length} طلب دفع لم يُفعّل بعد. اضغط «تحقق من Stripe» لاسترجاع حالة الدفعة من Stripe وتفعيل الباقة تلقائيًا إذا تم الدفع فعلًا.`
                    : `${pendingOrders.length} payment order(s) not yet activated. Click "Verify with Stripe" to retrieve the payment status from Stripe and activate the package automatically if it was actually paid.`}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleReconcile('')}
              disabled={!!reconcileBusy}
              className="min-h-[36px]"
            >
              {reconcileBusy === 'all' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} className="me-1.5" />
              )}
              {isAr ? 'تحقق من الكل' : 'Reconcile all'}
            </Button>
          </div>
          <div className="space-y-2">
            {pendingOrders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-card/80 border px-3 py-2.5">
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-semibold truncate">{o.email || o.name || o.user}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {pkgLabel(o.package)} · {o.currency} {Number(o.amount || 0).toFixed(2)} · {String(o.stripe_session_id || '').slice(0, 22)}…
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReconcile(o.id)}
                  disabled={!!reconcileBusy}
                  className="min-h-[36px]"
                >
                  {reconcileBusy === o.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} className="me-1.5" />
                  )}
                  {isAr ? 'تحقق من Stripe' : 'Verify with Stripe'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crypto submissions awaiting manual review — the admin checks the
          transaction hash on-chain themselves (no automatic verification is
          performed — this project has no blockchain-node/explorer
          credentials) then Confirms or Rejects. Confirm reuses the exact
          same activation logic Stripe orders get. */}
      {cryptoPending.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-900 p-5 space-y-3">
          <div className="flex items-start gap-2">
            <Wallet className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-sky-800 dark:text-sky-200">
                {isAr ? 'دفعات عملات رقمية بانتظار المراجعة اليدوية' : 'Crypto payments awaiting manual review'}
              </p>
              <p className="text-xs text-sky-700 dark:text-sky-300">
                {isAr
                  ? 'تحقّق من رقم العملية (Tx Hash) على السلسلة بنفسك قبل التأكيد — لا يتم أي تحقق تلقائي من الشبكة.'
                  : 'Verify the transaction hash on-chain yourself before confirming — no automatic on-chain check is performed.'}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {cryptoPending.map((o) => (
              <div key={o.id} className="rounded-lg bg-card/80 border px-3 py-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm font-semibold truncate">{o.email || o.name || o.user}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {pkgLabel(o.package)} · {o.currency} {Number(o.amount || 0).toFixed(2)} · {o.crypto_asset} / {o.crypto_network}
                    </p>
                    <p className="text-xs font-mono break-all text-muted-foreground" dir="ltr">
                      {o.crypto_tx_hash}
                    </p>
                    {o.crypto_notes && (
                      <p className="text-xs text-muted-foreground mt-1">{o.crypto_notes}</p>
                    )}
                    {o.has_proof && o.proof_url && (
                      <a href={o.proof_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                        {isAr ? 'عرض إثبات الدفع' : 'View payment proof'}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCryptoConfirm(o.id)}
                      disabled={!!cryptoBusy}
                      className="min-h-[36px] text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    >
                      {cryptoBusy === o.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} className="me-1.5" />}
                      {isAr ? 'تأكيد' : 'Confirm'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCryptoReject(o.id)}
                      disabled={!!cryptoBusy}
                      className="min-h-[36px] text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {cryptoBusy === o.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} className="me-1.5" />}
                      {isAr ? 'رفض' : 'Reject'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual payment methods (InstaPay/Vodafone Cash/Orange Cash/Etisalat
          Cash/WE Pay) awaiting review — admin checks the reference/proof
          themselves then Approves (activates the package, same logic as
          Stripe/Crypto) or Rejects with a reason shown to the user. */}
      {manualPending.length > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-900 p-5 space-y-3">
          <div className="flex items-start gap-2">
            <Wallet className="text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-violet-800 dark:text-violet-200">
                {isAr ? 'دفعات يدوية بانتظار المراجعة' : 'Manual payments awaiting review'}
              </p>
              <p className="text-xs text-violet-700 dark:text-violet-300">
                {isAr
                  ? 'تحقّق من الرقم المرجعي وإثبات الدفع بنفسك قبل الموافقة — لا يتم أي تحقق تلقائي.'
                  : 'Verify the reference number and payment proof yourself before approving — no automatic check is performed.'}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {manualPending.map((o) => (
              <div key={o.id} className="rounded-lg bg-card/80 border px-3 py-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm font-semibold truncate">{o.email || o.name || o.user}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {pkgLabel(o.package)} · {o.currency} {Number(o.amount || 0).toFixed(2)} · {gatewayTypeLabel(o.method, lang)}
                    </p>
                    {o.reference && (
                      <p className="text-xs font-mono break-all text-muted-foreground" dir="ltr">
                        {o.reference}
                      </p>
                    )}
                    {o.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{o.notes}</p>
                    )}
                    {o.has_proof && o.proof_url && (
                      <a href={o.proof_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                        {isAr ? 'عرض إثبات الدفع' : 'View payment proof'}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleManualApprove(o.id)}
                      disabled={!!manualBusy}
                      className="min-h-[36px] text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    >
                      {manualBusy === o.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} className="me-1.5" />}
                      {isAr ? 'موافقة' : 'Approve'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleManualReject(o.id)}
                      disabled={!!manualBusy}
                      className="min-h-[36px] text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {manualBusy === o.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} className="me-1.5" />}
                      {isAr ? 'رفض' : 'Reject'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <GatewayFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={load}
      />
    </div>
  );
};

export default PaymentGatewaysPanel;
