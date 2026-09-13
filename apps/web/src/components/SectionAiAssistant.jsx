import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAiExtractor } from '@/hooks/useAiExtractor';
import { extractPdfText } from '@/lib/pdfText';
import {
  cacheKey,
  fileIdentity,
  getAiCache,
  getPdfTextCache,
  setAiCache,
  setPdfTextCache,
} from '@/lib/aiExtractCache';
import { formatMoney } from '@/lib/api';
import {
  localExtractSection,
  mergeFields,
  normalizeExtractedFields,
} from '@/lib/sectionAiLocalExtract';
import { cn } from '@/lib/utils';

const SECTION_LABEL_KEYS = {
  property_info: 'sec_property_info',
  purchase_details: 'sec_purchase_details',
  payment_plan: 'sec_payment_plan',
  handover: 'sec_handover',
  service_fees: 'sec_service_fees',
  alerts: 'alerts_step_title',
};

const MONEY_KEYS = new Set([
  'total_price',
  'service_charge_amount',
  'amount',
  'rent_amount',
  'security_deposit',
  'down_payment',
]);

const PROGRESS_STEPS = ['upload', 'read', 'extract', 'ready'];

function yieldUi() {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Compact section-scoped AI chat for PropertyForm.
 * Local loading only — never freezes the parent form.
 * Never mutates form fields itself — calls onApply(fields) after user confirms.
 */
export default function SectionAiAssistant({
  section,
  open,
  onOpenChange,
  currentValues = {},
  onApply,
  className = '',
}) {
  const { t, lang } = useLanguage();
  const { extractSection, sectionChat, isExtracting, error, setError } = useAiExtractor();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(null);
  const [replaceFilled, setReplaceFilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // upload | read | extract | ready
  const [lastFail, setLastFail] = useState(null); // { kind, payload } for Retry
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const listRef = useRef(null);
  const busyLock = useRef(false);
  const mountedRef = useRef(true);

  const title = t(SECTION_LABEL_KEYS[section] || 'sec_property_info');
  const working = busy || isExtracting;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      // Keep cache; only clear ephemeral UI. Do not abort in-flight work mid-stream
      // if user toggles — lock still prevents duplicates.
      setInput('');
      setPending(null);
      setReplaceFilled(false);
      setError(null);
      setProgress(null);
      setLastFail(null);
      return;
    }
    setMessages([
      {
        role: 'assistant',
        kind: 'text',
        content:
          lang === 'ar'
            ? `أنا مساعدك لهذا القسم فقط («${title}»). اكتب وصفًا أو ارفع PDF/صورة وسأقترح الحقول بعد التأكيد.`
            : `I only help with this section (“${title}”). Type a description or upload a PDF/image — I’ll propose fields after you confirm.`,
      },
    ]);
  }, [open, section, lang, title, setError]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, pending, working, progress]);

  const push = useCallback((msg) => {
    if (!mountedRef.current) return;
    setMessages((m) => [...m, msg]);
  }, []);

  const fieldLabels = useCallback(
    (fields) => {
      const map = {
        country: t('ai_field_country') || t('country'),
        area: t('ai_field_area') || t('area'),
        building: t('building'),
        unit_number: t('unit_number'),
        property_size: t('ai_field_size'),
        property_size_unit: t('size_unit_select'),
        developer: t('ai_field_developer'),
        purchase_date: t('purchase_date'),
        total_price: t('total_price') || t('ai_field_price'),
        purchase_fees: t('purchase_fees_section'),
        payment_method: t('payment_method_section'),
        payment_duration_years: t('duration_years'),
        payment_duration_months: t('duration_months'),
        plan_type: t('plan_type'),
        plan_down_pct: t('plan_down_pct'),
        plan_construction_pct: t('plan_construction_pct'),
        plan_handover_pct: t('plan_handover_pct'),
        plan_post_pct: t('plan_post_pct'),
        post_handover_years: t('duration_years'),
        post_handover_months: t('duration_months'),
        custom_stages: t('plan_type_5'),
        installments: t('ai_field_installments'),
        handover_status: t('handover_status'),
        expected_handover_date: t('expected_handover_date'),
        actual_handover_date: t('actual_handover_date'),
        service_charge_amount: t('service_fee_amount') || t('summary_service_charge'),
        service_charge_frequency: t('service_fee_type_label'),
        service_charge_value_type: t('purchase_fee_type'),
        service_charge_date: t('service_fee_date') || t('due_date'),
        service_charge_paid_status: t('payment_status'),
        service_charge_paid_in_installments: t('service_fee_in_installments'),
        service_fee_rows: t('ai_field_payments'),
        alerts_enabled: t('alerts_enable'),
        alerts_reminders: t('alerts_field_reminders'),
        alerts_custom_date: t('alerts_custom_date'),
      };
      return Object.keys(fields || {}).map((k) => ({
        key: k,
        label: map[k] || k,
        value: fields[k],
      }));
    },
    [t],
  );

  const hasValue = (v) => {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return true;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'boolean') return true;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return !!v;
  };

  const conflictsFor = useCallback(
    (fields) => {
      const keys = Object.keys(fields || {}).filter((k) => hasValue(fields[k]));
      return keys.filter((k) => hasValue(currentValues?.[k]));
    },
    [currentValues],
  );

  const formatPreviewValue = (key, v) => {
    if (v == null || v === '') return '—';
    if (Array.isArray(v)) {
      if (v.length === 0) return '—';
      if (typeof v[0] === 'object') {
        // purchase_fees / installments summary
        if (v[0].amount != null) {
          return v
            .map((row) => {
              const amt = formatMoney(row.amount, lang);
              return row.name ? `${row.name}: ${amt}` : amt;
            })
            .join(' · ');
        }
        return `${v.length}`;
      }
      return v.join(', ');
    }
    if (typeof v === 'boolean') return v ? (lang === 'ar' ? 'نعم' : 'Yes') : lang === 'ar' ? 'لا' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    if (MONEY_KEYS.has(key) || /(?:amount|price|fee|rent|deposit)$/i.test(key)) {
      return formatMoney(v, lang);
    }
    return String(v);
  };

  const openProposal = useCallback(
    (fields, source) => {
      const normalized = normalizeExtractedFields(fields || {});
      const cleaned = {};
      Object.entries(normalized).forEach(([k, v]) => {
        if (v == null || v === '') return;
        if (Array.isArray(v) && v.length === 0) return;
        cleaned[k] = v;
      });
      if (!Object.keys(cleaned).length) {
        push({
          role: 'assistant',
          kind: 'text',
          content:
            t('sec_ai_nothing_found') ||
            (lang === 'ar' ? 'لم أجد هذه المعلومة في الملف' : 'I could not find this information in the file'),
        });
        return;
      }
      setReplaceFilled(false);
      setPending({ fields: cleaned, source: source || 'extract' });
      setProgress('ready');
      push({
        role: 'assistant',
        kind: 'text',
        content:
          t('sec_ai_found_info') ||
          (lang === 'ar'
            ? 'تم العثور على معلومات يمكن استخدامها في هذا القسم. هل تريد إضافة المعلومات؟'
            : 'Found information that can be used in this section. Do you want to add it?'),
      });
    },
    [lang, push, t],
  );

  const runLocked = async (fn) => {
    if (busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    setError(null);
    setLastFail(null);
    try {
      await fn();
    } catch (err) {
      const msg = err?.message || '';
      let content;
      if (/verify your email/i.test(msg)) {
        content = t('ai_verify_email');
      } else if (msg === 'NO_TEXT') {
        content = t('ai_no_text');
      } else {
        content =
          t('sec_ai_fail') ||
          t('ai_error') ||
          t('ai_fallback') ||
          msg ||
          (lang === 'ar' ? 'تعذر التحليل' : 'Analysis failed');
      }
      push({ role: 'assistant', kind: 'text', content });
      if (mountedRef.current) setProgress(null);
    } finally {
      if (mountedRef.current) {
        setBusy(false);
      }
      busyLock.current = false;
    }
  };

  const analyzeFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    await runLocked(async () => {
      setLastFail({ kind: 'files', payload: list });
      const names = list.map((f) => f.name).join(', ');
      push({ role: 'user', kind: 'files', content: names });

      setProgress('upload');
      await yieldUi();

      const fileKey = cacheKey([
        'sec-files',
        section,
        lang,
        list.map((f) => fileIdentity(f)).join('+'),
      ]);
      const cached = getAiCache(fileKey);
      if (cached) {
        setProgress('ready');
        await yieldUi();
        if (cached?.mode === 'answer' && cached.answer) {
          push({ role: 'assistant', kind: 'text', content: cached.answer });
          setLastFail(null);
          return;
        }
        openProposal(cached?.fields || cached || {}, 'file-cache');
        setLastFail(null);
        return;
      }

      const pdfs = list.filter(
        (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''),
      );
      const images = list.filter(
        (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name || ''),
      );

      setProgress('read');
      await yieldUi();

      let text = '';
      for (const pdf of pdfs) {
        let part = getPdfTextCache(pdf);
        if (part == null) {
          try {
            part = await extractPdfText(pdf);
            setPdfTextCache(pdf, part);
          } catch {
            part = '';
          }
        }
        if (part) text += `\n\n--- ${pdf.name} ---\n${part}`;
      }

      if (!text.trim() && images.length === 0) {
        throw new Error('NO_TEXT');
      }

      setProgress('extract');
      await yieldUi();

      const result = await extractSection(section, text, images, {
        language: lang,
        currentValues,
      });
      const local = text.trim() ? localExtractSection(section, text) : {};
      const aiFields =
        result?.fields && typeof result.fields === 'object'
          ? result.fields
          : result && !result.mode && typeof result === 'object'
            ? result
            : {};
      const finalFields = mergeFields(aiFields, local);
      const toCache = {
        mode: Object.keys(finalFields).length ? 'extract' : result?.mode || 'extract',
        fields: finalFields,
        answer: result?.answer || null,
      };
      setAiCache(fileKey, toCache);
      setLastFail(null);

      if (Object.keys(finalFields).length) {
        openProposal(finalFields, 'file');
        return;
      }
      if (result?.mode === 'answer' && result.answer) {
        setProgress(null);
        push({ role: 'assistant', kind: 'text', content: result.answer });
        return;
      }
      openProposal({}, 'file');
    });
  };

  const handleFiles = (fileList) => {
    // Fire-and-forget background work — form stays interactive.
    void analyzeFiles(fileList);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || working) return;
    setInput('');
    await runLocked(async () => {
      setLastFail({ kind: 'text', payload: text });
      push({ role: 'user', kind: 'text', content: text });
      setProgress('extract');
      await yieldUi();
      const local = localExtractSection(section, text);
      let result = null;
      try {
        result = await sectionChat(section, text, {
          language: lang,
          currentValues,
        });
      } catch (err) {
        // Local extract can still fill fields if the model fails
        if (Object.keys(local).length) {
          setLastFail(null);
          openProposal(local, 'text-local');
          return;
        }
        throw err;
      }
      setLastFail(null);
      const aiFields =
        result?.fields && typeof result.fields === 'object'
          ? result.fields
          : result && !result.mode
            ? result
            : {};
      const finalFields = mergeFields(aiFields, local);
      if (Object.keys(finalFields).length) {
        openProposal(finalFields, 'text');
        return;
      }
      if (result?.mode === 'answer' && result.answer) {
        setProgress(null);
        push({ role: 'assistant', kind: 'text', content: result.answer });
        return;
      }
      openProposal({}, 'text');
    });
  };

  const handleRetry = () => {
    if (!lastFail || working) return;
    if (lastFail.kind === 'files') void analyzeFiles(lastFail.payload);
    else if (lastFail.kind === 'text') {
      setInput(lastFail.payload);
      // re-send after paint
      setTimeout(() => {
        const el = document.querySelector(`[data-section-ai="${section}"] textarea`);
        if (el) {
          /* input state set; user can press send, or we auto-send */
        }
      }, 0);
      void (async () => {
        const text = lastFail.payload;
        await runLocked(async () => {
          push({ role: 'user', kind: 'text', content: text });
          setProgress('extract');
          await yieldUi();
          const local = localExtractSection(section, text);
          let result = null;
          try {
            result = await sectionChat(section, text, {
              language: lang,
              currentValues,
            });
          } catch (err) {
            if (Object.keys(local).length) {
              setLastFail(null);
              openProposal(local, 'text-local');
              return;
            }
            throw err;
          }
          setLastFail(null);
          const aiFields =
            result?.fields && typeof result.fields === 'object'
              ? result.fields
              : result && !result.mode
                ? result
                : {};
          const finalFields = mergeFields(aiFields, local);
          if (Object.keys(finalFields).length) {
            openProposal(finalFields, 'text');
            return;
          }
          if (result?.mode === 'answer' && result.answer) {
            setProgress(null);
            push({ role: 'assistant', kind: 'text', content: result.answer });
            return;
          }
          openProposal({}, 'text');
        });
      })();
    }
  };

  const confirmApply = () => {
    if (!pending?.fields || !onApply) return;
    const conflicts = conflictsFor(pending.fields);
    const payload = normalizeExtractedFields({ ...pending.fields });
    if (!replaceFilled && conflicts.length) {
      conflicts.forEach((k) => {
        delete payload[k];
      });
    }
    if (!Object.keys(payload).length) {
      push({
        role: 'assistant',
        kind: 'text',
        content:
          lang === 'ar'
            ? 'لم تُضف حقول جديدة (كل القيم المستخرجة موجودة مسبقًا ولم تُفعّل الاستبدال).'
            : 'Nothing new was added (extracted values already filled and replace was off).',
      });
      setPending(null);
      setProgress(null);
      return;
    }
    try {
      onApply(payload, { replaceFilled, source: pending.source });
      // Verify keys that should land in currentValues after parent setState
      // (parent updates async — we still confirm the apply call succeeded).
      push({
        role: 'assistant',
        kind: 'text',
        content:
          t('sec_ai_applied') ||
          (lang === 'ar' ? 'تمت إضافة المعلومات إلى القسم.' : 'Information was added to the section.'),
      });
      setPending(null);
      setReplaceFilled(false);
      setProgress(null);
    } catch {
      push({
        role: 'assistant',
        kind: 'text',
        content:
          lang === 'ar'
            ? 'تعذر تحديث الحقل، حاول مرة أخرى.'
            : 'Could not update the field. Please try again.',
      });
    }
  };

  if (!open) return null;

  const conflictKeys = pending ? conflictsFor(pending.fields) : [];
  const previewRows = pending ? fieldLabels(pending.fields) : [];

  const progressLabel = (step) => {
    const map = {
      upload: t('ai_stage_uploading') || (lang === 'ar' ? 'رفع الملف…' : 'Uploading file…'),
      read: t('ai_stage_pdf') || (lang === 'ar' ? 'قراءة الملف…' : 'Reading file…'),
      extract: t('ai_stage_ai') || (lang === 'ar' ? 'استخراج البيانات…' : 'Extracting data…'),
      ready: t('ai_stage_ready') || (lang === 'ar' ? 'جاهز للمراجعة' : 'Ready for review'),
    };
    return map[step] || step;
  };

  return (
    <div
      className={cn(
        'mt-3 rounded-xl border border-primary/25 bg-card shadow-sm overflow-hidden',
        className,
      )}
      data-section-ai={section}
    >
      <div className="flex items-center justify-between gap-2 border-b bg-primary/5 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">AI · {title}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {t('sec_ai_scope_hint') || (lang === 'ar' ? 'هذا القسم فقط' : 'This section only')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange?.(false)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent text-muted-foreground"
          aria-label={t('cancel')}
        >
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} className="max-h-[280px] overflow-y-auto space-y-2 p-3 bg-accent/20">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              'rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap',
              m.role === 'user'
                ? 'ms-6 bg-primary text-primary-foreground'
                : 'me-4 bg-card border text-foreground',
            )}
          >
            {m.kind === 'files' ? (
              <span className="inline-flex items-center gap-1.5">
                <Paperclip size={12} />
                {m.content}
              </span>
            ) : (
              m.content
            )}
          </div>
        ))}

        {working && (
          <div className="me-2 rounded-xl border border-primary/20 bg-card px-3 py-2.5 space-y-2 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Loader2 size={14} className="animate-spin text-primary shrink-0" />
              <span>
                {progress
                  ? progressLabel(progress)
                  : t('sec_ai_analyzing') || (lang === 'ar' ? 'جاري التحليل…' : 'Analyzing…')}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {PROGRESS_STEPS.map((step) => {
                const idx = PROGRESS_STEPS.indexOf(step);
                const cur = progress ? PROGRESS_STEPS.indexOf(progress) : 0;
                const done = idx < cur || progress === 'ready';
                const active = step === progress;
                return (
                  <span
                    key={step}
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border',
                      done || active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-muted/40 text-muted-foreground',
                    )}
                  >
                    {progressLabel(step)}
                  </span>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t('sec_ai_bg_hint') ||
                (lang === 'ar'
                  ? 'يمكنك متابعة تعبئة النموذج أثناء المعالجة.'
                  : 'You can keep filling the form while this runs.')}
            </p>
          </div>
        )}

        {pending && (
          <div className="me-2 rounded-xl border border-primary/30 bg-card p-3 space-y-2 shadow-sm">
            <p className="text-xs font-bold text-foreground">
              {t('sec_ai_preview_title') || (lang === 'ar' ? 'معاينة المعلومات' : 'Preview')}
            </p>
            <ul className="space-y-1">
              {previewRows.map((row) => {
                const conflict = conflictKeys.includes(row.key);
                return (
                  <li
                    key={row.key}
                    className={cn(
                      'flex items-start justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px]',
                      conflict ? 'border-amber-200 bg-amber-50/70' : 'bg-accent/40',
                    )}
                  >
                    <span className="font-semibold text-muted-foreground shrink-0">{row.label}</span>
                    <span className="text-end font-medium break-all tabular-nums" dir="auto">
                      {formatPreviewValue(row.key, row.value)}
                      {conflict ? (
                        <span className="block text-[10px] text-amber-700 mt-0.5">
                          {t('sec_ai_field_filled') ||
                            (lang === 'ar'
                              ? 'هذا الحقل يحتوي على قيمة حالية'
                              : 'This field already has a value')}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            {conflictKeys.length > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-2.5 py-2 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={replaceFilled}
                  onChange={(e) => setReplaceFilled(e.target.checked)}
                />
                <span>
                  {t('sec_ai_replace_toggle') ||
                    (lang === 'ar'
                      ? 'استبدال القيم الحالية في الحقول الممتلئة'
                      : 'Also replace values already filled in the form')}
                </span>
              </label>
            )}
            <p className="text-[11px] text-muted-foreground">
              {t('sec_ai_confirm_add') ||
                (lang === 'ar'
                  ? 'هل تريد إضافة هذه المعلومات إلى القسم؟'
                  : 'Add this information to the section?')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[40px]"
                onClick={() => {
                  setPending(null);
                  setProgress(null);
                  push({
                    role: 'assistant',
                    kind: 'text',
                    content:
                      lang === 'ar' ? 'تم الإلغاء. لم يُغيّر أي حقل.' : 'Cancelled. No fields were changed.',
                  });
                }}
              >
                {t('sec_ai_no') || (lang === 'ar' ? 'لا' : 'No')}
              </Button>
              <Button type="button" size="sm" className="min-h-[40px]" onClick={confirmApply}>
                {t('sec_ai_yes_add') || (lang === 'ar' ? 'نعم، أضف المعلومات' : 'Yes, add information')}
              </Button>
            </div>
          </div>
        )}

        {(error || lastFail) && !working && (
          <div className="me-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-2">
            {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
            {lastFail ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[36px] text-xs"
                onClick={handleRetry}
              >
                <RefreshCw size={13} className="me-1" />
                {t('sec_ai_retry') || (lang === 'ar' ? 'إعادة المحاولة' : 'Retry')}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div className="border-t p-2 space-y-2 bg-card">
        <div className="flex items-end gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={working}
            rows={2}
            placeholder={
              t('sec_ai_placeholder') ||
              (lang === 'ar'
                ? 'اكتب وصف العقار أو اسأل عن هذا القسم…'
                : 'Describe the property or ask about this section…')
            }
            className="min-h-[44px] text-sm resize-none flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            disabled={working || !input.trim()}
            onClick={handleSend}
            className="min-h-[44px] min-w-[44px] shrink-0"
            aria-label={t('send') || 'Send'}
          >
            {working ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            multiple
            onChange={(e) => {
              const list = e.target.files;
              e.target.value = '';
              if (list?.length) handleFiles(list);
            }}
          />
          <input
            ref={imageRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            multiple
            onChange={(e) => {
              const list = e.target.files;
              e.target.value = '';
              if (list?.length) handleFiles(list);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working}
            className="min-h-[36px] text-xs"
            onClick={() => fileRef.current?.click()}
          >
            <FileText size={13} className="me-1" />
            PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working}
            className="min-h-[36px] text-xs"
            onClick={() => imageRef.current?.click()}
          >
            <ImageIcon size={13} className="me-1" />
            {lang === 'ar' ? 'صورة' : 'Image'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working}
            className="min-h-[36px] text-xs"
            onClick={() => imageRef.current?.click()}
          >
            <Paperclip size={13} className="me-1" />
            {lang === 'ar' ? 'عدة صور' : 'Multi'}
          </Button>
        </div>
      </div>
    </div>
  );
}
