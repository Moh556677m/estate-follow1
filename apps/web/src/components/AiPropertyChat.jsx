import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Home,
  KeyRound,
  Loader2,
  Paperclip,
  RotateCw,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Trees,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DateField from '@/components/DateField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { uploadToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { formatMoney, formatDate } from '@/lib/api';
import { useGeoData } from '@/hooks/useGeoData';
import { toIsoDate } from '@/lib/dateFormat';
import { mapPaymentType } from '@/lib/smartPlanReader';
import {
  extractPropertyFromFiles,
  findMissingStartPoints,
  buildFinalInstallments,
  resolveDeliveryDate,
} from '@/lib/aiPropertyExtract';
import { addMonthsIso } from '@/lib/paymentPlanSmart';

const ACCEPT_FILES = '.pdf,image/*';
const MAX_FILES = 100;
const PREVIEW_COUNT = 8;

const PURCHASE_OPTIONS = [
  {
    key: 'cash',
    icon: Banknote,
    ar: 'كاش (تم الدفع بالكامل)',
    en: 'Cash (paid in full)',
    short_ar: 'كاش',
    short_en: 'Cash',
  },
  {
    key: 'installment',
    icon: CalendarDays,
    ar: 'تقسيط (يُسدّد على دفعات)',
    en: 'Installment (paid in batches)',
    short_ar: 'تقسيط',
    short_en: 'Installment',
  },
  {
    key: 'rented',
    icon: KeyRound,
    ar: 'مؤجّر (مرتبط بعقد إيجار)',
    en: 'Rented (linked to a lease)',
    short_ar: 'مؤجّر',
    short_en: 'Rented',
  },
];

const USAGE_OPTIONS = [
  { key: 'residential', icon: Home, ar: 'سكني', en: 'Residential' },
  { key: 'commercial', icon: Store, ar: 'تجاري', en: 'Commercial' },
  { key: 'land', icon: Trees, ar: 'أرض', en: 'Land' },
];

function fmtMoney(v, lang) {
  if (v == null || v === '' || isNaN(Number(v))) return '—';
  return formatMoney(Number(v), lang);
}

/**
 * AI Property Creator — full-screen guided chat (WhatsApp-style shell).
 * Logic (Claude extract / save / docs) is unchanged.
 */
const AiPropertyChat = ({ onSaved }) => {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === 'ar';

  const [messages, setMessages] = useState([]);
  const [purchaseType, setPurchaseType] = useState('');
  const [usageType, setUsageType] = useState('');
  const [files, setFiles] = useState([]);
  const [extraction, setExtraction] = useState(null);
  const [startPoints, setStartPoints] = useState({ bookingDate: '', handoverDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(null);
  const [review, setReview] = useState(null);
  const [showAllInstallments, setShowAllInstallments] = useState(false);
  const [savedPropertyId, setSavedPropertyId] = useState(null);
  const [draft, setDraft] = useState('');
  const [extractProgress, setExtractProgress] = useState(null);

  // Rent flow: does this lease belong to a property the owner already has in
  // "My Properties" (cash/installment), or a brand new one? Renting an
  // EXISTING property never re-collects its building/unit/country data and
  // never changes its type — it only creates a tenant + tenancy linked via
  // property_id, exactly like the manual "Rent this property" action.
  const [rentMode, setRentMode] = useState(''); // '' | 'existing' | 'new'
  const [existingProperties, setExistingProperties] = useState([]);
  const [existingPropSearch, setExistingPropSearch] = useState('');
  const [selectedExistingProperty, setSelectedExistingProperty] = useState(null);

  const fileRef = useRef(null);
  const planFileRef = useRef(null);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await window.fetch('/hcgi/api/integrated-ai/plan-status', {
          headers: { Accept: 'application/json' },
        });
        if (!r.ok) {
          if (!cancelled) setConfigured(false);
          return;
        }
        const d = await r.json();
        if (!cancelled) setConfigured(!!d?.configured);
      } catch {
        if (!cancelled) setConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pushMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Task #26 (Estate AI conversational experience) — the guided flow used to
  // reply to every button tap with an assistant bubble that appeared
  // instantly (zero perceived "thinking"), which read as a form wizard
  // wearing a chat skin rather than an actual conversation. This helper adds
  // a brief "typing…" bubble before the real reply — used only for the
  // direct guided-flow replies (choosing purchase/usage type, the rent
  // source picker, free-text nudges), never for extraction/save results,
  // which already have their own real async wait and dedicated progress UI
  // and should not get an extra artificial delay on top of it.
  const pushAssistantReply = useCallback((content, extras = []) => {
    const typingId = `typing-${Date.now()}-${Math.random()}`;
    // busy=true for the brief typing window too — reuses the same flag that
    // already disables the purchase/usage buttons and the composer, so a
    // rapid double-tap during the ~550ms typing bubble can't queue a second,
    // overlapping reply.
    setBusy(true);
    setMessages((prev) => [...prev, { role: 'assistant', kind: 'typing', _typingId: typingId }]);
    setTimeout(() => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m._typingId === typingId);
        const textMsg = { role: 'assistant', kind: 'text', content };
        if (idx === -1) return [...prev, textMsg, ...extras];
        const next = prev.slice();
        next[idx] = textMsg;
        return [...next, ...extras];
      });
      setBusy(false);
    }, 550);
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy, scrollToBottom]);

  const choosePurchase = (key) => {
    if (busy || key === purchaseType) return;
    setUsageType('');
    setFiles([]);
    setExtraction(null);
    setReview(null);
    setSavedPropertyId(null);
    setStartPoints({ bookingDate: '', handoverDate: '' });
    setShowAllInstallments(false);
    setError('');
    setDraft('');
    setRentMode('');
    setExistingProperties([]);
    setExistingPropSearch('');
    setSelectedExistingProperty(null);
    setPurchaseType(key);
    const opt = PURCHASE_OPTIONS.find((o) => o.key === key);
    if (key === 'rented') {
      // Renting is never a second brand-new property when the owner already
      // has the matching cash/installment property — ask first so an
      // existing property's data is never re-collected or duplicated.
      setMessages([{ role: 'user', content: ar ? opt.ar : opt.en }]);
      pushAssistantReply(
        ar
          ? 'تمام. هل هذا العقار موجود بالفعل في «عقاراتي» (كاش أو أقساط)، أم عقار جديد بالكامل؟'
          : 'Got it. Is this property already in "My Properties" (cash or installment), or is it a brand new property?',
        [{ role: 'assistant', kind: 'rent-source-select' }],
      );
      return;
    }
    setMessages([{ role: 'user', content: ar ? opt.ar : opt.en }]);
    pushAssistantReply(
      ar
        ? 'تمام، تاني سؤال! ايه نوع استخدام العقار؟ اختر من صف نوع الاستخدام بالأعلى.'
        : 'Got it. Second question: what is the property usage type? Pick from the usage row above.',
    );
  };

  // Rent flow, step 2: existing property (skip re-entering its data) vs a
  // brand new one (asks usage type + full property data, same as before).
  const chooseRentSource = async (mode) => {
    if (busy) return;
    setRentMode(mode);
    if (mode === 'new') {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: ar ? 'عقار جديد' : 'New property' },
      ]);
      pushAssistantReply(
        ar
          ? 'تمام، تاني سؤال! ايه نوع استخدام العقار؟ اختر من صف نوع الاستخدام بالأعلى.'
          : 'Got it. Second question: what is the property usage type? Pick from the usage row above.',
      );
      return;
    }
    // mode === 'existing'
    setBusy(true);
    try {
      const list = await pb.collection('properties').getFullList({
        filter: `owner = "${user.id}" && status = "approved" && (type = "cash" || type = "installment")`,
        sort: '-created',
        requestKey: `ai-rent-existing-${user.id}`,
      });
      setExistingProperties(list);
    } catch {
      setExistingProperties([]);
    } finally {
      setBusy(false);
    }
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: ar ? 'عقار موجود' : 'Existing property' },
    ]);
    pushAssistantReply(
      ar
        ? 'اختر العقار من القائمة بالأسفل — بياناته لن تُطلب منك مرة أخرى.'
        : 'Pick the property from the list below — its data will not be asked for again.',
      [{ role: 'assistant', kind: 'rent-property-picker' }],
    );
  };

  const pickExistingProperty = (prop) => {
    if (busy || !prop) return;
    setSelectedExistingProperty(prop);
    setUsageType(prop.usage_type || '');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: `${prop.building || ''} / ${prop.unit_number || ''}` },
    ]);
    pushAssistantReply(
      ar
        ? 'ممتاز. دلوقتي ارفع مستندات الإيجار (PDF أو صورة) — عقد الإيجار + جواز سفر/هوية المستأجر + أي شيكات أو إيصالات. النظام هياخد كل الملفات كعقد إيجار واحد ويستخرج البيانات بالذكاء الاصطناعي.'
        : 'Great. Now upload the lease documents (PDF or image) — the lease contract + the tenant\'s passport/ID + any cheques or receipts. The system treats all files as one lease and extracts the data with AI.',
      [{ role: 'assistant', kind: 'upload' }],
    );
  };

  const chooseUsage = (key) => {
    if (busy || !purchaseType || key === usageType) return;
    setFiles([]);
    setExtraction(null);
    setReview(null);
    setSavedPropertyId(null);
    setStartPoints({ bookingDate: '', handoverDate: '' });
    setShowAllInstallments(false);
    setError('');
    setDraft('');
    setUsageType(key);
    const opt = USAGE_OPTIONS.find((o) => o.key === key);
    setMessages((prev) => [...prev.slice(0, 2), { role: 'user', content: ar ? opt.ar : opt.en }]);
    pushAssistantReply(
      purchaseType === 'rented'
        ? (ar
          ? 'ممتاز. دلوقتي ارفع مستندات الإيجار (PDF أو صورة) — عقد الإيجار + جواز سفر/هوية المستأجر + أي ملحقات أو شيكات أو إيصالات أو مستندات مرتبطة بنفس العقد. النظام هياخد كل الملفات كعقد إيجار واحد ويستخرج البيانات بالذكاء الاصطناعي.'
          : 'Great. Now upload the lease documents (PDF or image) — the lease contract + tenant passport/ID + any annex, cheques, receipts, or documents related to the same lease. The system treats all files as one lease and extracts the data with AI.')
        : (ar
          ? 'ممتاز. دلوقتي ارفع العقد (PDF أو صورة) — أي نوع مستند: عقد بيع وشراء من المطور (SPA)، عقد أراضي وأملاك رسمي (Oqood)، عرض بيع من المطور (Sales Offer)، أو أي مستند مشابه. النظام هيتعرف على نوع المستند تلقائيًا.'
          : 'Great. Now upload the contract (PDF or image) — any type: Sales-Purchase Agreement (SPA), Oqood title deed, Sales Offer, or any similar document. The system auto-detects the document type.'),
      [{ role: 'assistant', kind: 'upload' }],
    );
  };

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES));
    e.target.value = '';
    setError('');
  };

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Remembers the exact call that's currently running (or last ran) so a
  // "Retry" button after a hard failure can repeat it without asking the
  // user to re-pick files — the files themselves are untouched by a failed
  // extraction (only the "extracting" message is removed), so a retry is
  // just calling runExtraction again with the same arguments.
  const lastRunRef = useRef(null);

  const runExtraction = async (filesToUse, { isPlanOnly = false } = {}) => {
    if (!filesToUse.length) return;
    lastRunRef.current = { filesToUse, isPlanOnly };
    setBusy(true);
    setError('');
    setExtractProgress(null);
    pushMessage({
      role: 'user',
      content: ar
        ? `رفعت ${filesToUse.length} ملف — ابدأ القراءة`
        : `Uploaded ${filesToUse.length} file(s) — start reading`,
    });
    pushMessage({ role: 'assistant', kind: 'extracting' });
    try {
      const result = await extractPropertyFromFiles(filesToUse, {
        purchaseType,
        usageType,
        lang,
        onProgress: (info) => setExtractProgress(info),
      });
      setExtraction(result);

      // Partial extraction: the backend read as many page-batches as it
      // could, then stopped and saved what it had instead of discarding
      // everything when a later batch failed. Tell the user plainly which
      // page range was not read, so they know to double-check the data
      // below rather than assume it is complete.
      const partialNote = result?.partial
        ? (ar
          ? `تنبيه: تعذّرت قراءة جزء من المستند (${result.partial_info?.failed_batch_label || `الدفعة ${result.partial_info?.failed_batch_index || '?'} من ${result.partial_info?.batch_total || '?'}`}) بعد محاولات متكررة. البيانات بالأسفل مستخرجة فقط من الصفحات التي أمكن قراءتها — راجعها جيدًا، وأضف يدويًا أي بيانات ناقصة من الصفحات المتبقية إذا لزم.`
          : `Note: part of the document could not be read (${result.partial_info?.failed_batch_label || `batch ${result.partial_info?.failed_batch_index || '?'} of ${result.partial_info?.batch_total || '?'}`}) after repeated attempts. The data below was extracted only from the pages that could be read — please review it carefully and manually add anything missing from the remaining pages if needed.`)
        : '';

      // ---- Rental (للإيجار) path: lease-shaped result ----
      if (purchaseType === 'rented') {
        setStartPoints({ bookingDate: '', handoverDate: '' });
        setMessages((prev) => prev.filter((m) => m.kind !== 'extracting'));
        const lease = result.lease || {};
        const payments = Array.isArray(result.payments) ? result.payments : [];
        const p = result.property || {};
        pushMessage({
          role: 'assistant',
          kind: 'text',
          content: ar
            ? 'تمت قراءة مستندات الإيجار واستخراج البيانات. راجع الملخص بالأسفل ثم أكّد الإضافة.'
            : 'Lease documents read and data extracted. Review the summary below then confirm adding the property.',
        });
        if (partialNote) {
          pushMessage({ role: 'assistant', kind: 'partial-warning', content: partialNote });
        }
        // When renting an EXISTING cash/installment property, its data is
        // never re-collected — use the already-known record instead of
        // whatever the lease document happens to mention for the property.
        const existingProp = rentMode === 'existing' ? selectedExistingProperty : null;
        setReview({
          building: existingProp ? existingProp.building || '' : p.building_name || p.project_name || '',
          unit_number: existingProp ? existingProp.unit_number || '' : p.unit_number || '',
          property_type: p.property_type || '',
          area_value: p.property_area != null ? String(p.property_area) : '',
          area_unit: p.area_unit === 'sqft' ? 'sqft' : 'sqm',
          community: existingProp ? existingProp.area || '' : p.area_name || '',
          country: existingProp ? existingProp.country || '' : '',
          tenant_name: lease.tenant_name || '',
          tenant_phone: lease.tenant_phone || '',
          tenant_email: lease.tenant_email || '',
          tenant_nationality: lease.tenant_nationality || '',
          contract_start_date: lease.contract_start_date ? toIsoDate(lease.contract_start_date) || '' : '',
          contract_end_date: lease.contract_end_date ? toIsoDate(lease.contract_end_date) || '' : '',
          contract_duration: lease.contract_duration || '',
          annual_rent: lease.annual_rent != null ? String(lease.annual_rent) : '',
          total_rent: lease.total_rent != null ? String(lease.total_rent) : '',
          currency: lease.currency || '',
          security_deposit: lease.security_deposit != null ? String(lease.security_deposit) : '',
          management_fee: lease.management_fee != null ? String(lease.management_fee) : '',
          other_fees: Array.isArray(lease.other_fees) ? lease.other_fees : [],
          developer: p.developer_or_company || '',
          payments,
          aiReview: result.review || null,
          partialInfo: result.partial ? result.partial_info : null,
        });
        pushMessage({ role: 'assistant', kind: 'rental-review' });
        return;
      }

      setStartPoints({
        bookingDate: result.start_points?.booking_date
          ? toIsoDate(result.start_points.booking_date) || ''
          : '',
        handoverDate: result.start_points?.handover_date
          ? toIsoDate(result.start_points.handover_date) || ''
          : '',
      });

      setMessages((prev) => prev.filter((m) => m.kind !== 'extracting'));

      const scheduleFound =
        result.schedule?.found && (result.schedule.installments || []).length > 0;

      if (isPlanOnly) {
        pushMessage({
          role: 'assistant',
          kind: 'text',
          content: ar
            ? 'تمت قراءة خطة الدفع. راجع الجدول بالأسفل ثم أكّد الإضافة.'
            : 'Payment plan read. Review the table below then confirm adding the property.',
        });
      } else if (!scheduleFound) {
        pushMessage({
          role: 'assistant',
          kind: 'text',
          content: ar
            ? 'تم استخراج بيانات العقار، لكن لم أجد جدول أقساط في هذا المستند (وهذا طبيعي مثلًا لعقد Oqood الرسمي). لو عندك خطة دفع منفصلة، ارفعها الآن — أو يمكنك المتابعة بدون جدول أقساط.'
            : 'Property data extracted, but no installment schedule was found in this document (this is normal e.g. for an Oqood title deed). If you have a separate payment plan, upload it now — or continue without a schedule.',
        });
        pushMessage({ role: 'assistant', kind: 'plan-upload' });
      } else {
        pushMessage({
          role: 'assistant',
          kind: 'text',
          content: ar
            ? 'تمت قراءة المستند واستخراج البيانات. راجع الملخص بالأسفل.'
            : 'Document read and data extracted. Review the summary below.',
        });
      }
      if (partialNote) {
        pushMessage({ role: 'assistant', kind: 'partial-warning', content: partialNote });
      }

      const deliveryDate = resolveDeliveryDate(result, {
        bookingDate: result.start_points?.booking_date
          ? toIsoDate(result.start_points.booking_date)
          : '',
        handoverDate: result.start_points?.handover_date
          ? toIsoDate(result.start_points.handover_date)
          : '',
      });
      const p = result.property || {};
      setReview({
        building: p.building || '',
        unit_number: p.unit_number || '',
        property_type: p.property_type || '',
        area_value: p.area_value != null ? String(p.area_value) : '',
        area_unit: p.area_unit === 'sqft' ? 'sqft' : 'sqm',
        community: p.community || '',
        country: '',
        total_price: p.total_price != null ? String(p.total_price) : '',
        original_price: p.original_price != null ? String(p.original_price) : '',
        discounted_price: p.discounted_price != null ? String(p.discounted_price) : '',
        discount_percentage: p.discount_percentage != null ? String(p.discount_percentage) : '',
        expected_handover_date: deliveryDate || '',
        handover_status:
          deliveryDate && new Date(deliveryDate) <= new Date()
            ? 'handover_completed'
            : 'under_construction',
        payment_method: '',
        developer: '',
        aiReview: result.review || null,
        partialInfo: result.partial ? result.partial_info : null,
      });
      pushMessage({ role: 'assistant', kind: 'review' });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.kind !== 'extracting'));
      const serverMsg = ar
        ? e?.userMessageAr || e?.userMessageEn || ''
        : e?.userMessageEn || e?.userMessageAr || '';
      const code = String(e?.code || e?.message || '');
      let msg = serverMsg;
      if (!msg) {
        if (/PLAN_NOT_CONFIGURED/i.test(code)) {
          msg = ar
            ? 'لا يوجد مزوّد ذكاء اصطناعي مُعد لهذا القسم. أضف وفعّل مفتاح مزوّد من لوحة الإدارة (إدارة Estate AI) لاستخدام هذه الميزة.'
            : 'No AI provider is configured for this section. Add and enable a provider key from the admin panel (Estate AI Management) to use this feature.';
        } else if (/PLAN_NO_PLAN/i.test(code)) {
          msg = ar
            ? 'لم يتم العثور على جدول دفعات في المستند.'
            : 'No payment table found in the document.';
        } else if (/PLAN_AI_TIMEOUT|PLAN_AI_NETWORK/i.test(code)) {
          msg = ar
            ? 'انتهت مهلة قراءة المستند. حاول مرة أخرى بملف أوضح.'
            : 'Document reading timed out. Try again with a clearer file.';
        } else if (/401|403|session|sign in/i.test(code)) {
          msg = ar
            ? 'انتهت الجلسة. سجّل الدخول ثم أعد المحاولة.'
            : 'Session expired. Sign in and try again.';
        } else {
          msg = ar
            ? 'تعذر قراءة المستند. تأكد من جودة الملف وحاول مرة أخرى.'
            : 'Could not read the document. Check file quality and try again.';
        }
      }
      // Append the REAL upstream reason (Anthropic error body, sanitized of
      // keys server-side) so the user sees the actual cause of a failure.
      const detail = String(e?.detail || '').trim();
      if (detail) {
        msg = `${msg}\n\n${ar ? 'السبب: ' : 'Reason: '}${detail}`;
      }
      setError(msg);
      pushMessage({ role: 'assistant', kind: 'text', content: msg });
      // A retry button only for failures a plain re-attempt can plausibly fix
      // (timeout/network/proxy hiccups, or an unclassified failure). Never for
      // "no provider configured" (needs an admin action, not a retry) or a
      // session/auth error (needs a re-login, not a retry) — retrying those
      // identically would just fail the same way again and mislead the user.
      const noRetryCode = /PLAN_NOT_CONFIGURED|401|403|session|sign in/i.test(code);
      if (!noRetryCode) {
        pushMessage({ role: 'assistant', kind: 'retry' });
      }
    } finally {
      setBusy(false);
    }
  };

  const retryLastExtraction = () => {
    if (busy || !lastRunRef.current) return;
    setMessages((prev) => prev.filter((m) => m.kind !== 'retry'));
    void runExtraction(lastRunRef.current.filesToUse, { isPlanOnly: lastRunRef.current.isPlanOnly });
  };

  const onUploadSubmit = () => {
    if (!files.length || busy) return;
    void runExtraction(files);
  };

  const onPlanPick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    void runExtraction(picked, { isPlanOnly: true });
  };

  const missingStarts = useMemo(() => {
    if (!extraction) return [];
    return findMissingStartPoints(extraction, startPoints);
  }, [extraction, startPoints]);

  const setStartPoint = (key, value) => {
    setStartPoints((prev) => ({ ...prev, [key]: toIsoDate(value) || '' }));
  };

  const finalInstallments = useMemo(() => {
    if (!extraction) return [];
    return buildFinalInstallments(extraction, startPoints);
  }, [extraction, startPoints]);

  const finalFees = useMemo(() => {
    if (!extraction) return [];
    return (extraction.fees || []).map((f) => {
      const rel = f.due_date_relative;
      if (rel && rel.offset_months != null) {
        const start =
          rel.to === 'booking_date' ? startPoints.bookingDate : startPoints.handoverDate;
        if (start) return { ...f, due_date: addMonthsIso(start, Number(rel.offset_months) || 0) };
        return { ...f, due_date: '' };
      }
      return { ...f, due_date: f.due_date ? toIsoDate(f.due_date) || '' : '' };
    });
  }, [extraction, startPoints]);

  const saveAll = async () => {
    if (!review || busy) return;
    if (missingStarts.length > 0) {
      setError(
        ar
          ? `من فضلك أدخل ${missingStarts.includes('booking_date') ? 'تاريخ الحجز' : 'تاريخ التسليم'} أولًا لحساب تواريخ الأقساط.`
          : `Please enter the ${missingStarts.includes('booking_date') ? 'booking date' : 'handover date'} first to compute installment dates.`,
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      const num = (v) => (v === '' || v == null ? '' : String(v));
      const rentingExisting = purchaseType === 'rented' && rentMode === 'existing' && selectedExistingProperty;

      let propId;
      if (rentingExisting) {
        // Renting a property the owner already has — never re-created, never
        // re-classified. Its type (cash/installment) and every other field
        // stay exactly as they were; only a tenancy gets linked to it.
        propId = selectedExistingProperty.id;
      } else {
        const propData = {
          owner: user.id,
          status: 'pending',
          // A property's cash/installment classification is permanent and is
          // never set to "rented" — being rented is a separate, additive
          // tenancy linked via property_id, not a type. A brand-new property
          // added straight into the rent flow defaults to "cash" (no ongoing
          // installment obligation known) unless the AI extraction found
          // installment data — see below.
          type: purchaseType === 'rented' ? 'cash' : purchaseType,
          usage_type: usageType,
          building: review.building || '',
          unit_number: review.unit_number || '',
          area: review.community || '',
          country: review.country || '',
          property_size: review.area_value || '',
          property_size_unit: review.area_unit || 'sqm',
          total_price: num(review.discounted_price || review.total_price),
          expected_handover_date: review.expected_handover_date || '',
          handover_status: review.handover_status || 'under_construction',
          developer: review.developer || '',
          financing_details: review.payment_method || '',
        };
        if (purchaseType !== 'installment') propData.total_paid = '0';

        const created = await pb.collection('properties').create(propData, {
          requestKey: `ai-prop-${Date.now()}`,
        });
        propId = created.id;
      }
      setSavedPropertyId(propId);

      if (purchaseType === 'installment' && finalInstallments.length > 0) {
        let planId = null;
        try {
          const planRec = await pb.collection('payment_plans').create(
            {
              property: propId,
              owner: user.id,
              plan_type: 'custom',
              currency: extraction?.schedule?.currency || null,
              total_price: num(review.discounted_price || review.total_price) || null,
              source: 'AI_IMPORT',
              stages: JSON.stringify([]),
              status: 'active',
            },
            { requestKey: `ai-plan-${propId}` },
          );
          planId = planRec?.id || null;
        } catch {
          /* best-effort */
        }

        await Promise.all(
          finalInstallments.map((row, i) =>
            pb.collection('payments').create(
              {
                property: propId,
                owner: user.id,
                kind: 'installment',
                label: `${ar ? 'القسط' : 'Installment'} ${row.number || i + 1}`,
                amount: row.amount != null ? String(row.amount) : '',
                due_date: row.due_date || '',
                status: 'upcoming',
                phase:
                  row.relative?.to === 'handover'
                    ? 'post_handover'
                    : i === 0
                      ? 'first_payment'
                      : 'pre_handover',
                percentage: row.percentage != null ? String(row.percentage) : null,
                note: row.name || '',
                relative_date: row.relative || null,
                plan_source: 'AI_IMPORT',
                payment_type: mapPaymentType(i === 0 ? 'down_payment' : 'installment'),
                raw_label: row.name || '',
                reminder_sent: false,
                ...(planId ? { payment_plan_id: planId } : {}),
              },
              { requestKey: `ai-pay-${propId}-${i}` },
            ),
          ),
        );
      }

      // ---- Rental (للإيجار): create tenant + tenancy + rent_payments (checks) ----
      // Linked to the property via property_id/owner_id — never a duplicate
      // property row and never a mutation of the property's own type.
      // payment_status "paid" (explicit evidence in the document) → status
      // "collected"; otherwise "pending". Amounts/dates come straight from
      // Claude's extraction — never fabricated. Rows without an amount or due
      // date are skipped so the checks list stays valid.
      if (purchaseType === 'rented') {
        const rentRows = (extraction?.payments || review?.payments || []).filter(
          (r) => r && r.amount != null && r.amount !== '' && r.due_date,
        );

        let tenantId = null;
        if (review.tenant_name || review.tenant_phone || review.tenant_email) {
          try {
            const tenantRec = await pb.collection('tenants').create(
              {
                owner: user.id,
                name: review.tenant_name || (ar ? 'مستأجر' : 'Tenant'),
                phone: review.tenant_phone || '',
                email: review.tenant_email || '',
                nationality: review.tenant_nationality || '',
              },
              { requestKey: `ai-tenant-${propId}` },
            );
            tenantId = tenantRec?.id || null;
          } catch {
            /* best-effort — the tenancy still records the snapshot fields below */
          }
        }

        const tenancyRec = await pb.collection('tenancies').create(
          {
            property: propId,
            owner: user.id,
            ...(tenantId ? { tenant: tenantId } : {}),
            tenant_name: review.tenant_name || '',
            tenant_phone: review.tenant_phone || '',
            tenant_email: review.tenant_email || '',
            tenant_nationality: review.tenant_nationality || '',
            start_date: review.contract_start_date || '',
            end_date: review.contract_end_date || '',
            security_deposit: Number(review.security_deposit) || 0,
            payments_count: rentRows.length,
            status: 'active',
          },
          { requestKey: `ai-tenancy-${propId}` },
        );

        await Promise.all(
          rentRows.map((row, i) =>
            pb.collection('rent_payments').create(
              {
                tenancy: tenancyRec.id,
                property: propId,
                owner: user.id,
                check_number: row.cheque_number && !Number.isNaN(Number(row.cheque_number))
                  ? Number(row.cheque_number)
                  : null,
                amount: String(row.amount),
                due_date: row.due_date || '',
                status: row.payment_status === 'paid' ? 'collected' : 'pending',
                note: [
                  row.payment_type || '',
                  row.cheque_number ? `${ar ? 'شيك' : 'cheque'} ${row.cheque_number}` : '',
                  row.bank_name || '',
                  row.notes || '',
                ].filter(Boolean).join(' · '),
              },
              { requestKey: `ai-rent-${propId}-${i}` },
            ),
          ),
        );
      }

      // Auto-name each uploaded document with a compact slug built from the
      // property's building + unit + country (e.g. "BARARIGATE-B402-UAE").
      // The building and unit come from the contract-extracted data; the
      // country comes from the manually-selected property country. The
      // original file name is appended for uniqueness so multiple files keep
      // distinct names. The document is INDEXED (linked via the `property`
      // relation) — the file itself is never copied.
      const slugPart = (s) =>
        String(s || '')
          .trim()
          .replace(/\s+/g, '')
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase();
      const docSlug = [
        slugPart(review.building),
        slugPart(review.unit_number),
        slugPart(review.country),
      ]
        .filter(Boolean)
        .join('-');
      const category =
        purchaseType === 'rented'
          ? 'rental'
          : purchaseType === 'installment'
            ? 'installment'
            : 'ownership';
      const cloudReady = await isCloudinaryConfigured().catch(() => false);
      const allFiles = files;
      await Promise.all(
        allFiles.map(async (file, i) => {
          try {
            const fd = new FormData();
            fd.append('owner', user.id);
            fd.append(
              'name',
              docSlug
                ? `${docSlug} - ${file.name || `file-${i + 1}`}`
                : (file.name || (ar ? 'عقار جديد' : 'New property')),
            );
            fd.append('category', category);
            fd.append('property', propId);
            if (cloudReady) {
              const up = await uploadToCloudinary(file);
              if (up?.url) fd.append('file_url', up.url);
              else fd.append('file', file);
            } else {
              fd.append('file', file);
            }
            await pb.collection('owner_documents').create(fd, {
              requestKey: `ai-doc-${propId}-${i}`,
            });
          } catch (e) {
            console.warn('AI doc export failed', e);
          }
        }),
      );

      pushMessage({
        role: 'assistant',
        kind: 'done',
        content: rentingExisting
          ? (ar
            ? `تم تأجير العقار بنجاح! ستجد بيانات المستأجر والشيكات في صفحة العقار، والمستندات (${allFiles.length}) في «مستنداتي». لم يتم تكرار بيانات العقار.`
            : `Property rented successfully! Tenant data and checks now appear on the property's page, and ${allFiles.length} document(s) in "My Documents". The property's own data was never duplicated.`)
          : (ar
            ? `تمت إضافة العقار بنجاح! سيظهر في لوحة التحكم وقسم المستندات بعد اعتماده. تم ترحيل ${allFiles.length} مستند إلى قسم المستندات.`
            : `Property added successfully! It will appear in your dashboard and Documents section once approved. ${allFiles.length} document(s) were exported to the Documents section.`),
      });
      onSaved?.();
    } catch (err) {
      const rawMsg = String(err?.response?.message || err?.message || '');
      if (rawMsg.includes('property_limit_reached') || rawMsg.includes('subscription_expired')) {
        setError(
          ar
            ? 'وصلت للحد الأقصى من العقارات في باقتك. ترقَّ باقتك من صفحة الاشتراك لإضافة عقارات جديدة.'
            : 'You have reached your property limit. Upgrade from the Subscription page to add more.',
        );
      } else {
        const data = err?.response?.data;
        let msg = rawMsg;
        if (data && typeof data === 'object') {
          const parts = Object.entries(data).map(
            ([f, info]) => `${f}: ${info?.message || info?.code || ''}`,
          );
          if (parts.length) msg = parts.join(' · ');
        }
        setError(
          msg || (ar ? 'تعذر حفظ العقار. حاول مرة أخرى.' : 'Could not save the property. Try again.'),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setPurchaseType('');
    setUsageType('');
    setFiles([]);
    setExtraction(null);
    setStartPoints({ bookingDate: '', handoverDate: '' });
    setError('');
    setReview(null);
    setShowAllInstallments(false);
    setSavedPropertyId(null);
    setDraft('');
    setExtractProgress(null);
    setRentMode('');
    setExistingProperties([]);
    setExistingPropSearch('');
    setSelectedExistingProperty(null);
  };

  /** Composer: free-text nudges the guided flow without changing Claude logic. */
  const sendDraft = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    if (!purchaseType) {
      pushMessage({ role: 'user', content: text });
      pushAssistantReply(
        ar
          ? 'ابدأ باختيار طريقة الشراء من الأزرار بالأعلى (كاش / تقسيط / مؤجّر).'
          : 'Start by choosing a purchase method from the buttons above (Cash / Installment / Rented).',
      );
      return;
    }
    if (!usageType) {
      pushMessage({ role: 'user', content: text });
      pushAssistantReply(
        ar
          ? 'اختر نوع الاستخدام من الصف الثاني (سكني / تجاري / أرض).'
          : 'Pick a usage type from the second row (Residential / Commercial / Land).',
      );
      return;
    }
    pushMessage({ role: 'user', content: text });
    pushAssistantReply(
      ar
        ? 'ارفع مستند العقد من بطاقة الرفع في المحادثة، أو أرفق ملفًا من زر المرفقات بالأسفل.'
        : 'Upload the contract from the upload card in the chat, or attach a file with the paperclip below.',
    );
  };

  const onComposerKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendDraft();
    }
  };

  const visibleInstallments = showAllInstallments
    ? finalInstallments
    : finalInstallments.slice(0, PREVIEW_COUNT);
  const hiddenCount = finalInstallments.length - visibleInstallments.length;

  // Header (4rem) + owner bottom nav on mobile (~3.5rem). Desktop: header only.
  const shellClass =
    'flex flex-col bg-background w-full overflow-hidden ' +
    'h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] ' +
    'max-lg:h-[calc(100dvh-4rem-3.5rem-env(safe-area-inset-bottom,0px))] ' +
    'max-lg:max-h-[calc(100dvh-4rem-3.5rem-env(safe-area-inset-bottom,0px))]';

  return (
    <div className={shellClass}>
      <Helmet>
        <title>إضافة عقار بالذكاء الاصطناعي — Estate Follow | AI Property Creator</title>
        <meta
          name="description"
          content="أضف عقارك من المستند مباشرة باستخدام Claude AI — استخراج ذكي للبيانات وجدول الأقساط"
        />
      </Helmet>

      {/* Filter chips — same mobile proportions, responsive on desktop */}
      <div className="shrink-0 border-b border-border/60 bg-background px-3 pt-3 pb-2.5 sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl flex items-stretch gap-1 sm:gap-1.5 md:gap-2">
          <div className="flex-1 flex flex-col gap-1 sm:gap-1.5 min-w-0">
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5 md:gap-2">
              {PURCHASE_OPTIONS.map((o) => {
                const selected = purchaseType === o.key;
                const Icon = o.icon;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => choosePurchase(o.key)}
                    disabled={busy}
                    className={cn(
                      'inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-full border px-1.5 py-1.5 sm:px-2 sm:py-2 md:px-2.5 md:py-2.5 text-xs sm:text-[13px] md:text-sm font-bold transition-all min-h-[40px] sm:min-h-[42px] md:min-h-[44px] active:scale-[0.98] disabled:cursor-not-allowed',
                      selected
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card text-foreground border-border hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50',
                    )}
                  >
                    <Icon
                      size={14}
                      strokeWidth={2}
                      className={cn(
                        'shrink-0',
                        selected ? 'text-primary-foreground' : 'text-primary',
                      )}
                    />
                    <span className="leading-tight text-center truncate">
                      {ar ? o.short_ar : o.short_en}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5 md:gap-2">
              {USAGE_OPTIONS.map((o) => {
                const selected = usageType === o.key;
                const Icon = o.icon;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => chooseUsage(o.key)}
                    disabled={busy || !purchaseType}
                    className={cn(
                      'inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-full border px-1.5 py-1.5 sm:px-2 sm:py-2 md:px-2.5 md:py-2.5 text-xs sm:text-[13px] md:text-sm font-bold transition-all min-h-[40px] sm:min-h-[42px] md:min-h-[44px] active:scale-[0.98] disabled:cursor-not-allowed',
                      selected
                        ? 'bg-primary/15 text-primary border-primary/30 shadow-sm'
                        : 'bg-card text-foreground border-border hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50',
                    )}
                  >
                    <Icon
                      size={14}
                      strokeWidth={2}
                      className={cn(
                        'shrink-0',
                        selected ? 'text-primary' : 'text-primary/80',
                      )}
                    />
                    <span className="leading-tight text-center truncate">
                      {ar ? o.ar : o.en}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            title={ar ? 'بدء من جديد' : 'Start over'}
            aria-label={ar ? 'بدء من جديد' : 'Start over'}
            className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-border bg-card px-2.5 sm:px-3 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50 min-h-[48px] self-stretch min-w-[44px]"
          >
            <RotateCw size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {configured === false && (
        <div className="mx-3 mt-2 sm:mx-4 md:mx-6 lg:mx-8 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            {ar
              ? 'لا يوجد مزوّد ذكاء اصطناعي مُعد لهذا القسم. أضف وفعّل مفتاح مزوّد من لوحة الإدارة (إدارة Estate AI) لاستخدام هذه الميزة.'
              : 'No AI provider is configured for this section. Add and enable a provider key from the admin panel (Estate AI Management) to use this feature.'}
          </span>
        </div>
      )}

      {/* Chat transcript */}
      <div
        ref={scrollRef}
        className="ef-chat-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 md:px-6 lg:px-8 space-y-3.5 bg-background"
      >
        <div className="mx-auto w-full max-w-3xl space-y-3.5">
          {messages.length === 0 && !purchaseType && (
            <div className="flex items-end gap-2 justify-start">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                <Sparkles size={15} />
              </span>
              <div
                className="max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-es-md border border-border/80 bg-card px-3.5 py-2.5 text-[15px] sm:text-sm leading-relaxed text-foreground shadow-sm"
                dir={ar ? 'rtl' : 'ltr'}
              >
                {ar
                  ? 'أهلًا! أنا Estate AI، هساعدك تضيف عقارك في أقل من دقيقة من مستند واحد بس. اختر طريقة الشراء من الأزرار بالأعلى (كاش / تقسيط / مؤجّر) عشان نبدأ.'
                  : "Hi! I'm Estate AI — I can add your property from a single document in under a minute. Choose a purchase method from the buttons above (Cash / Installment / Rented) to get started."}
              </div>
            </div>
          )}
          {messages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={idx}
                className={cn('flex items-end gap-2', isUser ? 'justify-end' : 'justify-start')}
              >
                {!isUser && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Sparkles size={15} />
                  </span>
                )}
                <div
                  className={cn(
                    'max-w-[92%] sm:max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] sm:text-sm leading-relaxed whitespace-pre-line shadow-sm',
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-ee-md'
                      : 'bg-card border border-border/80 text-foreground rounded-es-md',
                  )}
                  dir={ar ? 'rtl' : 'ltr'}
                >
                  {m.kind === 'typing' && <TypingDots />}
                  {m.kind === 'extracting' && (
                    <ExtractingView ar={ar} info={extractProgress} />
                  )}
                  {m.kind === 'partial-warning' && (
                    <div className="flex items-start gap-2 text-amber-800">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <span>{m.content}</span>
                    </div>
                  )}
                  {m.kind === 'retry' && (
                    <button
                      type="button"
                      onClick={retryLastExtraction}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-semibold hover:bg-accent transition-colors disabled:opacity-50 min-h-[36px]"
                    >
                      <RotateCw size={13} className="text-primary" />
                      {ar ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                  )}
                  {m.kind === 'upload' && (
                    <UploadCard
                      ar={ar}
                      files={files}
                      onPick={onPickFiles}
                      onRemove={removeFile}
                      fileRef={fileRef}
                      onSubmit={onUploadSubmit}
                      busy={busy}
                    />
                  )}
                  {m.kind === 'rent-source-select' && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => chooseRentSource('existing')}
                        disabled={busy || !!rentMode}
                        className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-semibold hover:bg-accent transition-colors disabled:opacity-50 min-h-[36px]"
                      >
                        <Building2 size={13} className="text-primary" />
                        {ar ? 'عقار موجود في عقاراتي' : 'Existing property'}
                      </button>
                      <button
                        type="button"
                        onClick={() => chooseRentSource('new')}
                        disabled={busy || !!rentMode}
                        className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-semibold hover:bg-accent transition-colors disabled:opacity-50 min-h-[36px]"
                      >
                        <Sparkles size={13} className="text-primary" />
                        {ar ? 'عقار جديد بالكامل' : 'Brand new property'}
                      </button>
                    </div>
                  )}
                  {m.kind === 'rent-property-picker' && !selectedExistingProperty && (
                    <div className="mt-1 space-y-2">
                      <div className="relative">
                        <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={existingPropSearch}
                          onChange={(e) => setExistingPropSearch(e.target.value)}
                          placeholder={ar ? 'ابحث بالاسم أو رقم الوحدة' : 'Search by building or unit'}
                          className="h-9 text-xs ps-8"
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-1.5">
                        {existingProperties
                          .filter((p) => {
                            const q = existingPropSearch.trim().toLowerCase();
                            if (!q) return true;
                            return (
                              String(p.building || '').toLowerCase().includes(q) ||
                              String(p.unit_number || '').toLowerCase().includes(q)
                            );
                          })
                          .map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => pickExistingProperty(p)}
                              disabled={busy}
                              className="flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-start text-xs hover:bg-accent transition-colors disabled:opacity-50"
                            >
                              <Building2 size={13} className="shrink-0 text-primary" />
                              <span className="truncate">
                                <b>{p.building || (ar ? 'بدون اسم' : 'Untitled')}</b>
                                {p.unit_number ? ` · ${p.unit_number}` : ''}
                                {p.country ? ` · ${p.country}` : ''}
                              </span>
                            </button>
                          ))}
                        {existingProperties.length === 0 && (
                          <p className="text-xs text-muted-foreground py-2">
                            {ar
                              ? 'لا يوجد عقار كاش/أقساط بعد. اختر «عقار جديد بالكامل» بدلًا من ذلك.'
                              : 'No cash/installment property yet. Choose "Brand new property" instead.'}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {m.kind === 'plan-upload' && (
                    <div className="mt-1 space-y-2">
                      <PlanUploadCard
                        ar={ar}
                        onPick={onPlanPick}
                        fileRef={planFileRef}
                        busy={busy}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setMessages((prev) => prev.filter((x) => x.kind !== 'plan-upload'));
                          pushMessage({
                            role: 'user',
                            content: ar ? 'متابعة بدون جدول أقساط' : 'Continue without a schedule',
                          });
                          pushMessage({ role: 'assistant', kind: 'review' });
                        }}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50 min-h-[36px]"
                      >
                        {ar ? 'متابعة بدون جدول أقساط' : 'Continue without a schedule'}
                      </button>
                    </div>
                  )}
                  {m.kind === 'review' && review && (
                    <ReviewCard
                      ar={ar}
                      lang={lang}
                      review={review}
                      setReview={setReview}
                      extraction={extraction}
                      finalInstallments={finalInstallments}
                      finalFees={finalFees}
                      visibleInstallments={visibleInstallments}
                      hiddenCount={hiddenCount}
                      showAll={showAllInstallments}
                      setShowAll={setShowAllInstallments}
                      missingStarts={missingStarts}
                      startPoints={startPoints}
                      setStartPoint={setStartPoint}
                      purchaseType={purchaseType}
                      onSave={saveAll}
                      busy={busy}
                      saved={!!savedPropertyId}
                      aiReview={review.aiReview}
                    />
                  )}
                  {m.kind === 'rental-review' && review && (
                    <RentalReviewCard
                      ar={ar}
                      lang={lang}
                      review={review}
                      setReview={setReview}
                      onSave={saveAll}
                      busy={busy}
                      saved={!!savedPropertyId}
                      aiReview={review.aiReview}
                      existingProperty={selectedExistingProperty}
                    />
                  )}
                  {m.kind === 'done' && (
                    <div className="flex items-start gap-2 text-emerald-700">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                      <span>{m.content}</span>
                    </div>
                  )}
                  {(!m.kind || m.kind === 'text') && (m.content || '')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mx-3 mb-1 sm:mx-4 md:mx-6 lg:mx-8 shrink-0 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Composer — WhatsApp-style input bar */}
      <div className="shrink-0 border-t border-border/70 bg-card px-3 py-2.5 sm:px-4 md:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl flex items-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              if (messages.some((m) => m.kind === 'plan-upload')) {
                planFileRef.current?.click();
              } else {
                fileRef.current?.click();
              }
            }}
            disabled={busy || !purchaseType || !usageType}
            title={ar ? 'إرفاق مستند' : 'Attach document'}
            aria-label={ar ? 'إرفاق مستند' : 'Attach document'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Paperclip size={18} strokeWidth={2} />
          </button>
          <div className="flex-1 min-w-0 rounded-full border border-border bg-background px-3.5 py-1.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30 transition-shadow">
            <input
              ref={composerRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onComposerKey}
              disabled={busy}
              placeholder={
                ar ? 'اكتب رسالة…' : 'Type a message…'
              }
              className="w-full bg-transparent border-0 outline-none ring-0 focus:outline-none focus:ring-0 text-[15px] sm:text-sm text-foreground placeholder:text-muted-foreground min-h-[36px] py-1"
              dir={ar ? 'rtl' : 'ltr'}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={sendDraft}
            disabled={busy || !draft.trim()}
            title={ar ? 'إرسال' : 'Send'}
            aria-label={ar ? 'إرسال' : 'Send'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.96]"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} strokeWidth={2} className={ar ? 'rtl:rotate-180' : ''} />
            )}
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_FILES}
        multiple
        className="hidden"
        onChange={onPickFiles}
      />
      <input
        ref={planFileRef}
        type="file"
        accept={ACCEPT_FILES}
        multiple
        className="hidden"
        onChange={onPlanPick}
      />
    </div>
  );
};

/* ---------- Extracting (multi-batch progress) view ---------- */
function ExtractingView({ ar, info }) {
  const stage = info?.stage || (ar ? 'جاري قراءة المستند واستخراج البيانات…' : 'Reading document and extracting data…');
  const progress = Number(info?.progress) || 0;
  const batchCurrent = Number(info?.batch_current) || 0;
  const batchTotal = Number(info?.batch_total) || 0;
  const labels = Array.isArray(info?.batch_labels) ? info.batch_labels : [];
  const multi = batchTotal > 1;

  // Live elapsed-time counter — a multi-batch document (or a slow provider
  // response) can take well over a minute; a bare spinner with no sense of
  // time passing reads as stuck. Purely local to this view (mounted only
  // while the "extracting" message is shown, unmounted the moment it's
  // filtered out on success/failure), so it needs no wiring into the polling
  // logic in aiPropertyExtract.js.
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const elapsedLabel = elapsedSec >= 60
    ? `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`
    : `${elapsedSec}s`;

  return (
    <div className="mt-1 space-y-2.5">
      <div className="flex items-center gap-2">
        <Loader2 size={15} className="animate-spin text-primary shrink-0" />
        <span className="leading-snug flex-1">{stage}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dir="ltr">
          {elapsedLabel}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
        />
      </div>

      {/* Per-batch checklist (only when the document was split into batches) */}
      {multi && labels.length > 0 && (
        <div className="space-y-1 pt-0.5">
          {labels.map((label, i) => {
            const idx = i + 1;
            const done = batchCurrent > idx || info?.status === 'completed';
            const current = batchCurrent === idx && info?.status !== 'completed';
            return (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-1.5 text-[11px] leading-snug',
                  done ? 'text-emerald-700' : current ? 'text-primary font-semibold' : 'text-muted-foreground',
                )}
              >
                {done ? (
                  <CheckCircle2 size={12} className="shrink-0" />
                ) : current ? (
                  <Loader2 size={12} className="shrink-0 animate-spin" />
                ) : (
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-current opacity-50" />
                )}
                <span className="truncate">{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Typing indicator (brief, before a guided-flow reply) ---------- */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
    </div>
  );
}

/* ---------- Upload card ---------- */
function UploadCard({ ar, files, onPick, onRemove, fileRef, onSubmit, busy }) {
  return (
    <div className="mt-1 space-y-2.5">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="w-full inline-flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/30 bg-background px-4 py-2.5 text-sm hover:border-primary/60 hover:bg-primary/5 transition-colors disabled:opacity-50 min-h-[60px]"
      >
        <span className="flex items-center gap-1.5">
          <Upload size={17} className="text-primary" />
          <span className="font-medium">
            {ar ? 'اضغط لرفع المستند (PDF أو صورة)' : 'Tap to upload the document (PDF or image)'}
          </span>
        </span>
        <span className="text-[11px] text-muted-foreground">
          {ar ? 'يمكنك رفع عدة صفحات' : 'You can upload multiple pages'}
        </span>
      </button>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2"
            >
              <Paperclip size={14} className="text-primary shrink-0" />
              <span className="flex-1 min-w-0 truncate text-xs">{f.name}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={busy}
                className="text-destructive hover:opacity-70 disabled:opacity-30"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <Button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="w-full min-h-[44px] gap-2 font-bold"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
          {ar ? 'ابدأ القراءة والاستخراج' : 'Start reading & extracting'}
        </Button>
      )}
    </div>
  );
}

function PlanUploadCard({ ar, onPick, fileRef, busy }) {
  return (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={busy}
      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/30 bg-background px-4 py-2.5 text-sm hover:border-primary/60 hover:bg-primary/5 transition-colors disabled:opacity-50 min-h-[52px]"
    >
      <Upload size={16} className="text-primary" />
      <span className="font-medium">
        {ar ? 'ارفع خطة الدفع (PDF أو صورة)' : 'Upload the payment plan (PDF or image)'}
      </span>
    </button>
  );
}

/* ---------- Rental review card (للإيجار) ---------- */
function RentalReviewCard({ ar, lang, review, setReview, onSave, busy, saved, aiReview, existingProperty }) {
  // Unified geo source (PocketBase platform_countries + static fallback) —
  // not a private country list — so Super Admin edits show up here too.
  const { countries } = useGeoData();
  const update = (k, v) => setReview((p) => ({ ...p, [k]: v }));
  const payments = Array.isArray(review.payments) ? review.payments : [];
  const visiblePayments = payments.slice(0, PREVIEW_COUNT);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? payments : visiblePayments;
  const hiddenCount = payments.length - shown.length;
  const docType = review.document_type;

  return (
    <div className="mt-1 space-y-3 text-start">
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <CheckCircle2 size={15} className="text-primary" />
        {ar ? 'مراجعة بيانات عقد الإيجار' : 'Review lease data'}
      </div>

      {docType && (
        <p className="text-[11px] text-muted-foreground">
          {ar ? 'نوع المستند المكتشف' : 'Detected document type'}: <b>{docType}</b>
        </p>
      )}

      <PartialExtractionBanner ar={ar} partialInfo={review.partialInfo} />

      <AiReviewSummary ar={ar} aiReview={aiReview} />

      {existingProperty ? (
        // Renting an EXISTING property — its data is never re-collected or
        // re-editable here; only a read-only summary is shown so the user can
        // confirm it's the right property before continuing to lease data.
        <div className="rounded-lg border bg-primary/5 p-3 space-y-1">
          <p className="text-xs font-bold flex items-center gap-1.5">
            <Building2 size={13} className="text-primary" />{' '}
            {ar ? 'العقار المختار (لن يتم تكرار بياناته)' : 'Selected property (its data will not be duplicated)'}
          </p>
          <p className="text-sm">
            <b>{existingProperty.building || '—'}</b>
            {existingProperty.unit_number ? ` · ${existingProperty.unit_number}` : ''}
            {existingProperty.country ? ` · ${existingProperty.country}` : ''}
          </p>
        </div>
      ) : (
      /* Property data */
      <div className="rounded-lg border bg-background/60 p-3 space-y-2.5">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Building2 size={13} className="text-primary" />{' '}
          {ar ? 'بيانات العقار' : 'Property data'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <ReviewField
            label={ar ? 'اسم المشروع/البناية' : 'Project/Building'}
            value={review.building}
            onChange={(v) => update('building', v)}
          />
          <ReviewField
            label={ar ? 'رقم الوحدة' : 'Unit number'}
            value={review.unit_number}
            onChange={(v) => update('unit_number', v)}
          />
          <ReviewField
            label={ar ? 'نوع العقار' : 'Property type'}
            value={review.property_type}
            onChange={(v) => update('property_type', v)}
          />
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-muted-foreground">
              {ar ? 'المساحة' : 'Area'}
            </Label>
            <div className="flex gap-1.5">
              <Input
                value={review.area_value}
                onChange={(e) => update('area_value', e.target.value)}
                className="h-9 text-xs flex-1"
                dir="ltr"
              />
              <Select value={review.area_unit} onValueChange={(v) => update('area_unit', v)}>
                <SelectTrigger className="h-9 text-xs w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sqm">{ar ? 'م²' : 'sqm'}</SelectItem>
                  <SelectItem value="sqft">{ar ? 'قدم²' : 'sqft'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ReviewField
            label={ar ? 'المنطقة/المجتمع' : 'Area/Community'}
            value={review.community}
            onChange={(v) => update('community', v)}
          />
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-muted-foreground">
              {ar ? 'الدولة' : 'Country'}
            </Label>
            <Select
              value={review.country || 'none'}
              onValueChange={(v) => update('country', v === 'none' ? '' : v)}
            >
              <SelectTrigger className="h-9 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{ar ? 'اختر الدولة' : 'Select country'}</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {ar ? c.ar : c.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ReviewField
            label={ar ? 'المالك/الشركة المُؤجِّرة' : 'Landlord/Company'}
            value={review.developer}
            onChange={(v) => update('developer', v)}
          />
        </div>
      </div>
      )}

      {/* Lease contract data */}
      <div className="rounded-lg border bg-background/60 p-3 space-y-2.5">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <KeyRound size={13} className="text-primary" />{' '}
          {ar ? 'بيانات عقد الإيجار' : 'Lease contract data'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <ReviewField
            label={ar ? 'اسم المستأجر' : 'Tenant name'}
            value={review.tenant_name}
            onChange={(v) => update('tenant_name', v)}
          />
          <ReviewField
            label={ar ? 'هاتف المستأجر' : 'Tenant phone'}
            value={review.tenant_phone}
            onChange={(v) => update('tenant_phone', v)}
            dir="ltr"
          />
          <ReviewField
            label={ar ? 'بريد المستأجر' : 'Tenant email'}
            value={review.tenant_email}
            onChange={(v) => update('tenant_email', v)}
            dir="ltr"
          />
          <ReviewField
            label={ar ? 'جنسية المستأجر' : 'Tenant nationality'}
            value={review.tenant_nationality}
            onChange={(v) => update('tenant_nationality', v)}
          />
          <ReviewField
            label={ar ? 'مدة العقد' : 'Contract duration'}
            value={review.contract_duration}
            onChange={(v) => update('contract_duration', v)}
          />
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-muted-foreground">
              {ar ? 'تاريخ بداية العقد' : 'Contract start date'}
            </Label>
            <Input
              type="date"
              value={review.contract_start_date}
              onChange={(e) => update('contract_start_date', e.target.value)}
              className="h-9 text-xs"
              dir="ltr"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-muted-foreground">
              {ar ? 'تاريخ نهاية العقد' : 'Contract end date'}
            </Label>
            <Input
              type="date"
              value={review.contract_end_date}
              onChange={(e) => update('contract_end_date', e.target.value)}
              className="h-9 text-xs"
              dir="ltr"
            />
          </div>
          <ReviewMoneyField
            label={ar ? 'الإيجار السنوي' : 'Annual rent'}
            value={review.annual_rent}
            onChange={(v) => update('annual_rent', v)}
            dir="ltr"
          />
          <ReviewMoneyField
            label={ar ? 'الإيجار الإجمالي' : 'Total rent'}
            value={review.total_rent}
            onChange={(v) => update('total_rent', v)}
            dir="ltr"
          />
          <ReviewMoneyField
            label={ar ? 'التأمين' : 'Security deposit'}
            value={review.security_deposit}
            onChange={(v) => update('security_deposit', v)}
            dir="ltr"
          />
          <ReviewMoneyField
            label={ar ? 'رسوم الإدارة' : 'Management fee'}
            value={review.management_fee}
            onChange={(v) => update('management_fee', v)}
            dir="ltr"
          />
          <ReviewField
            label={ar ? 'العملة' : 'Currency'}
            value={review.currency}
            onChange={(v) => update('currency', v)}
            dir="ltr"
          />
        </div>
        {review.other_fees && review.other_fees.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-semibold text-muted-foreground">
              {ar ? 'رسوم أخرى' : 'Other fees'}
            </p>
            {review.other_fees.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 text-xs border-b border-dashed py-1"
              >
                <span className="text-muted-foreground">{f.name || (ar ? 'رسوم' : 'Fee')}</span>
                <span className="font-semibold tabular-nums" dir="ltr">
                  {f.amount != null ? fmtMoney(f.amount, lang) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payments / cheques table */}
      <div className="rounded-lg border bg-background/60 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold">
            {ar
              ? `جدول الدفعات/الشيكات (${payments.length})`
              : `Payments / cheques (${payments.length})`}
          </p>
          {payments.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80"
            >
              {showAll ? (
                <>
                  <ChevronUp size={12} /> {ar ? 'عرض أقل' : 'Show less'}
                </>
              ) : (
                <>
                  <ChevronDown size={12} />{' '}
                  {ar ? `عرض المزيد (${hiddenCount})` : `Show more (${hiddenCount})`}
                </>
              )}
            </button>
          )}
        </div>
        {payments.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {ar
              ? 'لم يُعثر على جدول دفعات/شيكات في المستند. يمكنك المتابعة بدون جدول.'
              : 'No payment/cheque schedule found in the document. You can continue without one.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="py-1.5 px-1.5 text-start font-semibold">#</th>
                  <th className="py-1.5 px-1.5 text-start font-semibold">
                    {ar ? 'النوع' : 'Type'}
                  </th>
                  <th className="py-1.5 px-1.5 text-start font-semibold">
                    {ar ? 'المبلغ' : 'Amount'}
                  </th>
                  <th className="py-1.5 px-1.5 text-start font-semibold">
                    {ar ? 'تاريخ' : 'Date'}
                  </th>
                  <th className="py-1.5 px-1.5 text-start font-semibold">
                    {ar ? 'الحالة' : 'Status'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i} className="border-b border-dashed">
                    <td className="py-1.5 px-1.5 tabular-nums">{r.payment_number || i + 1}</td>
                    <td className="py-1.5 px-1.5">
                      {r.payment_type || '—'}
                      {r.cheque_number ? (
                        <span className="block text-[10px] text-muted-foreground" dir="ltr">
                          {r.cheque_number}
                          {r.bank_name ? ` · ${r.bank_name}` : ''}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 px-1.5 tabular-nums" dir="ltr">
                      {r.amount != null ? fmtMoney(r.amount, lang) : '—'}
                    </td>
                    <td className="py-1.5 px-1.5 tabular-nums" dir="ltr">
                      {r.due_date ? formatDate(r.due_date, lang) : '—'}
                    </td>
                    <td className="py-1.5 px-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                          r.payment_status === 'paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700',
                        )}
                      >
                        {r.payment_status === 'paid'
                          ? (ar ? 'مدفوع' : 'Paid')
                          : (ar ? 'غير مدفوع' : 'Unpaid')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!saved && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="flex-1 min-h-[48px] gap-2 font-bold"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <CheckCircle2 size={18} />
            )}
            {ar ? 'تأكيد وإضافة العقار' : 'Confirm & add property'}
          </Button>
        </div>
      )}
      {saved && (
        <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          {ar ? 'تمت إضافة العقار بنجاح.' : 'Property added successfully.'}
        </p>
      )}
    </div>
  );
}

/* ---------- Review card ---------- */
function ReviewCard({
  ar,
  lang,
  review,
  setReview,
  extraction,
  finalInstallments,
  finalFees,
  visibleInstallments,
  hiddenCount,
  showAll,
  setShowAll,
  missingStarts,
  startPoints,
  setStartPoint,
  purchaseType,
  onSave,
  busy,
  saved,
  aiReview,
}) {
  // Unified geo source (PocketBase platform_countries + static fallback) —
  // not a private country list — so Super Admin edits show up here too.
  const { countries } = useGeoData();
  const update = (k, v) => setReview((p) => ({ ...p, [k]: v }));
  const MoneyReviewField = purchaseType === 'installment' ? ReviewMoneyField : ReviewField;
  const scheduleFound = extraction?.schedule?.found && finalInstallments.length > 0;
  const docType = extraction?.document_type;

  return (
    <div className="mt-1 space-y-3 text-start">
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <CheckCircle2 size={15} className="text-primary" />
        {ar ? 'مراجعة البيانات المستخرجة' : 'Review extracted data'}
      </div>

      {docType && (
        <p className="text-[11px] text-muted-foreground">
          {ar ? 'نوع المستند المكتشف' : 'Detected document type'}: <b>{docType}</b>
        </p>
      )}

      <PartialExtractionBanner ar={ar} partialInfo={review.partialInfo} />

      <AiReviewSummary ar={ar} aiReview={aiReview} />

      <div className="rounded-lg border bg-background/60 p-3 space-y-2.5">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Building2 size={13} className="text-primary" />{' '}
          {ar ? 'بيانات العقار' : 'Property data'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <ReviewField
            label={ar ? 'اسم المشروع/البناية' : 'Project/Building'}
            value={review.building}
            onChange={(v) => update('building', v)}
          />
          <ReviewField
            label={ar ? 'رقم الوحدة' : 'Unit number'}
            value={review.unit_number}
            onChange={(v) => update('unit_number', v)}
          />
          <ReviewField
            label={ar ? 'نوع العقار' : 'Property type'}
            value={review.property_type}
            onChange={(v) => update('property_type', v)}
          />
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-muted-foreground">
              {ar ? 'المساحة' : 'Area'}
            </Label>
            <div className="flex gap-1.5">
              <Input
                value={review.area_value}
                onChange={(e) => update('area_value', e.target.value)}
                className="h-9 text-xs flex-1"
                dir="ltr"
              />
              <Select value={review.area_unit} onValueChange={(v) => update('area_unit', v)}>
                <SelectTrigger className="h-9 text-xs w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sqm">{ar ? 'م²' : 'sqm'}</SelectItem>
                  <SelectItem value="sqft">{ar ? 'قدم²' : 'sqft'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ReviewField
            label={ar ? 'المنطقة/المجتمع' : 'Community'}
            value={review.community}
            onChange={(v) => update('community', v)}
          />
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-muted-foreground">
              {ar ? 'الدولة' : 'Country'}
            </Label>
            <Select
              value={review.country || 'none'}
              onValueChange={(v) => update('country', v === 'none' ? '' : v)}
            >
              <SelectTrigger className="h-9 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{ar ? 'اختر الدولة' : 'Select country'}</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {ar ? c.ar : c.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <MoneyReviewField
            label={ar ? 'السعر الإجمالي' : 'Total price'}
            value={review.total_price}
            onChange={(v) => update('total_price', v)}
            dir="ltr"
          />
          {review.original_price && Number(review.original_price) > 0 && (
            <MoneyReviewField
              label={ar ? 'السعر قبل الخصم' : 'Original price'}
              value={review.original_price}
              onChange={(v) => update('original_price', v)}
              dir="ltr"
            />
          )}
          {review.discounted_price && Number(review.discounted_price) > 0 && (
            <MoneyReviewField
              label={ar ? 'السعر بعد الخصم' : 'Discounted price'}
              value={review.discounted_price}
              onChange={(v) => update('discounted_price', v)}
              dir="ltr"
            />
          )}
          {review.discount_percentage && Number(review.discount_percentage) > 0 && (
            <ReviewField
              label={ar ? 'نسبة الخصم (%)' : 'Discount %'}
              value={review.discount_percentage}
              onChange={(v) => update('discount_percentage', v)}
              dir="ltr"
            />
          )}
          {purchaseType === 'installment' ? (
            <DateField
              label={ar ? 'تاريخ التسليم المتوقع' : 'Expected delivery'}
              value={review.expected_handover_date || ''}
              onChange={(v) => update('expected_handover_date', v)}
              heightClass="min-h-[36px]"
            />
          ) : (
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground">
                {ar ? 'تاريخ التسليم المتوقع' : 'Expected delivery'}
              </Label>
              <Input
                type="date"
                value={review.expected_handover_date}
                onChange={(e) => update('expected_handover_date', e.target.value)}
                className="h-9 text-xs"
                dir="ltr"
              />
            </div>
          )}
          <ReviewField
            label={ar ? 'المطوّر (اختياري)' : 'Developer (optional)'}
            value={review.developer}
            onChange={(v) => update('developer', v)}
          />
          <ReviewField
            label={ar ? 'طريقة السداد (شركة/بنك/غيره)' : 'Payment method (company/bank/etc.)'}
            value={review.payment_method}
            onChange={(v) => update('payment_method', v)}
          />
        </div>
      </div>

      {finalFees.length > 0 && (
        <div className="rounded-lg border bg-background/60 p-3 space-y-2">
          <p className="text-xs font-bold">{ar ? 'الرسوم الإضافية' : 'Additional fees'}</p>
          <div className="space-y-1.5">
            {finalFees.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 text-xs border-b border-dashed py-1"
              >
                <span className="text-muted-foreground">
                  {f.name || (ar ? 'رسوم' : 'Fee')}
                </span>
                <span className="font-semibold tabular-nums" dir="ltr">
                  {fmtMoney(f.amount, lang)}
                </span>
                <span className="text-muted-foreground tabular-nums" dir="ltr">
                  {f.due_date ? formatDate(f.due_date, lang) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {missingStarts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2.5">
          <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle size={13} />
            {ar
              ? 'نقطة بداية مطلوبة لحساب تواريخ الأقساط'
              : 'Start point needed to compute installment dates'}
          </p>
          <p className="text-[11px] text-amber-700 leading-snug">
            {ar
              ? 'بعض الأقساط مرتبطة بتاريخ نسبي. أدخل نقطة البداية لحساب التواريخ التقويمية بدقة.'
              : 'Some installments use relative timing. Enter the start point to compute exact calendar dates.'}
          </p>
          {missingStarts.includes('booking_date') && (
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-amber-800">
                {ar ? 'تاريخ الحجز' : 'Booking date'}
              </Label>
              <Input
                type="date"
                value={startPoints.bookingDate}
                onChange={(e) => setStartPoint('bookingDate', e.target.value)}
                className="h-9 text-xs"
                dir="ltr"
              />
            </div>
          )}
          {missingStarts.includes('handover') && (
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-amber-800">
                {ar ? 'تاريخ التسليم' : 'Handover date'}
              </Label>
              <Input
                type="date"
                value={startPoints.handoverDate}
                onChange={(e) => setStartPoint('handoverDate', e.target.value)}
                className="h-9 text-xs"
                dir="ltr"
              />
            </div>
          )}
        </div>
      )}

      {scheduleFound && (
        <div className="rounded-lg border bg-background/60 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold">
              {ar
                ? `جدول الأقساط (${finalInstallments.length})`
                : `Installment schedule (${finalInstallments.length})`}
            </p>
            {finalInstallments.length > PREVIEW_COUNT && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80"
              >
                {showAll ? (
                  <>
                    <ChevronUp size={12} /> {ar ? 'عرض أقل' : 'Show less'}
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} />{' '}
                    {ar ? `عرض المزيد (${hiddenCount})` : `Show more (${hiddenCount})`}
                  </>
                )}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="py-1.5 px-1.5 text-start font-semibold">
                    {ar ? 'قسط' : 'No.'}
                  </th>
                  <th className="py-1.5 px-1.5 text-start font-semibold">
                    {ar ? 'نسبة' : '%'}
                  </th>
                  <th className="py-1.5 px-1.5 text-start font-semibold">
                    {ar ? 'تاريخ' : 'Date'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleInstallments.map((r, i) => (
                  <tr key={i} className="border-b border-dashed">
                    <td className="py-1.5 px-1.5 tabular-nums">{r.number || i + 1}</td>
                    <td className="py-1.5 px-1.5 tabular-nums">
                      {r.percentage != null ? `${r.percentage}%` : '—'}
                    </td>
                    <td className="py-1.5 px-1.5 tabular-nums" dir="ltr">
                      {r.due_date
                        ? formatDate(r.due_date, lang)
                        : ar
                          ? 'بانتظار نقطة البداية'
                          : 'awaiting start point'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!scheduleFound && purchaseType === 'installment' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {ar
              ? 'لم يُعثر على جدول أقساط في المستند. يمكنك المتابعة (سيُضاف العقار بدون جدول) أو رفع خطة دفع منفصلة.'
              : 'No installment schedule found in the document. You can continue (the property will be added without a schedule) or upload a separate payment plan.'}
          </span>
        </div>
      )}

      {!saved && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            onClick={onSave}
            disabled={busy || missingStarts.length > 0}
            className="flex-1 min-h-[48px] gap-2 font-bold"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <CheckCircle2 size={18} />
            )}
            {ar ? 'تأكيد وإضافة العقار' : 'Confirm & add property'}
          </Button>
        </div>
      )}
      {saved && (
        <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          {ar ? 'تمت إضافة العقار بنجاح.' : 'Property added successfully.'}
        </p>
      )}
    </div>
  );
}

function normalizeReviewMoney(value) {
  if (value == null || value === '') return '';
  const raw = String(value)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .replace(/[^\d.-]/g, '');
  if (!raw || raw === '-' || raw === '.' || raw === '-.') return '';
  const number = Number(raw);
  return Number.isFinite(number) ? String(number) : '';
}

function formatReviewMoney(value) {
  const normalized = normalizeReviewMoney(value);
  if (!normalized) return '';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(normalized));
}

function ReviewMoneyField({ label, value, onChange, dir }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(value == null ? '' : String(value));

  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-muted-foreground">{label}</Label>
      <Input
        type="text"
        inputMode="decimal"
        value={focused ? text : formatReviewMoney(value)}
        onFocus={() => {
          setText(value == null ? '' : String(value));
          setFocused(true);
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(normalizeReviewMoney(e.target.value));
        }}
        onBlur={() => {
          const normalized = normalizeReviewMoney(text);
          setText(normalized);
          onChange(normalized);
          setFocused(false);
        }}
        className="h-9 text-xs tabular-nums"
        dir={dir}
      />
    </div>
  );
}

function ReviewField({ label, value, onChange, dir }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-muted-foreground">{label}</Label>
      <Input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-xs"
        dir={dir}
      />
    </div>
  );
}

/* ---------- OpenAI review summary (Estate AI two-stage pipeline) ---------- */
/* ---------- Partial-extraction banner (shown when a later batch of a
   multi-batch document could not be read, but earlier batches were saved
   instead of discarding everything) ---------- */
function PartialExtractionBanner({ ar, partialInfo }) {
  if (!partialInfo) return null;
  const label = partialInfo.failed_batch_label
    || (ar
      ? `الدفعة ${partialInfo.failed_batch_index || '?'} من ${partialInfo.batch_total || '?'}`
      : `batch ${partialInfo.failed_batch_index || '?'} of ${partialInfo.batch_total || '?'}`);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span>
        {ar
          ? <>استخراج جزئي — تعذّرت قراءة <b>{label}</b>. البيانات هنا من الصفحات التي أمكن قراءتها فقط، راجعها جيدًا.</>
          : <>Partial extraction — <b>{label}</b> could not be read. The data here covers only the pages that were read; please review it carefully.</>}
      </span>
    </div>
  );
}

function AiReviewSummary({ ar, aiReview }) {
  if (!aiReview) return null;
  const confidence = aiReview.overall_confidence || 'unknown';
  const applied = Array.isArray(aiReview.applied) ? aiReview.applied : [];
  const issues = Array.isArray(aiReview.validation_issues) ? aiReview.validation_issues : [];
  const needsReview = Array.isArray(aiReview.needs_review_fields)
    ? aiReview.needs_review_fields
    : (Array.isArray(aiReview.fields)
      ? aiReview.fields.filter((f) => f && (f.needs_review === true || f.status === 'uncertain'))
      : []);
  const confLabel = {
    high: ar ? 'مراجعة عالية الثقة' : 'High-confidence review',
    medium: ar ? 'مراجعة متوسطة الثقة' : 'Medium-confidence review',
    low: ar ? 'مراجعة منخفضة الثقة' : 'Low-confidence review',
    unknown: ar ? 'لم تُجرَ المراجعة' : 'Review not run',
  }[confidence] || (ar ? 'مراجعة' : 'Review');
  const confColor =
    confidence === 'high'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : confidence === 'medium'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : confidence === 'low'
          ? 'text-red-700 bg-red-50 border-red-200'
          : 'text-muted-foreground bg-muted border-border';
  return (
    <div className="rounded-lg border bg-background/60 p-3 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <ShieldCheck size={13} className="text-primary shrink-0" />
        <span className="text-xs font-bold">
          {ar ? 'مراجعة OpenAI للبيانات' : 'OpenAI data review'}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold',
            confColor,
          )}
        >
          {confLabel}
        </span>
        {aiReview.skipped && (
          <span className="text-[10px] text-muted-foreground">
            {ar ? 'تم تخطي المراجعة' : 'Review skipped'}
          </span>
        )}
      </div>

      {applied.length > 0 && (
        <div className="space-y-1">
          {applied.map((c, i) => (
            <div
              key={i}
              className="text-[11px] leading-snug border-b border-dashed pb-1 last:border-0"
            >
              <span className="font-semibold text-primary">
                {ar ? 'تم التصحيح: ' : 'Corrected: '}
              </span>
              <span dir="ltr" className="tabular-nums">
                {c.path}
              </span>
              <span className="text-muted-foreground">
                {' — '}
                {ar ? c.reason_ar : c.reason_en}
              </span>
            </div>
          ))}
        </div>
      )}

      {issues.length > 0 && applied.length === 0 && (
        <div className="space-y-1">
          {issues.slice(0, 5).map((iss, i) => (
            <div key={i} className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">
                {ar ? iss.reason_ar : iss.reason_en}
              </span>
            </div>
          ))}
        </div>
      )}

      {needsReview.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-dashed">
          <p className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
            <AlertTriangle size={12} />
            {ar ? 'حقول بحاجة لمراجعتك' : 'Fields needing your review'}
          </p>
          {needsReview.map((f, i) => (
            <div key={i} className="text-[11px] leading-snug">
              <span dir="ltr" className="tabular-nums font-semibold text-foreground">
                {f.path}
              </span>
              <span className="text-muted-foreground">
                {' — '}
                {ar ? (f.reason_ar || (f.status === 'uncertain' ? 'غير مؤكد' : '')) : (f.reason_en || (f.status === 'uncertain' ? 'uncertain' : ''))}
              </span>
            </div>
          ))}
        </div>
      )}

      {(aiReview.notes_ar || aiReview.notes_en) && (
        <p className="text-[11px] text-muted-foreground">
          {ar ? aiReview.notes_ar : aiReview.notes_en}
        </p>
      )}
    </div>
  );
}

export default AiPropertyChat;
