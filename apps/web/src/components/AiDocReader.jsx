import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CloudUpload, FileCheck2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { FileViewButton } from '@/components/FileViewButton';
import { cn } from '@/lib/utils';

// stage: 'idle' | 'upload' | 'pdf' | 'ai' | 'review'
// fileField: plain PDF upload only (no auto AI). Sparkles button mode runs AI on user click.
const AiDocReader = ({
  type,
  buttonLabel,
  title,
  description,
  renderReview,
  onApply,
  fileField = false,
  file = null,
  existing = null,
  record = null,
  required = false,
  hint = null,
  onFileChange = null,
  label = null,
  className = '',
}) => {
  const { t, lang } = useLanguage();
  const { extract, isExtracting, error, setError } = useAiExtractor();
  const [stage, setStage] = useState('idle');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [lastFile, setLastFile] = useState(null);
  const fileRef = useRef(null);
  const lockRef = useRef(false);

  const isWorking = stage === 'upload' || stage === 'pdf' || stage === 'ai' || isExtracting;

  const reset = useCallback(() => {
    setStage('idle');
    setData(null);
    setError(null);
    setOpen(false);
    lockRef.current = false;
  }, [setError]);

  const storeFileOnly = useCallback(
    (picked) => {
      if (!picked) return;
      const isPdf =
        picked.type === 'application/pdf' ||
        /\.pdf$/i.test(picked.name || '');
      if (!isPdf) {
        setError(t('file_invalid_type'));
        return;
      }
      if (!picked.size) {
        setError(t('file_empty') || t('file_invalid_type'));
        return;
      }
      setError(null);
      onFileChange?.(picked);
    },
    [onFileChange, setError, t],
  );

  const runAiOnFile = useCallback(
    async (picked) => {
      if (!picked || lockRef.current) return;
      const isPdf =
        picked.type === 'application/pdf' ||
        /\.pdf$/i.test(picked.name || '');
      if (!isPdf) {
        setError(t('file_invalid_type'));
        setStage('idle');
        setOpen(true);
        return;
      }
      if (!picked.size) {
        setError(t('file_empty') || t('file_invalid_type'));
        setStage('idle');
        setOpen(true);
        return;
      }
      lockRef.current = true;
      setLastFile(picked);
      onFileChange?.(picked);
      setOpen(true);
      setData(null);
      setError(null);
      try {
        setStage('upload');
        await new Promise((r) => setTimeout(r, 0));

        const resultKey = cacheKey(['aidoc', type, fileIdentity(picked)]);
        const cached = getAiCache(resultKey);
        if (cached) {
          setData(cached);
          setStage('review');
          return;
        }

        setStage('pdf');
        let text = getPdfTextCache(picked);
        if (text == null) {
          text = await extractPdfText(picked);
          setPdfTextCache(picked, text);
        }
        setStage('ai');
        await new Promise((r) => setTimeout(r, 0));
        const result = await extract(type, text);
        setAiCache(resultKey, result);
        setData(result);
        setStage('review');
      } catch (err) {
        const msg = err?.message || '';
        if (msg === 'NO_TEXT') {
          setError(t('ai_no_text'));
        } else if (/verify your email/i.test(msg)) {
          setError(t('ai_verify_email'));
        } else {
          setError(t('ai_error') || t('ai_fallback') || msg);
        }
        setStage('idle');
      } finally {
        lockRef.current = false;
      }
    },
    [extract, onFileChange, setError, t, type],
  );

  const handleAiFile = useCallback(
    (picked) => {
      void runAiOnFile(picked);
    },
    [runAiOnFile],
  );

  const onPick = (e) => {
    const picked = e.target.files?.[0] || null;
    if (fileRef.current) fileRef.current.value = '';
    if (fileField) {
      storeFileOnly(picked);
    } else {
      handleAiFile(picked);
    }
  };

  const apply = () => {
    onApply?.(data);
    setStage('idle');
    setData(null);
    setError(null);
    setOpen(false);
  };

  const isVerifyError = /verify your email/i.test(error || '');
  const displayName = file?.name || (existing ? String(existing) : null);
  const fieldHint = hint || {
    required: t('required_label'),
    optional: t('optional_label'),
    placeholder: t('file_pdf_only'),
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onPick}
      />

      {fileField ? (
        <div className={cn('space-y-1.5', className)}>
          <Label>
            {label || buttonLabel}{' '}
            <span className="text-xs text-muted-foreground">
              ({required ? fieldHint.required : fieldHint.optional})
            </span>
          </Label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-dashed bg-accent/40 px-3 py-2.5 text-sm text-start hover:bg-accent transition-colors min-h-[44px]"
          >
            {displayName ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors group-hover:bg-primary/90">
                <FileCheck2 size={16} />
              </span>
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors group-hover:bg-primary/90">
                <CloudUpload size={16} />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">
              {displayName || fieldHint.placeholder}
            </span>
          </button>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <FileViewButton file={file} record={record} filename={existing} />
            {(file || existing) && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors min-h-[36px]"
              >
                <CloudUpload size={13} />
                {t('replace_file')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={isWorking}
          className={cn('min-h-[44px] border-dashed gap-2', className)}
        >
          {isWorking ? (
            <Loader2 size={16} className="animate-spin text-primary" />
          ) : (
            <Sparkles size={16} className="text-primary" />
          )}
          {isWorking ? t('ai_reading') : buttonLabel}
        </Button>
      )}

      {!fileField && (
        <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); }}>
          <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles size={16} />
                </span>
                {title}
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            {isWorking && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <Loader2 size={28} className="animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">
                  {stage === 'upload'
                    ? t('ai_stage_uploading')
                    : stage === 'pdf'
                      ? t('ai_stage_pdf')
                      : t('ai_stage_ai')}
                </p>
                <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
                  {['upload', 'pdf', 'ai', 'review'].map((s) => {
                    const order = ['upload', 'pdf', 'ai', 'review'];
                    const cur = order.indexOf(stage);
                    const idx = order.indexOf(s);
                    const active = idx <= cur;
                    const labels = {
                      upload: t('ai_stage_uploading'),
                      pdf: t('ai_stage_pdf'),
                      ai: t('ai_stage_ai'),
                      review: t('ai_stage_ready') || (lang === 'ar' ? 'جاهز للمراجعة' : 'Ready for review'),
                    };
                    return (
                      <span
                        key={s}
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          active
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground',
                        )}
                      >
                        {labels[s]}
                      </span>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground px-4">
                  {t('sec_ai_bg_hint') ||
                    (lang === 'ar'
                      ? 'يمكنك متابعة تعبئة النموذج أثناء المعالجة.'
                      : 'You can keep filling the form while this runs.')}
                </p>
              </div>
            )}

            {error && !isWorking && (
              <div className="space-y-4 py-6">
                <div
                  className={cn(
                    'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
                    isVerifyError
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800',
                  )}
                >
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">{t('ai_manual_still')}</p>
                <div className="flex justify-end gap-2">
                  {lastFile ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void runAiOnFile(lastFile)}
                      className="min-h-[40px]"
                    >
                      <RefreshCw size={14} className="me-1.5" />
                      {t('sec_ai_retry') || (lang === 'ar' ? 'إعادة المحاولة' : 'Retry')}
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" onClick={reset} className="min-h-[40px]">
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            )}

            {stage === 'review' && data && (
              <div className="space-y-4 pt-1">
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                  <FileCheck2 size={16} className="mt-0.5 shrink-0" />
                  <span>{t('ai_review_hint')}</span>
                </div>
                {renderReview?.(data, setData) || (
                  <pre className="max-h-72 overflow-auto rounded-lg bg-accent p-3 text-xs">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={reset} className="min-h-[44px]">
                    {t('cancel')}
                  </Button>
                  <Button type="button" onClick={apply} className="min-h-[44px]">
                    {t('ai_apply')}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default AiDocReader;
