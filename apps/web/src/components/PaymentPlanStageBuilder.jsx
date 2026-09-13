import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Layers,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/MoneyInput';
import { PercentInput } from '@/components/PercentInput';
import DateField from '@/components/DateField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMoney } from '@/lib/api';
import { moneyNumber } from '@/lib/money';
import {
  formatPlanDateDisplay,
  phaseBreakdown,
  stagePhase,
  stagesToInstallments,
  sumStagesPreview,
} from '@/lib/paymentPlanSmart';
import { cn } from '@/lib/utils';

const newId = () => `stage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/* ---- default section factories ---- */
const defaultDown = (dueDate = '') => ({
  id: newId(),
  type: 'down',
  kind: 'down',
  amountMode: 'fixed',
  amount: '',
  percent: '',
  dueMode: 'specific_date',
  dueDate,
  afterMonths: '0',
  name: '',
});

const defaultBullet = (phase = 'pre_handover') => ({
  id: newId(),
  type: 'bullet',
  amountMode: 'fixed',
  amount: '',
  percent: '',
  phase,
  dueMode: 'specific_date',
  dueDate: '',
  name: '',
  note: '',
  overrideRegular: true,
  addAlongside: false,
});

const defaultConstruction = () => ({
  id: newId(),
  type: 'recurring',
  recurringMode: 'per_installment',
  perAmount: '',
  percent: '',
  count: '30',
  firstDate: '',
  frequency: 'monthly',
  customMonths: '1',
  sameDayEachMonth: true,
  phase: 'pre_handover',
  name: '',
});

const defaultPost = () => ({
  id: newId(),
  type: 'post_equal',
  recurringMode: 'per_installment',
  perAmount: '',
  percent: '',
  count: '24',
  firstDate: '',
  startAfterMonths: '1',
  frequency: 'monthly',
  customMonths: '1',
  sameDayEachMonth: true,
  phase: 'post_handover',
  name: '',
});

/* ---- which builder sections each plan type shows ----
   Plan type is the single source of truth for section visibility.
   type3 (construction-only) was removed — legacy type3 maps to type1. */
function sectionsForType(planType) {
  const t = planType === 'type3' ? 'type1' : planType;
  switch (t) {
    case 'type1': // construction + remaining at handover
      return {
        down: true,
        bullets: true,
        handover: true,
        construction: true,
        post: false,
        // Fixed shape: down + construction + handover always on; bullets optional
        downToggle: false,
        bulletsToggle: true,
        handoverToggle: false,
        constructionToggle: false,
        postToggle: false,
        downForced: true,
        handoverForced: true,
        constructionForced: true,
        postForced: false,
      };
    case 'type2': // construction + post-handover
      return {
        down: true,
        bullets: true,
        handover: true,
        construction: true,
        post: true,
        downToggle: false,
        bulletsToggle: true,
        handoverToggle: true,
        constructionToggle: false,
        postToggle: false,
        downForced: true,
        handoverForced: false,
        constructionForced: true,
        postForced: true,
      };
    case 'type4': // down + handover only
      return {
        down: true,
        bullets: false,
        handover: true,
        construction: false,
        post: false,
        downToggle: false,
        bulletsToggle: false,
        handoverToggle: false,
        constructionToggle: false,
        postToggle: false,
        downForced: true,
        handoverForced: true,
        constructionForced: false,
        postForced: false,
      };
    case 'type5': // custom — every section optional
      return {
        down: true,
        bullets: true,
        handover: true,
        construction: true,
        post: true,
        downToggle: true,
        bulletsToggle: true,
        handoverToggle: true,
        constructionToggle: true,
        postToggle: true,
        downForced: false,
        handoverForced: false,
        constructionForced: false,
        postForced: false,
      };
    default:
      // No type selected yet — show nothing until the user picks one
      return {
        down: false,
        bullets: false,
        handover: false,
        construction: false,
        post: false,
        downToggle: false,
        bulletsToggle: false,
        handoverToggle: false,
        constructionToggle: false,
        postToggle: false,
        downForced: false,
        handoverForced: false,
        constructionForced: false,
        postForced: false,
      };
  }
}

/* ---- normalize legacy stage shapes into the new builder state ---- */
function normalizeStage(s) {
  if (!s) return s;
  if (s.type === 'major_payment' && (s.kind === 'down' || s.kind === 'topup')) {
    return { ...s, type: 'down' };
  }
  if (s.type === 'major_payment' && s.dueMode === 'on_handover') {
    return { ...s, type: 'handover' };
  }
  if (s.type === 'major_payment') {
    const isPost = s.kind === 'after_handover' || s.dueMode === 'after_handover_months';
    return {
      ...s,
      type: 'bullet',
      phase: isPost ? 'post_handover' : 'pre_handover',
      dueMode: isPost
        ? s.dueMode === 'specific_date' ? 'after_handover_months' : (s.dueMode || 'after_handover_months')
        : (s.dueMode === 'on_handover' ? 'after_months' : (s.dueMode || 'after_months')),
      overrideRegular: s.overrideRegular !== false,
      addAlongside: !!s.addAlongside,
    };
  }
  if (s.type === 'post_handover') return { ...s, type: 'post_equal' };
  return s;
}

/* ---- derive builder state from saved stages (edit mode) ---- */
function initFromStages(stages, handoverDate) {
  const arr = Array.isArray(stages) ? stages.map(normalizeStage).filter(Boolean) : [];
  const downS = arr.find((s) => s.type === 'down');
  const bulletArr = arr.filter((s) => s.type === 'bullet');
  const handS = arr.find((s) => s.type === 'handover');
  const consS = arr.find((s) => s.type === 'recurring' || s.type === 'construction');
  const postS = arr.find((s) => s.type === 'post_equal' || s.type === 'post_custom');

  const toAmountPercent = (s) => {
    if (s.amountMode === 'percent') {
      return { amount: '', percent: String(s.percent || '') };
    }
    return { amount: String(s.amount || ''), percent: '' };
  };

  const down = downS
    ? { ...defaultDown(), ...downS, ...toAmountPercent(downS), amountMode: 'fixed' }
    : defaultDown();

  const bullets = bulletArr.map((b) => ({
    ...defaultBullet(b.phase || 'pre_handover'),
    ...b,
    ...toAmountPercent(b),
    amountMode: 'fixed',
  }));

  const handover = handS
    ? {
        id: handS.id || newId(),
        type: 'handover',
        amountMode: 'fixed',
        amount: handS.amountMode === 'percent' ? '' : String(handS.amount || ''),
        percent: handS.amountMode === 'percent' ? String(handS.percent || '') : '',
        dueDate: handS.dueDate || handoverDate || '',
        name: handS.name || '',
      }
    : { id: newId(), type: 'handover', amountMode: 'fixed', amount: '', percent: '', dueDate: handoverDate || '', name: '' };

  const construction = consS
    ? {
        ...defaultConstruction(),
        ...consS,
        recurringMode: 'per_installment',
        perAmount: consS.recurringMode === 'per_installment' ? String(consS.perAmount || '') : String(consS.perAmount || ''),
        percent: String(consS.percent || ''),
        count: String(consS.count || '30'),
        firstDate: consS.firstDate || '',
      }
    : defaultConstruction();

  const post = postS
    ? {
        ...defaultPost(),
        ...postS,
        recurringMode: 'per_installment',
        perAmount: String(postS.perAmount || ''),
        percent: String(postS.percent || ''),
        count: String(postS.count || '24'),
        startAfterMonths: String(postS.startAfterMonths || '1'),
      }
    : defaultPost();

  return {
    down,
    downOn: !!downS || moneyNumber(down.amount) > 0 || Number(down.percent) > 0,
    bulletsOn: bullets.length > 0,
    bullets,
    handoverOn: !!handS,
    handover,
    constructionOn:
      !!consS ||
      (Number(construction.count) > 0 &&
        (moneyNumber(construction.perAmount) > 0 || Number(construction.percent) > 0)),
    construction,
    postOn: !!postS,
    post,
  };
}

const PaymentPlanStageBuilder = ({
  totalPrice = '',
  purchaseDate = '',
  handoverDate = '',
  onCancel,
  onGenerate,
  embedded = false,
  initialStages = null,
  resetKey = null,
  planType = null,
}) => {
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  const price = moneyNumber(totalPrice);

  const emptyState = (hd = handoverDate) => ({
    down: defaultDown(),
    downOn: true,
    bulletsOn: false,
    bullets: [],
    handoverOn: true,
    handover: {
      id: newId(),
      type: 'handover',
      amountMode: 'fixed',
      amount: '',
      percent: '',
      dueDate: hd || '',
      name: '',
    },
    constructionOn: true,
    construction: defaultConstruction(),
    postOn: true,
    post: defaultPost(),
  });

  const [state, setState] = useState(() =>
    Array.isArray(initialStages) && initialStages.length
      ? initFromStages(initialStages, handoverDate)
      : emptyState(),
  );

  // Reset builder when resetKey changes (e.g. opening a different property).
  useEffect(() => {
    if (Array.isArray(initialStages) && initialStages.length) {
      setState(initFromStages(initialStages, handoverDate));
    } else {
      setState(emptyState());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Apply forced on/off flags when plan type changes so fixed-shape types
  // always include their required sections in generation.
  useEffect(() => {
    const v = sectionsForType(planType);
    setState((s) => ({
      ...s,
      downOn: v.downForced ? true : v.downToggle ? s.downOn : s.downOn,
      handoverOn: v.handoverForced ? true : s.handoverOn,
      constructionOn: v.constructionForced ? true : s.constructionOn,
      postOn: v.postForced ? true : v.post ? s.postOn : false,
      bulletsOn: v.bullets ? s.bulletsOn : false,
      bullets: v.bullets ? s.bullets : [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planType]);

  // Keep handover default date in sync with the property handover date when
  // the user hasn't typed a custom one yet.
  useEffect(() => {
    setState((s) => ({
      ...s,
      handover: { ...s.handover, dueDate: s.handover.dueDate || handoverDate || '' },
    }));
  }, [handoverDate]);

  const [showTimeline, setShowTimeline] = useState(false);

  // Which builder sections are visible for the selected plan type. When a
  // section is hidden it simply isn't rendered — its state stays empty so it
  // never contributes to the generated plan.
  const vis = sectionsForType(planType);

  /* ---- auto-calc helpers (value ↔ percent) ---- */
  const pctFromAmt = (amt) => (price > 0 ? Math.round((moneyNumber(amt) / price) * 100 * 100) / 100 : '');
  const amtFromPct = (pct) => (price > 0 ? Math.round((price * moneyNumber(pct)) / 100 * 100) / 100 : '');

  const L = useMemo(
    () => ({
      title: isAr ? 'بناء خطة الدفع' : 'Build payment plan',
      summary: isAr ? 'ملخص الخطة' : 'Plan summary',
      generate: isAr ? 'إنشاء الخطة' : 'Generate plan',
      cancel: t('cancel'),
      timeline: isAr ? 'معاينة الجدول الزمني' : 'Timeline preview',
      timelineHint: isAr
        ? 'كل الدفعات مرتبة زمنيًا — قبل إنشاء الخطة. التواريخ المحجوزة (دفعة كبيرة/استلام) تمنع تكرار القسط في نفس اليوم.'
        : 'All payments in chronological order — before generating. Reserved dates (bullet/handover) prevent a recurring installment on the same day.',
      showTimeline: isAr ? 'عرض الجدول الزمني' : 'Show timeline',
      hideTimeline: isAr ? 'إخفاء الجدول' : 'Hide timeline',
      // section titles
      secDown: isAr ? 'الدفعة الأولى' : 'Down payment',
      secDownHint: isAr ? 'الدفعة الأولى عند الحجز. أدخل القيمة أو النسبة ويُحسب الآخر تلقائيًا.' : 'Initial payment at booking. Enter amount or percent — the other is auto-calculated.',
      secBullets: isAr ? 'الدفعات الكبيرة (Bullet Payments)' : 'Bullet payments',
      secBulletsHint: isAr
        ? 'دفعات غير متكررة بين الأقساط، مثل 3% أو 10% بعد عدة أشهر. كل دفعة تحجز تاريخها فلا يُنشأ قسط متكرر في نفس اليوم.'
        : 'Non-recurring payments between installments, e.g. 3% or 10% after some months. Each reserves its date so no recurring installment lands on it.',
      secHandover: isAr ? 'دفعة الاستلام' : 'Handover payment',
      secHandoverHint: isAr ? 'دفعة واحدة تُستحق عند تاريخ الاستلام. يُستخدم تاريخ استلام العقار تلقائيًا.' : 'A single payment due on the handover date. Uses the property handover date by default.',
      secConstruction: isAr ? 'الأقساط أثناء الإنشاء' : 'Installments during construction',
      secConstructionHint: isAr
        ? 'أقساط متكررة تُدفع قبل الاستلام. تُتخطى تلقائيًا التواريخ المحجوزة للدفعات الكبيرة أو الاستلام، ويُولّد العدد الفعلي المطلوب.'
        : 'Recurring installments paid before handover. Reserved dates are skipped automatically and the actual requested count is generated.',
      secPost: isAr ? 'الأقساط بعد الاستلام' : 'Installments after handover',
      secPostHint: isAr ? 'تبدأ بعد الاستلام وترتبط بتاريخه. نفس منطق التواريخ المحجوزة.' : 'Start after handover, linked to its date. Same reserved-dates logic.',
      // toggles
      hasDown: isAr ? 'هل توجد دفعة أولى؟' : 'Is there a down payment?',
      hasBullets: isAr ? 'هل توجد دفعات كبيرة ضمن الخطة؟' : 'Are there bullet payments in the plan?',
      hasHandover: isAr ? 'هل توجد دفعة عند الاستلام؟' : 'Is there a handover payment?',
      hasConstruction: isAr ? 'هل توجد أقساط أثناء الإنشاء؟' : 'Are there construction installments?',
      hasPost: isAr ? 'هل توجد أقساط بعد الاستلام؟' : 'Are there installments after handover?',
      yes: isAr ? 'نعم' : 'Yes',
      no: isAr ? 'لا' : 'No',
      postStartPreset: isAr ? 'أول استحقاق بعد الاستلام' : 'First due after handover',
      after1m: isAr ? 'بعد شهر' : 'After 1 month',
      after3m: isAr ? 'بعد 3 أشهر' : 'After 3 months',
      after6m: isAr ? 'بعد 6 أشهر' : 'After 6 months',
      afterCustom: isAr ? 'مدة مخصصة' : 'Custom duration',
      // fields
      amount: isAr ? 'قيمة الدفعة' : 'Payment amount',
      percent: isAr ? 'النسبة %' : 'Percent %',
      dueDate: isAr ? 'تاريخ الدفعة' : 'Due date',
      bulletName: isAr ? 'اسم الدفعة (اختياري)' : 'Payment name (optional)',
      bulletNamePh: isAr ? 'مثال: دفعة إضافية' : 'e.g. Extra payment',
      handoverDate: isAr ? 'تاريخ الاستلام / الاستحقاق' : 'Handover / due date',
      perInstallment: isAr ? 'قيمة كل قسط' : 'Per installment',
      percentPer: isAr ? 'نسبة كل قسط %' : 'Percent per installment %',
      count: isAr ? 'عدد الأقساط' : 'Number of installments',
      firstDate: isAr ? 'تاريخ أول قسط' : 'First installment date',
      frequency: isAr ? 'التكرار' : 'Frequency',
      monthly: isAr ? 'شهري' : 'Monthly',
      bimonthly: isAr ? 'كل شهرين' : 'Every 2 months',
      quarterly: isAr ? 'كل 3 أشهر' : 'Every 3 months',
      semi: isAr ? 'كل 6 أشهر' : 'Every 6 months',
      yearly: isAr ? 'سنوي' : 'Yearly',
      custom: isAr ? 'مخصص' : 'Custom',
      customMonths: isAr ? 'الفترة المخصصة (شهور)' : 'Custom interval (months)',
      sameDay: isAr ? 'نفس يوم الاستحقاق كل شهر' : 'Same day each month',
      postStartAfter: isAr ? 'تبدأ بعد (شهور من الاستلام)' : 'Start after (months from handover)',
      addBullet: isAr ? '+ إضافة دفعة كبيرة أخرى' : '+ Add another bullet',
      // summary
      preLabel: isAr ? 'قبل الاستلام' : 'Before handover',
      handoverLabel: isAr ? 'عند الاستلام' : 'On handover',
      postLabel: isAr ? 'بعد الاستلام' : 'After handover',
      totalPct: isAr ? 'إجمالي النسبة' : 'Total %',
      totalAmount: isAr ? 'إجمالي المبلغ' : 'Total amount',
      payments: isAr ? 'عدد الدفعات' : 'Payments',
      complete: isAr ? 'الخطة مكتملة' : 'Plan complete',
      remaining: isAr ? 'متبقي' : 'Remaining',
      over: isAr ? 'تجاوز 100% بمقدار' : 'Exceeds 100% by',
      propertyPrice: isAr ? 'سعر العقار' : 'Property price',
      // timeline
      tlDate: isAr ? 'التاريخ' : 'Date',
      tlName: isAr ? 'البيان' : 'Description',
      tlAmount: isAr ? 'المبلغ' : 'Amount',
      tlPct: isAr ? 'النسبة' : '%',
      tlPhase: isAr ? 'المرحلة' : 'Phase',
      tlSkipNote: isAr ? 'تم تخطي القسط المتكرر في هذا التاريخ لوجود دفعة أخرى' : 'Recurring installment skipped on this date due to another payment',
      handoverMissing: isAr
        ? 'تاريخ الاستلام غير محدد. حدده في بيانات العقار لربط دفعة الاستلام والأقساط بعدها.'
        : 'Handover date is missing. Set it in the property to anchor handover / post-handover payments.',
      priceMissing: isAr
        ? 'أدخل سعر العقار أولًا لحساب النسبة تلقائيًا من القيمة.'
        : 'Enter the property price first to auto-calculate percent from amount.',
    }),
    [isAr, t],
  );

  const freqLabel = (f) =>
    ({
      monthly: L.monthly,
      bimonthly: L.bimonthly,
      quarterly: L.quarterly,
      semi_annual: L.semi,
      yearly: L.yearly,
      custom: L.custom,
    }[f] || L.monthly);

  /* ---- state updaters ---- */
  const patch = (p) => setState((s) => ({ ...s, ...p }));

  // Auto-calc the counterpart field ONLY when a property price is available.
  // Without a price the ratio can't be computed, so we leave the other field
  // untouched — this lets the user type amount and percent independently
  // instead of one wiping the other (the "disappearing value" bug).
  const syncPair = (setField, valueKey, value, otherKey, compute) => {
    setField(valueKey, value);
    if (price > 0) {
      setField(otherKey, value === '' || value == null ? '' : String(compute(value)));
    }
  };

  const setDown = (key, val) => setState((s) => ({ ...s, down: { ...s.down, [key]: val } }));
  const onDownAmount = (raw) => {
    const v = raw && raw.target ? raw.target.value : raw;
    syncPair(setDown, 'amount', v, 'percent', pctFromAmt);
  };
  const onDownPercent = (v) => {
    syncPair(setDown, 'percent', v, 'amount', amtFromPct);
  };

  const setHandover = (key, val) => setState((s) => ({ ...s, handover: { ...s.handover, [key]: val } }));
  const onHandoverAmount = (raw) => {
    const v = raw && raw.target ? raw.target.value : raw;
    syncPair(setHandover, 'amount', v, 'percent', pctFromAmt);
  };
  const onHandoverPercent = (v) => {
    syncPair(setHandover, 'percent', v, 'amount', amtFromPct);
  };

  const setConstruction = (key, val) => setState((s) => ({ ...s, construction: { ...s.construction, [key]: val } }));
  const onConstrAmount = (raw) => {
    const v = raw && raw.target ? raw.target.value : raw;
    syncPair(setConstruction, 'perAmount', v, 'percent', pctFromAmt);
  };
  const onConstrPercent = (v) => {
    syncPair(setConstruction, 'percent', v, 'perAmount', amtFromPct);
  };

  const setPost = (key, val) => setState((s) => ({ ...s, post: { ...s.post, [key]: val } }));
  const onPostAmount = (raw) => {
    const v = raw && raw.target ? raw.target.value : raw;
    syncPair(setPost, 'perAmount', v, 'percent', pctFromAmt);
  };
  const onPostPercent = (v) => {
    syncPair(setPost, 'percent', v, 'perAmount', amtFromPct);
  };

  const addBullet = () => setState((s) => ({ ...s, bullets: [...s.bullets, defaultBullet('pre_handover')] }));
  const updateBullet = (id, key, val) =>
    setState((s) => ({ ...s, bullets: s.bullets.map((b) => (b.id === id ? { ...b, [key]: val } : b)) }));
  const onBulletAmount = (id, raw) => {
    const v = raw && raw.target ? raw.target.value : raw;
    syncPair((k, val) => updateBullet(id, k, val), 'amount', v, 'percent', pctFromAmt);
  };
  const onBulletPercent = (id, v) => {
    syncPair((k, val) => updateBullet(id, k, val), 'percent', v, 'amount', amtFromPct);
  };
  const removeBullet = (id) => setState((s) => ({ ...s, bullets: s.bullets.filter((b) => b.id !== id) }));

  /* ---- build the stages array from current state (respects plan-type visibility) ---- */
  const buildStages = () => {
    const stages = [];
    const v = sectionsForType(planType);
    const downActive = v.down && (v.downForced || state.downOn);
    const bulletsActive = v.bullets && state.bulletsOn;
    const handoverActiveSec = v.handover && (v.handoverForced || state.handoverOn);
    const constructionActive = v.construction && (v.constructionForced || state.constructionOn);
    const postActiveSec = v.post && (v.postForced || state.postOn);

    if (downActive && (moneyNumber(state.down.amount) > 0 || Number(state.down.percent) > 0)) {
      stages.push({
        ...state.down,
        type: 'down',
        kind: 'down',
        amountMode: 'fixed',
        name: state.down.name || (isAr ? 'الدفعة الأولى' : 'Down Payment'),
      });
    }
    if (bulletsActive) {
      state.bullets.forEach((b) => {
        if (moneyNumber(b.amount) > 0 || Number(b.percent) > 0) {
          stages.push({ ...b, type: 'bullet', amountMode: 'fixed' });
        }
      });
    }
    if (handoverActiveSec && (moneyNumber(state.handover.amount) > 0 || Number(state.handover.percent) > 0)) {
      stages.push({
        ...state.handover,
        type: 'handover',
        amountMode: 'fixed',
        name: state.handover.name || (isAr ? 'دفعة الاستلام' : 'Handover Payment'),
      });
    }
    if (
      constructionActive &&
      Number(state.construction.count) > 0 &&
      (moneyNumber(state.construction.perAmount) > 0 || Number(state.construction.percent) > 0)
    ) {
      stages.push({ ...state.construction, type: 'recurring', recurringMode: 'per_installment' });
    }
    if (
      postActiveSec &&
      Number(state.post.count) > 0 &&
      (moneyNumber(state.post.perAmount) > 0 || Number(state.post.percent) > 0)
    ) {
      stages.push({ ...state.post, type: 'post_equal', recurringMode: 'per_installment' });
    }
    return stages;
  };

  const stages = useMemo(buildStages, [state, isAr]); // eslint-disable-line react-hooks/exhaustive-deps

  const breakdown = useMemo(() => phaseBreakdown(stages, totalPrice), [stages, totalPrice]);
  const preview = useMemo(() => sumStagesPreview(stages, totalPrice), [stages, totalPrice]);
  const timeline = useMemo(
    () => stagesToInstallments(stages, { totalPrice, startDate: purchaseDate, handoverDate }),
    [stages, totalPrice, purchaseDate, handoverDate],
  );
  const skippedSet = useMemo(
    () => new Set((timeline.skipped || []).map((s) => s.date)),
    [timeline],
  );

  const pct = breakdown.totalPct;
  const pctState =
    Math.abs(pct - 100) < 0.05 ? 'ok' : pct > 100 ? 'over' : pct > 0 ? 'low' : 'none';

  const handoverActive = vis.handover && (vis.handoverForced || state.handoverOn);
  const postActive = vis.post && (vis.postForced || state.postOn);
  const needsHandover =
    (handoverActive || postActive) && !handoverDate && !state.handover.dueDate;

  const generate = () => onGenerate(buildStages(), { handoverDate });

  /* ---- shared field renderers ---- */
  const renderFreqSelect = (stage, setField) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label className="text-xs">{L.frequency}</Label>
        <Select value={stage.frequency} onValueChange={setField('frequency')}>
          <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">{L.monthly}</SelectItem>
            <SelectItem value="bimonthly">{L.bimonthly}</SelectItem>
            <SelectItem value="quarterly">{L.quarterly}</SelectItem>
            <SelectItem value="semi_annual">{L.semi}</SelectItem>
            <SelectItem value="custom">{L.custom}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {stage.frequency === 'custom' && (
        <div className="space-y-1">
          <Label className="text-xs">{L.customMonths}</Label>
          <Input
            type="number"
            min="1"
            max="60"
            value={stage.customMonths || ''}
            onChange={setField('customMonths')}
            dir="ltr"
            className="min-h-[40px]"
          />
        </div>
      )}
    </div>
  );

  const renderSameDay = (stage, setField) => (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <input
        type="checkbox"
        checked={!!stage.sameDayEachMonth}
        onChange={(e) => setField('sameDayEachMonth')(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
      />
      {L.sameDay}
    </label>
  );

  /* ---- yes/no toggle ---- */
  const YesNo = ({ value, onChange }) => (
    <div className="inline-flex rounded-lg border bg-card p-0.5">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          'rounded-md px-3 py-1 text-xs font-semibold transition',
          value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {L.yes}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          'rounded-md px-3 py-1 text-xs font-semibold transition',
          !value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {L.no}
      </button>
    </div>
  );

  /* ---- section wrapper ---- */
  const Section = ({ icon: Icon, title, hint, color = 'border-primary/20 bg-primary/5', children, actions }) => (
    <div className={cn('rounded-xl border p-3 space-y-3', color)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Icon size={16} />
          </span>
          <div>
            <p className="text-sm font-bold">{title}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
          </div>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );

  /* ---- value/percent pair ---- */
  const AmountPercentPair = ({ amount, percent, onAmount, onPercent, amountLabel, percentLabel }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label className="text-xs">{amountLabel}</Label>
        <MoneyInput value={amount || ''} onChange={onAmount} className="min-h-[40px]" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{percentLabel}</Label>
        <PercentInput
          min="0"
          max="100"
          value={percent || ''}
          onChange={(e) => onPercent(e.target.value)}
          className="min-h-[40px]"
        />
      </div>
    </div>
  );

  /* ---- timeline preview ---- */
  const renderTimeline = () => {
    const rows = timeline.installments || [];
    if (!rows.length) return null;
    return (
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr className="text-start">
                <th className="px-2 py-1.5 text-start font-semibold">#</th>
                <th className="px-2 py-1.5 text-start font-semibold">{L.tlDate}</th>
                <th className="px-2 py-1.5 text-start font-semibold">{L.tlName}</th>
                <th className="px-2 py-1.5 text-end font-semibold">{L.tlPct}</th>
                <th className="px-2 py-1.5 text-end font-semibold">{L.tlAmount}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const ph = stagePhase({ type: r.payment_type === 'bullet' ? 'bullet' : r.phase, phase: r.phase });
                const isBullet = r.payment_type === 'bullet';
                const isHandover = r.payment_type === 'handover';
                const isDown = r.payment_type === 'down_payment';
                const badgeCls = isHandover
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : isBullet
                    ? 'bg-violet-100 text-violet-800 border-violet-200'
                    : isDown
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : ph === 'post_handover'
                        ? 'bg-purple-100 text-purple-800 border-purple-200'
                        : 'bg-sky-100 text-sky-800 border-sky-200';
                const badgeLabel = isHandover
                  ? L.handoverLabel
                  : isBullet
                    ? (isAr ? 'دفعة كبيرة' : 'Bullet')
                    : isDown
                      ? (isAr ? 'دفعة أولى' : 'Down')
                      : ph === 'post_handover'
                        ? L.postLabel
                        : (isAr ? 'قسط' : 'Installment');
                const skippedHere = r.due_date && skippedSet.has(r.due_date);
                return (
                  <tr key={i} className="border-t align-top">
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.number}</td>
                    <td className="px-2 py-1.5 tabular-nums" dir="ltr">
                      {r.due_date ? formatPlanDateDisplay(r.due_date) : <span className="text-amber-600">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold me-1', badgeCls)}>
                        {isBullet && <Zap size={8} />}
                        {badgeLabel}
                      </span>
                      <span className="text-muted-foreground">{r.name}</span>
                      {skippedHere && (
                        <span className="block text-[9px] text-amber-700 mt-0.5">⚠ {L.tlSkipNote}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-end tabular-nums">{r.percentage ? `${r.percentage}%` : '—'}</td>
                    <td className="px-2 py-1.5 text-end tabular-nums" dir="ltr">{r.amount ? formatMoney(r.amount, lang) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  /* ---- live summary — only phases that apply to this plan type / data ---- */
  const renderSummary = () => {
    if (!planType) return null;
    const cards = [];
    const showPre =
      vis.down ||
      vis.bullets ||
      vis.construction ||
      breakdown.pre.count > 0 ||
      breakdown.pre.pct > 0;
    const showHandover =
      (vis.handover && (vis.handoverForced || state.handoverOn || breakdown.handover.count > 0)) ||
      breakdown.handover.pct > 0;
    const showPost =
      (vis.post && (vis.postForced || state.postOn || breakdown.post.count > 0)) ||
      breakdown.post.pct > 0;
    if (showPre) {
      cards.push({ key: 'pre', label: L.preLabel, ...breakdown.pre, cls: 'border-emerald-200 bg-emerald-50' });
    }
    if (showHandover) {
      cards.push({
        key: 'handover',
        label: L.handoverLabel,
        ...breakdown.handover,
        cls: 'border-amber-200 bg-amber-50',
      });
    }
    if (showPost) {
      cards.push({ key: 'post', label: L.postLabel, ...breakdown.post, cls: 'border-purple-200 bg-purple-50' });
    }
    const cols =
      cards.length >= 3 ? 'grid-cols-3' : cards.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
    return (
      <div
        className={cn(
          'rounded-lg border p-3 space-y-2 text-xs',
          pctState === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : pctState === 'over'
              ? 'border-red-200 bg-red-50 text-red-800'
              : pctState === 'low'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-border bg-card text-muted-foreground',
        )}
      >
        <p className="font-bold">{L.summary}</p>
        {cards.length > 0 && (
          <div className={cn('grid gap-2', cols)}>
            {cards.map((b) => (
              <div key={b.key} className={cn('rounded-lg border p-2', b.cls)}>
                <p className="text-[10px] font-semibold">{b.label}</p>
                <p className="text-sm font-bold tabular-nums">{b.pct}%</p>
                <p className="text-[10px] tabular-nums text-muted-foreground" dir="ltr">
                  {price > 0 ? formatMoney(b.amount, lang) : '—'}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {b.count} {L.payments}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t">
          <p>
            {L.totalPct}: <span className="font-semibold tabular-nums">{pct}%</span>
          </p>
          <p>
            {L.payments}: <span className="font-semibold tabular-nums">{preview.count}</span>
          </p>
          <p>
            {L.totalAmount}:{' '}
            <span className="font-semibold tabular-nums" dir="ltr">
              {formatMoney(preview.totalAmount, lang)}
            </span>
          </p>
          <p className="font-semibold">
            {pctState === 'ok'
              ? L.complete
              : pctState === 'over'
                ? `${L.over} ${Math.round((pct - 100) * 100) / 100}%`
                : `${L.remaining}: ${Math.round((100 - pct) * 100) / 100}%`}
          </p>
        </div>
        {price > 0 ? (
          <p className="text-[10px] text-muted-foreground pt-1 border-t">
            {L.propertyPrice}:{' '}
            <span className="tabular-nums" dir="ltr">
              {formatMoney(totalPrice, lang)}
            </span>
          </p>
        ) : (
          <p className="text-[10px] text-amber-700 pt-1 border-t">{L.priceMissing}</p>
        )}
      </div>
    );
  };

  const downFieldsOn = vis.downForced || state.downOn;
  const constructionFieldsOn = vis.constructionForced || state.constructionOn;
  const handoverFieldsOn = vis.handoverForced || state.handoverOn;
  const postFieldsOn = vis.postForced || state.postOn;

  const postStartVal = String(state.post.startAfterMonths || '1');
  const postStartIsPreset = ['1', '3', '6'].includes(postStartVal);

  if (!planType) {
    return (
      <div className="rounded-xl border bg-accent/30 p-4 text-center space-y-1">
        <Layers size={18} className="mx-auto text-primary" />
        <p className="text-sm font-semibold">
          {isAr ? 'اختر نوع خطة الدفع أولًا' : 'Select a payment plan type first'}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {isAr
            ? 'الأقسام والحقول تظهر حسب النوع المختار.'
            : 'Sections and fields appear based on the selected type.'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4 rounded-xl border bg-accent/30 p-3')}>
      <div className="flex items-center gap-2">
        <Layers size={16} className="text-primary" />
        <p className="text-sm font-bold">{L.title}</p>
      </div>

      {/* 1) Down payment */}
      {vis.down && (
        <Section
          icon={Banknote}
          title={L.secDown}
          hint={L.secDownHint}
          actions={
            vis.downToggle ? (
              <YesNo value={!!state.downOn} onChange={(v) => patch({ downOn: v })} />
            ) : null
          }
        >
          {vis.downToggle && (
            <p className="text-[11px] font-medium text-muted-foreground">{L.hasDown}</p>
          )}
          {downFieldsOn && (
            <>
              <AmountPercentPair
                amount={state.down.amount}
                percent={state.down.percent}
                onAmount={onDownAmount}
                onPercent={onDownPercent}
                amountLabel={L.amount}
                percentLabel={L.percent}
              />
              <DateField
                label={L.dueDate}
                value={state.down.dueDate || ''}
                onChange={(v) => setDown('dueDate', v)}
                heightClass="min-h-[40px]"
              />
            </>
          )}
        </Section>
      )}

      {/* 2) Bullet payments */}
      {vis.bullets && (
        <Section
          icon={Zap}
          title={L.secBullets}
          hint={L.secBulletsHint}
          color="border-violet-200 bg-violet-50/40"
          actions={
            vis.bulletsToggle ? (
              <YesNo
                value={state.bulletsOn}
                onChange={(v) =>
                  patch({
                    bulletsOn: v,
                    bullets: v && state.bullets.length === 0 ? [defaultBullet('pre_handover')] : state.bullets,
                  })
                }
              />
            ) : null
          }
        >
          {vis.bulletsToggle && (
            <p className="text-[11px] font-medium text-muted-foreground">{L.hasBullets}</p>
          )}
          {state.bulletsOn && (
            <div className="space-y-2">
              {state.bullets.map((b) => (
                <div key={b.id} className="rounded-lg border bg-card p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1">
                      <Zap size={12} className="text-violet-600" />
                      {isAr ? 'دفعة كبيرة' : 'Bullet payment'}
                    </span>
                    {state.bullets.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeBullet(b.id)}
                        className="h-7 w-7 text-destructive"
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                  <AmountPercentPair
                    amount={b.amount}
                    percent={b.percent}
                    onAmount={(raw) => onBulletAmount(b.id, raw)}
                    onPercent={(v) => onBulletPercent(b.id, v)}
                    amountLabel={L.amount}
                    percentLabel={L.percent}
                  />
                  <DateField
                    label={L.dueDate}
                    value={b.dueDate || ''}
                    onChange={(v) => updateBullet(b.id, 'dueDate', v)}
                    heightClass="min-h-[40px]"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addBullet}
                className="min-h-[36px] w-full border-dashed"
              >
                <Plus size={14} className="me-1" />
                {L.addBullet}
              </Button>
            </div>
          )}
        </Section>
      )}

      {/* Handover before construction for type2 (and custom/type4); after construction for type1 */}
      {vis.handover && planType === 'type2' && (
        <Section
          icon={KeyRound}
          title={L.secHandover}
          hint={L.secHandoverHint}
          color="border-amber-200 bg-amber-50/40"
          actions={
            vis.handoverToggle ? (
              <YesNo value={state.handoverOn} onChange={(v) => patch({ handoverOn: v })} />
            ) : null
          }
        >
          {vis.handoverToggle && (
            <p className="text-[11px] font-medium text-muted-foreground">{L.hasHandover}</p>
          )}
          {handoverFieldsOn && (
            <div className="space-y-2">
              <AmountPercentPair
                amount={state.handover.amount}
                percent={state.handover.percent}
                onAmount={onHandoverAmount}
                onPercent={onHandoverPercent}
                amountLabel={L.amount}
                percentLabel={L.percent}
              />
              <DateField
                label={L.handoverDate}
                value={state.handover.dueDate || ''}
                onChange={(v) => setHandover('dueDate', v)}
                heightClass="min-h-[40px]"
              />
              {!handoverDate && !state.handover.dueDate && (
                <p className="text-[11px] text-amber-700">{L.handoverMissing}</p>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Construction installments */}
      {vis.construction && (
        <Section
          icon={Repeat}
          title={L.secConstruction}
          hint={L.secConstructionHint}
          actions={
            vis.constructionToggle ? (
              <YesNo value={!!state.constructionOn} onChange={(v) => patch({ constructionOn: v })} />
            ) : null
          }
        >
          {vis.constructionToggle && (
            <p className="text-[11px] font-medium text-muted-foreground">{L.hasConstruction}</p>
          )}
          {constructionFieldsOn && (
            <>
              <AmountPercentPair
                amount={state.construction.perAmount}
                percent={state.construction.percent}
                onAmount={onConstrAmount}
                onPercent={onConstrPercent}
                amountLabel={L.perInstallment}
                percentLabel={L.percentPer}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{L.count}</Label>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={state.construction.count || ''}
                    onChange={(e) => setConstruction('count', e.target.value)}
                    dir="ltr"
                    className="min-h-[40px]"
                  />
                </div>
                <DateField
                  label={L.firstDate}
                  value={state.construction.firstDate || ''}
                  onChange={(v) => setConstruction('firstDate', v)}
                  heightClass="min-h-[40px]"
                />
              </div>
              {renderFreqSelect(state.construction, (k) => (v) => setConstruction(k, v))}
              {renderSameDay(state.construction, (k) => (v) => setConstruction(k, v))}
            </>
          )}
        </Section>
      )}

      {/* Handover after construction for type1 / type4 / type5 */}
      {vis.handover && planType !== 'type2' && (
        <Section
          icon={KeyRound}
          title={L.secHandover}
          hint={L.secHandoverHint}
          color="border-amber-200 bg-amber-50/40"
          actions={
            vis.handoverToggle ? (
              <YesNo value={state.handoverOn} onChange={(v) => patch({ handoverOn: v })} />
            ) : null
          }
        >
          {vis.handoverToggle && (
            <p className="text-[11px] font-medium text-muted-foreground">{L.hasHandover}</p>
          )}
          {handoverFieldsOn && (
            <div className="space-y-2">
              <AmountPercentPair
                amount={state.handover.amount}
                percent={state.handover.percent}
                onAmount={onHandoverAmount}
                onPercent={onHandoverPercent}
                amountLabel={L.amount}
                percentLabel={L.percent}
              />
              <DateField
                label={L.handoverDate}
                value={state.handover.dueDate || ''}
                onChange={(v) => setHandover('dueDate', v)}
                heightClass="min-h-[40px]"
              />
              {!handoverDate && !state.handover.dueDate && (
                <p className="text-[11px] text-amber-700">{L.handoverMissing}</p>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Post-handover installments */}
      {vis.post && (
        <Section
          icon={CalendarClock}
          title={L.secPost}
          hint={L.secPostHint}
          color="border-purple-200 bg-purple-50/30"
          actions={
            vis.postToggle ? (
              <YesNo value={state.postOn} onChange={(v) => patch({ postOn: v })} />
            ) : null
          }
        >
          {vis.postToggle && (
            <p className="text-[11px] font-medium text-muted-foreground">{L.hasPost}</p>
          )}
          {postFieldsOn && (
            <div className="space-y-2">
              <AmountPercentPair
                amount={state.post.perAmount}
                percent={state.post.percent}
                onAmount={onPostAmount}
                onPercent={onPostPercent}
                amountLabel={L.perInstallment}
                percentLabel={L.percentPer}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{L.count}</Label>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={state.post.count || ''}
                    onChange={(e) => setPost('count', e.target.value)}
                    dir="ltr"
                    className="min-h-[40px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{L.postStartPreset}</Label>
                  <Select
                    value={postStartIsPreset ? postStartVal : 'custom'}
                    onValueChange={(v) => {
                      if (v === 'custom') {
                        if (postStartIsPreset) setPost('startAfterMonths', '12');
                      } else {
                        setPost('startAfterMonths', v);
                      }
                    }}
                  >
                    <SelectTrigger className="min-h-[40px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{L.after1m}</SelectItem>
                      <SelectItem value="3">{L.after3m}</SelectItem>
                      <SelectItem value="6">{L.after6m}</SelectItem>
                      <SelectItem value="custom">{L.afterCustom}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!postStartIsPreset && (
                <div className="space-y-1">
                  <Label className="text-xs">{L.postStartAfter}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="240"
                    value={state.post.startAfterMonths || ''}
                    onChange={(e) => setPost('startAfterMonths', e.target.value)}
                    dir="ltr"
                    className="min-h-[40px]"
                  />
                </div>
              )}
              {renderFreqSelect(state.post, (k) => (v) => setPost(k, v))}
              {renderSameDay(state.post, (k) => (v) => setPost(k, v))}
              {!handoverDate && (
                <p className="text-[11px] text-amber-700">{L.handoverMissing}</p>
              )}
            </div>
          )}
        </Section>
      )}

      {/* 6) Summary */}
      {renderSummary()}

      {needsHandover && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
          <p className="text-xs font-semibold text-amber-900">{L.handoverMissing}</p>
        </div>
      )}

      {/* 7) Timeline preview */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowTimeline((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold text-foreground"
        >
          {showTimeline ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {L.showTimeline}
          <span className="text-muted-foreground font-normal">({timeline.installments.length})</span>
        </button>
        {showTimeline && (
          <>
            <p className="text-[10px] text-muted-foreground">{L.timelineHint}</p>
            {renderTimeline()}
          </>
        )}
      </div>

      {/* 8) Create plan */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {typeof onCancel === 'function' && !embedded && (
          <Button type="button" variant="outline" onClick={onCancel} className="min-h-[44px]">
            {L.cancel}
          </Button>
        )}
        <Button
          type="button"
          onClick={generate}
          disabled={stages.length === 0 || needsHandover}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <Sparkles size={14} className="me-1.5" />
          {L.generate}
        </Button>
      </div>
    </div>
  );
};

export default PaymentPlanStageBuilder;
