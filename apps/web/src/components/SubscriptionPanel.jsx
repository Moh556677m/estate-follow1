import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  CalendarClock,
  Check,
  CreditCard,
  Crown,
  Infinity as InfinityIcon,
  Loader2,
  Plus,
  Rocket,
  Sparkles,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
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
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import {
  listActiveGateways,
  createStripeCheckoutSession,
  verifyStripeOrder,
  submitCryptoPayment,
  submitManualPayment,
  gatewayTypeLabel,
} from '@/lib/paymentGateways';
import {
  listCountryCurrencySettings,
  resolveCurrencyForCountry,
  resolvePlanPriceForCurrency,
} from '@/lib/countryCurrency';
import {
  effectivePropertyLimit,
  formatPrice,
  formatSubDate,
  isPackageActive as isPkgActive,
  loadSubscriptionSettings,
  packageFinalPrice,
  packageHasDiscount,
  packageLabel,
  packageOriginalPrice,
  packagePropertyLimit,
  remainingProperties,
  countOwnedProperties,
  DEFAULT_SETTINGS,
  subscribeSettings,
  subscriptionWindow,
  trialDurationLabel,
} from '@/lib/subscriptionUtils';

const PACKAGE_ICONS = {
  trial: Sparkles,
  annual: Zap,
  premium: Crown,
  unlimited: InfinityIcon,
};

// Shown only when more than one active gateway is configured at once — with
// a single active gateway the flow stays exactly as before (no intermediate
// chooser), matching the pre-existing behavior for the common
// single-Stripe-gateway setup. Lists every active gateway individually (not
// just one button per type) so an admin can configure e.g. two different
// Vodafone Cash numbers, or InstaPay + Vodafone Cash + Stripe, and the
// customer picks exactly which one to use.
function PaymentMethodChooserDialog({ open, onOpenChange, isAr, gateways, onPick }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isAr ? 'اختر طريقة الدفع' : 'Choose a payment method'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {gateways.map((g) => (
            <Button
              key={g.id}
              variant="outline"
              className="w-full min-h-[52px] justify-start"
              onClick={() => onPick(g)}
            >
              {g.type === 'stripe' ? <CreditCard size={18} className="me-2" /> : <Wallet size={18} className="me-2" />}
              {g.type === 'stripe'
                ? (isAr ? 'بطاقة ائتمان (Stripe)' : 'Card (Stripe)')
                : `${gatewayTypeLabel(g.type, isAr ? 'ar' : 'en')}${g.label ? ` — ${g.label}` : ''}`}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Manual payment checkout (InstaPay, Vodafone Cash, Orange Cash, Etisalat
// Cash/e&, WE Pay, or any future manual gateway type): shows the
// admin-configured identifier/beneficiary name/instructions, the customer
// transfers the money themselves outside this app, then submits an optional
// reference number + proof file for a Super Admin to manually Approve or
// Reject. Never claims the package is active until an admin actually
// approves it — mirrors CryptoCheckoutDialog's honesty guarantee exactly.
function ManualCheckoutDialog({ open, onOpenChange, packageKey, gateway, isAr, currency }) {
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReference('');
    setNotes('');
    setProofFile(null);
    setSubmitting(false);
    setSubmitted(false);
  }, [open]);

  const minAmount = Number(gateway?.minAmount || 0) || 0;
  const maxAmount = Number(gateway?.maxAmount || 0) || 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitManualPayment({
        packageKey,
        gatewayId: gateway.id,
        method: gateway.type,
        reference: reference.trim(),
        notes,
        proofFile,
        currency: currency || '',
      });
      setSubmitted(true);
      notify.success(
        isAr ? 'تم إرسال الدفعة للمراجعة' : 'Payment submitted for review',
        isAr
          ? 'سيقوم فريقنا بمراجعة الدفعة يدويًا وتفعيل باقتك بعد الموافقة.'
          : 'Our team will manually review the payment and activate your package once approved.',
      );
    } catch (err) {
      notify.error(isAr ? 'تعذر الإرسال' : 'Submission failed', String(err?.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isAr ? `الدفع عبر ${gatewayTypeLabel(gateway?.type, 'ar')}` : `Pay with ${gatewayTypeLabel(gateway?.type, 'en')}`}
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-4 flex items-start gap-2">
              <Check className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                {isAr
                  ? 'تم استلام دفعتك وهي الآن قيد المراجعة اليدوية. سيتم تفعيل باقتك فور الموافقة من فريقنا — لن تُفعّل الباقة تلقائيًا قبل ذلك.'
                  : 'Your payment was received and is now under manual review. Your package will be activated once our team approves it — it is never activated automatically before that.'}
              </p>
            </div>
            <Button className="w-full min-h-[44px]" onClick={() => onOpenChange(false)}>
              {isAr ? 'تم' : 'Done'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 border px-3 py-2 space-y-1.5">
              {gateway?.identifier && (
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {isAr ? 'حوّل المبلغ إلى' : 'Send the amount to'}
                  </p>
                  <p className="text-sm font-mono break-all" dir="ltr">{gateway.identifier}</p>
                </div>
              )}
              {gateway?.beneficiaryName && (
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {isAr ? 'اسم المستفيد' : 'Beneficiary name'}
                  </p>
                  <p className="text-sm">{gateway.beneficiaryName}</p>
                </div>
              )}
              {gateway?.instructions && (
                <p className="text-xs text-muted-foreground pt-1">{gateway.instructions}</p>
              )}
              {(minAmount > 0 || maxAmount > 0) && (
                <p className="text-[11px] text-muted-foreground">
                  {isAr ? 'الحدود المسموحة: ' : 'Allowed limits: '}
                  {minAmount > 0 ? `${isAr ? 'من ' : 'min '}${minAmount}` : ''}
                  {minAmount > 0 && maxAmount > 0 ? ' – ' : ''}
                  {maxAmount > 0 ? `${isAr ? 'إلى ' : 'max '}${maxAmount}` : ''}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{isAr ? 'الرقم المرجعي / رقم العملية (إن وجد)' : 'Reference / transaction number (if any)'}</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="min-h-[44px] font-mono text-xs" dir="ltr" />
            </div>

            <div className="space-y-1.5">
              <Label>{isAr ? 'إثبات الدفع (صورة أو PDF)' : 'Payment proof (image or PDF)'}</Label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[44px]" />
            </div>

            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'هذه دفعة يدوية — لن تُفعّل باقتك تلقائيًا. سيراجع فريقنا الدفعة ثم يوافق عليها أو يرفضها.'
                : 'This is a manual payment — your package is not activated automatically. Our team reviews the payment, then approves or rejects it.'}
            </p>
          </div>
        )}

        {!submitted && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="min-h-[44px]">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : isAr ? 'إرسال للمراجعة' : 'Submit for review'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Manual/custodial crypto checkout: pick a configured asset+network, see the
// deposit address, send the funds yourself, then submit the tx hash for a
// Super Admin to manually confirm. Never claims the package is active until
// an admin actually confirms it.
function CryptoCheckoutDialog({ open, onOpenChange, packageKey, gateway, isAr, currency }) {
  const wallets = gateway?.wallets || [];
  const assets = useMemo(() => Array.from(new Set(wallets.map((w) => w.asset))), [wallets]);
  const [asset, setAsset] = useState('');
  const [network, setNetwork] = useState('');
  const [txHash, setTxHash] = useState('');
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAsset(assets[0] || '');
    setTxHash('');
    setNotes('');
    setProofFile(null);
    setSubmitting(false);
    setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const networksForAsset = useMemo(
    () => wallets.filter((w) => w.asset === asset).map((w) => w.network),
    [wallets, asset],
  );
  useEffect(() => {
    if (!networksForAsset.includes(network)) setNetwork(networksForAsset[0] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, networksForAsset]);

  const activeWallet = wallets.find((w) => w.asset === asset && w.network === network);

  const handleSubmit = async () => {
    if (!asset || !network || !String(txHash).trim()) {
      notify.error(
        isAr ? 'بيانات ناقصة' : 'Missing information',
        isAr ? 'اختر الأصل والشبكة وأدخل رقم العملية (Tx Hash)' : 'Pick the asset, network, and enter the transaction hash',
      );
      return;
    }
    setSubmitting(true);
    try {
      await submitCryptoPayment({
        packageKey,
        gatewayId: gateway.id,
        asset,
        network,
        txHash: txHash.trim(),
        notes,
        proofFile,
        currency: currency || '',
      });
      setSubmitted(true);
      notify.success(
        isAr ? 'تم إرسال الدفعة للمراجعة' : 'Payment submitted for review',
        isAr
          ? 'سيقوم فريقنا بمراجعة العملية يدويًا وتفعيل باقتك بعد التأكيد.'
          : 'Our team will manually review the transaction and activate your package once confirmed.',
      );
    } catch (err) {
      notify.error(isAr ? 'تعذر الإرسال' : 'Submission failed', String(err?.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isAr ? 'الدفع بعملة رقمية' : 'Pay with crypto'}</DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-4 flex items-start gap-2">
              <Check className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                {isAr
                  ? 'تم استلام دفعتك وهي الآن قيد المراجعة اليدوية. سيتم تفعيل باقتك فور تأكيد العملية من فريقنا — لن تُفعّل الباقة تلقائيًا قبل ذلك.'
                  : 'Your payment was received and is now under manual review. Your package will be activated once our team confirms the transaction — it is never activated automatically before that.'}
              </p>
            </div>
            <Button className="w-full min-h-[44px]" onClick={() => onOpenChange(false)}>
              {isAr ? 'تم' : 'Done'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{isAr ? 'الأصل' : 'Asset'}</Label>
                <select
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                  className="w-full min-h-[44px] rounded-md border bg-background px-3 text-sm"
                  dir="ltr"
                >
                  {assets.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'الشبكة' : 'Network'}</Label>
                <select
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                  className="w-full min-h-[44px] rounded-md border bg-background px-3 text-sm"
                  dir="ltr"
                >
                  {networksForAsset.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {activeWallet && (
              <div className="rounded-lg bg-muted/50 border px-3 py-2 space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  {isAr ? 'أرسل المبلغ إلى عنوان الاستلام التالي' : 'Send the amount to this deposit address'}
                </p>
                <p className="text-xs font-mono break-all" dir="ltr">{activeWallet.address}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{isAr ? 'رقم العملية (Tx Hash)' : 'Transaction hash'}</Label>
              <Input value={txHash} onChange={(e) => setTxHash(e.target.value)} className="min-h-[44px] font-mono text-xs" dir="ltr" />
            </div>

            <div className="space-y-1.5">
              <Label>{isAr ? 'إثبات الدفع (اختياري)' : 'Payment proof (optional)'}</Label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[44px]" />
            </div>

            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'هذه دفعة يدوية — لن تُفعّل باقتك تلقائيًا. سيراجع فريقنا العملية على السلسلة ثم يؤكدها.'
                : 'This is a manual payment — your package is not activated automatically. Our team reviews the transaction on-chain, then confirms it.'}
            </p>
          </div>
        )}

        {!submitted && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="min-h-[44px]">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : isAr ? 'إرسال للمراجعة' : 'Submit for review'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

const SubscriptionPanel = () => {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [propertyCount, setPropertyCount] = useState(0);
  const [activeGateways, setActiveGateways] = useState([]);
  const [loading, setLoading] = useState(true);
  // Package key currently redirecting to Stripe Checkout (no intermediate UI).
  const [checkoutBusy, setCheckoutBusy] = useState('');
  // Payment-method chooser — only shown when more than one gateway type is
  // active at once (e.g. Stripe + Crypto). Single-gateway installs keep the
  // original direct-checkout behavior with no extra step.
  const [methodChooserPackage, setMethodChooserPackage] = useState('');
  const [cryptoDialogPackage, setCryptoDialogPackage] = useState('');
  // Manual payment methods (InstaPay/Vodafone Cash/Orange Cash/Etisalat
  // Cash/WE Pay/any future manual gateway) — packageKey + which specific
  // gateway record the customer picked in the chooser (an admin may have
  // more than one manual gateway active at once, e.g. two different
  // Vodafone Cash numbers).
  const [manualDialogPackage, setManualDialogPackage] = useState('');
  const [manualDialogGateway, setManualDialogGateway] = useState(null);
  // Currency-per-country system: admin-configured country → currency map
  // (empty = every country falls back to the plan's base currency, exactly
  // as before this feature existed — see countryCurrency.js).
  const [countryCurrencySettings, setCountryCurrencySettings] = useState([]);
  // Stripe return-trip status: null | 'verifying' | 'activated' | 'failed' | 'cancelled'
  const [paymentResult, setPaymentResult] = useState(null);
  // Remember the orderId from the return URL so the manual "Verify now"
  // button can re-check after the query string is cleaned.
  const lastOrderIdRef = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Payment-methods audit finding: this previously called
      // listActiveGateways() with no arguments, so an admin's
      // allowed/blocked-country configuration on a gateway had NO effect —
      // every active gateway showed to every owner regardless of country.
      // `nationality` is the closest country signal the account already
      // stores (there is no separate "country of residence" field today);
      // it is passed through here so the country visibility rules an admin
      // sets in Payment Gateways actually take effect.
      const [s, gateways, countryCurrencyRows] = await Promise.all([
        loadSubscriptionSettings(),
        listActiveGateways({ country: user?.nationality || '' }).catch(() => []),
        listCountryCurrencySettings().catch(() => []),
      ]);
      setSettings(s);
      setActiveGateways(Array.isArray(gateways) ? gateways : []);
      setCountryCurrencySettings(Array.isArray(countryCurrencyRows) ? countryCurrencyRows : []);
      // Count only this owner's live properties (never other users / archived).
      try {
        const uid = pb.authStore.record?.id;
        const props = await pb.collection('properties').getFullList({
          filter: uid ? pb.filter('owner = {:uid}', { uid }) : undefined,
          requestKey: 'sub-prop-count',
        });
        setPropertyCount(countOwnedProperties(props, uid));
      } catch {
        setPropertyCount(0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [user?.nationality]);

  useEffect(() => {
    load();
    const unsub = subscribeSettings(load);
    // Realtime: refresh when the user record changes (package activation
    // by the Stripe webhook updates the user record, so the panel reflects
    // the new active package immediately). Order history is no longer shown
    // to owners, so subscription_orders is not subscribed here.
    const onUser = () => load();
    void pb.collection('users').subscribe('*', onUser).catch(() => {});
    return () => {
      unsub();
      void pb.collection('users').unsubscribe('*').catch(() => {});
    };
  }, [load]);

  // Detect return from Stripe hosted checkout. The package is activated
  // server-side — EITHER by the verified Stripe webhook OR, as a fallback,
  // by the /stripe/verify-order endpoint which retrieves the Checkout
  // Session directly from the Stripe API and activates when Stripe confirms
  // payment_status === 'paid'. The redirect alone is NEVER trusted as proof
  // of payment; Stripe's API (via webhook or verify-order) is the source of
  // truth. This fallback is what makes activation work even when the webhook
  // is not registered / misconfigured / signature-mismatched.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get('paid');
    const cancelled = params.get('cancelled');
    const orderId = params.get('order');

    if (paid === '1') {
      setPaymentResult('verifying');
      if (orderId) lastOrderIdRef.current = orderId;
      // Clean the query string.
      params.delete('paid');
      params.delete('order');
      const rest = params.toString();
      window.history.replaceState(
        {},
        '',
        rest ? `?${rest}` : window.location.pathname,
      );

      const finishActivated = async () => {
        setPaymentResult('activated');
        try {
          await pb.collection('users').authRefresh({
            requestKey: `post-pay-refresh-${Date.now()}`,
          });
        } catch {
          /* authStore.onChange (AuthContext) will still setUser */
        }
        load();
        notify.success(
          isAr
            ? 'تم الدفع بنجاح! تم تفعيل باقتك الآن. استمتع بالمزايا الجديدة.'
            : 'Payment successful! Your package is now active. Enjoy the new features.',
        );
      };

      const finishFailed = () => {
        setPaymentResult('failed');
        notify.error(
          isAr
            ? 'لم يكتمل الدفع ولم يتم تفعيل أي باقة.'
            : 'Payment did not complete — no package was activated.',
        );
      };

      if (orderId) {
        let attempts = 0;
        const MAX_ATTEMPTS = 40; // ~80s window for webhook delivery
        const pollOrderStatus = async () => {
          attempts += 1;
          try {
            const order = await pb
              .collection('subscription_orders')
              .getOne(orderId, { requestKey: `poll-order-${orderId}-${attempts}` });
            if (order && order.status === 'paid') {
              await finishActivated();
              return;
            }
            if (order && (order.status === 'failed' || order.status === 'cancelled')) {
              finishFailed();
              return;
            }
          } catch {
            /* ignore single poll failure */
          }
          if (attempts < MAX_ATTEMPTS) {
            setTimeout(pollOrderStatus, 2000);
          } else {
            // Still pending — keep the verifying state with a manual retry.
            setPaymentResult('verifying');
            notify.info(
              isAr
                ? 'لا يزال الدفع قيد المعالجة. اضغط «تحقق من الدفع الآن» بالأسفل.'
                : 'Payment is still processing. Click "Verify payment now" below.',
            );
          }
        };

        // Fallback activation: retrieve the session from Stripe and activate
        // if paid. Works even when the webhook is misconfigured / not
        // registered. Then poll the order status to catch webhook delivery.
        verifyStripeOrder(orderId)
          .then(async (resp) => {
            if (resp && (resp.activated || resp.reason === 'already_paid')) {
              await finishActivated();
            } else if (resp && resp.status === 'failed') {
              finishFailed();
            } else {
              // Not activated yet — poll for a webhook-delivered activation.
              setTimeout(pollOrderStatus, 2000);
            }
          })
          .catch(() => {
            // verify-order endpoint failed — fall back to polling.
            setTimeout(pollOrderStatus, 2000);
          });
      } else {
        load();
      }
    } else if (cancelled === '1') {
      setPaymentResult('cancelled');
      params.delete('cancelled');
      const rest = params.toString();
      window.history.replaceState(
        {},
        '',
        rest ? `?${rest}` : window.location.pathname,
      );
      notify.info(isAr ? 'تم إلغاء عملية الدفع.' : 'Payment was cancelled.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pkg = String(user?.subscription_package || 'none');
  const settingsSafe = settings || DEFAULT_SETTINGS;
  const active = isPkgActive(user, settingsSafe);
  const limit = effectivePropertyLimit(user, settingsSafe);
  const remaining = remainingProperties(user, settingsSafe, propertyCount);

  // All enabled packages for comparison (trial + paid tiers).
  const allPackages = useMemo(() => {
    if (!settings) return [];
    const tierOrder = { trial: 0, annual: 1, premium: 2, unlimited: 3 };
    const all = [
      { key: 'trial', enabled: settings.trial_enabled !== false },
      { key: 'annual', enabled: settings.annual_enabled },
      { key: 'premium', enabled: settings.premium_enabled },
      { key: 'unlimited', enabled: settings.unlimited_enabled },
    ];
    return all
      .filter((p) => p.enabled)
      .sort((a, b) => (tierOrder[a.key] || 0) - (tierOrder[b.key] || 0));
  }, [settings]);

  // Paid tiers the user can still upgrade into (higher than current).
  const upgradePackages = useMemo(() => {
    const tierOrder = { trial: 0, annual: 1, premium: 2, unlimited: 3 };
    const currentTier = tierOrder[pkg] || 0;
    return allPackages.filter(
      (p) => p.key !== 'trial' && (tierOrder[p.key] || 0) > currentTier,
    );
  }, [allPackages, pkg]);

  const windowDates = useMemo(() => subscriptionWindow(user), [user]);

  // Start Stripe Checkout immediately — no payment-method chooser.
  // Order stays pending until the signed Stripe webhook activates the package.
  const startStripeCheckout = async (packageKey) => {
    if (!settings || checkoutBusy) return;
    if (activeGateways.length === 0) {
      notify.error(
        isAr
          ? 'لا توجد بوابة دفع مفعّلة حاليًا. يرجى المحاولة لاحقًا أو التواصل مع الدعم.'
          : 'No active payment gateway is configured right now. Please try again later or contact support.',
      );
      return;
    }
    setCheckoutBusy(packageKey);
    try {
      // Prefer an active Stripe gateway when several exist; otherwise let the
      // server pick the first active Stripe config.
      const stripeGw =
        activeGateways.find((g) => g.type === 'stripe') || activeGateways[0];
      const { url } = await createStripeCheckoutSession(
        packageKey,
        stripeGw?.id || '',
        resolvedCurrency || '',
      );
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      notify.error(
        isAr ? 'تعذر بدء عملية الدفع' : 'Could not start payment',
        String(err?.message || err),
      );
      setCheckoutBusy('');
    }
  };

  const hasStripeGateway = activeGateways.some((g) => g.type === 'stripe');
  const cryptoGateway = activeGateways.find((g) => g.type === 'crypto');

  // Currency-per-country system: resolve which currency this owner's
  // country (their `nationality`, the same signal already used for gateway
  // country-visibility above) should see/pay in. Falls back to the plan's
  // own base currency when the admin hasn't configured that country —
  // identical behavior to before this feature existed.
  const resolvedCurrency = useMemo(
    () => resolveCurrencyForCountry(countryCurrencySettings, user?.nationality, settings?.currency || 'USD'),
    [countryCurrencySettings, user?.nationality, settings?.currency],
  );

  // Route a chosen gateway to the right checkout flow — used both for the
  // single-active-gateway shortcut and for a chooser selection.
  const openGatewayCheckout = (packageKey, gateway) => {
    if (!gateway) return;
    if (gateway.type === 'stripe') {
      void startStripeCheckout(packageKey);
    } else if (gateway.type === 'crypto') {
      setCryptoDialogPackage(packageKey);
    } else {
      // Every other active type is a manual gateway (InstaPay/Vodafone
      // Cash/Orange Cash/Etisalat Cash/WE Pay/future types) — see
      // registry.js's INTEGRATION_TYPE.
      setManualDialogGateway(gateway);
      setManualDialogPackage(packageKey);
    }
  };

  const startCheckout = (packageKey) => {
    if (activeGateways.length === 0) {
      notify.error(
        isAr
          ? 'لا توجد بوابة دفع مفعّلة حاليًا. يرجى المحاولة لاحقًا أو التواصل مع الدعم.'
          : 'No active payment gateway is configured right now. Please try again later or contact support.',
      );
      return;
    }
    // Only ask which method to use when more than one gateway RECORD is
    // actually available — otherwise go straight to the single active
    // gateway, unchanged (matches the pre-existing single-Stripe-gateway
    // behavior with no extra step).
    if (activeGateways.length > 1) {
      setMethodChooserPackage(packageKey);
    } else {
      openGatewayCheckout(packageKey, activeGateways[0]);
    }
  };

  const handleUpgrade = (packageKey) => {
    startCheckout(packageKey);
  };

  const handleBuyExtra = () => {
    startCheckout('extra_property');
  };

  // Manual re-check: the user presses "Verify payment now" after the
  // automatic polling timed out. Re-queries Stripe via the server and
  // activates if Stripe now confirms paid.
  const handleManualVerify = async () => {
    const id = lastOrderIdRef.current;
    if (!id) return;
    setPaymentResult('verifying');
    try {
      const resp = await verifyStripeOrder(id);
      if (resp && (resp.activated || resp.reason === 'already_paid')) {
        setPaymentResult('activated');
        try {
          await pb.collection('users').authRefresh({
            requestKey: `manual-verify-refresh-${Date.now()}`,
          });
        } catch {
          /* ignore */
        }
        load();
        notify.success(
          isAr
            ? 'تم الدفع بنجاح! تم تفعيل باقتك الآن.'
            : 'Payment successful! Your package is now active.',
        );
      } else if (resp && resp.status === 'failed') {
        setPaymentResult('failed');
        notify.error(isAr ? 'لم يكتمل الدفع.' : 'Payment did not complete.');
      } else {
        setPaymentResult('verifying');
        notify.info(
          isAr
            ? 'لا يزال الدفع قيد المعالجة. حاول مرة أخرى بعد قليل.'
            : 'Payment is still processing. Try again shortly.',
        );
      }
    } catch (err) {
      setPaymentResult('verifying');
      notify.error(
        isAr ? 'تعذر التحقق من الدفع' : 'Could not verify payment',
        String(err?.message || err),
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Stripe return-trip status banner — prominent, persistent confirmation */}
      {paymentResult === 'activated' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-5 flex items-start gap-3">
          <BadgeCheck className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={24} />
          <div className="flex-1">
            <p className="font-bold text-emerald-800 dark:text-emerald-200">
              {isAr ? 'تم الدفع بنجاح — باقتك مفعّلة الآن' : 'Payment successful — your package is now active'}
            </p>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">
              {isAr
                ? 'تم تفعيل باقتك فورًا بعد تأكيد الدفع من Stripe. يمكنك الآن إضافة العقارات المتاحة في باقتك.'
                : 'Your package was activated immediately after Stripe confirmed payment. You can now add the properties included in your plan.'}
            </p>
          </div>
          <button type="button" onClick={() => setPaymentResult(null)} className="text-emerald-700 dark:text-emerald-300 hover:opacity-70 shrink-0" aria-label="dismiss">
            <X size={18} />
          </button>
        </div>
      )}
      {paymentResult === 'verifying' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-5 flex items-start gap-3">
          <Loader2 className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-spin" size={22} />
          <div className="flex-1">
            <p className="font-bold text-amber-800 dark:text-amber-200">
              {isAr ? 'جارٍ تأكيد الدفع...' : 'Confirming your payment...'}
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              {isAr
                ? 'نتحقق من Stripe لتأكيد الدفع وتفعيل باقتك تلقائيًا. قد يستغرق ذلك لحظات.'
                : 'We are verifying with Stripe to confirm payment and activate your package automatically. This may take a moment.'}
            </p>
            <Button variant="outline" size="sm" onClick={handleManualVerify} className="mt-3 min-h-[36px]">
              {isAr ? 'تحقق من الدفع الآن' : 'Verify payment now'}
            </Button>
          </div>
        </div>
      )}
      {paymentResult === 'failed' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-5 flex items-start gap-3">
          <X className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={22} />
          <div className="flex-1">
            <p className="font-bold text-red-800 dark:text-red-200">
              {isAr ? 'لم يكتمل الدفع' : 'Payment did not complete'}
            </p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
              {isAr
                ? 'لم يتم تفعيل أي باقة. يمكنك المحاولة مرة أخرى من الباقات بالأسفل. إذا دفعت بالفعل، تواصل مع الدعم.'
                : 'No package was activated. You can try again from the plans below. If you already paid, contact support.'}
            </p>
          </div>
          <button type="button" onClick={() => setPaymentResult(null)} className="text-red-700 dark:text-red-300 hover:opacity-70 shrink-0" aria-label="dismiss">
            <X size={18} />
          </button>
        </div>
      )}
      {paymentResult === 'cancelled' && (
        <div className="rounded-2xl border bg-card p-5 flex items-start gap-3">
          <X className="text-muted-foreground shrink-0 mt-0.5" size={22} />
          <div className="flex-1">
            <p className="font-bold">
              {isAr ? 'تم إلغاء عملية الدفع' : 'Payment was cancelled'}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isAr ? 'لم يتم خصم أي مبلغ ولم يتم تفعيل أي باقة.' : 'No amount was charged and no package was activated.'}
            </p>
          </div>
          <button type="button" onClick={() => setPaymentResult(null)} className="text-muted-foreground hover:opacity-70 shrink-0" aria-label="dismiss">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Unified packages grid — the user's current package lives here too,
          rendered with the same card design as every other plan. Its
          subscription details (status, start/end dates, remaining & extra
          properties) are shown compactly inside the card. */}
      {allPackages.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold">
            {isAr ? 'الباقات المتاحة' : 'Available packages'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'قارن كل الباقات وأسعارها الحالية. باقتك الحالية تظهر بحدود خضراء مع تفاصيل اشتراكك داخل البطاقة.'
              : 'Compare every plan and current price. Your active plan is highlighted with a green border and shows your subscription details inside the card.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {allPackages.map((p) => {
              const Icon = PACKAGE_ICONS[p.key] || Rocket;
              const isCurrent = pkg === p.key;
              const canUpgrade = upgradePackages.some((u) => u.key === p.key);
              const isTrial = p.key === 'trial';
              const final = isTrial ? 0 : packageFinalPrice(p.key, settings);
              const original = isTrial ? 0 : packageOriginalPrice(p.key, settings);
              // Use admin discount % (not only original>final) so 0% never
              // shows a fake strike and any active % always shows promo UI.
              const hasDiscount =
                !isTrial && packageHasDiscount(p.key, settings) && original > final;
              const propLimit = packagePropertyLimit(p.key, settings);
              const baseCurrency = settings?.currency || 'USD';
              const preferredCurrency = resolvedCurrency || baseCurrency;
              // Currency-per-country override: only takes effect when the
              // resolved currency differs from the plan's base currency AND
              // the admin actually configured a currency_prices entry for
              // it. Critically, `currency` (the LABEL shown) always comes
              // from resolvePlanPriceForCurrency's own result, never from
              // `preferredCurrency` directly — if the admin set a country's
              // default currency but never configured a price override for
              // it, this falls back to the base price/currency together,
              // so a number is NEVER shown under the wrong currency label.
              let displayFinal = final;
              let displayOriginal = original;
              let currency = baseCurrency;
              if (!isTrial && preferredCurrency !== baseCurrency) {
                const planLike = {
                  price: original,
                  discount_price: Math.max(0, original - final),
                  currency: baseCurrency,
                  currency_prices: (settings._currencyPrices && settings._currencyPrices[p.key]) || {},
                };
                const resolved = resolvePlanPriceForCurrency(planLike, preferredCurrency);
                displayOriginal = resolved.price;
                displayFinal = Math.max(0, resolved.price - resolved.discountPrice);
                currency = resolved.currency;
              }
              return (
                <div
                  key={p.key}
                  className={cn(
                    'rounded-2xl border bg-card p-5 shadow-sm space-y-3 flex flex-col',
                    isCurrent && 'border-primary ring-2 ring-primary/20',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon size={22} className="text-primary shrink-0" />
                      <p className="font-bold text-lg truncate">{packageLabel(p.key, t)}</p>
                    </div>
                    {isCurrent && (
                      <span className="shrink-0 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                        {isAr ? 'الحالية' : 'Current'}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1" dir="ltr">
                    {isTrial ? (
                      <span className="text-2xl font-bold text-primary">
                        {isAr ? 'مجاني' : 'Free'}
                      </span>
                    ) : hasDiscount ? (
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span
                          className="text-xl text-muted-foreground tabular-nums"
                          style={{ textDecoration: 'line-through' }}
                          aria-label={isAr ? 'السعر الأصلي' : 'Original price'}
                        >
                          {formatPrice(displayOriginal, currency, true)}
                        </span>
                        <span className="text-2xl font-bold text-primary tabular-nums">
                          {formatPrice(displayFinal, currency, true)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-2xl font-bold text-primary tabular-nums">
                        {formatPrice(displayFinal, currency)}
                      </span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {isTrial
                        ? trialDurationLabel(settings, isAr)
                        : isAr
                          ? 'سنويًا'
                          : 'per year'}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {propLimit === -1
                      ? isAr
                        ? 'عقارات غير محدودة'
                        : 'Unlimited properties'
                      : isAr
                        ? `${propLimit} عقار متضمن`
                        : `${propLimit} properties included`}
                    {!isTrial && p.key !== 'annual' && (
                      <span className="block mt-1">
                        {isAr
                          ? 'شامل الاشتراك السنوي'
                          : 'Includes annual subscription'}
                      </span>
                    )}
                  </div>

                  {/* Current package: compact subscription details inside the card */}
                  {isCurrent && (
                    <div className="rounded-xl bg-muted/50 p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {isAr ? 'الحالة' : 'Status'}
                        </span>
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                            active
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-red-100 text-red-800 border-red-200',
                          )}
                        >
                          {active
                            ? isAr
                              ? 'نشط'
                              : 'Active'
                            : isAr
                              ? 'منتهي'
                              : 'Expired'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {isAr ? 'تاريخ البداية' : 'Start date'}
                        </span>
                        <span className="font-semibold inline-flex items-center gap-1">
                          <CalendarClock size={13} className="text-muted-foreground shrink-0" />
                          {formatSubDate(windowDates.start, isAr)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {isTrial
                            ? isAr
                              ? 'نهاية التجربة'
                              : 'Trial ends'
                            : isAr
                              ? 'تاريخ الانتهاء'
                              : 'End date'}
                        </span>
                        <span className="font-semibold inline-flex items-center gap-1">
                          <CalendarClock size={13} className="text-muted-foreground shrink-0" />
                          {formatSubDate(windowDates.end, isAr)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {isAr ? 'العقارات المتبقية' : 'Remaining'}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {remaining === Infinity ? (
                            <span className="inline-flex items-center gap-1">
                              <InfinityIcon size={14} />
                              {isAr ? 'غير محدود' : 'Unlimited'}
                            </span>
                          ) : (
                            remaining
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {isAr ? 'إضافية مشتراة' : 'Extra bought'}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {Number(user?.extra_properties_purchased || 0)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {isAr
                          ? `${propertyCount} مستخدم / ${limit === Infinity ? '∞' : limit} متاح`
                          : `${propertyCount} used / ${limit === Infinity ? '∞' : limit} allowed`}
                      </p>
                      {!active && (
                        <p className="text-[11px] text-red-700 leading-relaxed">
                          {isAr
                            ? 'انتهت فترتك أو اشتراكك. يجب الترقية أو التجديد لإضافة عقارات جديدة.'
                            : 'Your trial or subscription has ended. Upgrade or renew to add new properties.'}
                        </p>
                      )}
                      {active && remaining !== Infinity && remaining <= 1 && (
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                          {isAr
                            ? `قاربت على استنفاد رصيد العقارات (${remaining} متاح). ترقّى لباقة أعلى أو اشترِ عقارًا إضافيًا.`
                            : `You are almost out of property slots (${remaining} left). Upgrade or buy an extra property.`}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex-1" />

                  {canUpgrade ? (
                    <Button
                      onClick={() => handleUpgrade(p.key)}
                      disabled={!!checkoutBusy}
                      className="w-full min-h-[44px]"
                    >
                      {checkoutBusy === p.key ? (
                        <Loader2 size={15} className="me-1.5 animate-spin" />
                      ) : (
                        <Crown size={15} className="me-1.5" />
                      )}
                      {isAr ? 'ترقية الآن' : 'Upgrade now'}
                    </Button>
                  ) : isCurrent ? (
                    <Button variant="outline" disabled className="w-full min-h-[44px]">
                      <BadgeCheck size={15} className="me-1.5" />
                      {isAr ? 'باقتك الحالية' : 'Your current plan'}
                    </Button>
                  ) : (
                    <Button variant="outline" disabled className="w-full min-h-[44px]">
                      {isTrial
                        ? isAr
                          ? 'تبدأ تلقائيًا عند التسجيل'
                          : 'Starts automatically on signup'
                        : isAr
                          ? 'مشمولة في باقتك'
                          : 'Included in your plan'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Buy extra property (annual plan only, if enabled) */}
      {pkg === 'annual' && settings?.annual_extra_enabled && (() => {
        const baseCurrency = settings?.currency || 'USD';
        const preferredCurrency = resolvedCurrency || baseCurrency;
        // Percent-based extra fees are transitively correct in the
        // resolved currency once computed off the (possibly overridden)
        // annual price. A 'fixed' amount has no per-currency override
        // field of its own, so it is only ever relabeled when the admin
        // actually configured one for the annual plan — never mislabeled.
        let annualPrice = settings.annual_price;
        let extraCurrency = baseCurrency;
        if (preferredCurrency !== baseCurrency) {
          const planLike = {
            price: settings.annual_price,
            discount_price: 0,
            currency: baseCurrency,
            currency_prices: (settings._currencyPrices && settings._currencyPrices.annual) || {},
          };
          const resolved = resolvePlanPriceForCurrency(planLike, preferredCurrency);
          if (settings.annual_extra_type === 'fixed') {
            if (resolved.currency === preferredCurrency) {
              annualPrice = resolved.price;
              extraCurrency = resolved.currency;
            }
          } else {
            annualPrice = resolved.price;
            extraCurrency = resolved.currency;
          }
        }
        const extraAmount =
          settings.annual_extra_type === 'fixed'
            ? settings.annual_extra_value
            : (annualPrice * settings.annual_extra_value) / 100;
        return (
        <div className="rounded-2xl border bg-card p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-bold">
              {isAr ? 'شراء عقار إضافي' : 'Buy an extra property'}
            </p>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? `أضف عقارًا واحدًا إضافيًا لرصيدك بسعر ${formatPrice(extraAmount, extraCurrency)}`
                : `Add one extra property to your balance for ${formatPrice(extraAmount, extraCurrency)}`}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleBuyExtra}
            disabled={!!checkoutBusy}
            className="min-h-[44px]"
          >
            {checkoutBusy === 'extra_property' ? (
              <Loader2 size={15} className="me-1.5 animate-spin" />
            ) : (
              <Plus size={15} className="me-1.5" />
            )}
            {isAr ? 'شراء عقار إضافي' : 'Buy extra property'}
          </Button>
        </div>
        );
      })()}

      <PaymentMethodChooserDialog
        open={!!methodChooserPackage}
        onOpenChange={(o) => { if (!o) setMethodChooserPackage(''); }}
        isAr={isAr}
        gateways={activeGateways}
        onPick={(gateway) => {
          const pkg = methodChooserPackage;
          setMethodChooserPackage('');
          openGatewayCheckout(pkg, gateway);
        }}
      />

      <CryptoCheckoutDialog
        open={!!cryptoDialogPackage}
        onOpenChange={(o) => { if (!o) setCryptoDialogPackage(''); }}
        packageKey={cryptoDialogPackage}
        gateway={cryptoGateway}
        isAr={isAr}
        currency={resolvedCurrency}
      />

      <ManualCheckoutDialog
        open={!!manualDialogPackage}
        onOpenChange={(o) => { if (!o) { setManualDialogPackage(''); setManualDialogGateway(null); } }}
        packageKey={manualDialogPackage}
        gateway={manualDialogGateway}
        isAr={isAr}
        currency={resolvedCurrency}
      />
    </div>
  );
};

export default SubscriptionPanel;
