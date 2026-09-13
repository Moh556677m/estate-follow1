import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Crown,
  Infinity as InfinityIcon,
  Loader2,
  Package,
  Plus,
  Save,
  Sparkles,
  TrendingUp,
  Trash2,
  Users as UsersIcon,
  Zap,
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
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SETTINGS,
  currencySymbol,
  formatPrice,
  loadSubscriptionSettings,
  packageDiscountAmount,
  packageFinalPrice,
  packageLabel,
  packageOriginalPrice,
  subscribeSettings,
} from '@/lib/subscriptionUtils';

const PACKAGE_ICONS = {
  trial: Sparkles,
  annual: Zap,
  premium: Crown,
  unlimited: InfinityIcon,
};

const PACKAGE_KEYS = ['trial', 'annual', 'premium', 'unlimited'];

const FEATURE_LABELS = {
  monthly_property_reports: { ar: 'التقارير الشهرية', en: 'Monthly Reports' },
};

function featureDisplayName(feature, isAr) {
  const preset = FEATURE_LABELS[feature.feature_key];
  if (preset) return isAr ? preset.ar : preset.en;
  return isAr ? feature.name_ar || feature.name || feature.feature_key : feature.name || feature.name_ar || feature.feature_key;
}

// Only Stripe-confirmed payment statuses are shown. Pending / failed /
// cancelled orders are NOT real payments — they are never displayed as a
// payment fact. The package activates automatically and only when the signed
// Stripe webhook (or Stripe-API fallback) confirms the payment.
const PAID_STATUSES = ['paid', 'approved'];

// ---------------------------------------------------------------------------
// Toggle row helper
// ---------------------------------------------------------------------------
function ToggleRow({ label, checked, onChange, hint }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Currency-per-country price overrides — one optional row per currency the
// admin wants a DIFFERENT price for on this plan (e.g. the base plan is
// priced in USD, but Egypt should see a specific EGP price rather than a
// raw USD→EGP conversion). A currency with no row here simply has no
// override — the checkout flow falls back to the plan's base price/currency
// for it, exactly as before this feature existed (see
// resolvePlanPriceForCurrency() / applyCurrencyOverride()).
// `value` is the plan's raw `currency_prices` object: { [CURRENCY]: {
// price, discount_price } }. `onChange` receives the whole updated object.
// ---------------------------------------------------------------------------
function CurrencyPriceOverrides({ value, onChange, isAr }) {
  const entries = Object.entries(value || {});

  const updateRow = (code, field, raw) => {
    const next = { ...(value || {}) };
    const row = { ...(next[code] || { price: 0, discount_price: 0 }) };
    row[field] = raw;
    next[code] = row;
    onChange(next);
  };

  const renameRow = (oldCode, newCodeRaw) => {
    const newCode = String(newCodeRaw || '').trim().toUpperCase().slice(0, 10);
    if (!newCode || newCode === oldCode) return;
    const next = { ...(value || {}) };
    next[newCode] = next[oldCode];
    delete next[oldCode];
    onChange(next);
  };

  const addRow = () => {
    const next = { ...(value || {}) };
    let code = 'XXX';
    let n = 1;
    while (next[code]) { code = `XXX${n}`; n += 1; }
    next[code] = { price: 0, discount_price: 0 };
    onChange(next);
  };

  const removeRow = (code) => {
    const next = { ...(value || {}) };
    delete next[code];
    onChange(next);
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {isAr ? 'أسعار مخصّصة لعملات أخرى (اختياري)' : 'Custom prices for other currencies (optional)'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="min-h-[32px]">
          <Plus size={13} className="me-1" />
          {isAr ? 'إضافة' : 'Add'}
        </Button>
      </div>
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? 'بدون أي إضافة، الدول المرتبطة بعملة أخرى (من صفحة العملة حسب الدولة) تستخدم السعر الأساسي أعلاه.'
            : 'With none added, countries mapped to another currency (via Currency by Country) use the base price above.'}
        </p>
      )}
      {entries.map(([code, row]) => (
        <div key={code} className="grid grid-cols-[80px_1fr_1fr_auto] gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-[10px]">{isAr ? 'العملة' : 'Currency'}</Label>
            <Input
              defaultValue={code}
              onBlur={(e) => renameRow(code, e.target.value)}
              className="min-h-[36px] font-mono text-xs"
              dir="ltr"
              maxLength={10}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">{isAr ? 'السعر' : 'Price'}</Label>
            <Input
              type="number"
              min={0}
              value={row.price ?? 0}
              onChange={(e) => updateRow(code, 'price', Number(e.target.value) || 0)}
              className="min-h-[36px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">{isAr ? 'الخصم' : 'Discount'}</Label>
            <Input
              type="number"
              min={0}
              value={row.discount_price ?? 0}
              onChange={(e) => updateRow(code, 'discount_price', Number(e.target.value) || 0)}
              className="min-h-[36px]"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeRow(code)}
            className="h-9 w-9 text-destructive"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Package card — editable settings for one package
// ---------------------------------------------------------------------------
function PackageCard({ icon: Icon, title, enabled, onToggle, children }) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-5 shadow-sm space-y-4',
        !enabled && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={22} className="text-primary" />
          <p className="font-bold text-lg">{title}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Package stats card — real subscribers + real revenue for one package.
// Subscribers = live users whose subscription_package === this key (excluding
//   staff / super-admin).
// Revenue = sum of Stripe-confirmed (paid) orders for this package. Trial is
//   free so its revenue is always 0; extra_property orders are not a package
//   and are excluded from these cards.
// ---------------------------------------------------------------------------
function PackageStatsCard({ icon: Icon, title, subscribers, revenue, currency, isAr }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={20} className="text-primary" />
        <p className="font-bold">{title}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <UsersIcon size={13} />
            {isAr ? 'المشتركون' : 'Subscribers'}
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1">{subscribers}</p>
        </div>
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp size={13} />
            {isAr ? 'الإيرادات' : 'Revenue'}
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1" dir="ltr">
            {formatPrice(revenue, currency, true)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature Entitlement card — generic editor for one `feature_entitlements`
// row (the first real consumer is `portfolio_manager`, but this renders any
// row the collection contains, so a future feature — e.g.
// `monthly_property_reports` — needs no new UI code, only a new seeded row).
// Mirrors exactly the fields GET /ef/my-entitlements resolves in
// plan-entitlement.pb.js: enabled, min_property_count, allowed_account_types,
// allowed_plans, limit_by_plan, pricing_mode/price/currency/billing_period.
// ---------------------------------------------------------------------------
function hydrateFeatureLocal(feature) {
  return {
    enabled: !!feature.enabled,
    min_property_count: feature.min_property_count ?? 0,
    allowed_account_types: Array.isArray(feature.allowed_account_types) ? feature.allowed_account_types : [],
    allowed_plans: Array.isArray(feature.allowed_plans) ? feature.allowed_plans : [],
    limit_by_plan:
      feature.limit_by_plan && typeof feature.limit_by_plan === 'object' && !Array.isArray(feature.limit_by_plan)
        ? feature.limit_by_plan
        : {},
    pricing_mode: feature.pricing_mode || 'included',
    price: feature.price ?? 0,
    discount_price: feature.discount_price ?? 0,
    currency: feature.currency || 'USD',
    billing_period: feature.billing_period || 'monthly',
  };
}

const ACCOUNT_TYPE_OPTIONS = ['owner', 'tenant', 'agent'];
const ACCOUNT_TYPE_LABELS = {
  owner: { ar: 'مالك', en: 'Owner' },
  tenant: { ar: 'مستأجر', en: 'Tenant' },
  agent: { ar: 'وسيط', en: 'Agent' },
};

function FeatureEntitlementCard({ feature, isAr, t, onSave, saving }) {
  const [local, setLocal] = useState(() => hydrateFeatureLocal(feature));
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState(null);

  const runGenerateNow = async () => {
    setGenerating(true);
    setGenerateResult(null);
    try {
      const res = await pb.send('/ef/monthly-reports/generate', { method: 'POST', body: {} });
      setGenerateResult({ ok: true, res });
    } catch (err) {
      setGenerateResult({ ok: false, error: String(err?.message || err) });
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    setLocal(hydrateFeatureLocal(feature));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature.id, feature.enabled, feature.min_property_count, feature.pricing_mode]);

  const togglePlan = (key) => {
    setLocal((prev) => {
      const has = prev.allowed_plans.includes(key);
      return {
        ...prev,
        allowed_plans: has ? prev.allowed_plans.filter((k) => k !== key) : [...prev.allowed_plans, key],
      };
    });
  };

  const toggleAccountType = (key) => {
    setLocal((prev) => {
      const has = prev.allowed_account_types.includes(key);
      return {
        ...prev,
        allowed_account_types: has
          ? prev.allowed_account_types.filter((k) => k !== key)
          : [...prev.allowed_account_types, key],
      };
    });
  };

  const setLimitForPlan = (key, value) => {
    setLocal((prev) => ({ ...prev, limit_by_plan: { ...prev.limit_by_plan, [key]: value } }));
  };

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-bold text-lg">{featureDisplayName(feature, isAr)}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">{feature.feature_key}</p>
        </div>
        <Switch checked={local.enabled} onCheckedChange={(v) => setLocal((p) => ({ ...p, enabled: v }))} />
      </div>

      {local.enabled && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{isAr ? 'الحد الأدنى لعدد العقارات' : 'Minimum property count'}</Label>
              <Input
                type="number"
                min={0}
                value={local.min_property_count}
                onChange={(e) => setLocal((p) => ({ ...p, min_property_count: e.target.value }))}
                className="min-h-[40px]"
              />
              <p className="text-xs text-muted-foreground">
                {isAr ? '0 = بدون حد أدنى' : '0 = no minimum'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? 'نوع التسعير' : 'Pricing mode'}</Label>
              <Select value={local.pricing_mode} onValueChange={(v) => setLocal((p) => ({ ...p, pricing_mode: v }))}>
                <SelectTrigger className="min-h-[40px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="included">{isAr ? 'ضمن الباقة' : 'Included in plan'}</SelectItem>
                  <SelectItem value="free">{isAr ? 'مجاني للجميع' : 'Free for everyone'}</SelectItem>
                  <SelectItem value="paid_addon">{isAr ? 'إضافة مدفوعة منفصلة' : 'Paid add-on'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {local.pricing_mode === 'paid_addon' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>{isAr ? 'السعر' : 'Price'}</Label>
                <Input
                  type="number"
                  min={0}
                  value={local.price}
                  onChange={(e) => setLocal((p) => ({ ...p, price: e.target.value }))}
                  className="min-h-[40px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'سعر الخصم' : 'Discount price'}</Label>
                <Input
                  type="number"
                  min={0}
                  value={local.discount_price}
                  onChange={(e) => setLocal((p) => ({ ...p, discount_price: e.target.value }))}
                  className="min-h-[40px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'العملة' : 'Currency'}</Label>
                <Select value={local.currency} onValueChange={(v) => setLocal((p) => ({ ...p, currency: v }))}>
                  <SelectTrigger className="min-h-[40px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP'].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'دورة الفوترة' : 'Billing period'}</Label>
                <Select
                  value={local.billing_period}
                  onValueChange={(v) => setLocal((p) => ({ ...p, billing_period: v }))}
                >
                  <SelectTrigger className="min-h-[40px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{isAr ? 'شهري' : 'Monthly'}</SelectItem>
                    <SelectItem value="quarterly">{isAr ? 'ربع سنوي' : 'Quarterly'}</SelectItem>
                    <SelectItem value="semiannual">{isAr ? 'نصف سنوي' : 'Semiannual'}</SelectItem>
                    <SelectItem value="annual">{isAr ? 'سنوي' : 'Annual'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              {isAr
                ? 'أنواع الحسابات المسموح لها (اتركه فارغًا للسماح لكل الأنواع)'
                : 'Eligible account types (leave empty to allow all)'}
            </Label>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_TYPE_OPTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleAccountType(key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    local.allowed_account_types.includes(key)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-transparent',
                  )}
                >
                  {isAr ? ACCOUNT_TYPE_LABELS[key].ar : ACCOUNT_TYPE_LABELS[key].en}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              {isAr
                ? 'الباقات المسموح لها بهذه الميزة (اتركه فارغًا للسماح لكل الباقات)'
                : 'Eligible plans (leave empty to allow all)'}
            </Label>
            <div className="flex flex-wrap gap-2">
              {PACKAGE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => togglePlan(key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    local.allowed_plans.includes(key)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-transparent',
                  )}
                >
                  {packageLabel(key, t)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              {isAr
                ? 'الحد المسموح لكل باقة (−1 = بلا حدود، 0 = غير مُتضمَّن، 1 = مُتضمَّن)'
                : 'Limit per plan (−1 = unlimited, 0 = not included, 1 = included)'}
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PACKAGE_KEYS.map((key) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{packageLabel(key, t)}</Label>
                  <Input
                    type="number"
                    value={local.limit_by_plan[key] ?? ''}
                    onChange={(e) => setLimitForPlan(key, e.target.value)}
                    className="min-h-[36px]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {feature.feature_key === 'monthly_property_reports' && (
        <div className="rounded-xl border border-dashed p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'تشغيل يدوي لتوليد تقارير الشهر الماضي لكل مالك مؤهل الآن (للاختبار، أو كمعالجة يدوية إذا فات الجدول الشهري).'
                : 'Manually generate last month’s reports for every eligible owner right now (for testing, or a manual catch-up if the monthly schedule was missed).'}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={runGenerateNow} disabled={generating}>
              {generating ? <Loader2 size={14} className="animate-spin" /> : isAr ? 'توليد الآن' : 'Generate Now'}
            </Button>
          </div>
          {generateResult && (
            <p className={cn('text-xs', generateResult.ok ? 'text-emerald-700' : 'text-destructive')} dir="ltr">
              {generateResult.ok
                ? `period=${generateResult.res.period} created=${generateResult.res.created} exists=${generateResult.res.exists} not_entitled=${generateResult.res.not_entitled} error=${generateResult.res.error}`
                : generateResult.error}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => onSave(feature.id, local)} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : isAr ? 'حفظ الميزة' : 'Save feature'}
        </Button>
      </div>
    </div>
  );
}

const SubscriptionManagementPanel = () => {
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // { trial, annual, premium, unlimited } -> plans collection record ids.
  // The real Dynamic source of truth is now `plans`, not a single
  // subscription_settings record — see loadSubscriptionSettings() in
  // subscriptionUtils.js.
  const [planIds, setPlanIds] = useState({});
  // Currency-per-country system: { trial, annual, premium, unlimited } ->
  // that plan's raw currency_prices override map — see
  // 1792100000_country_currency_settings.js and CurrencyPriceOverrides above.
  const [currencyPrices, setCurrencyPrices] = useState({ trial: {}, annual: {}, premium: {}, unlimited: {} });
  const [saving, setSaving] = useState(false);
  const [applyingTrialId, setApplyingTrialId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Orders (Stripe-confirmed only) + users (for live subscriber counts).
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  // feature_entitlements rows (portfolio_manager today; generic so any
  // future feature — e.g. monthly_property_reports — needs no new UI code).
  const [features, setFeatures] = useState([]);
  const [savingFeatureId, setSavingFeatureId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, o, f] = await Promise.all([
        loadSubscriptionSettings(),
        pb.collection('users').getFullList({ sort: '-created', requestKey: 'sub-admin-users' }),
        pb.collection('subscription_orders').getFullList({
          sort: '-processed_at,-created',
          expand: 'user',
          requestKey: 'sub-admin-orders',
        }),
        pb.collection('feature_entitlements').getFullList({ sort: 'feature_key', requestKey: 'sub-admin-features' }),
      ]);
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setPlanIds(s?._planIds || {});
      setCurrencyPrices(s?._currencyPrices || { trial: {}, annual: {}, premium: {}, unlimited: {} });
      setUsers(u);
      // Keep ONLY Stripe-confirmed payments. Pending / failed / cancelled
      // orders are not real payments and are never shown here.
      setOrders(o.filter((r) => PAID_STATUSES.includes(r.status)));
      setFeatures(f);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeSettings(load);
    const onOrder = () => load();
    void pb.collection('subscription_orders').subscribe('*', onOrder).catch(() => {});
    void pb.collection('users').subscribe('*', onOrder).catch(() => {});
    void pb.collection('feature_entitlements').subscribe('*', onOrder).catch(() => {});
    return () => {
      unsub();
      void pb.collection('subscription_orders').unsubscribe('*').catch(() => {});
      void pb.collection('users').unsubscribe('*').catch(() => {});
      void pb.collection('feature_entitlements').unsubscribe('*').catch(() => {});
    };
  }, [load]);

  // Writes back to one `feature_entitlements` row — this is what powers
  // live show/hide/lock/unlock everywhere the feature is gated (GET
  // /ef/my-entitlements resolves the SAME row on every request, no redeploy
  // needed for a threshold/plan/pricing change).
  const saveFeature = async (featureId, local) => {
    setSavingFeatureId(featureId);
    try {
      const patch = {
        enabled: !!local.enabled,
        min_property_count: Math.max(0, Number(local.min_property_count) || 0),
        allowed_account_types: local.allowed_account_types,
        allowed_plans: local.allowed_plans,
        limit_by_plan: Object.fromEntries(
          Object.entries(local.limit_by_plan).map(([k, v]) => [k, v === '' || v == null ? 0 : Number(v)]),
        ),
        pricing_mode: local.pricing_mode,
        price: Math.max(0, Number(local.price) || 0),
        discount_price: Math.max(0, Number(local.discount_price) || 0),
        currency: local.currency || 'USD',
        billing_period: local.billing_period || 'monthly',
      };
      await pb.collection('feature_entitlements').update(featureId, patch, {
        requestKey: `feature-save-${featureId}-${Date.now()}`,
      });
      notify.success(isAr ? 'تم حفظ إعدادات الميزة' : 'Feature settings saved');
    } catch (err) {
      notify.error(isAr ? 'تعذر الحفظ' : 'Save failed', String(err?.message || err));
    } finally {
      setSavingFeatureId(null);
    }
  };

  // ---- Settings helpers ----
  const setField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // Writes back to the real `plans` collection (one patch per plan row) —
  // this is what makes every change here genuinely Dynamic: enforcement
  // (subscription-enforcement.pb.js) and every entitlement check read these
  // SAME rows live, on every request. There is no longer a
  // subscription_settings record involved at all.
  const saveSettings = async () => {
    setSaving(true);
    try {
      const currency = String(settings.currency || 'USD');
      const clamp = (v, max) => Math.min(Math.max(0, Number(v) || 0), Math.max(0, Number(max) || 0));

      const patches = {
        trial: {
          active: !!settings.trial_enabled,
          trial_value: Math.max(1, Number(settings.trial_days) || 10),
          trial_unit: String(settings.trial_unit || 'days'),
          property_limit: Math.max(1, Number(settings.trial_properties) || 1),
          currency,
        },
        annual: {
          active: !!settings.annual_enabled,
          price: Math.max(0, Number(settings.annual_price) || 0),
          discount_price: clamp(settings.annual_discount_amount, settings.annual_price),
          property_limit: Math.max(0, Number(settings.annual_free_properties) || 0),
          extra_property_enabled: !!settings.annual_extra_enabled,
          extra_property_type: settings.annual_extra_type || 'percent',
          extra_property_value: Math.max(0, Number(settings.annual_extra_value) || 0),
          currency,
          currency_prices: currencyPrices.annual || {},
        },
        premium: {
          active: !!settings.premium_enabled,
          price: Math.max(0, Number(settings.premium_price) || 0),
          discount_price: clamp(settings.premium_discount_amount, settings.premium_price),
          property_limit: Math.max(0, Number(settings.premium_properties) || 0),
          currency,
          currency_prices: currencyPrices.premium || {},
        },
        unlimited: {
          active: !!settings.unlimited_enabled,
          price: Math.max(0, Number(settings.unlimited_price) || 0),
          discount_price: clamp(settings.unlimited_discount_amount, settings.unlimited_price),
          currency,
          currency_prices: currencyPrices.unlimited || {},
        },
      };

      const writes = Object.entries(patches)
        .filter(([key]) => planIds[key])
        .map(([key, patch]) =>
          pb.collection('plans').update(planIds[key], patch, {
            requestKey: `plan-save-${key}-${Date.now()}`,
          }),
        );
      if (writes.length === 0) {
        throw new Error(
          isAr
            ? 'لم يتم العثور على سجلات الباقات — أعد تشغيل الترحيلات (migrations)'
            : 'Plan records not found — run migrations first',
        );
      }
      await Promise.all(writes);
      notify.success(isAr ? 'تم حفظ إعدادات الباقات' : 'Plan settings saved');
    } catch (err) {
      notify.error(isAr ? 'تعذر الحفظ' : 'Save failed', String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  // Explicit "apply to existing subscribers" action for a TRIAL LENGTH
  // change (requirement #1/#7) — everything else here (limits, price)
  // already propagates live to every current subscriber automatically,
  // since enforcement reads the plan row directly. Trial length is the one
  // exception: it's only consumed at the moment a trial STARTS, so an
  // already-running trial keeps its original end date unless the Admin
  // explicitly asks to recompute it from this button.
  const applyTrialChangeToExisting = async () => {
    const trialPlanId = planIds.trial;
    if (!trialPlanId) return;
    setApplyingTrialId(trialPlanId);
    try {
      const token = pb.authStore.token;
      const res = await fetch(`${pb.baseURL}/ef/admin/plans/${trialPlanId}/apply-trial-change`, {
        method: 'POST',
        headers: { Authorization: token },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      notify.success(
        isAr
          ? `تم تحديث ${body.updated || 0} حساب تجريبي حالي بالمدة الجديدة`
          : `Updated ${body.updated || 0} existing trial(s) with the new duration`,
      );
    } catch (err) {
      notify.error(isAr ? 'تعذر التطبيق' : 'Apply failed', String(err?.message || err));
    } finally {
      setApplyingTrialId(null);
    }
  };

  // ---- Live per-package stats (real data only) ----
  // Owners only — staff / super-admin are never counted as subscribers.
  const ownerUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          !u.is_super_admin &&
          !['admin', 'editor', 'support', 'custom'].includes(u.role),
      ),
    [users],
  );

  const packageStats = useMemo(() => {
    const stats = {};
    PACKAGE_KEYS.forEach((key) => {
      stats[key] = { subscribers: 0, revenue: 0 };
    });
    ownerUsers.forEach((u) => {
      const key = String(u.subscription_package || 'none');
      if (stats[key]) stats[key].subscribers += 1;
    });
    // Revenue = sum of Stripe-confirmed orders for each package.
    // extra_property orders are not one of the four packages — excluded.
    orders.forEach((o) => {
      const key = String(o.package || '');
      if (stats[key]) {
        stats[key].revenue += Number(o.amount) || 0;
      }
    });
    return stats;
  }, [ownerUsers, orders]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ---- Package settings ---- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold">
              {isAr ? 'إدارة الباقات والأسعار' : 'Packages & Pricing'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? 'كل تغيير ينعكس فورًا على كل المستخدمين الحاليين والجدد.'
                : 'Every change reflects instantly on all current and new users.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={settings.currency || 'USD'}
              onValueChange={(v) => setField('currency', v)}
            >
              <SelectTrigger className="w-[110px] min-h-[40px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP'].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c} {currencySymbol(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={saveSettings} disabled={saving} className="min-h-[40px]">
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <Save size={15} className="me-1.5" />
                  {isAr ? 'حفظ' : 'Save'}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Trial */}
          <PackageCard
            icon={PACKAGE_ICONS.trial}
            title={isAr ? 'الفترة التجريبية المجانية' : 'Free Trial'}
            enabled={settings.trial_enabled}
            onToggle={(v) => setField('trial_enabled', v)}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{isAr ? 'مدة التجربة' : 'Trial duration'}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={settings.trial_days}
                    onChange={(e) => setField('trial_days', e.target.value)}
                    className="min-h-[40px]"
                    aria-label={isAr ? 'العدد' : 'Duration value'}
                  />
                  <Select
                    value={settings.trial_unit === 'months' ? 'months' : 'days'}
                    onValueChange={(v) => setField('trial_unit', v === 'months' ? 'months' : 'days')}
                  >
                    <SelectTrigger className="min-h-[40px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">{isAr ? 'أيام' : 'Days'}</SelectItem>
                      <SelectItem value="months">{isAr ? 'شهور' : 'Months'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'عدد العقارات المسموح بها' : 'Allowed properties'}</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.trial_properties}
                  onChange={(e) => setField('trial_properties', e.target.value)}
                  className="min-h-[40px]"
                />
              </div>
              {planIds.trial && (
                <div className="rounded-lg border border-dashed p-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? 'تغيير مدة التجربة أعلاه (بعد الحفظ) ينطبق تلقائيًا على المستخدمين الجدد فقط. لتطبيق المدة الجديدة على الحسابات التجريبية الحالية أيضًا:'
                      : 'Changing the trial duration above (after saving) applies automatically to NEW users only. To also apply the new duration to CURRENT trial accounts:'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={applyTrialChangeToExisting}
                    disabled={applyingTrialId === planIds.trial}
                  >
                    {applyingTrialId === planIds.trial ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : isAr ? (
                      'تطبيق المدة الجديدة على المشتركين الحاليين'
                    ) : (
                      'Apply new duration to existing trial subscribers'
                    )}
                  </Button>
                </div>
              )}
            </div>
          </PackageCard>

          {/* Annual */}
          <PackageCard
            icon={PACKAGE_ICONS.annual}
            title={isAr ? 'الاشتراك السنوي' : 'Annual Subscription'}
            enabled={settings.annual_enabled}
            onToggle={(v) => setField('annual_enabled', v)}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? 'السعر الأصلي' : 'Original price'}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.annual_price}
                    onChange={(e) => setField('annual_price', e.target.value)}
                    className="min-h-[40px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? 'مبلغ الخصم' : 'Discount amount'}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={Number(settings.annual_price) || undefined}
                    step="0.01"
                    value={settings.annual_discount_amount}
                    onChange={(e) => {
                      const price = Math.max(0, Number(settings.annual_price) || 0);
                      const raw = Number(e.target.value);
                      const v = Number.isFinite(raw) ? Math.min(price, Math.max(0, raw)) : 0;
                      setField('annual_discount_amount', e.target.value === '' ? '' : v);
                    }}
                    className="min-h-[40px]"
                  />
                </div>
              </div>
              {packageDiscountAmount('annual', settings) > 0 && (
                <p className="text-xs text-primary font-medium" dir="ltr">
                  <span className="line-through text-muted-foreground me-2">
                    {formatPrice(packageOriginalPrice('annual', settings), settings.currency, true)}
                  </span>
                  <span className="font-bold">
                    {formatPrice(packageFinalPrice('annual', settings), settings.currency, true)}
                  </span>
                </p>
              )}
              <CurrencyPriceOverrides
                value={currencyPrices.annual}
                onChange={(v) => setCurrencyPrices((p) => ({ ...p, annual: v }))}
                isAr={isAr}
              />
              <div className="space-y-1.5">
                <Label>{isAr ? 'عدد العقارات المجانية' : 'Free properties'}</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.annual_free_properties}
                  onChange={(e) => setField('annual_free_properties', e.target.value)}
                  className="min-h-[40px]"
                />
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <ToggleRow
                  label={isAr ? 'تفعيل شراء عقارات إضافية' : 'Enable extra property purchase'}
                  checked={settings.annual_extra_enabled}
                  onChange={(v) => setField('annual_extra_enabled', v)}
                />
                {settings.annual_extra_enabled && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label>{isAr ? 'نوع السعر' : 'Pricing type'}</Label>
                      <Select
                        value={settings.annual_extra_type || 'percent'}
                        onValueChange={(v) => setField('annual_extra_type', v)}
                      >
                        <SelectTrigger className="min-h-[40px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">
                            {isAr ? 'نسبة % من السعر' : 'Percentage %'}
                          </SelectItem>
                          <SelectItem value="fixed">
                            {isAr ? 'مبلغ ثابت' : 'Fixed amount'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        {settings.annual_extra_type === 'fixed'
                          ? isAr
                            ? 'المبلغ'
                            : 'Amount'
                          : isAr
                            ? 'النسبة %'
                            : 'Percent %'}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={settings.annual_extra_value}
                        onChange={(e) => setField('annual_extra_value', e.target.value)}
                        className="min-h-[40px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </PackageCard>

          {/* Premium */}
          <PackageCard
            icon={PACKAGE_ICONS.premium}
            title={isAr ? 'الباقة المميزة (Premium)' : 'Premium Package'}
            enabled={settings.premium_enabled}
            onToggle={(v) => setField('premium_enabled', v)}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? 'السعر الأصلي' : 'Original price'}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.premium_price}
                    onChange={(e) => setField('premium_price', e.target.value)}
                    className="min-h-[40px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? 'مبلغ الخصم' : 'Discount amount'}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={Number(settings.premium_price) || undefined}
                    step="0.01"
                    value={settings.premium_discount_amount}
                    onChange={(e) => {
                      const price = Math.max(0, Number(settings.premium_price) || 0);
                      const raw = Number(e.target.value);
                      const v = Number.isFinite(raw) ? Math.min(price, Math.max(0, raw)) : 0;
                      setField('premium_discount_amount', e.target.value === '' ? '' : v);
                    }}
                    className="min-h-[40px]"
                  />
                </div>
              </div>
              {packageDiscountAmount('premium', settings) > 0 && (
                <p className="text-xs text-primary font-medium" dir="ltr">
                  <span className="line-through text-muted-foreground me-2">
                    {formatPrice(packageOriginalPrice('premium', settings), settings.currency, true)}
                  </span>
                  <span className="font-bold">
                    {formatPrice(packageFinalPrice('premium', settings), settings.currency, true)}
                  </span>
                </p>
              )}
              <CurrencyPriceOverrides
                value={currencyPrices.premium}
                onChange={(v) => setCurrencyPrices((p) => ({ ...p, premium: v }))}
                isAr={isAr}
              />
              <div className="space-y-1.5">
                <Label>{isAr ? 'عدد العقارات المتضمنة' : 'Included properties'}</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.premium_properties}
                  onChange={(e) => setField('premium_properties', e.target.value)}
                  className="min-h-[40px]"
                />
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'شامل الاشتراك السنوي' : 'Includes annual subscription'}
                </p>
              </div>
            </div>
          </PackageCard>

          {/* Unlimited */}
          <PackageCard
            icon={PACKAGE_ICONS.unlimited}
            title={isAr ? 'باقة بلا حدود (Unlimited)' : 'Unlimited Package'}
            enabled={settings.unlimited_enabled}
            onToggle={(v) => setField('unlimited_enabled', v)}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? 'السعر الأصلي' : 'Original price'}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.unlimited_price}
                    onChange={(e) => setField('unlimited_price', e.target.value)}
                    className="min-h-[40px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? 'مبلغ الخصم' : 'Discount amount'}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={Number(settings.unlimited_price) || undefined}
                    step="0.01"
                    value={settings.unlimited_discount_amount}
                    onChange={(e) => {
                      const price = Math.max(0, Number(settings.unlimited_price) || 0);
                      const raw = Number(e.target.value);
                      const v = Number.isFinite(raw) ? Math.min(price, Math.max(0, raw)) : 0;
                      setField('unlimited_discount_amount', e.target.value === '' ? '' : v);
                    }}
                    className="min-h-[40px]"
                  />
                </div>
              </div>
              {packageDiscountAmount('unlimited', settings) > 0 && (
                <p className="text-xs text-primary font-medium" dir="ltr">
                  <span className="line-through text-muted-foreground me-2">
                    {formatPrice(packageOriginalPrice('unlimited', settings), settings.currency, true)}
                  </span>
                  <span className="font-bold">
                    {formatPrice(packageFinalPrice('unlimited', settings), settings.currency, true)}
                  </span>
                </p>
              )}
              <CurrencyPriceOverrides
                value={currencyPrices.unlimited}
                onChange={(v) => setCurrencyPrices((p) => ({ ...p, unlimited: v }))}
                isAr={isAr}
              />
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? 'عقارات غير محدودة + شامل الاشتراك السنوي'
                  : 'Unlimited properties + includes annual subscription'}
              </p>
            </div>
          </PackageCard>
        </div>
      </div>

      {/* ---- Feature Entitlements (e.g. Portfolio Manager) ---- */}
      {features.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-bold">
              {isAr ? 'التحكم في الميزات (Feature Entitlements)' : 'Feature Entitlements'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? 'تحكم كامل في ظهور/إخفاء وقفل/فتح كل ميزة إضافية: من يراها، ما هو الحد الأدنى للعقارات، أي الباقات تتضمنها، وهل هي مجانية أم إضافة مدفوعة. كل تغيير هنا ينعكس فورًا على كل مستخدم دون الحاجة لأي نشر جديد.'
                : 'Full control over showing/hiding and locking/unlocking each add-on feature: who can see it, the minimum property count, which plans include it, and whether it is free or a paid add-on. Every change here applies live to every user with no redeploy needed.'}
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {features.map((f) => (
              <FeatureEntitlementCard
                key={f.id}
                feature={f}
                isAr={isAr}
                t={t}
                onSave={saveFeature}
                saving={savingFeatureId === f.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- Per-package stats (real subscribers + real revenue) ---- */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-primary" />
          <h2 className="text-xl font-bold">
            {isAr ? 'إحصائيات الباقات' : 'Package Statistics'}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? 'عدد المشتركين الفعليين في كل باقة وإجمالي الإيرادات المتحقق منها — محسوب تلقائيًا من اشتراكات المستخدمين وعمليات الدفع المؤكدة عبر Stripe.'
            : 'Real subscriber count and total revenue per package — calculated automatically from user subscriptions and Stripe-confirmed payments.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PACKAGE_KEYS.map((key) => {
            const Icon = PACKAGE_ICONS[key];
            const st = packageStats[key] || { subscribers: 0, revenue: 0 };
            return (
              <PackageStatsCard
                key={key}
                icon={Icon}
                title={packageLabel(key, t)}
                subscribers={st.subscribers}
                revenue={st.revenue}
                currency={settings.currency || 'USD'}
                isAr={isAr}
              />
            );
          })}
        </div>
      </div>

      {/* ---- Payment history (Stripe-confirmed only — monitoring, no manual action) ---- */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-primary" />
          <h2 className="text-xl font-bold">
            {isAr ? 'عمليات الدفع المؤكدة' : 'Confirmed Payments'}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? 'عمليات الدفع التي أكدها Stripe فعلًا فقط. تُفعَّل الباقات تلقائيًا عبر Stripe Webhook — لا يوجد أي تدخل يدوي ولا حالات معلقة أو فاشلة معروضة كحقيقة دفع.'
            : 'Only payments actually confirmed by Stripe. Packages activate automatically via the Stripe Webhook — no manual intervention, and no pending or failed orders shown as payment facts.'}
        </p>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {isAr ? 'لا توجد عمليات دفع مؤكدة بعد.' : 'No confirmed payments yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
              >
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-semibold">
                    {o.expand?.user?.name || o.expand?.user?.email || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {o.expand?.user?.email}
                  </p>
                </div>
                <span className="text-sm font-medium">
                  {o.package === 'extra_property'
                    ? isAr
                      ? 'عقار إضافي'
                      : 'Extra property'
                    : packageLabel(o.package, t)}
                </span>
                <span className="text-sm font-semibold tabular-nums" dir="ltr">
                  {formatPrice(o.amount, o.currency)}
                </span>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    'bg-emerald-100 text-emerald-800 border-emerald-200',
                  )}
                >
                  {isAr ? 'مدفوع' : 'Paid'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionManagementPanel;
