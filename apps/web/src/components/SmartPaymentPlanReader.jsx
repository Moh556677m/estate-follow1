import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  Loader2,
  Plus,
  RotateCw,
  ScanLine,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PercentInput } from '@/components/PercentInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMoney } from '@/lib/api';
import { formatMoneyTyping } from '@/lib/money';
import { parseFlexibleDate } from '@/lib/paymentPlanSmart';
import {
  enhanceImageFile,
  extractPlanFromFiles,
  getActivePlanJob,
  resumePlanJob,
  validatePlan,
} from '@/lib/smartPlanReader';
import { cn } from '@/lib/utils';
import DateField from '@/components/DateField';
import { toIsoDate } from '@/lib/dateFormat';

// One native input lets the operating system provide its own source chooser
// (Files, Photos, Camera, Google Drive, or another installed provider).
// Any PDF or any image format, in any language — no type restriction.
const ACCEPT_FILES = '.pdf,image/*';
const MAX_CONCURRENCY = 4;
// Hard cap on the number of files in a single analysis batch. The backend
// accepts up to 200, but we cap the UI at 100 so a single Claude request
// stays within the model's context/payload limits and stays responsive.
const MAX_FILES = 100;

const STAGE_ORDER = ['upload', 'read', 'extract', 'validate', 'ready'];

function confidenceCls(c) {
  if (c === 'high') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (c === 'medium') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SmartPaymentPlanReader = ({
  totalPrice = '',
  handoverDate = '',
  onApprove,
  existingHashes = [],
}) => {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const filesInputRef = useRef(null);
  const idRef = useRef(0);

  // files: [{ id, identity, file, kind:'pdf'|'image', label, previewUrl }]
  const [files, setFiles] = useState([]);

  const [stage, setStage] = useState(null);
  const [stageDetail, setStageDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [rows, setRows] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  // null = checking, true = Anthropic key configured, false = not configured.
  const [configured, setConfigured] = useState(null);
  // Drag & drop reordering state. dragId = the item being dragged;
  // dragOverId = the item currently under the pointer (drop target).
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  // Banner shown when the user tried to add more than MAX_FILES at once.
  const [limitWarning, setLimitWarning] = useState('');
  // Async job progress (0-100) reported by the polling client.
  const [progress, setProgress] = useState(0);
  // AbortController for the in-flight analysis (cancel on reset/unmount).
  const abortRef = useRef(null);

  // Check whether the Anthropic Claude API key is configured on the server.
  // Use the same auth-aware client as analyze-plan so a missing/401 token
  // never masquerades as "key not configured".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let token = null;
        try {
          const raw = localStorage.getItem('pocketbase_auth');
          if (raw) {
            const bytes = new TextEncoder().encode(raw);
            token = btoa(String.fromCharCode(...bytes));
          }
        } catch {
          token = null;
        }
        const r = await window.fetch('/hcgi/api/integrated-ai/plan-status', {
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
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

  const L = useCallback(
    () => ({
      title: isAr ? 'قارئ خطة الدفع الذكي' : 'Smart Payment Plan Reader',
      subtitle: isAr
        ? 'ارفع كل صفحات المستند (حتى 100 صورة أو PDF) بالترتيب — سنحللها معًا كمستند واحد ويستخرج Claude جدول الدفعات كاملًا مع تحديد نوع كل دفعة من السياق.'
        : 'Upload all pages of the document (up to 100 images or PDFs) in order — we analyze them together as one document and Claude extracts the full payment table, determining each payment type from context.',
      addBtn: isAr ? 'إضافة' : 'Add',
      clear: isAr ? 'مسح الكل' : 'Clear all',
      analyzeMain: isAr ? 'تحليل خطة الدفع' : 'Analyze payment plan',
      analyzeHint: isAr
        ? 'أضف كل الصفحات بالترتيب الصحيح أولًا — لا يبدأ التحليل تلقائيًا. يمكنك إعادة الترتيب بالسحب أو الأسهم. اضغط هذا الزر بعد اكتمال الإضافة.'
        : 'Add all pages in the correct order first — analysis does not start automatically. You can reorder by dragging or with the arrows. Press this button once you are done.',
      pagesLabel: isAr ? 'الملفات المضافة' : 'Added files',
      reorderUp: isAr ? 'تحريك للأعلى' : 'Move up',
      reorderDown: isAr ? 'تحريك للأسفل' : 'Move down',
      removeItem: isAr ? 'حذف' : 'Remove',
      typePdf: 'PDF',
      typeImage: isAr ? 'صورة' : 'Image',
      notConfiguredTitle: isAr
        ? 'قارئ خطة الدفع الذكي يحتاج تفعيل'
        : 'Smart Payment Plan Reader needs setup',
      notConfiguredMsg: isAr
        ? 'لم يتم إضافة مفتاح Anthropic Claude API بعد. أضف المفتاح في إعدادات الخادم (ANTHROPIC_API_KEY) لتفعيل القراءة الذكية للمستندات.'
        : 'The Anthropic Claude API key has not been added yet. Add it to the server settings (ANTHROPIC_API_KEY) to enable smart document reading.',
      notConfiguredHint: isAr
        ? 'بمجرد إضافة المفتاح، يمكنك رفع أي PDF أو صورة بأي لغة وسيعرض النظام جدول الدفعات تلقائيًا.'
        : 'Once the key is added, you can upload any PDF or image in any language and the system will show the payment table automatically.',
      stages: {
        upload: isAr ? 'جاري رفع الملفات' : 'Uploading files',
        read: isAr ? 'جاري قراءة خطة الدفع' : 'Reading payment plan',
        extract: isAr ? 'جاري استخراج الأقساط' : 'Extracting installments',
        validate: isAr ? 'جاري التحقق من البيانات' : 'Validating',
        ready: isAr ? 'جاهز للمراجعة' : 'Ready for review',
      },
      extractedTitle: isAr ? 'تم استخراج خطة الدفع' : 'Payment plan extracted',
      partialMsg: (found, review) =>
        isAr
          ? `تم استخراج ${found} دفعة. هناك ${review} صفوف تحتاج مراجعة.`
          : `Extracted ${found} payments. ${review} rows need review.`,
      fullMsg: (found) =>
        isAr ? `تم استخراج ${found} دفعة بنجاح.` : `Extracted ${found} payments successfully.`,
      duplicateMsg: isAr
        ? 'بعض الملفات مطابقة لملفات سبق رفعها. قد تكون خطة مكررة — تأكد قبل الاعتماد.'
        : 'Some files match previously uploaded ones. This may be a duplicate plan — confirm before approving.',
      colDate: isAr ? 'التاريخ' : 'Date',
      colPhase: isAr ? 'المرحلة' : 'Phase',
      colPct: isAr ? 'النسبة' : 'Percentage',
      colAmount: isAr ? 'المبلغ' : 'Amount',
      colStatus: isAr ? 'حالة الدفع' : 'Payment status',
      colNote: isAr ? 'ملاحظة' : 'Note',
      colNumber: isAr ? 'رقم القسط' : 'Installment no.',
      paymentDetails: isAr ? 'تفاصيل الدفعة' : 'Payment details',
      statusPaid: isAr ? 'مدفوع' : 'Paid',
      statusUnpaid: isAr ? 'غير مدفوع' : 'Unpaid',
      colConf: isAr ? 'درجة الثقة' : 'Confidence',
      colPage: isAr ? 'صفحة' : 'Page',
      phaseFirst: isAr ? 'الدفعة الأولى' : 'First Payment',
      phasePre: isAr ? 'أثناء الإنشاء' : 'During Construction',
      phaseHand: isAr ? 'عند الاستلام' : 'On Handover',
      phasePost: isAr ? 'بعد الاستلام' : 'Post-Handover',
      confHigh: isAr ? 'مؤكد' : 'Confirmed',
      confMed: isAr ? 'للمراجعة' : 'Needs Review',
      confLow: isAr ? 'يرجى المراجعة' : 'Please Review',
      reviewHint: isAr
        ? 'يمكنك تعديل أي صف قبل الاعتماد. القيم غير المؤكدة فارغة — املأها من المستند.'
        : 'You can edit any row before approving. Unclear values are empty — fill them from the document.',
      sumPct: isAr ? 'إجمالي النسب' : 'Total %',
      sumAmt: isAr ? 'إجمالي المبلغ' : 'Total amount',
      sumCount: isAr ? 'عدد الدفعات' : 'Payments',
      propPrice: isAr ? 'سعر العقار' : 'Property price',
      diff: isAr ? 'الفرق' : 'Difference',
      planComplete: isAr ? 'الخطة مكتملة' : 'Plan complete',
      planRemaining: (n) => (isAr ? `متبقي ${n}%` : `Remaining ${n}%`),
      planOver: isAr ? 'إجمالي الخطة يتجاوز 100%' : 'Plan total exceeds 100%',
      statusComplete: isAr ? 'مكتملة' : 'Complete',
      statusReview: isAr ? 'تحتاج مراجعة' : 'Needs review',
      remainingLabel: isAr ? 'المتبقي' : 'Remaining',
      planStatusLabel: isAr ? 'حالة الخطة' : 'Plan status',
      editRow: isAr ? 'تعديل' : 'Edit',
      diffWarn: (d) =>
        isAr
          ? `يوجد فرق بقيمة ${d}. راجع الخطة قبل الاعتماد.`
          : `There is a difference of ${d}. Review the plan before approving.`,
      pctWarn: (d) =>
        isAr
          ? `مجموع النسب لا يساوي 100% (الفرق ${d}%). راجع الخطة قبل الاعتماد.`
          : `Percentages do not sum to 100% (diff ${d}%). Review before approving.`,
      approve: isAr ? 'اعتماد وإضافة الخطة' : 'Approve & add plan',
      cancel: isAr ? 'إلغاء' : 'Cancel',
      noFiles: isAr ? 'لم يتم إضافة ملفات بعد. اضغط «إضافة» للبدء (حتى 100 صورة أو PDF).' : 'No files added yet. Press "Add" to start (up to 100 images or PDFs).',
      limitReached: isAr
        ? `تم الوصول للحد الأقصى (100 ملف). لا يمكن إضافة المزيد — احذف بعض الملفات أولًا.`
        : `Maximum reached (100 files). Cannot add more — remove some files first.`,
      limitPartial: (added, skipped) =>
        isAr
          ? `تمت إضافة ${added} ملف فقط وتجاهل ${skipped} ملف للوصول إلى الحد الأقصى (100 ملف).`
          : `Added ${added} file(s) only and skipped ${skipped} to stay within the maximum (100 files).`,
      dragHint: isAr ? 'اسحب لإعادة الترتيب' : 'Drag to reorder',
      errGeneric: isAr ? 'تعذر قراءة المستند. تأكد من جودة الملف وحاول مرة أخرى.' : 'Could not read the document. Check file quality and try again.',
      errNoPlan: isAr ? 'لم يتم العثور على خطة دفع واضحة في الملف.' : 'No clear payment plan found in the file.',
      errAborted: isAr ? 'تم إلغاء العملية.' : 'Operation cancelled.',
      errAnalysis: isAr ? 'تعذر تحليل المستند. تأكد من جودة الصور وحاول مرة أخرى.' : 'Could not analyze the document. Check image quality and try again.',
      errUploadAll: isAr ? 'تعذر رفع أي من الملفات. تحقق من الاتصال وحاول مرة أخرى.' : 'Could not upload any of the files. Check your connection and try again.',
      errStorageAccess: isAr ? 'تعذر الوصول إلى الملفات المرفوعة. حاول مرة أخرى.' : 'Could not access the uploaded files. Try again.',
      errTimeout: isAr ? 'تجاوز تحليل المستند الوقت المحدد. استخدم صورًا أقل ووضوحًا أو حاول مرة أخرى.' : 'Analysis timed out. Use fewer clear images or try again.',
      errNetwork: isAr ? 'تعذر الاتصال بخدمة التحليل. تحقق من اتصالك وحاول مرة أخرى.' : 'Could not reach the analysis service. Check your connection and try again.',
      partialFilesTitle: isAr ? 'تحليل جزئي' : 'Partial analysis',
      partialFilesMsg: (ok, total) =>
        isAr
          ? `تم تحليل ${ok} من ${total} ملفات بنجاح. ${total - ok} ملف يحتاج إعادة محاولة.`
          : `Analyzed ${ok} of ${total} files successfully. ${total - ok} file(s) need retry.`,
      retryFailed: isAr ? 'إعادة محاولة الملفات الفاشلة' : 'Retry failed files',
      relativeHint: isAr ? 'تاريخ نسبي — يُحسب تلقائيًا عند تحديد تاريخ الحجز أو الاستلام.' : 'Relative date — auto-computed when booking/handover date is set.',
      corruptedDateWarn: isAr
        ? 'بعض الدفعات لا تحتوي على تاريخ صالح. يجب تعبئة تاريخ كل دفعة (أو تحديدها كموعد نسبي) قبل الاعتماد.'
        : 'Some payments have no valid date. Fill in each payment\'s date (or mark it as relative) before approving.',
    }),
    [isAr],
  );

  const labels = L();

  const nextId = () => `f${++idRef.current}`;

  // Revoke all object URLs on unmount + abort any in-flight analysis poll.
  useEffect(
    () => () => {
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch { /* ignore */ }
        abortRef.current = null;
      }
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const addFiles = (picked) => {
    if (!picked.length) return;
    setLimitWarning('');
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.identity));
      const additions = [];
      let skippedDup = 0;
      picked.forEach((file) => {
        const identity = `${file.name}|${file.size}|${file.lastModified}`;
        if (existing.has(identity)) {
          skippedDup += 1;
          return; // don't re-add the same file
        }
        // Enforce the hard cap of MAX_FILES total items in the list.
        if (prev.length + additions.length >= MAX_FILES) return;
        const isPdf =
          file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
        const kind = isPdf ? 'pdf' : 'image';
        const previewUrl = kind === 'image' ? URL.createObjectURL(file) : null;
        const label = file.name;
        additions.push({
          id: nextId(),
          identity,
          file,
          kind,
          label,
          previewUrl,
        });
        existing.add(identity);
      });
      const totalAfter = prev.length + additions.length;
      const totalPicked = picked.length;
      // If we hit the cap and there are still picked files we didn't add,
      // tell the user clearly (duplicates vs. cap reached).
      const notAdded = totalPicked - additions.length;
      if (notAdded > 0) {
        if (totalAfter >= MAX_FILES) {
          setLimitWarning(
            additions.length
              ? labels.limitPartial(additions.length, notAdded)
              : labels.limitReached,
          );
        }
      }
      return [...prev, ...additions]; // append, never replace
    });
    setError('');
    setResult(null);
    setRows([]);
  };

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) addFiles(picked);
    // Allow selecting the same file again after it is removed.
    e.target.value = '';
  };

  // The Add button is the only site control that invokes the native picker.
  // The operating system decides whether to show Files, Photos, Camera,
  // Google Drive, or another installed provider.
  const openNativePicker = () => {
    if (busy) return;
    const input = filesInputRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const removeFile = (id) => {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const moveItem = (id, dir) => {
    setFiles((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      const ni = idx + dir;
      if (ni < 0 || ni >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[idx];
      copy[idx] = copy[ni];
      copy[ni] = tmp;
      return copy;
    });
  };

  // Drag & drop reordering: on drop, move the dragged item to the position
  // of the item it was dropped onto (preserving the rest of the order).
  const onDragStart = (id) => () => {
    setDragId(id);
  };
  const onDragOverItem = (id) => (e) => {
    e.preventDefault();
    if (id !== dragId) setDragOverId(id);
  };
  const onDropItem = () => (e) => {
    e.preventDefault();
    setFiles((prev) => {
      const from = prev.findIndex((f) => f.id === dragId);
      const to = prev.findIndex((f) => f.id === dragOverId);
      if (from === -1 || to === -1 || from === to) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
    setDragId(null);
    setDragOverId(null);
  };
  const onDragEndItem = () => () => {
    setDragId(null);
    setDragOverId(null);
  };

  const reset = () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
      abortRef.current = null;
    }
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      return [];
    });
    setStage(null);
    setStageDetail('');
    setError('');
    setResult(null);
    setRows([]);
    setDuplicateWarning(false);
    setLimitWarning('');
    setProgress(0);
    setDragId(null);
    setDragOverId(null);
    if (filesInputRef.current) filesInputRef.current.value = '';
  };

  const stageLabel = (s) => {
    if (s === 'upload') return labels.stages.upload;
    return labels.stages[s] || s;
  };

  const applyResult = (res) => {
    setResult(res);
    // AI default: unpaid unless the document explicitly marked paid.
    setRows(
      (res.installments || []).map((row) => {
        const due =
          toIsoDate(row.due_date) ||
          parseFlexibleDate(row.due_date) ||
          '';
        return {
          ...row,
          due_date: due,
          status: row.status === 'paid' ? 'paid' : 'unpaid',
        };
      }),
    );
    setStage('ready');
    setStageDetail(labels.stages.ready);
    setProgress(100);
  };

  // Resume an in-flight analysis after a page reload / dropped connection.
  // The job is persisted in PocketBase, so we just re-poll it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = await getActivePlanJob();
      if (cancelled || !active || !active.jobId) return;
      setBusy(true);
      setError('');
      setResult(null);
      setRows([]);
      setStage(active.stage || 'read');
      setStageDetail(stageLabel(active.stage || 'read'));
      setProgress(active.progress || 20);
      abortRef.current = new AbortController();
      try {
        const res = await resumePlanJob(active.jobId, {
          totalPrice,
          handoverDate,
          lang,
          signal: abortRef.current.signal,
          onProgress: (s, detail, p) => {
            setStage(s);
            setStageDetail(detail || stageLabel(s));
            setProgress(typeof p === 'number' ? p : 0);
          },
        });
        if (!cancelled) applyResult(res);
      } catch (e) {
        if (!cancelled) {
          const serverMsg = isAr
            ? (e?.userMessageAr || e?.userMessageEn || '')
            : (e?.userMessageEn || e?.userMessageAr || '');
          setError(serverMsg || (isAr ? 'تعذر استئناف التحليل. حاول مرة أخرى.' : 'Could not resume analysis. Try again.'));
          setStage(null);
          setProgress(0);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    if (!files.length) return;
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
    }
    abortRef.current = new AbortController();
    setBusy(true);
    setError('');
    setResult(null);
    setRows([]);
    setDuplicateWarning(false);
    setProgress(5);
    setStage('upload');

    const total = files.length;
    let prepared = 0;
    setStageDetail(isAr ? `رفع 0 من ${total}` : `Uploading 0 of ${total}`);

    // ---- Parallel preparation: compress images, pass PDFs through ----
    // Concurrency-limited so we never fire too many heavy canvas jobs at once
    // and we never freeze the UI (each step awaits and yields).
    const preparedMap = new Map(); // id -> File (compressed for images)
    const queue = [...files];
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        let out = item.file;
        if (item.kind === 'image') {
          try {
            // eslint-disable-next-line no-await-in-loop
            const enh = await enhanceImageFile(item.file);
            out =
              enh instanceof File
                ? enh
                : new File([enh], item.file.name || 'image.jpg', {
                    type: 'image/jpeg',
                  });
          } catch {
            out = item.file;
          }
        }
        preparedMap.set(item.id, out);
        prepared += 1;
        setStageDetail(isAr ? `رفع ${prepared} من ${total}` : `Uploading ${prepared} of ${total}`);
      }
    };
    const workers = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENCY, files.length); i += 1) {
      workers.push(worker());
    }
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(workers);

    // ---- Duplicate detection (hash the original bytes, as before) ----
    try {
      // eslint-disable-next-line no-await-in-loop
      const newHashes = await Promise.all(
        files.map(async (item) => {
          const buf = await item.file.arrayBuffer();
          const digest = await crypto.subtle.digest('SHA-256', buf);
          return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        }),
      );
      if (existingHashes.length && newHashes.some((h) => existingHashes.includes(h))) {
        setDuplicateWarning(true);
      }
    } catch {
      /* ignore */
    }

    // Preserve the user's reorder: send files in the list's current order.
    const orderedFiles = files.map((item) => preparedMap.get(item.id) || item.file);

    try {
      const res = await extractPlanFromFiles(orderedFiles, {
        totalPrice,
        handoverDate,
        lang,
        skipEnhance: true, // we already compressed above → no double work
        signal: abortRef.current.signal,
        onProgress: (s, detail, p) => {
          setStage(s);
          setStageDetail(detail || stageLabel(s));
          setProgress(typeof p === 'number' ? p : 0);
        },
      });
      applyResult(res);
    } catch (e) {
      const msg = String(e?.message || e || '');
      const code = String(e?.code || msg || '');
      // Prefer server-provided localized explanation (never contains API keys).
      const serverMsg = isAr
        ? (e?.userMessageAr || e?.userMessageEn || '')
        : (e?.userMessageEn || e?.userMessageAr || '');
      if (serverMsg) {
        setError(serverMsg);
      } else if (/PLAN_NOT_CONFIGURED/i.test(code) || /PLAN_NOT_CONFIGURED/i.test(msg)) {
        setConfigured(false);
        setError(labels.notConfiguredMsg);
      } else if (/PLAN_NO_PLAN/i.test(code) || /PLAN_NO_PLAN/i.test(msg)) {
        setError(labels.errNoPlan);
      } else if (/PLAN_AI_EMPTY/i.test(code)) {
        setError(isAr
          ? 'لم يُرجع النموذج نتيجة صالحة. قد تكون جودة المسح منخفضة — جرّب صورة أوضح أو PDF أوضح.'
          : 'The model returned no usable result. Try a clearer scan or PDF.');
      } else if (/PLAN_AI_NOT_FOUND/i.test(code)) {
        setError(isAr
          ? 'نموذج Claude المحدد غير متاح لهذا الحساب. راجع إعداد النموذج على الخادم.'
          : 'The selected Claude model is not available for this account. Check the server model setting.');
      } else if (/PLAN_AI_TOO_LARGE/i.test(code) || /PLAN_AI_TOO_LARGE/i.test(msg)) {
        setError(isAr ? 'حجم المستند أو عدد الصفحات أكبر من حد خدمة الذكاء الاصطناعي. قلّل الصفحات أو الدقة.' : 'The document is too large for the AI service. Use fewer pages or lower-resolution images.');
      } else if (/PLAN_AI_BAD_IMAGE|PLAN_UNSUPPORTED_TYPE/i.test(code)) {
        setError(isAr
          ? 'نوع أو ترميز الملف غير مدعوم لإرساله إلى Claude. ارفع PDF أو صورة JPG/PNG/WebP.'
          : 'File type/encoding is not supported for Claude. Upload a PDF or JPG/PNG/WebP image.');
      } else if (/PLAN_UPLOAD_ALL_FAILED|Could not upload any|تعذر رفع أي/i.test(msg) || /PLAN_UPLOAD_ALL_FAILED/i.test(code)) {
        setError(labels.errUploadAll);
      } else if (/PLAN_STORAGE_ACCESS_FAILED/i.test(code) || /PLAN_STORAGE_ACCESS_FAILED/i.test(msg)) {
        setError(labels.errStorageAccess);
      } else if (/PLAN_AI_TIMEOUT/i.test(code) || /PLAN_AI_TIMEOUT/i.test(msg)) {
        setError(labels.errTimeout);
      } else if (/PLAN_AI_NETWORK/i.test(code) || /PLAN_AI_NETWORK/i.test(msg)) {
        setError(labels.errNetwork);
      } else if (/PLAN_AI_AUTH/i.test(code) || /PLAN_AI_AUTH/i.test(msg)) {
        setError(isAr ? 'مفتاح Anthropic Claude API غير صالح. تحقق من المفتاح في إعدادات الخادم.' : 'The Anthropic Claude API key is invalid. Check the key in the server settings.');
      } else if (/PLAN_PARSE_FAILED|PLAN_NO_FILES|PLAN_MISSING_MESSAGE/i.test(code)) {
        setError(isAr
          ? `تعذر تجهيز المستند للقراءة.${e?.detail ? ` (${String(e.detail).slice(0, 120)})` : ' تأكد أن الملف PDF أو صورة غير تالفة.'}`
          : `Could not prepare the document for reading.${e?.detail ? ` (${String(e.detail).slice(0, 120)})` : ' Ensure the file is a valid PDF or image.'}`);
      } else if (/PLAN_AI_PROXY|AI proxy|AI request failed|AI error|could not extract/i.test(msg) || /PLAN_AI_PROXY/i.test(code)) {
        setError(labels.errAnalysis);
      } else if (/abort/i.test(msg)) {
        setError(labels.errAborted);
      } else if (/401|403|session|sign in|Please sign/i.test(msg)) {
        setError(isAr ? 'انتهت الجلسة أو غير مصرح. سجّل الدخول ثم أعد المحاولة.' : 'Session expired or unauthorized. Sign in and try again.');
      } else if (/Load failed|Failed to fetch|NetworkError|network|Invalid file|file type|file content|413/i.test(msg)) {
        setError(labels.errUploadAll);
      } else if (/^PLAN_/i.test(code)) {
        setError(isAr ? `فشل التحليل (${code}). حاول مرة أخرى.` : `Analysis failed (${code}). Try again.`);
      } else if (msg.length > 180 || /^Error:/.test(msg)) {
        setError(labels.errGeneric);
      } else {
        setError(msg || labels.errGeneric);
      }
      setStage(null);
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (i, key, val) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  const updateRowPhase = (i, phase) =>
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              phase,
              payment_type:
                phase === 'first_payment'
                  ? 'down_payment'
                  : phase === 'handover'
                    ? 'handover'
                    : phase === 'post_handover'
                      ? 'post_handover'
                      : r.payment_type === 'down_payment'
                        ? 'installment'
                        : r.payment_type || 'installment',
            }
          : r,
      ),
    );

  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const liveValidation = validatePlan(rows, totalPrice);
  const needsReviewCount = rows.filter((r) => r.needs_review).length;
  // A row "blocks approval" when it has no usable date — neither a parsed
  // due_date nor a relative anchor. This prevents approving corrupted /
  // missing dates (requirement #10). Relative payments (booking/handover)
  // are allowed because their date is intentionally computed later.
  const corruptedDateRows = rows.filter((r) => !r.due_date && !r.relative);
  const hasCorruptedDates = corruptedDateRows.length > 0;

  const phaseSelectValue = (r) => {
    if (r.phase === 'first_payment' || r.payment_type === 'down_payment' || r.payment_type === 'first_payment') {
      return 'first_payment';
    }
    if (r.phase === 'handover') return 'handover';
    if (r.phase === 'post_handover') return 'post_handover';
    return 'pre_handover';
  };
  const statusSelectValue = (r) => (r.status === 'paid' ? 'paid' : 'unpaid');
  const confLabel = (c) => (c === 'high' ? labels.confHigh : c === 'medium' ? labels.confMed : labels.confLow);

  const onAmountChange = (i, raw) => {
    const cleaned = String(raw || '')
      .replace(/,/g, '')
      .replace(/[^\d.]/g, '');
    updateRow(i, 'amount', cleaned);
  };

  const approve = () => {
    if (!rows.length) return;
    onApprove?.({
      installments: rows,
      currency: result?.currency || null,
      totalPrice: result?.totalPrice || null,
      sourceFiles: result?.sourceFiles || [],
      validation: liveValidation,
    });
    reset();
  };

  const stageIdx = stage ? STAGE_ORDER.indexOf(stage) : -1;

  const typeBadge = (item) => {
    if (item.kind === 'pdf') return labels.typePdf;
    const t = (item.file.type || '').toLowerCase();
    if (t.includes('png')) return 'PNG';
    if (t.includes('webp')) return 'WEBP';
    if (t.includes('jpeg') || t.includes('jpg')) return 'JPG';
    return labels.typeImage;
  };

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ScanLine size={16} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold">{labels.title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">{labels.subtitle}</p>
        </div>
      </div>

      {/* Not-configured banner — Anthropic key missing on the server. */}
      {configured === false && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1.5">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle size={14} />
            {labels.notConfiguredTitle}
          </p>
          <p className="leading-snug">{labels.notConfiguredMsg}</p>
          <p className="text-[11px] text-amber-700 leading-snug">{labels.notConfiguredHint}</p>
        </div>
      )}

      {/* Hidden inputs live on document.body (via portal below) so they are
          never clipped by Dialog overflow/transform and stay gesture-safe. */}

      {/* Add controls — explicit stacking so nothing in the parent Dialog
          can sit on top of the primary action. */}
      <div className="relative z-20 isolate flex flex-wrap gap-2 pointer-events-auto">
        <Button
          type="button"
          onClick={openNativePicker}
          disabled={busy}
          aria-disabled={busy}
          className="relative z-20 min-h-[44px] gap-2 pointer-events-auto touch-manipulation"
        >
          <Plus size={16} />
          {labels.addBtn}
        </Button>
        {files.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            onClick={reset}
            disabled={busy}
            className="min-h-[44px] gap-2"
          >
            <Trash2 size={14} />
            {labels.clear}
          </Button>
        )}

      </div>

      {/* Added files list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold text-muted-foreground">
              {labels.pagesLabel} ({files.length}/{MAX_FILES})
            </p>
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <GripVertical size={11} />
              {labels.dragHint}
            </span>
          </div>
          {files.map((item, i) => (
            <div
              key={item.id}
              draggable={!busy}
              onDragStart={onDragStart(item.id)}
              onDragOver={onDragOverItem(item.id)}
              onDrop={onDropItem()}
              onDragEnd={onDragEndItem()}
              className={cn(
                'flex items-center gap-2 rounded-md border bg-accent/30 px-2 py-1.5 transition-shadow',
                !busy && 'cursor-grab active:cursor-grabbing',
                dragId === item.id && 'opacity-50 shadow-sm',
                dragOverId === item.id && dragId !== item.id && 'ring-2 ring-primary/60 border-primary/40',
              )}
            >
              <span className="shrink-0 text-muted-foreground/60" aria-hidden="true">
                <GripVertical size={14} />
              </span>
              <div className="shrink-0">
                {item.kind === 'image' && item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-10 w-10 rounded object-cover border"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded border bg-card text-primary">
                    <FileText size={18} />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] truncate font-medium">
                  <span className="text-muted-foreground tabular-nums me-1">{i + 1}.</span>
                  {item.label}
                </p>
                <p className="text-[10px] text-muted-foreground" dir="ltr">
                  <span className="inline-flex items-center gap-1">
                    <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary">
                      {typeBadge(item)}
                    </span>
                    {formatSize(item.file.size)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveItem(item.id, -1)}
                  disabled={i === 0 || busy}
                  title={labels.reorderUp}
                  className="rounded p-1 text-muted-foreground hover:bg-background disabled:opacity-30"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(item.id, 1)}
                  disabled={i === files.length - 1 || busy}
                  title={labels.reorderDown}
                  className="rounded p-1 text-muted-foreground hover:bg-background disabled:opacity-30"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => removeFile(item.id)}
                  disabled={busy}
                  title={labels.removeItem}
                  className="rounded p-1 text-destructive hover:opacity-70 disabled:opacity-30"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Limit warning — user tried to add more than MAX_FILES */}
      {limitWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{limitWarning}</span>
        </div>
      )}



      {/* Main analyze button — single, prominent, manual */}
      {files.length > 0 && !busy && (
        <div className="space-y-1">
          <Button
            type="button"
            onClick={run}
            className="min-h-[48px] w-full gap-2 text-sm font-bold"
          >
            <Sparkles size={18} />
            {labels.analyzeMain}
          </Button>
          <p className="text-[10px] text-muted-foreground leading-snug">{labels.analyzeHint}</p>
        </div>
      )}

      {/* Progress */}
      {busy && stage && (
        <div className="rounded-lg border bg-accent/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
            <span className="flex items-center gap-2 min-w-0">
              <Loader2 size={14} className="animate-spin text-primary shrink-0" />
              <span className="truncate">{stageDetail}</span>
            </span>
            <span className="tabular-nums text-primary shrink-0">{Math.round(progress || 0)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.max(2, Math.min(100, progress || 0))}%` }}
            />
          </div>
          <div className="flex gap-1">
            {STAGE_ORDER.map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i <= stageIdx ? 'bg-primary/70' : 'bg-muted',
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Duplicate warning */}
      {duplicateWarning && !error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{labels.duplicateMsg}</span>
        </div>
      )}

      {/* Result summary */}
      {result && rows.length > 0 && (
        <>
          <div
            className={cn(
              'rounded-lg border p-3 text-xs space-y-1',
              needsReviewCount > 0
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800',
            )}
          >
            <p className="font-bold flex items-center gap-1.5">
              {needsReviewCount > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {labels.extractedTitle}
            </p>
            <p>
              {needsReviewCount > 0
                ? labels.partialMsg(rows.length, needsReviewCount)
                : labels.fullMsg(rows.length)}
            </p>
            {needsReviewCount > 0 && <p className="text-[10px]">{labels.reviewHint}</p>}
          </div>

          {/* Partial upload banner — some files failed but analysis continued */}
          {result?.failedFiles?.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold">{labels.partialFilesTitle}</p>
                  <p>{labels.partialFilesMsg(result.uploadedCount, result.totalFiles)}</p>
                  <ul className="mt-1 ps-4 list-disc text-[10px] text-amber-700">
                    {result.failedFiles.map((f, i) => (
                      <li key={i} className="truncate">{f.name || `file-${i + 1}`}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy} className="min-h-[36px] gap-2">
                  <RotateCw size={14} />
                  {labels.retryFailed}
                </Button>
              </div>
            </div>
          )}

          {/* Mobile-first summary: count · total % · total amount · remaining · status */}
          <div className="rounded-lg border bg-card p-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-md bg-accent/40 p-2.5">
                <p className="text-[10px] text-muted-foreground">{labels.sumCount}</p>
                <p className="text-base font-bold tabular-nums leading-tight">{rows.length}</p>
              </div>
              <div className="rounded-md bg-accent/40 p-2.5">
                <p className="text-[10px] text-muted-foreground">{labels.sumPct}</p>
                <p className="text-base font-bold tabular-nums leading-tight">{liveValidation.sumPct}%</p>
              </div>
              <div className="rounded-md bg-accent/40 p-2.5">
                <p className="text-[10px] text-muted-foreground">{labels.sumAmt}</p>
                <p className="text-base font-bold tabular-nums leading-tight" dir="ltr">{formatMoney(liveValidation.sumAmt, lang)}</p>
              </div>
              <div className="rounded-md bg-accent/40 p-2.5">
                <p className="text-[10px] text-muted-foreground">{labels.remainingLabel}</p>
                <p className={cn('text-base font-bold tabular-nums leading-tight', liveValidation.pctOk ? 'text-emerald-600' : 'text-amber-600')}>
                  {liveValidation.pctOk ? '0%' : `${Math.abs(liveValidation.pctDiff)}%`}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t">
              <span className="text-[11px] text-muted-foreground">{labels.planStatusLabel}</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap',
                  liveValidation.pctOk && needsReviewCount === 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800',
                )}
              >
                {liveValidation.pctOk && needsReviewCount === 0 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {liveValidation.pctOk && needsReviewCount === 0 ? labels.statusComplete : labels.statusReview}
              </span>
            </div>
            {!liveValidation.pctOk && (
              <p className="text-[11px] font-semibold text-amber-700">
                {liveValidation.sumPct > 100
                  ? labels.planOver
                  : labels.planRemaining(Math.round((100 - liveValidation.sumPct) * 100) / 100)}
              </p>
            )}
            {liveValidation.amtDiff != null && !liveValidation.amtOk && (
              <p className="text-[11px] font-semibold text-amber-700">{labels.diffWarn(formatMoney(liveValidation.amtDiff, lang))}</p>
            )}
          </div>

          {/* ---- Mobile-first: one card per installment ---- */}
          <div className="space-y-2.5 md:hidden">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border bg-card p-3.5 space-y-3 shadow-sm">
                {/* 1. تفاصيل الدفعة */}
                <div className="flex items-center justify-between gap-2 border-b pb-2">
                  <p className="text-sm font-bold text-foreground">{labels.paymentDetails}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.confidence ? (
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold whitespace-nowrap', confidenceCls(r.confidence))}>
                        {confLabel(r.confidence)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      title={labels.removeItem}
                      className="rounded-md p-2 text-destructive hover:bg-destructive/10 min-h-[40px] min-w-[40px] inline-flex items-center justify-center"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* 2. رقم القسط */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground">{labels.colNumber}</label>
                  <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold tabular-nums">
                      {r.number}
                    </span>
                    <span className="text-sm font-semibold tabular-nums" dir="ltr">{r.number}</span>
                  </div>
                </div>

                {/* 3. التاريخ — عرض واحد DD/MM/YYYY، تخزين ISO */}
                <div className="space-y-1">
                  <DateField
                    label={labels.colDate}
                    value={r.due_date || ''}
                    onChange={(v) => updateRow(i, 'due_date', toIsoDate(v) || '')}
                    heightClass="h-10 min-h-[40px] text-sm"
                  />
                  {!r.due_date && r.relative ? (
                    <p className="text-[10px] text-violet-700 leading-snug">{labels.relativeHint}</p>
                  ) : null}
                </div>

                {/* 4. المرحلة */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground">{labels.colPhase}</label>
                  <Select value={phaseSelectValue(r)} onValueChange={(v) => updateRowPhase(i, v)}>
                    <SelectTrigger className="h-10 text-sm w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_payment">{labels.phaseFirst}</SelectItem>
                      <SelectItem value="pre_handover">{labels.phasePre}</SelectItem>
                      <SelectItem value="handover">{labels.phaseHand}</SelectItem>
                      <SelectItem value="post_handover">{labels.phasePost}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 5. النسبة % + 6. المبلغ */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1 min-w-0">
                    <label className="text-[10px] font-semibold text-muted-foreground">{labels.colPct}</label>
                    <div className="relative">
                      <PercentInput
                        min="0"
                        max="100"
                        step="0.01"
                        value={r.percentage || ''}
                        onChange={(e) => updateRow(i, 'percentage', e.target.value)}
                        className="h-10 text-sm w-full"
                      />
                    </div>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <label className="text-[10px] font-semibold text-muted-foreground">{labels.colAmount}</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={r.amount === '' || r.amount == null ? '' : formatMoneyTyping(r.amount)}
                      onChange={(e) => onAmountChange(i, e.target.value)}
                      dir="ltr"
                      className="h-10 text-sm w-full text-end tabular-nums"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* 7. حالة الدفع */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground">{labels.colStatus}</label>
                  <Select
                    value={statusSelectValue(r)}
                    onValueChange={(v) => updateRow(i, 'status', v === 'paid' ? 'paid' : 'unpaid')}
                  >
                    <SelectTrigger className="h-10 text-sm w-full min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">{labels.statusUnpaid}</SelectItem>
                      <SelectItem value="paid">{labels.statusPaid}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 8. ملاحظة */}
                {r.note ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">{labels.colNote}</label>
                    <p className="text-[12px] text-muted-foreground leading-snug break-words rounded-md bg-muted/40 px-2.5 py-2">{r.note}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* ---- Desktop: card grid (same fields, no type title) ---- */}
          <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b pb-2">
                  <p className="text-sm font-bold">{labels.paymentDetails}</p>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    title={labels.removeItem}
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground">{labels.colNumber}</label>
                  <p className="text-sm font-semibold tabular-nums" dir="ltr">{r.number}</p>
                </div>

                <div className="space-y-1">
                  <DateField
                    label={labels.colDate}
                    value={r.due_date || ''}
                    onChange={(v) => updateRow(i, 'due_date', toIsoDate(v) || '')}
                    heightClass="h-9 min-h-[36px] text-xs"
                  />
                  {!r.due_date && r.relative ? (
                    <p className="text-[10px] text-violet-700">{labels.relativeHint}</p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground">{labels.colPhase}</label>
                  <Select value={phaseSelectValue(r)} onValueChange={(v) => updateRowPhase(i, v)}>
                    <SelectTrigger className="h-9 text-xs w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_payment">{labels.phaseFirst}</SelectItem>
                      <SelectItem value="pre_handover">{labels.phasePre}</SelectItem>
                      <SelectItem value="handover">{labels.phaseHand}</SelectItem>
                      <SelectItem value="post_handover">{labels.phasePost}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 min-w-0">
                    <label className="text-[10px] font-semibold text-muted-foreground">{labels.colPct}</label>
                    <div className="relative">
                      <PercentInput
                        min="0"
                        max="100"
                        step="0.01"
                        value={r.percentage || ''}
                        onChange={(e) => updateRow(i, 'percentage', e.target.value)}
                        className="h-9 text-xs w-full"
                        suffixClassName="text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <label className="text-[10px] font-semibold text-muted-foreground">{labels.colAmount}</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={r.amount === '' || r.amount == null ? '' : formatMoneyTyping(r.amount)}
                      onChange={(e) => onAmountChange(i, e.target.value)}
                      dir="ltr"
                      className="h-9 text-xs w-full text-end tabular-nums"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground">{labels.colStatus}</label>
                  <Select
                    value={statusSelectValue(r)}
                    onValueChange={(v) => updateRow(i, 'status', v === 'paid' ? 'paid' : 'unpaid')}
                  >
                    <SelectTrigger className="h-9 text-xs w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">{labels.statusUnpaid}</SelectItem>
                      <SelectItem value="paid">{labels.statusPaid}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {r.note ? (
                  <p className="text-[11px] text-muted-foreground leading-snug break-words">{r.note}</p>
                ) : null}
              </div>
            ))}
          </div>

          {/* Sticky action bar — pinned above the mobile bottom nav, never covers content */}
          <div className="sticky z-20 -mx-3 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] mt-1 bg-card/95 backdrop-blur border-t bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-0">
            {hasCorruptedDates && (
              <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-800 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{labels.corruptedDateWarn}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={reset} className="min-h-[48px] flex-1">
                {labels.cancel}
              </Button>
              <Button type="button" onClick={approve} disabled={!rows.length || hasCorruptedDates} className="min-h-[48px] flex-[2] gap-2 font-bold">
                <CheckCircle2 size={18} />
                {labels.approve}
              </Button>
            </div>
          </div>
        </>
      )}

      {files.length === 0 && !busy && (
        <p className="text-[11px] text-muted-foreground">{labels.noFiles}</p>
      )}

      {/* One native input only. The browser and operating system provide the
          source list and open the chosen provider directly. */}
      <input
        ref={filesInputRef}
        type="file"
        accept={ACCEPT_FILES}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPickFiles}
      />
    </div>
  );
};

export default SmartPaymentPlanReader;
