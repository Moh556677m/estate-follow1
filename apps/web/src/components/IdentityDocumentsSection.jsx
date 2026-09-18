import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  FileCheck2,
  Plus,
  Upload,
  RefreshCw,
  Loader2,
  CheckCircle2,
  BadgeCheck,
  AlertCircle,
  Trash2,
  Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { FileViewButton } from '@/components/FileViewButton';
import {
  uploadRecordFile,
  prepareFile,
  uploadErrorMessage,
  formatBytes,
  FILE_LIMITS,
  safeSyncAuthRecord,
} from '@/lib/uploadClient';
import pb from '@/lib/pocketbaseClient';
import { cn } from '@/lib/utils';

// Identity Documents section for the Owner Profile.
//
// Structure (top → bottom):
//   1) Identity Documents (مستندات الهوية) — the BASIC MANDATORY document.
//      User chooses ONE of Passport / Residence Permit, enters its number and
//      uploads its file. One document is enough to satisfy verification.
//      A second identity type may optionally be added.
//   2) Additional Documents (مستندات إضافية) — an OPTIONAL accordion below.
//      Fully optional: not adding any never blocks save / submit / approval.
//      Types: ID Card, Additional Passport, Additional Residence, Driver
//      License, Other. Each row shows type / filename / number / open /
//      replace / delete. Unlimited count.
//
// Additional documents are never mixed into the verification requirement.
//
// All uploads go through the unified uploadClient (real progress, validation,
// compression, cancel, retry). A failed or cancelled upload NEVER logs the
// user out — pb.authStore is never cleared here.

const DOC_KIND = 'doc'; // PDF or image
const ADD_COLLECTION = 'user_additional_documents';

const ADD_TYPES = [
  'id_card',
  'passport_extra',
  'residence_extra',
  'driver_license',
  'other',
];

export default function IdentityDocumentsSection({ status, onChanged }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  // Derived document presence from the verification status payload.
  const hasPassport = !!status?.has_passport_file;
  const hasResidence = !!status?.has_residence_file;
  const hasLegacy = !!status?.has_document_file && !hasPassport && !hasResidence;
  const passportNumber = status?.passport_number || '';
  const residenceNumber = status?.residence_number || '';
  const legacyNumber = status?.document_number || '';
  const legacyType = status?.document_type || '';

  const count =
    (hasPassport ? 1 : 0) + (hasResidence ? 1 : 0) + (hasLegacy ? 1 : 0);
  const isApproved = String(status?.account_state || '').toLowerCase() === 'approved';

  const countLabel =
    count === 0
      ? t('identity_no_doc')
      : count === 1
        ? t('identity_documents_count_one')
        : t('identity_documents_count_n').replace('{n}', String(count));

  const canAddMore = !hasPassport || !hasResidence;

  return (
    <div className="space-y-3">
      {/* ===== 1) Basic mandatory identity document ===== */}
      <div className="rounded-lg border bg-background/50 overflow-hidden">
        {/* Compact header — always visible */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-start hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">
                {t('identity_documents_title')} <span className="text-destructive">*</span>
              </p>
              <p className="text-xs text-muted-foreground truncate">{countLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isApproved && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                <BadgeCheck size={12} /> {t('profile_status_verified')}
              </span>
            )}
            {open ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
          </div>
        </button>

        {/* Expanded details */}
        {open && (
          <div className="border-t px-4 py-4 space-y-3">
            <p className="text-[11px] text-muted-foreground">{t('identity_one_required_hint')}</p>

            {/* Uploaded identity documents only — no static "not uploaded" rows. */}
            {hasPassport && (
              <IdentityRow
                label={t('identity_passport')}
                present
                number={passportNumber}
                typeKey="passport"
                onChanged={onChanged}
              />
            )}

            {hasResidence && (
              <IdentityRow
                label={t('identity_residence')}
                present
                number={residenceNumber}
                typeKey="residence"
                onChanged={onChanged}
              />
            )}

            {/* Legacy single document row (only if no dedicated docs yet) */}
            {hasLegacy && (
              <IdentityRow
                label={
                  legacyType === 'residence'
                    ? t('identity_residence')
                    : t('identity_passport')
                }
                present
                number={legacyNumber}
                typeKey="legacy"
                onChanged={onChanged}
              />
            )}

            {/* Single upload interface.
                - No document yet → form shown directly (required section).
                - One uploaded, other type still available → "+ Add" button.
                - Both uploaded → done message. */}
            {canAddMore ? (
              count === 0 || adding ? (
                <AddIdentityForm
                  hasPassport={hasPassport}
                  hasResidence={hasResidence}
                  hideCancel={count === 0}
                  onCancel={() => setAdding(false)}
                  onDone={() => {
                    setAdding(false);
                    onChanged && onChanged();
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors min-h-[40px]"
                >
                  <Plus size={15} /> {t('identity_add_doc')}
                </button>
              )
            ) : (
              <p className="text-center text-[11px] text-muted-foreground">{t('identity_both_uploaded')}</p>
            )}
          </div>
        )}
      </div>

      {/* ===== 2) Additional documents (optional accordion) ===== */}
      <AdditionalDocumentsSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// A single identity document row (Passport / Residence / legacy).
// Shows status, number, filename, Open + Replace. Replace uploads a new file
// via the unified uploader with progress; the old file is atomically swapped
// server-side only on success.
// ---------------------------------------------------------------------------
function IdentityRow({ label, present, number, typeKey, onChanged }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [upload, setUpload] = useState(null); // { percent, status, error, name, size }
  const abortRef = useRef(null);

  const fieldMap = {
    passport: { file: 'passport_file', number: 'passport_number' },
    residence: { file: 'residence_file', number: 'residence_number' },
    legacy: { file: 'document_file', number: 'document_number' },
  };
  const fields = fieldMap[typeKey] || fieldMap.legacy;

  const filenameField =
    typeKey === 'passport'
      ? user?.passport_file
      : typeKey === 'residence'
        ? user?.residence_file
        : user?.document_file;

  const startReplace = async (file) => {
    if (!file) return;
    setUpload({ percent: 0, status: 'preparing', error: null, name: file.name, size: file.size });
    const prepared = await prepareFile(file, DOC_KIND);
    if (!prepared.ok) {
      setUpload({ percent: 0, status: 'error', error: t(prepared.error) || t('upload_error_generic'), name: file.name, size: file.size });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setUpload({ percent: 0, status: 'uploading', error: null, name: file.name, size: prepared.file.size });
    try {
      const updated = await uploadRecordFile({
        collection: 'users',
        recordId: user.id,
        fields: { [fields.file]: prepared.file },
        field: fields.file,
        signal: controller.signal,
        onProgress: (_l, total, percent) =>
          setUpload((u) => ({ ...u, percent, status: 'uploading', size: total })),
      });
      safeSyncAuthRecord(updated);
      setUpload({ percent: 100, status: 'done', error: null, name: file.name, size: prepared.file.size });
      setTimeout(() => setUpload(null), 1500);
      onChanged && onChanged();
    } catch (err) {
      if (err?.isCancelled) {
        setUpload(null);
        return;
      }
      // The real reason is logged for debugging only — the UI always shows
      // the same plain, fixed failure message (see UploadStatus below).
      console.error('Document upload failed:', err);
      setUpload({ percent: 0, status: 'error', error: uploadErrorMessage(err, t), name: file.name, size: prepared.file.size });
    } finally {
      abortRef.current = null;
    }
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (e.target) e.target.value = '';
    if (f) startReplace(f);
  };

  const retry = () => {
    fileRef.current?.click();
  };

  return (
    <div className="rounded-lg border bg-card px-3.5 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              present ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {present ? <FileCheck2 size={15} /> : <FileText size={15} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{label}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {present
                ? (number ? `# ${number}` : t('identity_uploaded'))
                : t('identity_not_uploaded')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {present && !upload && (
            <>
              <FileViewButton
                record={user}
                filename={filenameField}
                label={t('identity_open')}
                className="!px-2 !py-1 !text-[11px] min-h-[30px]"
              />
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium hover:bg-accent transition-colors min-h-[30px]">
                <RefreshCw size={12} /> {t('identity_replace')}
                <input ref={fileRef} type="file" accept={FILE_LIMITS.doc.accept} className="hidden" onChange={pickFile} />
              </label>
            </>
          )}
          {!present && !upload && (
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors min-h-[30px]">
              <Upload size={12} /> {t('identity_upload')}
              <input ref={fileRef} type="file" accept={FILE_LIMITS.doc.accept} className="hidden" onChange={pickFile} />
            </label>
          )}
        </div>
      </div>

      {/* Upload status */}
      {upload && (
        <UploadStatus upload={upload} onRetry={retry} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add a second identity document (choose type not already uploaded).
// ---------------------------------------------------------------------------
function AddIdentityForm({ hasPassport, hasResidence, hideCancel, onCancel, onDone }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [type, setType] = useState('none');
  const [number, setNumber] = useState('');
  const [file, setFile] = useState(null);
  const [upload, setUpload] = useState(null);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const abortRef = useRef(null);

  const fieldMap = {
    passport: { file: 'passport_file', number: 'passport_number' },
    residence: { file: 'residence_file', number: 'residence_number' },
  };
  const fields = fieldMap[type];

  const submit = async (pickedFile) => {
    const f = pickedFile || file;
    setErr('');
    if (type === 'none') {
      setErr(t('identity_choose_type_required'));
      return;
    }
    if (!number.trim()) {
      setErr(t('identity_doc_number'));
      return;
    }
    if (!f) {
      setErr(t('identity_pick_file'));
      return;
    }
    setUpload({ percent: 0, status: 'preparing', error: null, name: f.name, size: f.size });
    const prepared = await prepareFile(f, DOC_KIND);
    if (!prepared.ok) {
      setUpload({ percent: 0, status: 'error', error: t(prepared.error) || t('upload_error_generic'), name: f.name, size: f.size });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setUpload({ percent: 0, status: 'uploading', error: null, name: f.name, size: prepared.file.size });
    try {
      const updated = await uploadRecordFile({
        collection: 'users',
        recordId: user.id,
        fields: { [fields.number]: number.trim(), [fields.file]: prepared.file },
        field: fields.file,
        signal: controller.signal,
        onProgress: (_l, total, percent) =>
          setUpload((u) => ({ ...u, percent, size: total })),
      });
      safeSyncAuthRecord(updated);
      setUpload({ percent: 100, status: 'done', error: null, name: f.name, size: prepared.file.size });
      setTimeout(() => onDone(), 900);
    } catch (e) {
      if (e?.isCancelled) {
        setUpload(null);
        return;
      }
      // The real reason is logged for debugging only — the UI always shows
      // the same plain, fixed failure message (see UploadStatus below).
      console.error('Document upload failed:', e);
      setUpload({ percent: 0, status: 'error', error: uploadErrorMessage(e, t), name: f.name, size: prepared.file.size });
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => {
    try { abortRef.current?.abort(); } catch (_) {}
    setUpload(null);
    onCancel();
  };

  const typeOptions = [];
  if (!hasPassport) typeOptions.push({ value: 'passport', label: t('identity_passport') });
  if (!hasResidence) typeOptions.push({ value: 'residence', label: t('identity_residence') });

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('identity_choose_type')} <span className="text-destructive">*</span></Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder={t('identity_choose_type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>{t('identity_choose_type')}</SelectItem>
              {typeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('identity_doc_number')} *</Label>
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={t('identity_doc_number_placeholder')}
            className="h-10"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t('identity_pick_file')} *</Label>
        <input
          ref={fileRef}
          type="file"
          accept={FILE_LIMITS.doc.accept}
          disabled={upload?.status === 'uploading' || upload?.status === 'preparing'}
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f);
            // Selecting a file uploads it immediately (once type + number are
            // filled) — there is no separate "Upload" step to click anymore.
            if (f) submit(f);
          }}
          className="block w-full text-xs text-muted-foreground file:me-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer"
        />
        <p className="text-[10px] text-muted-foreground">{t('identity_max_size_hint')}</p>
        {file && <p className="text-[11px] text-muted-foreground">{file.name} · {formatBytes(file.size)}</p>}
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      {upload && <UploadStatus upload={upload} onRetry={() => submit()} />}

      {!hideCancel && (
        <div className="flex items-center justify-end">
          <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={upload?.status === 'uploading'} className="min-h-[36px]">
            {t('identity_cancel_add')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// ADDITIONAL DOCUMENTS — optional accordion section
// ===========================================================================
function AdditionalDocumentsSection() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await pb.collection(ADD_COLLECTION).getFullList({
        sort: '-created',
        requestKey: `add-docs-load-${user.id}-${Date.now()}`,
      });
      setDocs(rows);
    } catch (_) {
      /* ignore — optional section */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    // Realtime sync so additions/edits/deletes from other devices reflect.
    let cancelled = false;
    void pb
      .collection(ADD_COLLECTION)
      .subscribe('*', (e) => {
        if (cancelled) return;
        setDocs((prev) => {
          if (e.action === 'create') return [e.record, ...prev];
          if (e.action === 'update')
            return prev.map((d) => (d.id === e.record.id ? e.record : d));
          if (e.action === 'delete')
            return prev.filter((d) => d.id !== e.record.id);
          return prev;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void pb.collection(ADD_COLLECTION).unsubscribe('*').catch(() => {});
    };
  }, [load]);

  const typeLabel = (type) => {
    const map = {
      id_card: 'additional_type_id_card',
      passport_extra: 'additional_type_passport_extra',
      residence_extra: 'additional_type_residence_extra',
      driver_license: 'additional_type_driver_license',
      other: 'additional_type_other',
    };
    return t(map[type] || 'additional_type_other');
  };

  return (
    <div className="rounded-lg border bg-background/50 overflow-hidden">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="add-docs" className="border-0">
          <AccordionTrigger className="px-4 py-3 hover:bg-accent/30 transition-colors [&>svg]:hidden">
            <div className="flex items-center gap-2.5 min-w-0 w-full">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Paperclip size={16} />
              </span>
              <div className="min-w-0 flex-1 text-start">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold truncate">{t('additional_documents_title')}</p>
                  <span className="inline-flex items-center rounded-full border border-muted-foreground/20 bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                    {t('additional_optional_badge')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {docs.length > 0
                    ? `${docs.length} · ${t('additional_optional_badge')}`
                    : t('additional_documents_hint')}
                </p>
              </div>
              <ChevronDown size={18} className="text-muted-foreground shrink-0" />
            </div>
          </AccordionTrigger>
          <AccordionContent className="border-t px-4 py-4 space-y-3">
            <p className="text-[11px] text-muted-foreground">{t('additional_documents_hint')}</p>

            {/* Existing additional documents */}
            {!loading && docs.length === 0 && !adding && (
              <p className="text-center text-[11px] text-muted-foreground">{t('additional_empty')}</p>
            )}
            {loading && (
              <div className="flex items-center justify-center py-2 text-muted-foreground">
                <Loader2 size={14} className="animate-spin me-1.5" />
                <span className="text-xs">{t('loading')}</span>
              </div>
            )}

            {docs.map((d) => (
              <AdditionalDocRow
                key={d.id}
                record={d}
                typeLabel={typeLabel(d.type)}
                onChanged={load}
              />
            ))}

            {/* Add form */}
            {adding ? (
              <AddAdditionalForm
                onCancel={() => setAdding(false)}
                onDone={() => {
                  setAdding(false);
                  load();
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors min-h-[40px]"
              >
                <Plus size={15} /> {t('additional_add_doc')}
              </button>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A single additional document row: type / filename / number / open / replace / delete
// ---------------------------------------------------------------------------
function AdditionalDocRow({ record, typeLabel, onChanged }) {
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const [upload, setUpload] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const abortRef = useRef(null);

  const fileName = record?.file
    ? (Array.isArray(record.file) ? record.file[0] : record.file)
    : '';
  const number = record?.number || '';

  const startReplace = async (file) => {
    if (!file) return;
    setUpload({ percent: 0, status: 'preparing', error: null, name: file.name, size: file.size });
    const prepared = await prepareFile(file, DOC_KIND);
    if (!prepared.ok) {
      setUpload({ percent: 0, status: 'error', error: t(prepared.error) || t('upload_error_generic'), name: file.name, size: file.size });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setUpload({ percent: 0, status: 'uploading', error: null, name: file.name, size: prepared.file.size });
    try {
      await uploadRecordFile({
        collection: ADD_COLLECTION,
        recordId: record.id,
        fields: { file: prepared.file },
        field: 'file',
        signal: controller.signal,
        onProgress: (_l, total, percent) =>
          setUpload((u) => ({ ...u, percent, status: 'uploading', size: total })),
      });
      setUpload({ percent: 100, status: 'done', error: null, name: file.name, size: prepared.file.size });
      setTimeout(() => setUpload(null), 1500);
      onChanged && onChanged();
    } catch (err) {
      if (err?.isCancelled) {
        setUpload(null);
        return;
      }
      // The real reason is logged for debugging only — the UI always shows
      // the same plain, fixed failure message (see UploadStatus below).
      console.error('Document upload failed:', err);
      setUpload({ percent: 0, status: 'error', error: uploadErrorMessage(err, t), name: file.name, size: prepared.file.size });
    } finally {
      abortRef.current = null;
    }
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (e.target) e.target.value = '';
    if (f) startReplace(f);
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await pb.collection(ADD_COLLECTION).delete(record.id, {
        requestKey: `add-doc-del-${record.id}-${Date.now()}`,
      });
      onChanged && onChanged();
    } catch (_) {
      /* ignore */
    } finally {
      setDeleting(false);
      setConfirmDel(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card px-3.5 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileCheck2 size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{typeLabel}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {fileName}
              {number ? ` · # ${number}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!upload && !confirmDel && (
            <>
              <FileViewButton
                record={record}
                filename={fileName}
                label={t('identity_open')}
                className="!px-2 !py-1 !text-[11px] min-h-[28px]"
              />
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium hover:bg-accent transition-colors min-h-[28px]">
                <RefreshCw size={12} /> {t('identity_replace')}
                <input ref={fileRef} type="file" accept={FILE_LIMITS.doc.accept} className="hidden" onChange={pickFile} />
              </label>
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[28px]"
              >
                <Trash2 size={12} /> {t('additional_delete')}
              </button>
            </>
          )}
        </div>
      </div>

      {confirmDel && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <span className="text-[11px] text-destructive">{t('additional_delete_confirm')}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmDel(false)}
              className="rounded-lg border px-2 py-1 text-[11px] font-medium hover:bg-accent min-h-[28px]"
            >
              {t('identity_cancel_add')}
            </button>
            <button
              type="button"
              onClick={doDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded-lg bg-destructive px-2 py-1 text-[11px] font-semibold text-destructive-foreground hover:bg-destructive/90 min-h-[28px] disabled:opacity-60"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {t('additional_delete')}
            </button>
          </div>
        </div>
      )}

      {upload && (
        <UploadStatus upload={upload} onRetry={() => fileRef.current?.click()} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add an additional document: type / name / number / file
// ---------------------------------------------------------------------------
function AddAdditionalForm({ onCancel, onDone }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [type, setType] = useState('id_card');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [file, setFile] = useState(null);
  const [upload, setUpload] = useState(null);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const abortRef = useRef(null);

  const submit = async (pickedFile) => {
    const f = pickedFile || file;
    setErr('');
    if (type === 'other' && !name.trim()) {
      setErr(t('additional_name_required'));
      return;
    }
    if (!f) {
      setErr(t('additional_file_required'));
      return;
    }
    setUpload({ percent: 0, status: 'preparing', error: null, name: f.name, size: f.size });
    const prepared = await prepareFile(f, DOC_KIND);
    if (!prepared.ok) {
      setUpload({ percent: 0, status: 'error', error: t(prepared.error) || t('upload_error_generic'), name: f.name, size: f.size });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setUpload({ percent: 0, status: 'uploading', error: null, name: f.name, size: prepared.file.size });
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('name', name.trim());
      fd.append('number', number.trim());
      fd.append('owner', user.id);
      fd.append('file', prepared.file);
      await pb.collection(ADD_COLLECTION).create(fd, {
        requestKey: `add-doc-create-${user.id}-${Date.now()}`,
      });
      setUpload({ percent: 100, status: 'done', error: null, name: f.name, size: prepared.file.size });
      setTimeout(() => onDone(), 800);
    } catch (e) {
      if (e?.isCancelled) {
        setUpload(null);
        return;
      }
      // The real reason is logged for debugging only — the UI always shows
      // the same plain, fixed failure message (see UploadStatus below).
      console.error('Document upload failed:', e);
      setUpload({ percent: 0, status: 'error', error: uploadErrorMessage(e, t) || t('upload_error_generic'), name: f.name, size: prepared.file.size });
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => {
    try { abortRef.current?.abort(); } catch (_) {}
    setUpload(null);
    onCancel();
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('additional_choose_type')} *</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADD_TYPES.map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`additional_type_${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('additional_doc_number')}</Label>
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={t('additional_doc_number')}
            className="h-10"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">
          {t('additional_doc_name')}
          {type === 'other' ? ' *' : ''}
        </Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('additional_doc_name_placeholder')}
          className="h-10"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t('additional_pick_file')} *</Label>
        <input
          ref={fileRef}
          type="file"
          accept={FILE_LIMITS.doc.accept}
          disabled={upload?.status === 'uploading' || upload?.status === 'preparing'}
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f);
            // Selecting a file uploads it immediately — no separate "Upload"
            // step to click anymore.
            if (f) submit(f);
          }}
          className="block w-full text-xs text-muted-foreground file:me-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer"
        />
        <p className="text-[10px] text-muted-foreground">{t('identity_max_size_hint')}</p>
        {file && <p className="text-[11px] text-muted-foreground">{file.name} · {formatBytes(file.size)}</p>}
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      {upload && (
        <UploadStatus
          upload={upload}
          onRetry={() => submit()}
        />
      )}

      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={upload?.status === 'uploading'} className="min-h-[36px]">
          {t('additional_cancel')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload status display — simplified by design: the file uploads directly
// in the background as soon as it's picked, so this only ever shows one of
// three things — the selected file name while it's uploading (no percent,
// no size, no progress bar, no cancel button), a short success confirmation,
// or a clear error with a retry action.
// ---------------------------------------------------------------------------
// Shows the REAL reason a failed upload failed (already computed by
// uploadErrorMessage()/prepareFile() at each call site — file too large,
// wrong type, session expired, not allowed, or the server's own validation
// message) instead of one fixed generic string for every possible cause.
// This used to collapse everything into "Could not upload the file, try
// again" with the real reason only ever reaching the browser console — an
// owner (or Estate Follow's own team testing this) had no way to tell a
// too-large file from an expired session from an actual server outage,
// which made this exact failure impossible to diagnose or self-correct
// without opening DevTools. uploadErrorMessage() already returns a
// reasonably clear, translated string for every common case; it only ever
// falls through to a raw server message for a genuinely unexpected one —
// which is still far more useful than no information at all.
function UploadStatus({ upload, onRetry }) {
  const { t } = useLanguage();
  if (!upload) return null;
  if (upload.status === 'done') {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-700">
        <CheckCircle2 size={14} /> {t('upload_success')}
      </div>
    );
  }
  if (upload.status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-red-700 min-w-0">
          <AlertCircle size={14} className="shrink-0" />
          <span className="truncate">{upload.error || t('upload_error_generic')}</span>
        </span>
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 min-h-[28px] shrink-0">
          <RefreshCw size={12} /> {t('upload_retry')}
        </button>
      </div>
    );
  }
  // uploading / preparing — a plain "uploading..." status, nothing else.
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Loader2 size={12} className="animate-spin shrink-0" />
      <span className="truncate">{t('identity_uploading')}</span>
    </div>
  );
}
