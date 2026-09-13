import React, { useEffect, useRef, useState } from 'react';
import {
  FileCheck2,
  Plus,
  Trash2,
  Wallet,
  ShieldCheck,
  Receipt,
  CircleDollarSign,
  TrendingUp,
  CalendarClock,
  Landmark,
  Banknote,
  CalendarDays,
  BadgeCheck,
  Repeat,
  Layers,
  ListOrdered,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowRight,
  Home,
  Store,
  TreePine,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/MoneyInput';
import { PercentInput } from '@/components/PercentInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
import { toIsoDate } from '@/lib/dateFormat';
import { countries } from '@/lib/countries';
import { useGeoData } from '@/hooks/useGeoData';
import { parsePhone } from '@/lib/dialCodes';
import PhoneField from '@/components/PhoneField';
import NationalityField from '@/components/NationalityField';
import CityField from '@/components/CityField';
import DateField from '@/components/DateField';
import AiDocReader from '@/components/AiDocReader';
import PaymentPlanStageBuilder from '@/components/PaymentPlanStageBuilder';
import SmartPaymentPlanReader from '@/components/SmartPaymentPlanReader';
import { stagesToInstallments, sumStagesPreview, stageSummary, stagePhase } from '@/lib/paymentPlanSmart';
import { mapPaymentType } from '@/lib/smartPlanReader';
import AlertsStep from '@/components/AlertsStep';
import SectionAiAssistant from '@/components/SectionAiAssistant';
import { savePropertyAlertOverride } from '@/lib/alertsClient';
import { uploadToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/api';
import { normalizeMoneyValue } from '@/lib/money';

const emptyForm = {
  type: 'cash',
  usage_type: '',
  country: '',
  area: '',
  building: '',
  unit_number: '',
  owner_phone: '',
  owner_email: '',
  tenant_name: '',
  tenant_phone: '',
  tenant_email: '',
  total_price: '',
  down_payment: '',
  handover_status: 'under_construction',
  expected_handover_date: '',
  actual_handover_date: '',
  rent_amount: '',
  contract_start_date: '',
  contract_end_date: '',
  security_deposit: '',
  property_size: '',
  property_size_unit: 'sqm',
  developer: '',
  purchase_date: '',
  service_charge_amount: '',
  service_charge_date: '',
  service_charge_frequency: 'one_time',
  service_charge_paid_in_installments: 'no',
  service_charge_installments_count: '',
  service_charge_paid: false,
  financing_details: '',
  purchase_fees: [],
  payment_method: '',
  payment_duration_years: '',
  payment_duration_months: '',
  plan_down_pct: '',
  plan_construction_pct: '',
  plan_handover_pct: '',
  plan_post_pct: '',
  post_handover_years: '',
  post_handover_months: '',
  service_charge_value_type: 'fixed',
  service_charge_paid_status: 'unpaid',
  additional_doc_names: [],
};

const emptyFiles = {
  passport_pdf: null,
  residence_pdf: null,
  title_deed_pdf: null,
  tenant_document: null,
  lease_contract: null,
  additional_documents: [],
};

const newRentRow = () => ({ id: null, name: '', amount: '', due_date: '', status: 'unpaid' });

const num = (v) => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Compute the next service-charge due date. For a one-time charge it is just
// the stored date. For a yearly recurring charge it is the next anniversary
// on or after today (or the original date if it is still in the future).
function nextServiceDate(dateStr, frequency) {
  if (!dateStr) return '';
  const base = new Date(String(dateStr).replace(' ', 'T'));
  if (Number.isNaN(base.getTime())) return '';
  if (frequency !== 'yearly') return String(dateStr).slice(0, 10);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const next = new Date(base);
  while (next < now) {
    next.setFullYear(next.getFullYear() + 1);
  }
  return next.toISOString().slice(0, 10);
}

// Map a country name (Arabic or English, or even an ISO code) returned by the
// AI to the form's country code. Returns '' if no confident match.
function countryToCode(name) {
  if (!name) return '';
  const n = String(name).trim();
  if (!n) return '';
  const lower = n.toLowerCase();
  // Already a known code?
  const byCode = countries.find((c) => c.code.toLowerCase() === lower);
  if (byCode) return byCode.code;
  // Exact English / Arabic match.
  const exact = countries.find(
    (c) => c.en.toLowerCase() === lower || c.ar.trim() === n.trim(),
  );
  if (exact) return exact.code;
  // Partial match (AI may return a slightly different spelling).
  const partial = countries.find(
    (c) => c.en.toLowerCase().includes(lower) || c.ar.includes(n.trim()),
  );
  return partial ? partial.code : '';
}

// Small editable field used inside the AI review panels.
function ReviewField({ label, value, onChange, type = 'text', dir, placeholder, t, money = false, percent = false }) {
  const empty = value == null || value === '';
  const Field = money || type === 'money' ? MoneyInput : percent ? PercentInput : Input;
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Field
        type={money || type === 'money' || percent ? undefined : type}
        value={value == null ? '' : String(value)}
        onChange={onChange}
        dir={dir}
        placeholder={empty ? (placeholder || t('ai_not_found')) : ''}
        className="min-h-[40px]"
      />
    </div>
  );
}

// Property size input with unit selector (m² / ft²) and live auto-conversion.
// Entering a value in one unit instantly shows the equivalent in the other.
function SizeField({ value, unit, onValueChange, onUnitChange, t }) {
  const SQM_TO_SQFT = 10.7639;
  const numeric = parseFloat(String(value || ''));
  const hasValue = !Number.isNaN(numeric) && numeric > 0;
  const otherUnit = unit === 'sqm' ? 'sqft' : 'sqm';
  const converted = hasValue
    ? unit === 'sqm'
      ? numeric * SQM_TO_SQFT
      : numeric / SQM_TO_SQFT
    : null;
  const convertedLabel = converted != null
    ? t('size_conversion')
        .replace('{value}', converted.toFixed(converted >= 100 ? 0 : 2))
        .replace('{unit}', otherUnit === 'sqm' ? t('size_unit_sqm') : t('size_unit_sqft'))
    : '';

  return (
    <div className="space-y-2">
      <Label>{t('ai_field_size')}</Label>
      <div className="flex gap-2 items-stretch">
        <Input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          dir="ltr"
          className="min-h-[44px] flex-1"
          inputMode="decimal"
        />
        <Select value={unit || 'sqm'} onValueChange={onUnitChange}>
          <SelectTrigger className="min-h-[44px] w-[110px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sqm">{t('size_unit_sqm')}</SelectItem>
            <SelectItem value="sqft">{t('size_unit_sqft')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {convertedLabel && (
        <p className="text-[11px] text-muted-foreground" dir="ltr">{convertedLabel}</p>
      )}
    </div>
  );
}

// Section header: title + icon.
function SectionHead({ icon: Icon, title }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon size={16} className="shrink-0 text-primary" /> : null}
          <p className="text-sm font-bold leading-snug">{title}</p>
        </div>
      </div>
    </div>
  );
}

// Plain file upload (no AI) — used by the Property Documents section.
// Uploads to Cloudinary (via the Express signed endpoint) and reports both the
// staged File (for validation) and the hosted URL (for saving). Falls back to
// the legacy PocketBase file path if Cloudinary is not configured.
//
// `existingUrl` is the Cloudinary URL of an already-saved file (preferred);
// `existing` + `record` are the legacy PocketBase file field (fallback).
function PlainFileUpload({ label, required, file, fileUrl, existing, existingUrl, record, fieldKey, onFileChange, t }) {
  const inputId = `pfu-${fieldKey}`;
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const legacyUrl = existing && record ? pb.files.getURL(record, existing) : '';
  const displayUrl = fileUrl || existingUrl || legacyUrl;
  const displayName = existing || (fileUrl || existingUrl ? (file?.name || 'document') : '');

  const handlePick = async (e) => {
    const f = e.target.files?.[0] || null;
    e.target.value = '';
    if (!f) { onFileChange(null, ''); return; }
    setUploading(true);
    setUploadErr('');
    try {
      const configured = await isCloudinaryConfigured();
      let url = '';
      if (configured) {
        const res = await uploadToCloudinary(f);
        url = res?.url || '';
      }
      onFileChange(f, url);
    } catch (err) {
      setUploadErr(err?.message || 'Upload failed');
      // Still hand the file up so the legacy PocketBase path can store it.
      onFileChange(f, '');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold">
          {label}{required && <span className="text-destructive"> *</span>}
        </Label>
        <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 min-h-[36px]">
          {existing || file || fileUrl || existingUrl ? t('replace_file') || (t('profile_doc_replace') || 'Replace') : (t('additional_upload') || 'Upload')}
        </label>
        <input
          id={inputId}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handlePick}
          disabled={uploading}
        />
      </div>
      {uploading ? (
        <p className="text-xs text-primary">{t('loading') || 'Uploading…'}</p>
      ) : file ? (
        <p className="text-xs text-foreground truncate"><FileCheck2 size={13} className="inline me-1 text-primary" />{file.name}</p>
      ) : displayUrl ? (
        <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2 truncate inline-flex items-center gap-1">
          <FileCheck2 size={13} /> {displayName || 'document'}
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">{t('profile_no_doc') || '—'}</p>
      )}
      {uploadErr && <p className="text-xs text-destructive">{uploadErr}</p>}
    </div>
  );
}

// Multi-file upload for additional property documents (name + file per row).
// Each picked file is uploaded to Cloudinary; `urls` (aligned with `files`)
// carries the hosted URLs. `existingDocs` lists already-saved Cloudinary docs
// ({name, url}); `existing` + `record` are the legacy PocketBase files.
function AdditionalDocsUpload({ files, names, urls, onFilesChange, onNamesChange, existing, existingDocs, record, t }) {
  const existingList = Array.isArray(existing) ? existing : [];
  const existingCloud = Array.isArray(existingDocs) ? existingDocs : [];
  const legacyUrls = record && existingList.length
    ? existingList.map((f) => pb.files.getURL(record, f))
    : [];
  const [uploadingIdx, setUploadingIdx] = useState(-1);

  const pickFile = async (i, e) => {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    const nextFiles = files.map((x, j) => (j === i ? file : x));
    if (!file) {
      onFilesChange(nextFiles, (urls || []).map((u, j) => (j === i ? '' : u)));
      return;
    }
    setUploadingIdx(i);
    try {
      const configured = await isCloudinaryConfigured();
      let url = '';
      if (configured) {
        const res = await uploadToCloudinary(file);
        url = res?.url || '';
      }
      const nextUrls = (urls && urls.length ? urls : files.map(() => '')).map((u, j) => (j === i ? url : u));
      onFilesChange(nextFiles, nextUrls);
    } catch {
      const nextUrls = (urls && urls.length ? urls : files.map(() => '')).map((u, j) => (j === i ? '' : u));
      onFilesChange(nextFiles, nextUrls);
    } finally {
      setUploadingIdx(-1);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold">{t('additional_docs_section')}</p>
        <button
          type="button"
          onClick={() => { onFilesChange([...files, null], [...(urls || files.map(() => '')), '']); onNamesChange([...names, '']); }}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-accent min-h-[36px]"
        >
          <Plus size={13} className="text-primary" />
          {t('additional_doc_add')}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('additional_docs_hint')}</p>
      {files.length === 0 && existingList.length === 0 && existingCloud.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('additional_doc_empty')}</p>
      ) : (
        <div className="space-y-2">
          {existingCloud.map((d, i) => (
            <a key={`exc-${i}`} href={d.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary underline truncate">
              <FileCheck2 size={13} className="inline me-1" />{d.name || 'document'}
            </a>
          ))}
          {existingList.map((f, i) => (
            <a key={`ex-${i}`} href={legacyUrls[i]} target="_blank" rel="noopener noreferrer" className="block text-xs text-primary underline truncate">
              <FileCheck2 size={13} className="inline me-1" />{f}
            </a>
          ))}
          {files.map((f, i) => (
            <div key={`new-${i}`} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-[11px]">{t('additional_doc_name')}{f && <span className="text-destructive"> *</span>}</Label>
                <Input
                  value={names[i] || ''}
                  onChange={(e) => onNamesChange(names.map((n, j) => (j === i ? e.target.value : n)))}
                  required={!!f}
                  className="min-h-[40px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-2.5 py-2 text-xs font-semibold hover:bg-accent min-h-[40px]">
                  {uploadingIdx === i ? (t('loading') || 'Uploading…') : (f ? (t('replace_file') || 'Replace') : (t('additional_upload') || 'Upload'))}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => pickFile(i, e)}
                    disabled={uploadingIdx === i}
                  />
                </label>
                {f && <p className="text-[11px] text-foreground truncate max-w-[120px]">{f.name}</p>}
                <button
                  type="button"
                  onClick={() => { onFilesChange(files.filter((_, j) => j !== i), (urls || []).filter((_, j) => j !== i)); onNamesChange(names.filter((_, j) => j !== i)); }}
                  className="text-destructive hover:bg-red-50 rounded p-1.5 min-h-[40px] min-w-[40px]"
                  aria-label={t('remove_installment')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PropertyForm = ({
  open,
  onOpenChange,
  onSaved,
  property,
  adminMode,
  owners,
  adminOwner,
  onAdminOwnerChange,
  // When set ('installment' | 'cash'), edit the same property id as a type conversion.
  convertTarget = null,
}) => {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  // Unified geo source (PocketBase platform_countries + static fallback) for
  // any in-render country name lookup — not a private re-implementation —
  // so a country the Super Admin disables/renames/adds is reflected here too.
  const { countryName: geoCountryName } = useGeoData();
  const isEdit = !!property;
  const isConvert = !!convertTarget && isEdit;
  // When an admin creates a property on behalf of an owner, the property
  // and its payment rows belong to that owner, not to the admin.
  const effectiveOwner = adminOwner || property?.owner || user?.id;
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState(emptyFiles);
  // Cloudinary URLs aligned with `files` (single-file fields -> string;
  // additional_documents -> string[] aligned with the files array).
  const [fileUrls, setFileUrls] = useState({ ...emptyFiles, additional_documents: [] });
  const [rows, setRows] = useState([]);
  const [rentRows, setRentRows] = useState([]);
  const [serviceFeeRows, setServiceFeeRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethodError, setPaymentMethodError] = useState(false);
  const paymentMethodRef = useRef(null);
  const [confirmApply, setConfirmApply] = useState(null); // { message, onConfirm }
  const [confirmClearPlan, setConfirmClearPlan] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  // 'select' = property-type picker, 'rented-source' / 'rented-existing' =
  // rented-specific source picker, 'form' = the actual entry form.
  const [step, setStep] = useState('select');
  // Rented flow: did the owner pick an existing property or add a new one?
  const [rentedSource, setRentedSource] = useState(null); // 'existing' | 'new'
  const [selectedProperty, setSelectedProperty] = useState(null); // existing property record
  const [existingProperties, setExistingProperties] = useState([]);
  const [existingSearch, setExistingSearch] = useState('');
  const [loadingExisting, setLoadingExisting] = useState(false);
  // Alerts & Follow-up config for this property (saved after the property record exists).
  const [alertsConfig, setAlertsConfig] = useState({ enabled: true, reminders: [7, 1] });
  // Owner's properties — used to detect active rental match for summary status.
  const [ownerProps, setOwnerProps] = useState([]);
  // Installment-only UI state: payment-plan classification + add-installment mini-form.
  const [planType, setPlanType] = useState('');
  /** After plan type is chosen: '' | 'smart' | 'builder' — only one path visible. */
  const [planEntryMode, setPlanEntryMode] = useState('');
  const [customStages, setCustomStages] = useState([]);
  // Unified Plan Builder stages (the single source of truth for the whole
  // payment plan). The user builds every phase — major payments, construction
  // installments, handover payment and post-handover installments — from one
  // builder, then presses "إنشاء الخطة" to generate the installment schedule.
  const [planStages, setPlanStages] = useState([]);
  const [showNewInst, setShowNewInst] = useState(false);
  // Incrementing this key resets the internal state of the smart reader and
  // builder after the user clears the current plan.
  const [planResetKey, setPlanResetKey] = useState(0);
  // Collapsed by default after plan approval — user taps the compact
  // "أقساط (عدد: N)" chip to expand the full installment list.
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false);
  const [instPage, setInstPage] = useState(1);
  // Keep the installments pagination page in range as rows are added/removed.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / 10));
    setInstPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [rows.length]);
  const [newInst, setNewInst] = useState({ amount: '', due_date: '', phase: 'pre_handover', percentage: '', note: '', status: 'unpaid' });
  // Which section AI chat is open (property_info | purchase_details | …).
  const [openSectionAi, setOpenSectionAi] = useState(null);
  // Smart Payment Plan Reader — file hashes already imported (duplicate guard).
  const [smartImportHashes, setSmartImportHashes] = useState([]);
  // Session key for the current add/edit flow — prevents wipe on auth refresh.
  const sessionKeyRef = useRef('');
  const allowCloseRef = useRef(false);
  const draftTimerRef = useRef(null);
  const DRAFT_KEY = 'ef_property_form_draft_v1';

  const toggleSectionAi = (key) => {
    setOpenSectionAi((cur) => (cur === key ? null : key));
  };

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  };

  const requestClose = () => {
    allowCloseRef.current = true;
    clearDraft();
    sessionKeyRef.current = '';
    onOpenChange(false);
    // Reset after Radix processes the close.
    window.setTimeout(() => {
      allowCloseRef.current = false;
    }, 0);
  };

  const handleDialogOpenChange = (next) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    // Ignore accidental closes (overlay, escape, remount). Only explicit
    // back/cancel/save may leave the page.
    if (allowCloseRef.current) {
      onOpenChange(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setOpenSectionAi(null);
      return;
    }
  }, [open]);

  // Persist draft while the form is open (new property only) so auth refresh
  // / remount never loses typed data, plan rows, or AI results.
  useEffect(() => {
    if (!open || property) return undefined;
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      try {
        const payload = {
          form,
          rows,
          rentRows,
          serviceFeeRows,
          planType,
          planEntryMode,
          planStages,
          customStages,
          step,
          alertsConfig,
          smartImportHashes,
          rentedSource,
          savedAt: Date.now(),
        };
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      } catch {
        /* ignore quota */
      }
    }, 400);
    return () => {
      if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    };
  }, [
    open,
    property,
    form,
    rows,
    rentRows,
    serviceFeeRows,
    planType,
    planEntryMode,
    planStages,
    customStages,
    step,
    alertsConfig,
    smartImportHashes,
    rentedSource,
  ]);

  useEffect(() => {
    if (!open) return;
    // Only (re)initialize when the logical session changes — NOT when the
    // `user` object reference updates after authRefresh / heartbeat.
    const nextKey = property?.id
      ? `edit:${property.id}:${convertTarget || ''}`
      : `new:${adminOwner || 'self'}`;
    if (sessionKeyRef.current === nextKey) {
      return;
    }
    sessionKeyRef.current = nextKey;

    // Restore draft for a new property if present and fresh (< 24h).
    if (!property) {
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft && draft.savedAt && Date.now() - draft.savedAt < 86400000) {
            if (draft.form) setForm({ ...emptyForm, ...draft.form });
            if (Array.isArray(draft.rows)) setRows(draft.rows);
            if (Array.isArray(draft.rentRows)) setRentRows(draft.rentRows);
            if (Array.isArray(draft.serviceFeeRows)) setServiceFeeRows(draft.serviceFeeRows);
            if (draft.planType != null) setPlanType(draft.planType);
            if (draft.planEntryMode != null) setPlanEntryMode(draft.planEntryMode);
            if (Array.isArray(draft.planStages)) setPlanStages(draft.planStages);
            if (Array.isArray(draft.customStages)) setCustomStages(draft.customStages);
            if (draft.step) setStep(draft.step);
            if (draft.alertsConfig) setAlertsConfig(draft.alertsConfig);
            if (Array.isArray(draft.smartImportHashes)) setSmartImportHashes(draft.smartImportHashes);
            if (draft.rentedSource != null) setRentedSource(draft.rentedSource);
            setError('');
            setFiles(emptyFiles);
            setFileUrls({ ...emptyFiles, additional_documents: [] });
            setConfirmConvert(false);
            // Still load owner props below.
            const ownerId = adminOwner || user?.id;
            if (ownerId) {
              pb.collection('properties')
                .getFullList({ filter: `owner = "${ownerId}"`, requestKey: `owner-props-${ownerId}` })
                .then(setOwnerProps)
                .catch(() => setOwnerProps([]));
            }
            return;
          }
        }
      } catch {
        /* fall through to fresh init */
      }
    }

    setError('');
    setFiles(emptyFiles);
    setFileUrls({ ...emptyFiles, additional_documents: [] });
    setRentRows([]);
    setServiceFeeRows([]);
    setRentedSource(null);
    setSelectedProperty(null);
    setExistingSearch('');
    setExistingProperties([]);
    setConfirmConvert(false);
    setPlanType('');
    setCustomStages([]);
    setPlanStages([]);
    setShowNewInst(false);
    setNewInst({ amount: '', due_date: '', phase: 'pre_handover', percentage: '', note: '', status: 'unpaid' });
    // Editing an existing property skips the type picker; new properties start on it.
    setStep(property ? 'form' : 'select');
    if (property) {
      const targetType = convertTarget || property.type || 'cash';
      setForm({
        type: targetType,
        usage_type: property.usage_type || '',
        country: property.country || '',
        area: property.area || '',
        building: property.building || '',
        unit_number: property.unit_number || '',
        owner_phone: user?.phone || property.owner_phone || '',
        owner_email: user?.email || property.owner_email || '',
        tenant_name: property.tenant_name || '',
        tenant_phone: property.tenant_phone || '',
        tenant_email: property.tenant_email || '',
        total_price: property.total_price || '',
        down_payment: property.down_payment || '',
        handover_status: property.handover_status || 'under_construction',
        expected_handover_date: property.expected_handover_date
          ? String(property.expected_handover_date).slice(0, 10)
          : '',
        actual_handover_date: property.actual_handover_date
          ? String(property.actual_handover_date).slice(0, 10)
          : '',
        rent_amount: property.rent_amount || '',
        contract_start_date: property.contract_start_date
          ? String(property.contract_start_date).slice(0, 10)
          : '',
        contract_end_date: property.contract_end_date
          ? String(property.contract_end_date).slice(0, 10)
          : '',
        security_deposit: property.security_deposit || '',
        property_size: property.property_size || '',
        property_size_unit: property.property_size_unit || 'sqm',
        developer: property.developer || '',
        purchase_date: property.purchase_date
          ? String(property.purchase_date).slice(0, 10)
          : '',
        service_charge_amount: property.service_charge_amount || '',
        service_charge_date: property.service_charge_date
          ? String(property.service_charge_date).slice(0, 10)
          : '',
        service_charge_frequency: property.service_charge_frequency || 'one_time',
        service_charge_paid_in_installments:
          property.service_charge_paid_in_installments ? 'yes' : 'no',
        service_charge_installments_count:
          property.service_charge_installments_count != null
            ? String(property.service_charge_installments_count)
            : '',
        service_charge_paid: Array.isArray(property.service_charge_schedule) &&
          property.service_charge_schedule.length > 0
          ? !!property.service_charge_schedule[0].paid
          : false,
        financing_details: property.financing_details || '',
        purchase_fees: Array.isArray(property.purchase_fees) ? property.purchase_fees : [],
        payment_method: property.payment_method || '',
        payment_duration_years: property.payment_duration_years != null ? String(property.payment_duration_years) : '',
        payment_duration_months: property.payment_duration_months != null ? String(property.payment_duration_months) : '',
        plan_down_pct: property.plan_down_pct != null ? String(property.plan_down_pct) : '',
        plan_construction_pct: property.plan_construction_pct != null ? String(property.plan_construction_pct) : '',
        plan_handover_pct: property.plan_handover_pct != null ? String(property.plan_handover_pct) : '',
        plan_post_pct: property.plan_post_pct != null ? String(property.plan_post_pct) : '',
        post_handover_years: property.post_handover_years != null ? String(property.post_handover_years) : '',
        post_handover_months: property.post_handover_months != null ? String(property.post_handover_months) : '',
        service_charge_value_type: property.service_charge_value_type || 'fixed',
        service_charge_paid_status: property.service_charge_paid_status || 'unpaid',
        additional_doc_names: Array.isArray(property.additional_doc_names) ? property.additional_doc_names : [],
      });
      const savedPlanType = property.payment_plan_type || '';
      if (['type1', 'type2', 'type3', 'type4', 'type5'].includes(savedPlanType)) {
        setPlanType(savedPlanType === 'type3' ? 'type1' : savedPlanType);
      } else {
        setPlanType('');
      }
      const stages = Array.isArray(property.plan_custom_stages) ? property.plan_custom_stages : [];
      setCustomStages(
        stages.map((s, i) => ({
          id: s?.id || `stage-${i}-${Date.now()}`,
          name: s?.name != null ? String(s.name) : '',
          percentage: s?.percentage != null ? String(s.percentage) : '',
          due_date: s?.due_date ? String(s.due_date).slice(0, 10) : '',
        })),
      );
      // Load the unified plan-builder stages saved on the property (if any).
      const savedPlanStages = Array.isArray(property.payment_plan_stages)
        ? property.payment_plan_stages
        : [];
      setPlanStages(
        savedPlanStages.map((s, i) => ({
          ...s,
          id: s?.id || `stage-${i}-${Date.now()}`,
        })),
      );
      // Load saved service-fee schedule rows (if any).
      const savedSchedule = Array.isArray(property.service_charge_schedule)
        ? property.service_charge_schedule
        : [];
      setServiceFeeRows(
        savedSchedule.map((r) => ({
          amount: r.amount != null ? String(r.amount) : '',
          due_date: r.due_date ? String(r.due_date).slice(0, 10) : '',
          paid: !!r.paid,
        })),
      );
      // Load installment rows when editing installment or converting cash → installment.
      if (property.type === 'installment' || convertTarget === 'installment') {
        pb
          .collection('payments')
          .getFullList({
            filter: `property = "${property.id}" && kind = "installment"`,
            sort: 'due_date',
          })
          .then((pays) =>
            setRows(
              pays.map((p) => ({
                id: p.id,
                amount: String(p.amount ?? ''),
                due_date: String(p.due_date || '').slice(0, 10),
                status: p.status === 'paid' ? 'paid' : p.status === 'overdue' ? 'overdue' : 'unpaid',
                phase: p.phase || 'pre_handover',
                percentage: p.percentage != null ? String(p.percentage) : '',
                note: p.note || '',
                relative: p.relative_date || null,
                relative_to: p.relative_date ? p.relative_date.to : null,
                offset_months: p.relative_date ? p.relative_date.offset_months : null,
                source: p.plan_source || 'manual',
                confidence: p.confidence || null,
                payment_type: p.payment_type || null,
                raw_label: p.raw_label || '',
                source_page: p.source_page != null ? p.source_page : null,
                payment_plan_id: p.payment_plan_id || null,
              })),
            ),
          )
          .catch(() => setRows([]));
      } else {
        setRows([]);
      }
      if (property.type === 'rented') {
        pb
          .collection('payments')
          .getFullList({
            filter: `property = "${property.id}" && kind = "rent"`,
            sort: 'due_date',
          })
          .then((pays) =>
            setRentRows(
              pays.map((p) => ({
                id: p.id,
                name: p.label || '',
                amount: String(p.amount ?? ''),
                due_date: String(p.due_date || '').slice(0, 10),
                status: p.status === 'paid' ? 'paid' : 'unpaid',
              })),
            ),
          )
          .catch(() => setRentRows([]));
      }
    } else {
      setForm({ ...emptyForm, owner_phone: user?.phone || '', owner_email: user?.email || '' });
      setRows([]);
      setPlanType('');
      setPlanEntryMode('');
      setPlanStages([]);
      setCustomStages([]);
      setSmartImportHashes([]);
    }
    // Load sibling properties for rental-status matching in summaries.
    const ownerId = adminOwner || property?.owner || user?.id;
    if (ownerId) {
      pb.collection('properties')
        .getFullList({ filter: `owner = "${ownerId}"`, requestKey: `owner-props-${ownerId}` })
        .then(setOwnerProps)
        .catch(() => setOwnerProps([]));
    } else {
      setOwnerProps([]);
    }
    // Intentionally omit `user` object — only identity fields above. Auth
    // refresh must never re-run this init and wipe in-progress form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, property?.id, convertTarget, adminOwner]);

  // Load existing alert override when editing; reset for new properties.
  useEffect(() => {
    if (!open) return;
    const pid = property?.id || selectedProperty?.id;
    if (pid) {
      pb.collection('alert_settings')
        .getFullList({ requestKey: `pf-alert-set-${pid}-${Date.now()}` })
        .then((rows) => {
          const ov = rows[0]?.property_overrides;
          const cfg = ov && ov[pid];
          if (cfg) setAlertsConfig({ enabled: cfg.enabled !== false, reminders: cfg.reminders || [7, 1] });
          else setAlertsConfig({ enabled: true, reminders: [7, 1] });
        })
        .catch(() => setAlertsConfig({ enabled: true, reminders: [7, 1] }));
    } else {
      setAlertsConfig({ enabled: true, reminders: [7, 1] });
    }
  }, [open, property, selectedProperty]);

  // Robust setter: accepts either a DOM event (Input/Select) or a plain
  // value string (DateField passes an ISO string directly).
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));
  const setFile = (key) => (file, url) => {
    setFiles((f) => ({ ...f, [key]: file }));
    setFileUrls((f) => ({ ...f, [key]: url || '' }));
  };

  // Pick a property type from the selection screen and move into the form.
  // Usage type (residential / commercial / land) is chosen inside each form,
  // not on this step.
  const chooseType = (type) => {
    setForm((f) => ({ ...f, type }));
    setError('');
    // Rented properties first ask for a source (existing vs new).
    if (type === 'rented' && !isEdit) {
      setStep('rented-source');
    } else {
      setStep('form');
    }
  };

  const chooseRentedSource = (source) => {
    setRentedSource(source);
    setError('');
    if (source === 'new') {
      setSelectedProperty(null);
      setStep('form');
    } else if (source === 'existing') {
      setStep('rented-existing');
      loadExistingProperties();
    }
  };

  const loadExistingProperties = () => {
    setLoadingExisting(true);
    const filter = `owner = "${effectiveOwner}" && status = "approved" && type != "rented"`;
    pb.collection('properties')
      .getFullList({ filter, sort: '-created' })
      .then((rows) => setExistingProperties(rows || []))
      .catch(() => setExistingProperties([]))
      .finally(() => setLoadingExisting(false));
  };

  const countryName = (code) => (code ? geoCountryName(code, lang) || code : '');

  const selectExistingProperty = (prop) => {
    setSelectedProperty(prop);
    // Import the saved property details into the form (shown read-only).
    setForm((f) => ({
      ...f,
      type: 'rented',
      usage_type: prop.usage_type || f.usage_type,
      country: prop.country || f.country,
      area: prop.area || f.area,
      building: prop.building || f.building,
      unit_number: prop.unit_number || f.unit_number,
      owner_phone: prop.owner_phone || f.owner_phone,
      owner_email: prop.owner_email || f.owner_email,
      property_size: prop.property_size || f.property_size,
      developer: prop.developer || f.developer,
      total_price: prop.total_price || f.total_price,
      down_payment: prop.down_payment || f.down_payment,
      handover_status: prop.handover_status || f.handover_status,
      expected_handover_date: prop.expected_handover_date
        ? String(prop.expected_handover_date).slice(0, 10)
        : f.expected_handover_date,
      purchase_date: prop.purchase_date
        ? String(prop.purchase_date).slice(0, 10)
        : f.purchase_date,
      service_charge_amount: prop.service_charge_amount || f.service_charge_amount,
      service_charge_date: prop.service_charge_date
        ? String(prop.service_charge_date).slice(0, 10)
        : f.service_charge_date,
      service_charge_frequency: prop.service_charge_frequency || f.service_charge_frequency,
    }));
    setStep('form');
  };

  // Commit the add-installment mini-form as a new independent installment record.
  const commitNewInst = () => {
    if (!num(newInst.amount) || !newInst.due_date) return;
    setRows((r) => [
      ...r,
      {
        id: null,
        amount: newInst.amount,
        due_date: newInst.due_date,
        status: newInst.status,
        phase: newInst.phase || 'pre_handover',
        percentage: newInst.percentage,
        note: newInst.note,
      },
    ]);
    setNewInst({ amount: '', due_date: '', phase: 'pre_handover', percentage: '', note: '', status: 'unpaid' });
    setShowNewInst(false);
  };

  // Group installment rows by phase for visual separation (pre / handover / post).
  const phaseGroups = [
    { key: 'first_payment', label: t('phase_first_payment') },
    { key: 'pre_handover', label: t('phase_pre_handover') },
    { key: 'handover', label: t('phase_handover') },
    { key: 'post_handover', label: t('phase_post_handover') },
  ];
  const rowsByPhase = (phase) => rows.filter((r) => (r.phase || 'pre_handover') === phase);
  const updateRow = (i, key, val) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  const updateRowPhase = (i, phase) =>
    setRows((r) =>
      r.map((row, idx) =>
        idx === i
          ? {
              ...row,
              phase,
              payment_type:
                phase === 'first_payment'
                  ? 'down_payment'
                  : phase === 'handover'
                    ? 'handover'
                    : phase === 'post_handover'
                      ? 'post_handover'
                      : row.payment_type === 'down_payment' || row.payment_type === 'first_payment'
                        ? 'installment'
                        : row.payment_type || 'installment',
            }
          : row,
      ),
    );
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));

  // Clear every locally entered payment-plan representation in one action:
  // flat installment rows, builder stages, AI source metadata and reader
  // hashes. The child keys reset the reader/builder UI without changing their
  // extraction or generation logic.
  const clearPaymentPlan = () => {
    setRows([]);
    setPlanStages([]);
    setCustomStages([]);
    setSmartImportHashes([]);
    setShowNewInst(false);
    setNewInst({ amount: '', due_date: '', phase: 'pre_handover', percentage: '', note: '', status: 'unpaid' });
    setInstallmentsExpanded(false);
    setInstPage(1);
    setPlanResetKey((key) => key + 1);
    setForm((f) => ({
      ...f,
      payment_plan_source: '',
      payment_plan_source_files: [],
      payment_plan_currency: null,
      payment_plan_total_price: null,
    }));
    setConfirmClearPlan(false);
  };

  const addRentRow = () => setRentRows((r) => [...r, newRentRow()]);
  const updateRentRow = (i, key, val) =>
    setRentRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  const removeRentRow = (i) => setRentRows((r) => r.filter((_, idx) => idx !== i));

  // --- Service-fee installment schedule helpers ---
  const addServiceFeeRow = () =>
    setServiceFeeRows((r) => [...r, { amount: '', due_date: '', paid: false, note: '' }]);
  const updateServiceFeeRow = (i, key, val) =>
    setServiceFeeRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  const removeServiceFeeRow = (i) =>
    setServiceFeeRows((r) => r.filter((_, idx) => idx !== i));

  // When the number of annual service-fee payments changes, (re)build the
  // schedule rows. Existing rows are preserved where possible; the equal-split
  // option divides the annual amount across all rows.
  const rebuildServiceFeeRows = (count, equalSplit) => {
    const n = Math.max(0, Math.min(12, Number(count) || 0));
    const total = num(form.service_charge_amount);
    // Equal split example: 5000 ÷ 4 = 1250 each (2 decimal places).
    const each = n > 0 ? Math.round((total / n) * 100) / 100 : 0;
    setServiceFeeRows((prev) => {
      const next = [];
      for (let i = 0; i < n; i += 1) {
        const existing = prev[i] || {};
        next.push({
          amount: equalSplit ? (each ? String(each) : '') : existing.amount || '',
          due_date: existing.due_date || '',
          paid: existing.paid || false,
          note: existing.note || '',
        });
      }
      return next;
    });
  };

  const splitServiceFeeEqually = () => {
    const n = serviceFeeRows.length || Number(form.service_charge_installments_count) || 0;
    if (n <= 0) return;
    const total = num(form.service_charge_amount);
    const each = Math.round((total / n) * 100) / 100;
    setServiceFeeRows((r) =>
      r.map((row) => ({ ...row, amount: each ? String(each) : '' })),
    );
  };

  // --- AI apply handlers (with overwrite confirmation) ---

  const guardApply = (data, mapper, hasConflict) => {
    if (hasConflict && hasConflict(data)) {
      setConfirmApply({
        message: t('ai_overwrite_confirm'),
        onConfirm: () => {
          mapper(data);
          setConfirmApply(null);
        },
      });
    } else {
      mapper(data);
    }
  };

  const applyPropertyData = (d) => {
    setForm((f) => ({
      ...f,
      // Keep the type the owner already chose (cash / installment / rented).
      country: d.country ? countryToCode(d.country) || f.country : f.country,
      area: d.area != null && d.area !== '' ? d.area : f.area,
      building: d.building != null && d.building !== '' ? d.building : f.building,
      unit_number: d.unit_number != null && d.unit_number !== '' ? d.unit_number : f.unit_number,
      total_price: d.total_price != null && d.total_price !== '' ? String(d.total_price) : f.total_price,
      handover_status:
        d.handover_status === 'under_construction' || d.handover_status === 'handover_completed'
          ? d.handover_status
          : f.handover_status,
      expected_handover_date: d.expected_handover_date
        ? String(d.expected_handover_date).slice(0, 10)
        : f.expected_handover_date,
      property_size:
        d.property_size != null && d.property_size !== '' ? d.property_size : f.property_size,
      developer: d.developer != null && d.developer !== '' ? d.developer : f.developer,
    }));
  };

  const propertyConflict = (d) => {
    const checks = [
      d.country != null && d.country !== '' && form.country,
      d.area != null && d.area !== '' && form.area,
      d.building != null && d.building !== '' && form.building,
      d.unit_number != null && d.unit_number !== '' && form.unit_number,
      d.total_price != null && d.total_price !== '' && form.total_price,
      d.property_size != null && d.property_size !== '' && form.property_size,
      d.developer != null && d.developer !== '' && form.developer,
      d.handover_status != null && d.handover_status !== '' && form.handover_status,
      d.expected_handover_date != null && d.expected_handover_date !== '' && form.expected_handover_date,
    ];
    return checks.some(Boolean);
  };

  const applyInstallmentData = (d, applyMode = 'replace') => {
    setForm((f) => ({
      ...f,
      type: f.type === 'cash' || f.type === 'rented' ? 'installment' : f.type,
      total_price: d.total_price != null && d.total_price !== '' ? String(d.total_price) : f.total_price,
      down_payment: d.down_payment != null ? String(d.down_payment) : f.down_payment,
      handover_status:
        d.handover_status === 'under_construction' || d.handover_status === 'handover_completed'
          ? d.handover_status
          : f.handover_status,
      expected_handover_date: d.expected_handover_date
        ? String(d.expected_handover_date).slice(0, 10)
        : f.expected_handover_date,
      plan_down_pct: d.plan_down_pct != null && d.plan_down_pct !== '' ? String(d.plan_down_pct) : f.plan_down_pct,
      plan_construction_pct:
        d.plan_construction_pct != null && d.plan_construction_pct !== ''
          ? String(d.plan_construction_pct)
          : f.plan_construction_pct,
      plan_handover_pct:
        d.plan_handover_pct != null && d.plan_handover_pct !== ''
          ? String(d.plan_handover_pct)
          : f.plan_handover_pct,
      plan_post_pct:
        d.plan_post_pct != null && d.plan_post_pct !== '' ? String(d.plan_post_pct) : f.plan_post_pct,
      post_handover_years:
        d.post_handover_years != null ? String(d.post_handover_years) : f.post_handover_years,
      post_handover_months:
        d.post_handover_months != null ? String(d.post_handover_months) : f.post_handover_months,
      // Keep plan source metadata on the form draft (not a PB field — stripped on save if unknown)
      payment_plan_source: d.source || f.payment_plan_source || '',
      payment_plan_source_files: Array.isArray(d.source_files)
        ? d.source_files
        : f.payment_plan_source_files || [],
    }));
    // Infer / apply plan type from AI extraction without inventing missing %.
    const explicitType = d.plan_type || d.payment_plan_type;
    if (['type1', 'type2', 'type3', 'type4', 'type5'].includes(explicitType)) {
      setPlanType(explicitType === 'type3' ? 'type1' : explicitType);
    } else if (Array.isArray(d.custom_stages) && d.custom_stages.length) {
      setPlanType('type5');
    } else {
      const hasD = d.plan_down_pct != null && d.plan_down_pct !== '';
      const hasC = d.plan_construction_pct != null && d.plan_construction_pct !== '';
      const hasH = d.plan_handover_pct != null && d.plan_handover_pct !== '';
      const hasP = d.plan_post_pct != null && d.plan_post_pct !== '';
      if (hasP) setPlanType('type2');
      else if (hasD && hasH && !hasC) setPlanType('type4');
      else if (hasD && hasC && hasH) setPlanType('type1');
      else if (hasD || hasC || hasH) setPlanType('type1');
      else if (Array.isArray(d.installments) && d.installments.length) {
        const types = d.installments.map((r) => r.payment_type || r.phase || '');
        const hasPost = types.some((x) => /post/i.test(String(x)));
        const hasHand = types.some((x) => /handover/i.test(String(x)) && !/post/i.test(String(x)));
        const hasDown = types.some((x) => /down/i.test(String(x)));
        const hasCons = types.some((x) => /construction|installment|pre/i.test(String(x)));
        if (hasPost) setPlanType('type2');
        else if (hasDown && hasHand && !hasCons) setPlanType('type4');
        else setPlanType('type1');
      }
    }
    if (Array.isArray(d.custom_stages) && d.custom_stages.length) {
      setCustomStages(
        d.custom_stages.map((s, i) => ({
          id: s?.id || `ai-doc-stage-${Date.now()}-${i}`,
          name: s?.name != null ? String(s.name) : '',
          percentage:
            s?.percentage != null
              ? String(s.percentage)
              : s?.percent != null
                ? String(s.percent)
                : '',
          due_date: s?.due_date ? String(s.due_date).slice(0, 10) : '',
        })),
      );
    }
    if (Array.isArray(d.installments)) {
      const mapped = d.installments.map((r) => ({
        id: null,
        amount: r.amount != null ? String(r.amount) : '',
        due_date: r.due_date ? String(r.due_date).slice(0, 10) : '',
        status: r.status === 'paid' ? 'paid' : 'unpaid',
        phase:
          r.phase ||
          (r.payment_type === 'handover'
            ? 'handover'
            : r.payment_type === 'post_handover'
              ? 'post_handover'
              : 'pre_handover'),
        percentage:
          r.percentage != null
            ? String(r.percentage)
            : r.percent != null
              ? String(r.percent)
              : '',
        note: r.note || r.notes || (r.name ? String(r.name) : '') || '',
      }));
      if (applyMode === 'merge') {
        setRows((prev) => [...prev, ...mapped]);
      } else {
        setRows(mapped);
      }
    }
  };

  const installmentConflict = (d) => {
    const checks = [
      d.total_price != null && form.total_price,
      d.down_payment != null && form.down_payment,
      d.handover_status != null && form.handover_status,
      d.expected_handover_date != null && form.expected_handover_date,
      Array.isArray(d.installments) && d.installments.length > 0 && rows.length > 0,
    ];
    return checks.some(Boolean);
  };

  // ---- Unified Plan Builder helpers ----
  // The whole payment plan is built from ONE builder. The plan type only
  // seeds suggested stages; the user edits/adds/removes stages in place and
  // presses "إنشاء الخطة" to generate the full installment schedule.
  const newStageId = () =>
    `stage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const mkMajor = (kind, dueMode = 'specific_date') => {
    if (kind === 'on_handover') {
      return {
        id: newStageId(),
        type: 'handover',
        name: '',
        amountMode: 'percent',
        percent: '',
        amount: '',
      };
    }
    return {
      id: newStageId(),
      type: 'down',
      kind,
      name: '',
      amountMode: 'percent',
      percent: '',
      amount: '',
      dueMode,
      dueDate: '',
      afterMonths: '2',
    };
  };

  const mkConstruction = () => ({
    id: newStageId(),
    type: 'recurring',
    timing: 'construction',
    name: '',
    count: '24',
    recurringMode: 'percent',
    percent: '',
    perAmount: '',
    totalAmount: '',
    firstDate: '',
    frequency: 'monthly',
    customMonths: '1',
    phase: 'pre_handover',
    sameDayEachMonth: true,
  });

  const mkPost = () => ({
    id: newStageId(),
    type: 'post_equal',
    name: '',
    count: '24',
    recurringMode: 'percent',
    percent: '',
    perAmount: '',
    totalAmount: '',
    startAfterMonths: '1',
    frequency: 'monthly',
    customMonths: '1',
    sameDayEachMonth: true,
  });

  // Suggested stages per plan type. Percentages are left empty for the user
  // to fill in. type5 (custom) starts empty.
  const suggestedStagesForType = (type) => {
    const t = type === 'type3' ? 'type1' : type;
    switch (t) {
      case 'type1':
        return [mkMajor('down'), mkConstruction(), mkMajor('on_handover')];
      case 'type2':
        return [mkMajor('down'), mkConstruction(), mkPost()];
      case 'type4':
        return [mkMajor('down'), mkMajor('on_handover')];
      default:
        return [];
    }
  };

  // "إنشاء الخطة" — convert the builder stages into the flat installment
  // schedule (rows) and store the stages for persistence.
  const handleCreatePlan = (stages, extra = {}) => {
    const hd = extra?.handoverDate || form.expected_handover_date || '';
    const { installments } = stagesToInstallments(stages, {
      totalPrice: form.total_price,
      startDate: form.purchase_date,
      handoverDate: hd,
    });
    const mapped = installments.map((r) => ({
      id: null,
      amount: r.amount != null ? String(r.amount) : '',
      due_date: r.due_date ? String(r.due_date).slice(0, 10) : '',
      status: r.status === 'paid' ? 'paid' : 'unpaid',
      phase: r.phase || 'pre_handover',
      percentage:
        r.percentage != null
          ? String(r.percentage)
          : r.percent != null
            ? String(r.percent)
            : '',
      note: r.note || r.name || '',
      payment_type: r.payment_type || null,
      raw_label: r.name || '',
      source: 'manual',
    }));
    setRows(mapped);
    setPlanStages(stages);
  };

  // ---- Smart Payment Plan Reader: approve an AI-extracted plan ----
  // The approved installments become the same engine records used by manual
  // entry (rows), and we synthesize a minimal stage array so the builder /
  // summary stay consistent. Source = AI_IMPORT. Relative dates persist until
  // a handover date is set, then resolve automatically.
  const handleApproveSmartPlan = (plan) => {
    const inst = Array.isArray(plan?.installments) ? plan.installments : [];
    if (!inst.length) return;

    const hd = form.expected_handover_date || '';
    const mapped = inst.map((r) => ({
      id: null,
      amount: r.amount != null && r.amount !== '' ? String(r.amount) : '',
      due_date: toIsoDate(r.due_date) || '',
      status: r.status === 'paid' ? 'paid' : 'unpaid',
      phase: r.phase || 'pre_handover',
      percentage:
        r.percentage != null && r.percentage !== ''
          ? String(r.percentage)
          : r.percent != null && r.percent !== ''
            ? String(r.percent)
            : '',
      note: r.note || r.name || '',
      relative: r.relative || null,
      relative_to: r.relative ? r.relative.to : null,
      offset_months: r.relative ? r.relative.offset_months : null,
      source: 'AI_IMPORT',
      confidence: r.confidence || 'high',
      payment_type: r.payment_type_persisted || r.payment_type || null,
      raw_label: r.raw_label || r.name || '',
      source_page: r.source_page != null ? r.source_page : null,
    }));
    setRows(mapped);

    // Synthesize one stage per phase so the live summary / save path works.
    const phaseGroups = {};
    mapped.forEach((r) => {
      const ph = r.phase || 'pre_handover';
      if (!phaseGroups[ph]) phaseGroups[ph] = { phase: ph, count: 0, pct: 0, amt: 0 };
      phaseGroups[ph].count += 1;
      phaseGroups[ph].pct += Number(r.percentage || 0);
      phaseGroups[ph].amt += Number(r.amount || 0);
    });
    const stages = Object.values(phaseGroups).map((g) => ({
      id: `ai-stage-${g.phase}-${Date.now()}`,
      type: g.phase === 'handover' ? 'handover' : g.phase === 'post_handover' ? 'post_equal' : 'recurring',
      name: g.phase === 'handover' ? 'Handover' : g.phase === 'post_handover' ? 'Post Handover' : 'Construction',
      amountMode: 'fixed',
      percent: String(Math.round(g.pct * 100) / 100),
      amount: String(Math.round(g.amt * 100) / 100),
      count: String(g.count),
      phase: g.phase,
      recurringMode: 'per_installment',
      perAmount: g.count > 0 ? String(Math.round((g.amt / g.count) * 100) / 100) : '',
      frequency: 'monthly',
      firstDate: '',
      sameDayEachMonth: true,
      _ai_import: true,
    }));
    setPlanStages(stages);

    // Record source files + mark the plan as AI-imported on the form draft.
    setForm((f) => ({
      ...f,
      type: f.type === 'cash' || f.type === 'rented' ? 'installment' : f.type,
      payment_plan_source: 'AI_IMPORT',
      payment_plan_source_files: Array.isArray(plan?.sourceFiles)
        ? plan.sourceFiles.map((s) => (s?.name ? s.name : s))
        : f.payment_plan_source_files || [],
      payment_plan_currency: plan?.currency || f.payment_plan_currency || null,
      payment_plan_total_price:
        plan?.totalPrice != null && plan.totalPrice !== ''
          ? String(plan.totalPrice)
          : f.payment_plan_total_price || null,
    }));

    // Remember imported file hashes to guard against re-importing the same file.
    if (Array.isArray(plan?.sourceFiles)) {
      const hashes = plan.sourceFiles.map((s) => s?.hash).filter(Boolean);
      if (hashes.length) setSmartImportHashes((prev) => [...prev, ...hashes]);
    }
  };

  const applyRentalData = (d) => {
    setForm((f) => ({
      ...f,
      type: f.type === 'cash' || f.type === 'installment' ? 'rented' : f.type,
      tenant_name: d.tenant_name ?? f.tenant_name,
      tenant_phone: d.tenant_phone ?? f.tenant_phone,
      tenant_email: d.tenant_email ?? f.tenant_email,
      // Only fill building/unit when this is a new property entry (not linked existing).
      building: selectedProperty ? f.building : (d.building ?? f.building),
      unit_number: selectedProperty ? f.unit_number : (d.unit_number ?? f.unit_number),
      rent_amount: d.rent_amount != null ? String(d.rent_amount) : f.rent_amount,
      contract_start_date: d.contract_start
        ? String(d.contract_start).slice(0, 10)
        : f.contract_start_date,
      contract_end_date: d.contract_end
        ? String(d.contract_end).slice(0, 10)
        : f.contract_end_date,
      security_deposit:
        d.security_deposit != null ? String(d.security_deposit) : f.security_deposit,
    }));
    if (Array.isArray(d.payments) && d.payments.length) {
      setRentRows(
        d.payments.map((p, i) => ({
          id: null,
          name: p.name || `${t('check_n')} ${i + 1}`,
          amount: p.amount != null ? String(p.amount) : '',
          due_date: p.due_date ? String(p.due_date).slice(0, 10) : '',
          status: 'unpaid',
        })),
      );
    }
  };

  const rentalConflict = (d) => {
    const checks = [
      d.tenant_name != null && form.tenant_name,
      d.tenant_phone != null && form.tenant_phone,
      d.tenant_email != null && form.tenant_email,
      !selectedProperty && d.building != null && form.building,
      !selectedProperty && d.unit_number != null && form.unit_number,
      d.rent_amount != null && form.rent_amount,
      d.security_deposit != null && form.security_deposit,
      d.contract_start != null && form.contract_start_date,
      d.contract_end != null && form.contract_end_date,
      Array.isArray(d.payments) && d.payments.length > 0 && rentRows.length > 0,
    ];
    return checks.some(Boolean);
  };

  const applyTenantData = (d) => {
    setForm((f) => ({
      ...f,
      tenant_name: d.tenant_name ?? f.tenant_name,
      tenant_phone: d.tenant_phone ?? f.tenant_phone,
      tenant_email: d.tenant_email ?? f.tenant_email,
    }));
  };

  /** Apply confirmed section-AI fields without wiping unrelated form data. */
  const applySectionFields = (section, fields) => {
    if (!fields || typeof fields !== 'object') return;
    const moneyStr = (v) => {
      if (v == null || v === '') return null;
      const n = normalizeMoneyValue(v);
      return n || String(v).replace(/,/g, '');
    };

    if (section === 'property_info') {
      setForm((f) => {
        const next = { ...f };
        if (fields.country) next.country = countryToCode(fields.country) || String(fields.country);
        if (fields.area != null && fields.area !== '') next.area = String(fields.area);
        if (fields.building != null && fields.building !== '') next.building = String(fields.building);
        if (fields.unit_number != null && fields.unit_number !== '') next.unit_number = String(fields.unit_number);
        if (fields.property_size != null && fields.property_size !== '') {
          const raw = String(fields.property_size).replace(/[^\d.]/g, '');
          if (raw) next.property_size = raw;
        }
        if (fields.property_size_unit === 'sqm' || fields.property_size_unit === 'sqft') {
          next.property_size_unit = fields.property_size_unit;
        } else if (fields.property_size_unit) {
          const u = String(fields.property_size_unit).toLowerCase();
          if (/ft|قدم/.test(u)) next.property_size_unit = 'sqft';
          else if (/m|متر/.test(u)) next.property_size_unit = 'sqm';
        }
        if (fields.developer != null && fields.developer !== '') next.developer = String(fields.developer);
        if (fields.purchase_date) next.purchase_date = String(fields.purchase_date).slice(0, 10);
        return next;
      });
      return;
    }

    if (section === 'purchase_details') {
      setForm((f) => {
        const next = { ...f };
        if (fields.total_price != null && fields.total_price !== '') {
          next.total_price = moneyStr(fields.total_price) || String(fields.total_price);
        }
        if (Array.isArray(fields.purchase_fees) && fields.purchase_fees.length) {
          next.purchase_fees = fields.purchase_fees.map((fee) => {
            const type = fee?.type === 'percent' ? 'percent' : 'fixed';
            const totalPrice = num(next.total_price);
            if (type === 'percent') {
              const pct = num(fee?.percent != null ? fee.percent : fee?.amount);
              const computed = totalPrice > 0 && pct > 0 ? Math.round(totalPrice * pct) / 100 : '';
              return {
                name: fee?.name != null ? String(fee.name) : '',
                type: 'percent',
                percent: pct ? String(pct) : '',
                amount: computed !== '' ? String(computed) : '',
              };
            }
            return {
              name: fee?.name != null ? String(fee.name) : '',
              type: 'fixed',
              percent: '',
              amount: fee?.amount != null ? moneyStr(fee.amount) || String(fee.amount) : '',
            };
          });
        }
        if (['full', 'company_installments', 'bank_installments'].includes(fields.payment_method)) {
          next.payment_method = fields.payment_method;
        }
        if (fields.payment_duration_years != null && fields.payment_duration_years !== '') {
          next.payment_duration_years = String(fields.payment_duration_years);
        }
        if (fields.payment_duration_months != null && fields.payment_duration_months !== '') {
          next.payment_duration_months = String(fields.payment_duration_months);
        }
        return next;
      });
      return;
    }

    if (section === 'payment_plan') {
      const inferredType = fields.plan_type || fields.payment_plan_type;
      if (['type1', 'type2', 'type3', 'type4', 'type5'].includes(inferredType)) {
        setPlanType(inferredType === 'type3' ? 'type1' : inferredType);
      } else if (Array.isArray(fields.custom_stages) && fields.custom_stages.length) {
        setPlanType('type5');
      } else {
        const hasD = fields.plan_down_pct != null && fields.plan_down_pct !== '';
        const hasC = fields.plan_construction_pct != null && fields.plan_construction_pct !== '';
        const hasH = fields.plan_handover_pct != null && fields.plan_handover_pct !== '';
        const hasP = fields.plan_post_pct != null && fields.plan_post_pct !== '';
        if (hasP) setPlanType('type2');
        else if (hasD && hasH && !hasC) setPlanType('type4');
        else if (hasD && hasC && hasH) setPlanType('type1');
        else if (hasD || hasC || hasH) setPlanType('type1');
      }
      setForm((f) => {
        const next = { ...f };
        ['plan_down_pct', 'plan_construction_pct', 'plan_handover_pct', 'plan_post_pct', 'post_handover_years', 'post_handover_months'].forEach((k) => {
          if (fields[k] != null && fields[k] !== '') next[k] = String(fields[k]);
        });
        if (fields.total_price != null && fields.total_price !== '') {
          next.total_price = moneyStr(fields.total_price) || String(fields.total_price);
        }
        return next;
      });
      if (Array.isArray(fields.custom_stages) && fields.custom_stages.length) {
        setCustomStages(
          fields.custom_stages.map((s, i) => ({
            id: s?.id || `ai-stage-${Date.now()}-${i}`,
            name: s?.name != null ? String(s.name) : '',
            percentage: s?.percentage != null ? String(s.percentage) : s?.percent != null ? String(s.percent) : '',
            due_date: s?.due_date ? String(s.due_date).slice(0, 10) : '',
          })),
        );
      }
      if (Array.isArray(fields.installments) && fields.installments.length) {
        setRows(
          fields.installments.map((r) => ({
            id: null,
            amount: r.amount != null ? moneyStr(r.amount) || String(r.amount) : '',
            due_date: r.due_date ? String(r.due_date).slice(0, 10) : '',
            status: r.status === 'paid' || r.status === 'overdue' ? r.status : 'unpaid',
            phase:
              r.phase === 'handover' || r.phase === 'post_handover' || r.phase === 'pre_handover'
                ? r.phase
                : 'pre_handover',
            percentage:
              r.percentage != null
                ? String(r.percentage)
                : r.percent != null
                  ? String(r.percent)
                  : '',
            note: r.note || r.notes || '',
          })),
        );
      }
      return;
    }

    if (section === 'handover') {
      setForm((f) => {
        const next = { ...f };
        if (fields.handover_status === 'under_construction' || fields.handover_status === 'handover_completed') {
          next.handover_status = fields.handover_status;
        }
        if (fields.expected_handover_date) next.expected_handover_date = String(fields.expected_handover_date).slice(0, 10);
        if (fields.actual_handover_date) next.actual_handover_date = String(fields.actual_handover_date).slice(0, 10);
        return next;
      });
      return;
    }

    if (section === 'service_fees') {
      setForm((f) => {
        const next = { ...f };
        if (fields.service_charge_amount != null && fields.service_charge_amount !== '') {
          next.service_charge_amount = moneyStr(fields.service_charge_amount) || String(fields.service_charge_amount);
        }
        const freq = fields.service_charge_frequency;
        if (
          freq &&
          ['none', 'one_time', 'yearly', 'semi_annual', 'quarterly', 'monthly', 'at_handover', 'custom'].includes(freq)
        ) {
          next.service_charge_frequency = freq;
        }
        if (fields.service_charge_value_type === 'fixed' || fields.service_charge_value_type === 'percent') {
          next.service_charge_value_type = fields.service_charge_value_type;
        }
        if (fields.service_charge_date) next.service_charge_date = String(fields.service_charge_date).slice(0, 10);
        if (['paid', 'unpaid', 'partial'].includes(fields.service_charge_paid_status)) {
          next.service_charge_paid_status = fields.service_charge_paid_status;
          next.service_charge_paid = fields.service_charge_paid_status === 'paid';
        }
        if (fields.service_charge_paid_in_installments === 'yes' || fields.service_charge_paid_in_installments === 'no') {
          next.service_charge_paid_in_installments = fields.service_charge_paid_in_installments;
        }
        return next;
      });
      if (Array.isArray(fields.service_fee_rows) && fields.service_fee_rows.length) {
        setServiceFeeRows(
          fields.service_fee_rows.map((r) => ({
            amount: r.amount != null ? moneyStr(r.amount) || String(r.amount) : '',
            due_date: r.due_date ? String(r.due_date).slice(0, 10) : '',
            status: r.status === 'paid' ? 'paid' : 'unpaid',
            note: r.note || '',
          })),
        );
      }
      return;
    }

    if (section === 'alerts') {
      setAlertsConfig((prev) => {
        const next = { ...prev };
        if (typeof fields.alerts_enabled === 'boolean') next.enabled = fields.alerts_enabled;
        if (Array.isArray(fields.alerts_reminders)) {
          next.reminders = fields.alerts_reminders
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n));
        }
        if (fields.alerts_custom_date) next.customDate = String(fields.alerts_custom_date).slice(0, 10);
        return next;
      });
    }
  };

  const sectionCurrentValues = (section) => {
    if (section === 'property_info') {
      return {
        country: form.country,
        area: form.area,
        building: form.building,
        unit_number: form.unit_number,
        property_size: form.property_size,
        property_size_unit: form.property_size_unit,
        developer: form.developer,
        purchase_date: form.purchase_date,
      };
    }
    if (section === 'purchase_details') {
      return {
        total_price: form.total_price,
        purchase_fees: form.purchase_fees,
        payment_method: form.payment_method,
        payment_duration_years: form.payment_duration_years,
        payment_duration_months: form.payment_duration_months,
      };
    }
    if (section === 'payment_plan') {
      return {
        total_price: form.total_price,
        plan_type: planType,
        plan_down_pct: form.plan_down_pct,
        plan_construction_pct: form.plan_construction_pct,
        plan_handover_pct: form.plan_handover_pct,
        plan_post_pct: form.plan_post_pct,
        post_handover_years: form.post_handover_years,
        post_handover_months: form.post_handover_months,
        custom_stages: customStages,
        installments: rows,
      };
    }
    if (section === 'handover') {
      return {
        handover_status: form.handover_status,
        expected_handover_date: form.expected_handover_date,
        actual_handover_date: form.actual_handover_date,
      };
    }
    if (section === 'service_fees') {
      return {
        service_charge_amount: form.service_charge_amount,
        service_charge_frequency: form.service_charge_frequency,
        service_charge_value_type: form.service_charge_value_type,
        service_charge_date: form.service_charge_date,
        service_charge_paid_status: form.service_charge_paid_status,
        service_charge_paid_in_installments: form.service_charge_paid_in_installments,
        service_fee_rows: serviceFeeRows,
      };
    }
    if (section === 'alerts') {
      return {
        alerts_enabled: alertsConfig?.enabled,
        alerts_reminders: alertsConfig?.reminders,
        alerts_custom_date: alertsConfig?.customDate,
      };
    }
    return {};
  };

  // Apply structured payload from Property AI Assistant (multi-doc extract).
  // Never auto-saves — only fills editable form state for owner review.
  // eslint-disable-next-line no-unused-vars
  const applyAiAssistantPayload = (payload) => {
    if (!payload) return;
    const p = payload.property || {};
    const plan = payload.payment_plan || {};
    const rental = payload.rental || {};

    setForm((f) => {
      const next = { ...f };
      const fill = (key, val) => {
        if (val == null || val === '') return;
        next[key] = typeof val === 'number' ? String(val) : String(val);
      };
      if (p.country) next.country = countryToCode(p.country) || next.country;
      fill('area', p.area);
      fill('building', p.building);
      fill('unit_number', p.unit_number);
      fill('total_price', p.total_price ?? plan.total_price);
      fill('down_payment', plan.down_payment);
      fill('property_size', p.property_size);
      fill('developer', p.developer);
      fill('purchase_date', p.purchase_date);
      fill('service_charge_amount', p.service_charge_amount);
      if (p.service_charge_frequency === 'yearly' || p.service_charge_frequency === 'one_time') {
        next.service_charge_frequency = p.service_charge_frequency;
      }
      if (p.handover_status === 'under_construction' || p.handover_status === 'handover_completed') {
        next.handover_status = p.handover_status;
      }
      fill('expected_handover_date', p.expected_handover_date);

      // Rental fields when present (or type is rented)
      if (f.type === 'rented' || rental.tenant_name || rental.rent_amount) {
        fill('tenant_name', rental.tenant_name);
        fill('tenant_phone', rental.tenant_phone);
        fill('tenant_email', rental.tenant_email);
        fill('rent_amount', rental.rent_amount);
        fill('security_deposit', rental.security_deposit);
        if (rental.contract_start) next.contract_start_date = String(rental.contract_start).slice(0, 10);
        if (rental.contract_end) next.contract_end_date = String(rental.contract_end).slice(0, 10);
        if (!selectedProperty) {
          fill('building', rental.building);
          fill('unit_number', rental.unit_number);
        }
      }
      return next;
    });

    // Full installment rows — one record per extracted payment (e.g. 80 → 80).
    // Cash: never invent installments; only installment type gets schedule rows.
    const inst = Array.isArray(payload.installments) ? payload.installments : [];
    if (inst.length && form.type === 'installment') {
      setRows(
        inst.map((r) => ({
          id: null,
          amount: r.amount != null ? String(r.amount) : '',
          due_date: r.due_date ? String(r.due_date).slice(0, 10) : '',
          status: r.status === 'paid' ? 'paid' : 'unpaid',
          phase: r.phase || (r.payment_type === 'handover' ? 'handover' : r.payment_type === 'post_handover' ? 'post_handover' : 'pre_handover'),
          percentage: r.percentage != null ? String(r.percentage) : (r.percent != null ? String(r.percent) : ''),
          note: r.note || r.notes || '',
        })),
      );
    }

    const rentPays = Array.isArray(payload.rental_payments) ? payload.rental_payments : [];
    if (rentPays.length && form.type === 'rented') {
      setRentRows(
        rentPays.map((pmt, i) => ({
          id: null,
          name: pmt.name || `${t('check_n')} ${i + 1}`,
          amount: pmt.amount != null ? String(pmt.amount) : '',
          due_date: pmt.due_date ? String(pmt.due_date).slice(0, 10) : '',
          status: 'unpaid',
        })),
      );
    }

    // Attach first matching PDF to known file slots when still empty.
    const fileList = Array.isArray(payload.files) ? payload.files : [];
    if (fileList.length) {
      setFiles((prev) => {
        const next = { ...prev };
        for (const file of fileList) {
          if (!file) continue;
          const name = String(file.name || '').toLowerCase();
          const isPdfFile =
            file.type === 'application/pdf' || /\.pdf$/i.test(name);
          if (!isPdfFile) continue;
          if (
            !next.title_deed_pdf &&
            (name.includes('title') ||
              name.includes('deed') ||
              name.includes('ملك') ||
              name.includes('spa') ||
              name.includes('sale'))
          ) {
            next.title_deed_pdf = file;
          } else if (
            !next.lease_contract &&
            (name.includes('lease') ||
              name.includes('rent') ||
              name.includes('tenan') ||
              name.includes('إيجار') ||
              name.includes('ايجار'))
          ) {
            next.lease_contract = file;
          } else if (!next.title_deed_pdf && form.type !== 'rented') {
            next.title_deed_pdf = file;
          } else if (!next.lease_contract && form.type === 'rented') {
            next.lease_contract = file;
          }
        }
        return next;
      });
    }
  };

  const tenantConflict = (d) => {
    const checks = [
      d.tenant_name != null && form.tenant_name,
      d.tenant_phone != null && form.tenant_phone,
      d.tenant_email != null && form.tenant_email,
    ];
    return checks.some(Boolean);
  };

  // --- Review renderers ---

  const renderPropertyReview = (d, setData) => {
    const upd = (key) => (e) => setData((prev) => ({ ...prev, [key]: e.target.value }));
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NationalityField
            label={t('ai_field_country')}
            value={countryToCode(d.country) || d.country || ''}
            onChange={(v) => setData((p) => ({ ...p, country: v }))}
            heightClass="min-h-[40px]"
            placeholder={t('country_select')}
          />
          <ReviewField label={t('ai_field_area')} value={d.area} onChange={upd('area')} t={t} />
          <ReviewField label={t('ai_field_building')} value={d.building} onChange={upd('building')} t={t} />
          <ReviewField label={t('ai_field_unit')} value={d.unit_number} onChange={upd('unit_number')} t={t} />
          <div className="space-y-1">
            <Label className="text-xs">{t('ai_field_type')}</Label>
            <Select value={d.type || ''} onValueChange={(v) => setData((p) => ({ ...p, type: v }))}>
              <SelectTrigger className="min-h-[40px]"><SelectValue placeholder={t('ai_not_found')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t('type_cash')}</SelectItem>
                <SelectItem value="installment">{t('type_installment')}</SelectItem>
                <SelectItem value="rented">{t('type_rented')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ReviewField label={t('ai_field_owner_name')} value={d.owner_name} onChange={upd('owner_name')} t={t} />
          <ReviewField label={t('ai_field_price')} money dir="ltr" value={d.total_price} onChange={upd('total_price')} t={t} />
          <ReviewField label={t('ai_field_size')} value={d.property_size} onChange={upd('property_size')} t={t} />
          <div className="space-y-1">
            <Label className="text-xs">{t('ai_field_handover')}</Label>
            <Select
              value={d.handover_status || ''}
              onValueChange={(v) => setData((p) => ({ ...p, handover_status: v }))}
            >
              <SelectTrigger className="min-h-[40px]"><SelectValue placeholder={t('ai_not_found')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="under_construction">{t('under_construction')}</SelectItem>
                <SelectItem value="handover_completed">{t('handover_completed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DateField
            label={t('ai_field_handover_date')}
            value={d.expected_handover_date || ''}
            onChange={(v) => setData((p) => ({ ...p, expected_handover_date: v }))}
            heightClass="min-h-[40px]"
          />
          <ReviewField label={t('ai_field_developer')} value={d.developer} onChange={upd('developer')} t={t} />
        </div>
      </div>
    );
  };

  const renderInstallmentReview = (d, setData) => {
    const updField = (key) => (e) => setData((prev) => ({ ...prev, [key]: e.target.value }));
    const updRow = (i, key, val) =>
      setData((prev) => ({
        ...prev,
        installments: (prev.installments || []).map((r, idx) =>
          idx === i ? { ...r, [key]: val } : r,
        ),
      }));
    const removeRow = (i) =>
      setData((prev) => ({ ...prev, installments: (prev.installments || []).filter((_, idx) => idx !== i) }));

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ReviewField label={t('ai_field_price')} money dir="ltr" value={d.total_price} onChange={updField('total_price')} t={t} />
          <ReviewField label={t('ai_field_down_payment')} money dir="ltr" value={d.down_payment} onChange={updField('down_payment')} t={t} />
          <div className="space-y-1">
            <Label className="text-xs">{t('ai_field_handover')}</Label>
            <Select
              value={d.handover_status || ''}
              onValueChange={(v) => setData((p) => ({ ...p, handover_status: v }))}
            >
              <SelectTrigger className="min-h-[40px]"><SelectValue placeholder={t('ai_not_found')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="under_construction">{t('under_construction')}</SelectItem>
                <SelectItem value="handover_completed">{t('handover_completed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DateField
            label={t('ai_field_handover_date')}
            value={d.expected_handover_date || ''}
            onChange={(v) => setData((p) => ({ ...p, expected_handover_date: v }))}
            heightClass="min-h-[40px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('ai_field_installments')} ({(d.installments || []).length})</Label>
          {(d.installments || []).length === 0 ? (
            <p className="rounded-lg border border-dashed bg-accent/30 px-3 py-3 text-center text-xs text-muted-foreground">
              {t('ai_not_found')}
            </p>
          ) : (
            <div className="space-y-2">
              {d.installments.map((row, i) => {
                const phase = row.phase || (row.payment_type === 'handover' ? 'handover' : row.payment_type === 'post_handover' ? 'post_handover' : 'pre_handover');
                const percentage = row.percentage != null && row.percentage !== '' ? row.percentage : (row.percent != null ? row.percent : '');
                const note = row.note != null ? row.note : (row.notes || '');
                return (
                <div key={i} className="space-y-2 rounded-lg border bg-card p-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end">
                    <ReviewField label={t('ai_installment_name')} value={row.name} onChange={(e) => updRow(i, 'name', e.target.value)} t={t} />
                    <ReviewField label={t('ai_amount')} money dir="ltr" value={row.amount} onChange={(e) => updRow(i, 'amount', e.target.value)} t={t} />
                    <DateField
                      label={t('ai_due_date')}
                      value={row.due_date || ''}
                      onChange={(v) => updRow(i, 'due_date', v)}
                      heightClass="min-h-[40px]"
                    />
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeRow(i)} className="min-h-[40px] min-w-[40px] text-destructive hover:bg-red-50" aria-label={t('remove_installment')}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-[11px]">{t('installment_phase')}</Label>
                      <Select value={phase || 'pre_handover'} onValueChange={(v) => updRow(i, 'phase', v)}>
                        <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="first_payment">{t('phase_first_payment')}</SelectItem>
                          <SelectItem value="pre_handover">{t('phase_pre_handover')}</SelectItem>
                          <SelectItem value="handover">{t('phase_handover')}</SelectItem>
                          <SelectItem value="post_handover">{t('phase_post_handover')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <ReviewField label={t('installment_percentage')} type="number" percent value={percentage} onChange={(e) => updRow(i, 'percentage', e.target.value)} t={t} />
                    <ReviewField label={t('installment_note')} value={note} onChange={(e) => updRow(i, 'note', e.target.value)} t={t} />
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRentalReview = (d, setData) => {
    const upd = (key) => (e) => setData((prev) => ({ ...prev, [key]: e.target.value }));
    const updRow = (i, key, val) =>
      setData((prev) => ({
        ...prev,
        payments: (prev.payments || []).map((r, idx) => (idx === i ? { ...r, [key]: val } : r)),
      }));
    const removeRow = (i) =>
      setData((prev) => ({ ...prev, payments: (prev.payments || []).filter((_, idx) => idx !== i) }));

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ReviewField label={t('ai_field_tenant_name')} value={d.tenant_name} onChange={upd('tenant_name')} t={t} />
          <ReviewField label={t('ai_field_tenant_phone')} dir="ltr" value={d.tenant_phone} onChange={upd('tenant_phone')} t={t} />
          <ReviewField label={t('ai_field_tenant_email')} dir="ltr" value={d.tenant_email} onChange={upd('tenant_email')} t={t} />
          {!selectedProperty && (
            <>
              <ReviewField label={t('ai_field_building')} value={d.building} onChange={upd('building')} t={t} />
              <ReviewField label={t('ai_field_unit')} value={d.unit_number} onChange={upd('unit_number')} t={t} />
            </>
          )}
          <ReviewField label={t('ai_field_rent')} money dir="ltr" value={d.rent_amount} onChange={upd('rent_amount')} t={t} />
          <ReviewField label={t('security_deposit')} money dir="ltr" value={d.security_deposit} onChange={upd('security_deposit')} t={t} />
          <DateField
            label={t('ai_field_start')}
            value={d.contract_start || ''}
            onChange={(v) => setData((p) => ({ ...p, contract_start: v }))}
            heightClass="min-h-[40px]"
          />
          <DateField
            label={t('ai_field_end')}
            value={d.contract_end || ''}
            onChange={(v) => setData((p) => ({ ...p, contract_end: v }))}
            heightClass="min-h-[40px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('ai_field_payments')} ({(d.payments || []).length})</Label>
          {(d.payments || []).length === 0 ? (
            <p className="rounded-lg border border-dashed bg-accent/30 px-3 py-3 text-center text-xs text-muted-foreground">
              {t('ai_not_found')}
            </p>
          ) : (
            <div className="space-y-2">
              {d.payments.map((row, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end rounded-lg border bg-card p-2.5">
                  <ReviewField label={t('ai_installment_name')} value={row.name} onChange={(e) => updRow(i, 'name', e.target.value)} t={t} />
                  <ReviewField label={t('ai_amount')} money dir="ltr" value={row.amount} onChange={(e) => updRow(i, 'amount', e.target.value)} t={t} />
                  <DateField
                    label={t('ai_due_date')}
                    value={row.due_date || ''}
                    onChange={(v) => updRow(i, 'due_date', v)}
                    heightClass="min-h-[40px]"
                  />
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeRow(i)} className="min-h-[40px] min-w-[40px] text-destructive hover:bg-red-50" aria-label={t('remove_installment')}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTenantReview = (d, setData) => {
    const upd = (key) => (e) => setData((prev) => ({ ...prev, [key]: e.target.value }));
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ReviewField label={t('ai_field_tenant_name')} value={d.tenant_name} onChange={upd('tenant_name')} t={t} />
          <ReviewField label={t('ai_field_tenant_phone')} dir="ltr" value={d.tenant_phone} onChange={upd('tenant_phone')} t={t} />
          <ReviewField label={t('ai_field_tenant_email')} dir="ltr" value={d.tenant_email} onChange={upd('tenant_email')} t={t} />
          <ReviewField label={t('ai_field_passport_id')} dir="ltr" value={d.passport_number} onChange={upd('passport_number')} t={t} />
          <NationalityField
            label={t('nationality')}
            value={countryToCode(d.nationality) || d.nationality || ''}
            onChange={(v) => setData((p) => ({ ...p, nationality: v }))}
            heightClass="min-h-[40px]"
          />
          <DateField
            label={t('date_of_birth')}
            value={d.date_of_birth || ''}
            onChange={(v) => setData((p) => ({ ...p, date_of_birth: v }))}
            heightClass="min-h-[40px]"
          />
        </div>
      </div>
    );
  };

  const validate = () => {
    if (adminMode && !isEdit && !effectiveOwner) {
      return t('select_owner_first');
    }
    if (!form.usage_type) {
      return t('usage_type_required');
    }
    const ownerParsed = parsePhone(form.owner_phone);
    const isLand = form.usage_type === 'land';
    if (
      !form.area ||
      !form.building ||
      (!isLand && !form.unit_number) ||
      !ownerParsed.cc ||
      !ownerParsed.num ||
      !form.owner_email ||
      !form.country
    ) {
      return t('something_wrong');
    }
    if (!isEdit) {
      // Ownership: a new property needs a title deed; an existing property
      // already has one on file, so no duplicate upload is required.
      if (!selectedProperty && !files.title_deed_pdf) return t('something_wrong');
      if (form.type === 'rented' && !files.lease_contract) return t('something_wrong');
    }
    if (form.type === 'installment') {
      if (!num(form.total_price)) return t('something_wrong');
      if (!form.payment_method) return t('payment_method_required');
      for (const row of rows) {
        if (!num(row.amount) || !row.due_date) return t('something_wrong');
      }
      // Payment-plan % must total 100 when a plan type is chosen or stages exist.
      const planPctSum = planStages.length
        ? sumStagesPreview(planStages, form.total_price).totalPct
        : 0;
      const planTouched = !!planType || planPctSum > 0 || rows.length > 0;
      if (planTouched && Math.abs(planPctSum - 100) >= 0.01) {
        return t('plan_must_100');
      }
      // Handover-linked stages require a handover date.
      const needsHandover = planStages.some((s) => {
        const ph = stagePhase(s);
        return (
          ph === 'handover' ||
          ph === 'post_handover' ||
          (s.type === 'major_payment' && s.dueMode === 'on_handover')
        );
      });
      if (needsHandover && !form.expected_handover_date) {
        return t('plan_section_handover_no_date');
      }
    }
    if (form.type === 'rented') {
      if (!num(form.rent_amount)) return t('something_wrong');
      if (!form.tenant_name || !form.tenant_phone || !form.tenant_email) return t('something_wrong');
      if (!isEdit && !files.tenant_document && !property?.tenant_document) return t('something_wrong');
      if (rentRows.length === 0) return t('something_wrong');
      for (const row of rentRows) {
        if (!num(row.amount) || !row.due_date) return t('something_wrong');
      }
    }
    // Additional property documents: every uploaded file must have a name.
    const addlFiles = (files.additional_documents || []).filter(Boolean);
    if (addlFiles.length > 0) {
      const names = form.additional_doc_names || [];
      for (let i = 0; i < (files.additional_documents || []).length; i += 1) {
        if (files.additional_documents[i] && !String(names[i] || '').trim()) {
          return t('additional_doc_name_required');
        }
      }
    }
    return '';
  };

  // Create / update / delete installment payment rows to match the editor.
  // Also maintains a `payment_plans` record for the property and links every
  // payment to it via `payment_plan_id` (batch insert with per-row requestKey
  // so 100+ installments persist in parallel, not one-by-one).
  const syncInstallmentRows = async (propertyId) => {
    // ---- 1. Create or update the payment_plans record for this property ----
    let planId = null;
    try {
      const existingPlans = await pb
        .collection('payment_plans')
        .getFullList({ filter: `property = "${propertyId}"`, sort: '-created' });
      const planData = {
        property: propertyId,
        owner: effectiveOwner,
        plan_type: planType || 'custom',
        currency: form.payment_plan_currency || null,
        total_price: num(form.total_price) || null,
        total_percentage: (() => {
          const s = rows.reduce((acc, r) => acc + Number(r.percentage || 0), 0);
          return Math.round(s * 100) / 100 || null;
        })(),
        total_amount: (() => {
          const s = rows.reduce((acc, r) => acc + num(r.amount), 0);
          return Math.round(s * 100) / 100 || null;
        })(),
        source: form.payment_plan_source || 'manual',
        source_files: JSON.stringify(form.payment_plan_source_files || []),
        stages: JSON.stringify(planStages || []),
        status: 'active',
      };
      if (existingPlans.length) {
        planId = existingPlans[0].id;
        await pb
          .collection('payment_plans')
          .update(planId, planData, { requestKey: `plan-upd-${propertyId}` });
      } else {
        const created = await pb
          .collection('payment_plans')
          .create(planData, { requestKey: `plan-cre-${propertyId}` });
        planId = created?.id || null;
      }
    } catch (e) {
      // payment_plans is best-effort metadata; installment rows still save.
      console.warn('payment_plans sync failed', e);
    }

    // ---- 2. Batch upsert installment rows, linked to the plan ----
    const base = {
      property: propertyId,
      owner: effectiveOwner,
      kind: 'installment',
      reminder_sent: false,
      ...(planId ? { payment_plan_id: planId } : {}),
    };
    await Promise.all(
      rows.map((row, i) => {
        const data = {
          ...base,
          label: `${t('installment_n')} ${i + 1}`,
          amount: num(row.amount),
          due_date: row.due_date,
          status: row.status === 'paid' ? 'paid' : row.status === 'overdue' ? 'overdue' : 'upcoming',
          paid_at: row.status === 'paid' ? new Date().toISOString() : null,
          phase: row.phase || 'pre_handover',
          percentage: row.percentage !== '' ? num(row.percentage) : null,
          note: row.note || '',
          relative_date:
            row.relative ||
            (row.relative_to
              ? { to: row.relative_to, offset_months: row.offset_months }
              : null),
          plan_source: row.source || 'manual',
          confidence: row.confidence || null,
          payment_type: mapPaymentType(
            row.payment_type ||
              (row.phase === 'first_payment'
                ? 'down_payment'
                : row.phase === 'handover'
                  ? 'handover'
                  : row.phase === 'post_handover'
                    ? 'post_handover'
                    : 'installment'),
          ),
          raw_label: row.raw_label || '',
          source_page: row.source_page != null ? row.source_page : null,
        };
        if (row.id) {
          return pb
            .collection('payments')
            .update(row.id, data, { requestKey: `upd-${propertyId}-${i}` });
        }
        return pb
          .collection('payments')
          .create(data, { requestKey: `cre-${propertyId}-${i}` });
      }),
    );
    const existing = await pb
      .collection('payments')
      .getFullList({ filter: `property = "${propertyId}" && kind = "installment"` });
    const kept = new Set(rows.filter((r) => r.id).map((r) => r.id));
    const toDelete = existing.filter((p) => !kept.has(p.id));
    await Promise.all(
      toDelete.map((p, i) =>
        pb.collection('payments').delete(p.id, { requestKey: `del-${propertyId}-${i}` }),
      ),
    );
  };

  // Sync rent payment rows (used when AI provided a schedule or on edit).
  const syncRentRows = async (propertyId) => {
    const base = { property: propertyId, owner: effectiveOwner, kind: 'rent', reminder_sent: false };
    await Promise.all(
      rentRows.map((row, i) => {
        const data = {
          ...base,
          label: row.name || `${t('check_n')} ${i + 1}`,
          amount: num(row.amount),
          due_date: row.due_date,
          status: row.status === 'paid' ? 'paid' : 'upcoming',
          paid_at: row.status === 'paid' ? new Date().toISOString() : null,
        };
        if (row.id) {
          return pb
            .collection('payments')
            .update(row.id, data, { requestKey: `rupd-${propertyId}-${i}` });
        }
        return pb
          .collection('payments')
          .create(data, { requestKey: `rcre-${propertyId}-${i}` });
      }),
    );
    const existing = await pb
      .collection('payments')
      .getFullList({ filter: `property = "${propertyId}" && kind = "rent"` });
    const kept = new Set(rentRows.filter((r) => r.id).map((r) => r.id));
    const toDelete = existing.filter((p) => !kept.has(p.id));
    await Promise.all(
      toDelete.map((p, i) =>
        pb.collection('payments').delete(p.id, { requestKey: `rdel-${propertyId}-${i}` }),
      ),
    );
  };

  const performSave = async () => {
    setSaving(true);
    setError('');
    let savedPropertyId = null;
    try {
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('usage_type', form.usage_type || '');
      fd.append('country', form.country);
      fd.append('area', form.area);
      fd.append('building', form.building);
      fd.append('unit_number', form.unit_number);
      fd.append('owner_phone', form.owner_phone);
      fd.append('owner_email', form.owner_email);
      fd.append('tenant_name', form.tenant_name);
      fd.append('tenant_phone', form.tenant_phone);
      fd.append('tenant_email', form.tenant_email);
      fd.append('property_size', form.property_size || '');
      fd.append('property_size_unit', form.property_size_unit || 'sqm');
      fd.append('developer', form.developer || '');

      if (form.type === 'installment') {
        fd.append('total_price', String(num(form.total_price)));
        fd.append('down_payment', String(num(form.down_payment)));
        fd.append('handover_status', form.handover_status);
        if (form.expected_handover_date) fd.append('expected_handover_date', form.expected_handover_date);
        if (form.actual_handover_date) fd.append('actual_handover_date', form.actual_handover_date);
        fd.append('installments_count', String(rows.length));
        fd.append('total_paid', String(num(form.down_payment)));
        fd.append('financing_details', form.financing_details || '');
        fd.append('purchase_fees', JSON.stringify(form.purchase_fees || []));
        fd.append('payment_method', form.payment_method || '');
        fd.append('payment_duration_years', String(num(form.payment_duration_years)));
        fd.append('payment_duration_months', String(num(form.payment_duration_months)));
        // Derive the legacy per-bucket percentages from the unified plan stages
        // so existing dashboards keep working. The canonical store is
        // payment_plan_stages (the ordered builder stage array).
        const planBuckets = planStages.reduce(
          (acc, s) => {
            const sum = stageSummary(s, num(form.total_price));
            const ph = stagePhase(s);
            if ((s.type === 'major_payment' || s.type === 'down') && ph !== 'handover') acc.down += sum.pct;
            else if (ph === 'handover') acc.handover += sum.pct;
            else if (ph === 'post_handover') acc.post += sum.pct;
            else acc.construction += sum.pct;
            return acc;
          },
          { down: 0, construction: 0, handover: 0, post: 0 },
        );
        fd.append('plan_down_pct', String(Math.round(planBuckets.down * 100) / 100));
        fd.append('plan_construction_pct', String(Math.round(planBuckets.construction * 100) / 100));
        fd.append('plan_handover_pct', String(Math.round(planBuckets.handover * 100) / 100));
        fd.append('plan_post_pct', String(Math.round(planBuckets.post * 100) / 100));
        fd.append('post_handover_years', String(num(form.post_handover_years)));
        fd.append('post_handover_months', String(num(form.post_handover_months)));
        if (planType) fd.append('payment_plan_type', planType);
        // Canonical ordered plan stages (the single source of truth).
        fd.append('payment_plan_stages', JSON.stringify(planStages || []));
        fd.append(
          'plan_custom_stages',
          JSON.stringify(
            (planStages || []).map((s) => ({
              name: s.name || '',
              percentage: num(s.percent),
              due_date: s.dueDate || s.firstDate || '',
            })),
          ),
        );
        // Converting into installment re-opens the plan.
        fd.append('installment_plan_completed', 'false');
      } else if (form.type === 'cash') {
        if (num(form.total_price)) fd.append('total_price', String(num(form.total_price)));
        fd.append('purchase_fees', JSON.stringify(form.purchase_fees || []));
        fd.append('payment_method', form.payment_method || '');
        fd.append('payment_duration_years', String(num(form.payment_duration_years)));
        fd.append('payment_duration_months', String(num(form.payment_duration_months)));
        // Converting installment → cash: keep payment history, mark plan completed.
        if (isConvert && property?.type === 'installment') {
          fd.append('installment_plan_completed', 'true');
        }
      } else if (form.type === 'rented') {
        fd.append('rent_amount', String(num(form.rent_amount)));
        fd.append('security_deposit', String(num(form.security_deposit)));
        if (form.contract_start_date) fd.append('contract_start_date', form.contract_start_date);
        if (form.contract_end_date) fd.append('contract_end_date', form.contract_end_date);
      }

      // Purchase date + service charge apply to cash and installment properties.
      if (form.type === 'cash' || form.type === 'installment') {
        if (form.purchase_date) fd.append('purchase_date', form.purchase_date);
        fd.append('service_charge_frequency', form.service_charge_frequency || 'one_time');
        fd.append('service_charge_value_type', form.service_charge_value_type || 'fixed');
        fd.append('service_charge_paid_status', form.service_charge_paid_status || 'unpaid');
        if (num(form.service_charge_amount)) {
          const amount = num(form.service_charge_amount);
          const inInstallments =
            form.service_charge_frequency === 'yearly' &&
            form.service_charge_paid_in_installments === 'yes';
          fd.append('service_charge_amount', String(amount));
          fd.append(
            'service_charge_paid_in_installments',
            inInstallments ? 'true' : 'false',
          );
          fd.append(
            'service_charge_installments_count',
            String(inInstallments ? (Number(form.service_charge_installments_count) || 0) : 0),
          );

          let schedule;
          if (inInstallments) {
            schedule = serviceFeeRows.map((r) => ({
              amount: num(r.amount),
              due_date: r.due_date || '',
              paid: !!r.paid,
              note: r.note || '',
            }));
            const firstDue = serviceFeeRows.map((r) => r.due_date).filter(Boolean).sort()[0] || '';
            if (firstDue) fd.append('service_charge_date', firstDue);
          } else {
            schedule = [
              {
                amount,
                due_date: form.service_charge_date || '',
                paid: !!form.service_charge_paid,
              },
            ];
            if (form.service_charge_date) fd.append('service_charge_date', form.service_charge_date);
          }
          fd.append('service_charge_schedule', JSON.stringify(schedule));
        } else {
          // No service charge — clear schedule fields.
          fd.append('service_charge_paid_in_installments', 'false');
          fd.append('service_charge_installments_count', '0');
          fd.append('service_charge_schedule', '[]');
        }
      }

      // File fields: prefer Cloudinary URLs (stored in `*_url` text fields);
      // fall back to the legacy PocketBase file upload when no URL is available
      // (e.g. Cloudinary not configured). Existing files are never cleared.
      ['title_deed_pdf', 'tenant_document', 'lease_contract'].forEach((key) => {
        const file = files[key];
        const url = fileUrls[key];
        if (url) {
          fd.append(`${key}_url`, url);
        } else if (file) {
          fd.append(key, file);
        }
      });

      // Additional documents: preserve already-saved Cloudinary docs and append
      // new uploads. Docs without a Cloudinary URL fall back to PB file upload.
      const existingCloudDocs = Array.isArray(property?.additional_documents_urls)
        ? property.additional_documents_urls
        : [];
      const newCloudDocs = [];
      (files.additional_documents || []).forEach((f, i) => {
        if (!f) return;
        const url = (fileUrls.additional_documents || [])[i];
        const name = (form.additional_doc_names || [])[i] || f.name || '';
        if (url) newCloudDocs.push({ name, url });
        else fd.append('additional_documents', f);
      });
      fd.append('additional_documents_urls', JSON.stringify([...existingCloudDocs, ...newCloudDocs]));
      fd.append('additional_doc_names', JSON.stringify(form.additional_doc_names || []));

      if (isEdit) {
        // Always update the same permanent property id (no duplicate on convert).
        await pb.collection('properties').update(property.id, fd);
        savedPropertyId = property.id;
        if (form.type === 'installment') {
          await syncInstallmentRows(property.id);
        } else if (form.type === 'rented') {
          await syncRentRows(property.id);
        }
        // Installment → cash: never delete installment payment history.
      } else if (selectedProperty) {
        // Rented flow linked to an existing property: update that record
        // (add rental fields + mark as rented) instead of creating a duplicate.
        await pb.collection('properties').update(selectedProperty.id, fd);
        await syncRentRows(selectedProperty.id);
        savedPropertyId = selectedProperty.id;
      } else {
        fd.append('owner', effectiveOwner);
        // Admin-created properties are auto-approved; owner submissions stay pending.
        fd.append('status', adminMode ? 'approved' : 'pending');
        if (form.type !== 'installment') fd.append('total_paid', '0');
        const created = await pb.collection('properties').create(fd);
        if (form.type === 'installment') await syncInstallmentRows(created.id);
        else if (form.type === 'rented') await syncRentRows(created.id);
        savedPropertyId = created.id;
      }
      // Save Alerts & Follow-up config for this property (enable + reminders).
      if (savedPropertyId) {
        try { await savePropertyAlertOverride(savedPropertyId, alertsConfig); } catch (_) { /* ignore */ }
      }
      onSaved?.();
      notify.success(
        isEdit ? (lang === 'ar' ? 'تم تحديث العقار' : 'Property updated') : (lang === 'ar' ? 'تم حفظ العقار' : 'Property saved'),
        lang === 'ar' ? 'سيظهر العقار في لوحة التحكم ومستنداتك بعد اعتماده.' : 'It will appear in your dashboard and documents once approved.',
      );
      requestClose();
    } catch (err2) {
      // Subscription / property-limit enforcement (server-side hook).
      // Surface a clear, localized message and direct the user to upgrade.
      const rawMsg = String(err2?.response?.message || err2?.message || '');
      if (
        rawMsg.includes('property_limit_reached') ||
        rawMsg.includes('subscription_expired')
      ) {
        const isLimit = rawMsg.includes('property_limit_reached');
        const limitMsg = lang === 'ar'
          ? isLimit
            ? 'لقد وصلت إلى الحد الأقصى من العقارات في باقتك. ترقَّ إلى باقة أعلى أو اشترِ عقارًا إضافيًا من صفحة «الاشتراك» لإضافة عقار جديد.'
            : 'انتهت فترتك التجريبية أو اشتراكك. جدِّد أو ترقَّ باقتك من صفحة «الاشتراك» لإضافة عقارات جديدة.'
          : isLimit
            ? 'You have reached your property limit. Upgrade your package or buy an extra property from the Subscription page to add more.'
            : 'Your trial or subscription has ended. Renew or upgrade from the Subscription page to add new properties.';
        setError(limitMsg);
        notify.error(
          lang === 'ar' ? 'حد العقارات ممتلئ' : 'Property limit reached',
          limitMsg,
        );
        setSaving(false);
        setConfirmConvert(false);
        return;
      }
      const data = err2?.response?.data;
      if (data && typeof data === 'object') {
        const parts = Object.entries(data).map(([field, info]) => {
          const msg = info?.message || info?.code || '';
          return msg ? `${field}: ${msg}` : field;
        });
        if (parts.length) {
          setError(parts.join(' · '));
          notify.error(t('something_wrong'), parts.join(' · '));
        } else {
          setError(err2?.message || t('something_wrong'));
          notify.error(t('something_wrong'), err2?.message || '');
        }
      } else {
        setError(err2?.message || t('something_wrong'));
        notify.error(t('something_wrong'), err2?.message || '');
      }
    } finally {
      setSaving(false);
      setConfirmConvert(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      // Highlight + scroll to the payment method field when it is the cause.
      if (err === t('payment_method_required')) {
        setPaymentMethodError(true);
        try {
          paymentMethodRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Focus the Radix select trigger so it opens for immediate selection.
          const trigger = paymentMethodRef.current?.querySelector?.('[role="combobox"]')
            || paymentMethodRef.current?.querySelector?.('button');
          trigger?.focus?.();
        } catch {
          /* ignore */
        }
      } else {
        setPaymentMethodError(false);
      }
      return;
    }
    setPaymentMethodError(false);
    if (isConvert) {
      setConfirmConvert(true);
      return;
    }
    await performSave();
  };

  const hint = {
    required: t('required_label'),
    optional: t('optional_label'),
    placeholder: t('file_pdf_only'),
  };

  // Reusable Service Fees section used by both Cash and Installment property
  // types. Implements the required structure:
  //  - Service Fee Amount
  //  - Frequency selector (Annually / One-time)
  //  - Annually → Service Fee Payment Date + "paid in installments?" Yes/No
  //    - Yes → number of payments, auto-generated rows (amount, due date, paid)
  //      with an equal-split helper
  //  - One-time → Payment Date + Paid/Unpaid status
  const renderServiceFees = (className = '') => {
    const isYearly = form.service_charge_frequency === 'yearly';
    const inInstallments = isYearly && form.service_charge_paid_in_installments === 'yes';

    return (
      <div className={cn('space-y-4 rounded-xl border border-emerald-200/60 bg-emerald-50/30 p-4', className)}>
        <SectionHead
          icon={Receipt}
          title={t('service_fee_section')}
        />
        {openSectionAi === 'service_fees' && (
          <SectionAiAssistant
            section="service_fees"
            open
            onOpenChange={(o) => !o && setOpenSectionAi(null)}
            currentValues={sectionCurrentValues('service_fees')}
            onApply={(fields) => applySectionFields('service_fees', fields)}
          />
        )}

        {/* 1. Fee type (flexible, country-agnostic) */}
        <div className="space-y-2">
          <Label>{t('service_fee_type_label')}</Label>
          <Select
            value={form.service_charge_frequency}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                service_charge_frequency: v,
                service_charge_paid_in_installments: 'no',
                service_charge_installments_count: '',
              }))
            }
          >
            <SelectTrigger className="min-h-[44px]">
              <SelectValue placeholder={t('service_fee_frequency_hint')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('service_fee_none')}</SelectItem>
              <SelectItem value="one_time">{t('service_fee_one_time')}</SelectItem>
              <SelectItem value="yearly">{t('service_fee_yearly')}</SelectItem>
              <SelectItem value="semi_annual">{t('service_fee_semi_annual')}</SelectItem>
              <SelectItem value="quarterly">{t('service_fee_quarterly')}</SelectItem>
              <SelectItem value="monthly">{t('service_fee_monthly')}</SelectItem>
              <SelectItem value="on_handover">{t('service_fee_on_handover')}</SelectItem>
              <SelectItem value="custom">{t('service_fee_custom')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 2. Amount + value type (hidden when no fees) */}
        {form.service_charge_frequency !== 'none' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('service_fee_amount')}</Label>
              <MoneyInput
                min="0"
                value={form.service_charge_amount}
                onChange={set('service_charge_amount')}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('service_fee_value_type')}</Label>
              <Select
                value={form.service_charge_value_type}
                onValueChange={set('service_charge_value_type')}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">{t('service_fee_value_fixed')}</SelectItem>
                  <SelectItem value="percent">{t('service_fee_value_percent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* One-time: payment date + paid/unpaid/partial status */}
        {!isYearly && form.service_charge_frequency !== 'none' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DateField
              label={t('service_fee_payment_date')}
              value={form.service_charge_date}
              onChange={set('service_charge_date')}
              heightClass="min-h-[44px]"
            />
            <div className="space-y-2">
              <Label>{t('service_fee_paid_status')}</Label>
              <Select
                value={form.service_charge_paid_status || (form.service_charge_paid ? 'paid' : 'unpaid')}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, service_charge_paid_status: v, service_charge_paid: v === 'paid' }))
                }
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">{t('service_fee_paid_unpaid')}</SelectItem>
                  <SelectItem value="paid">{t('service_fee_paid_paid')}</SelectItem>
                  <SelectItem value="partial">{t('service_fee_paid_partial')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Annually: payment date + installment question */}
        {isYearly && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DateField
                label={t('service_fee_payment_date')}
                value={form.service_charge_date}
                onChange={set('service_charge_date')}
                heightClass="min-h-[44px]"
              />
              <div className="space-y-2">
                <Label>{t('service_fee_paid_in_installments_q')}</Label>
                <Select
                  value={form.service_charge_paid_in_installments}
                  onValueChange={(v) => {
                    setForm((f) => ({
                      ...f,
                      service_charge_paid_in_installments: v,
                      service_charge_installments_count: v === 'yes' ? f.service_charge_installments_count : '',
                    }));
                    if (v === 'no') setServiceFeeRows([]);
                  }}
                >
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">{t('no')}</SelectItem>
                    <SelectItem value="yes">{t('yes')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Yearly, not in installments: paid/unpaid status for the single annual payment */}
            {!inInstallments && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('service_fee_one_time_status')}</Label>
                  <Select
                    value={form.service_charge_paid ? 'paid' : 'unpaid'}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, service_charge_paid: v === 'paid' }))
                    }
                  >
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">{t('service_fee_one_time_unpaid')}</SelectItem>
                      <SelectItem value="paid">{t('service_fee_one_time_paid')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Yearly, paid in installments: number of payments + schedule rows */}
            {inInstallments && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('service_fee_payments_count')}</Label>
                    <Select
                      value={form.service_charge_installments_count || ''}
                      onValueChange={(v) => {
                        setForm((f) => ({ ...f, service_charge_installments_count: v }));
                        rebuildServiceFeeRows(v, true);
                      }}
                    >
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue placeholder={t('service_fee_payments_count')} />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 6, 12].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={splitServiceFeeEqually}
                      className="min-h-[44px]"
                    >
                      <Repeat size={14} className="me-1" />
                      {t('service_fee_equal_split')}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t('service_fee_equal_split_hint')}</p>

                {serviceFeeRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed bg-accent/30 px-3 py-4 text-center text-xs text-muted-foreground">
                    {t('service_fee_payments_count')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {serviceFeeRows.map((row, i) => {
                      const paid = !!row.paid;
                      return (
                        <div
                          key={i}
                          className={cn(
                            'grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end rounded-lg border bg-card p-2.5',
                            paid ? 'border-emerald-300 bg-emerald-50/40' : 'border-border',
                          )}
                        >
                          <div className="space-y-1">
                            <Label className="text-[11px]">{t('service_fee_payment_amount')}</Label>
                            <MoneyInput
                              min="0"
                              value={row.amount}
                              onChange={(e) => updateServiceFeeRow(i, 'amount', e.target.value)}
                              className="min-h-[40px]"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">{t('service_fee_due_date')}</Label>
                            <DateField
                              value={row.due_date}
                              onChange={(v) => updateServiceFeeRow(i, 'due_date', v)}
                              heightClass="min-h-[40px]"
                              clearable
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">{t('service_fee_paid')}</Label>
                            <Select
                              value={paid ? 'paid' : 'unpaid'}
                              onValueChange={(v) => updateServiceFeeRow(i, 'paid', v === 'paid')}
                            >
                              <SelectTrigger className="min-h-[40px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unpaid">{t('service_fee_unpaid')}</SelectItem>
                                <SelectItem value="paid">{t('service_fee_paid')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeServiceFeeRow(i)}
                            className="min-h-[40px] min-w-[40px] text-destructive hover:bg-red-50"
                            aria-label={t('service_fee_remove_payment')}
                          >
                            <Trash2 size={15} />
                          </Button>
                          <div className="space-y-1 sm:col-span-4">
                            <Label className="text-[11px]">{t('service_fee_payment_note')}</Label>
                            <Input
                              value={row.note || ''}
                              onChange={(e) => updateServiceFeeRow(i, 'note', e.target.value)}
                              className="min-h-[40px]"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const isTypeSelect = step === 'select' && !isEdit && !isConvert;

  const headerTitle = isTypeSelect
    ? t('type_select_title')
    : isConvert
      ? t('convert_property_type')
      : step === 'rented-source'
        ? t('rented_source_title')
        : step === 'rented-existing'
          ? t('rented_existing_title')
          : isEdit
            ? t('edit_property')
            : t('add_property');

  const headerSubtitle = isTypeSelect
    ? t('type_select_subtitle')
    : isConvert
      ? convertTarget === 'installment'
        ? t('convert_to_installment_hint')
        : t('convert_to_cash_hint')
      : step === 'rented-source'
        ? t('rented_source_subtitle')
        : step === 'rented-existing'
          ? t('rented_existing_subtitle')
          : t('property_created');

  // Full-screen page header back/close:
  //  - type-select / edit / convert → close the form (return to dashboard)
  //  - form (new property) → back to the type-select step
  //  - rented-existing → back to rented-source → back to type-select
  const handleHeaderBack = () => {
    if (isTypeSelect || isEdit || isConvert) {
      requestClose();
      return;
    }
    if (step === 'rented-existing') setStep('rented-source');
    else if (step === 'rented-source') setStep('select');
    else if (step === 'form') setStep('select');
    else requestClose();
  };

  return (
    <Dialog modal={false} open={open} onOpenChange={handleDialogOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Content
          className="fixed inset-0 z-[60] flex h-[100dvh] w-full flex-col gap-0 overflow-hidden bg-background p-0 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          {/* Unified full-screen header — back/close + contextual title.
              No overlay/backdrop: this is a real full-screen page, not a modal. */}
          <div className="flex shrink-0 items-center gap-3 border-b bg-card px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={handleHeaderBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background text-foreground shadow-sm hover:bg-accent"
              aria-label={isTypeSelect || isEdit || isConvert ? t('cancel') : (t('back') || 'Back')}
            >
              <ArrowRight size={20} className={lang === 'ar' ? '' : 'rotate-180'} />
            </button>
            <div className="min-w-0 flex-1 text-start">
              <DialogTitle className="text-base font-bold leading-tight sm:text-lg">
                {headerTitle}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                {headerSubtitle}
              </DialogDescription>
            </div>
          </div>

          {/* Scrollable body — natural page scroll, full width */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-6">
            <div className="mx-auto w-full max-w-3xl">
              {isTypeSelect && (
                <>
                {/* Payment type only (cash / installment / rented).
                    Usage type is a required field inside each form. */}
                <div className="space-y-2.5">
                  <div>
                    <p className="text-sm font-bold text-foreground">{t('type_select_title')}</p>
                    <p className="text-xs text-muted-foreground">{t('type_select_subtitle')}</p>
                  </div>
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => chooseType('cash')}
                  className="group flex min-h-[120px] flex-row-reverse items-center gap-4 rounded-2xl border border-border bg-card p-5 text-start shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[160px] sm:flex-col sm:items-start sm:gap-3"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Banknote size={24} />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-base font-bold text-foreground">{t('type_cash')}</span>
                    <span className="block text-xs text-muted-foreground leading-relaxed">{t('type_cash_desc')}</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => chooseType('installment')}
                  className="group flex min-h-[120px] flex-row-reverse items-center gap-4 rounded-2xl border border-border bg-card p-5 text-start shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[160px] sm:flex-col sm:items-start sm:gap-3"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <CalendarClock size={24} />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-base font-bold text-foreground">{t('type_installment')}</span>
                    <span className="block text-xs text-muted-foreground leading-relaxed">{t('type_installment_desc')}</span>
                  </span>
                </button>

              </div>
                {/* Renting is no longer a creation-time "type" — it never
                    overwrites an existing cash/installment property's type
                    and never re-collects its data. Rent an existing property
                    from its Property Profile page ("Rent this property"), or
                    add a brand-new rented property through Estate AI. */}
                <p className="text-xs text-muted-foreground pt-1">
                  {t('type_rented_hint') ||
                    (lang === 'ar'
                      ? 'لتأجير عقار — افتح صفحة العقار في «عقاراتي» واضغط «تأجير هذا العقار»، أو استخدم Estate AI لإضافة عقار مؤجَّر جديد بالكامل.'
                      : 'To rent out a property — open it in "My Properties" and tap "Rent this property", or use Estate AI to add a brand-new rented property.')}
                </p>
                </div>

              <div className="mx-auto mt-4 flex w-full max-w-lg justify-start sm:max-w-none sm:justify-end">
                <Button type="button" variant="outline" onClick={() => requestClose()} className="min-h-[44px] rounded-full px-6">
                  {t('cancel')}
                </Button>
              </div>
                </>
              )}

        {step === 'rented-source' && !isEdit && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => chooseRentedSource('existing')}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-start shadow-sm transition-all hover:border-[hsl(var(--gold))]/60 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[160px]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors group-hover:bg-primary/90">
                  <Landmark size={24} />
                </span>
                <span className="space-y-1">
                  <span className="block text-base font-bold text-foreground">{t('rented_source_existing')}</span>
                  <span className="block text-xs text-muted-foreground leading-relaxed">{t('rented_source_existing_desc')}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => chooseRentedSource('new')}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-start shadow-sm transition-all hover:border-[hsl(var(--gold))]/60 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[160px]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors group-hover:bg-primary/90">
                  <Plus size={24} />
                </span>
                <span className="space-y-1">
                  <span className="block text-base font-bold text-foreground">{t('rented_source_new')}</span>
                  <span className="block text-xs text-muted-foreground leading-relaxed">{t('rented_source_new_desc')}</span>
                </span>
              </button>
            </div>

            <div className="flex justify-between pt-1">
              <Button type="button" variant="outline" onClick={() => setStep('select')} className="min-h-[44px]">
                {t('rented_back_source')}
              </Button>
              <Button type="button" variant="outline" onClick={() => requestClose()} className="min-h-[44px]">
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}

        {step === 'rented-existing' && !isEdit && (() => {
          const q = existingSearch.trim().toLowerCase();
          const filtered = existingProperties.filter((p) => {
            if (!q) return true;
            const hay = [
              countryName(p.country),
              p.area || '',
              p.building || '',
              p.unit_number || '',
              p.property_size || '',
              p.developer || '',
            ].join(' ').toLowerCase();
            return hay.includes(q);
          });
          return (
            <div className="space-y-3 pt-2">
              <Input
                value={existingSearch}
                onChange={(e) => setExistingSearch(e.target.value)}
                placeholder={t('rented_existing_search')}
                className="min-h-[44px]"
              />
              {loadingExisting ? (
                <p className="rounded-lg border border-dashed bg-accent/30 px-3 py-4 text-center text-xs text-muted-foreground">
                  {t('rented_existing_loading')}
                </p>
              ) : filtered.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-accent/30 px-3 py-4 text-center text-xs text-muted-foreground">
                  {t('rented_existing_empty')}
                </p>
              ) : (
                <div className="space-y-2 max-h-[52dvh] overflow-y-auto pe-1">
                  {filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectExistingProperty(p)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-start shadow-sm transition-all hover:border-[hsl(var(--gold))]/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Landmark size={18} />
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="block text-sm font-bold text-foreground truncate">
                          {p.building} · {t('unit_number')} {p.unit_number}
                        </span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {countryName(p.country)}{p.area ? ` · ${p.area}` : ''}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {p.type === 'installment' ? t('type_installment') : t('type_cash')}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex justify-between pt-1">
                <Button type="button" variant="outline" onClick={() => setStep('rented-source')} className="min-h-[44px]">
                  {t('rented_back_source')}
                </Button>
                <Button type="button" variant="outline" onClick={() => requestClose()} className="min-h-[44px]">
                  {t('cancel')}
                </Button>
              </div>
            </div>
          );
        })()}

        {step === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {adminMode && !isEdit && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <Label>{t('select_owner')} <span className="text-xs text-destructive">*</span></Label>
              <Select
                value={adminOwner || ''}
                onValueChange={(v) => onAdminOwnerChange?.(v)}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder={t('select_owner')} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(owners || []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(owners || []).length === 0 && (
                <p className="text-xs text-muted-foreground">{t('no_owners_yet')}</p>
              )}
            </div>
          )}
          {form.type === 'rented' && selectedProperty && !isEdit ? (
            <div className="space-y-3">
              {/* Read-only summary of the selected existing property */}
              <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Landmark size={16} className="text-primary" />
                    <p className="text-sm font-bold">{t('rented_selected_property')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedProperty(null); setRentedSource(null); setStep('rented-source'); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    {t('rented_change_property')}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
                  <div><span className="text-xs text-muted-foreground">{t('country')}: </span><span className="font-medium">{countryName(form.country)}</span></div>
                  <div><span className="text-xs text-muted-foreground">{t('area')}: </span><span className="font-medium">{form.area}</span></div>
                  <div><span className="text-xs text-muted-foreground">{t('building')}: </span><span className="font-medium">{form.building}</span></div>
                  <div><span className="text-xs text-muted-foreground">{t('unit_number')}: </span><span className="font-medium">{form.unit_number}</span></div>
                </div>
                <p className="text-xs text-muted-foreground">{t('property_details_imported')}</p>
              </div>
              {/* Ownership verification — satisfied by the existing property */}
              <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-3 flex items-center gap-2.5">
                <ShieldCheck size={18} className="text-emerald-700 shrink-0" />
                <p className="text-xs text-emerald-800">{t('ownership_existing_ok')}</p>
              </div>
            </div>
          ) : form.type === 'installment' ? null : (
          <>
          {/* Ownership / title deed — required PDF; AI auto-fills property fields after upload */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">{t('ownership_section')}</p>
              <p className="text-xs text-muted-foreground">{t('ownership_upload_hint')}</p>
            </div>
            <PlainFileUpload
              label={t('title_deed_pdf')}
              required={!isEdit}
              file={files.title_deed_pdf}
              fileUrl={fileUrls.title_deed_pdf}
              existing={property?.title_deed_pdf}
              existingUrl={property?.title_deed_pdf_url}
              record={property}
              fieldKey="title_deed_pdf"
              onFileChange={setFile('title_deed_pdf')}
              t={t}
            />
            <AdditionalDocsUpload
              files={files.additional_documents}
              names={form.additional_doc_names}
              urls={fileUrls.additional_documents}
              onFilesChange={(arr, urls) => { setFiles((f) => ({ ...f, additional_documents: arr })); setFileUrls((f) => ({ ...f, additional_documents: urls || arr.map(() => '') })); }}
              onNamesChange={(arr) => setForm((s) => ({ ...s, additional_doc_names: arr }))}
              existing={property?.additional_documents}
              existingDocs={property?.additional_documents_urls}
              record={property}
              t={t}
            />
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
            <SectionHead
              icon={Landmark}
              title={t('sec_property_info')}
            />
            {openSectionAi === 'property_info' && (
              <SectionAiAssistant
                section="property_info"
                open
                onOpenChange={(o) => !o && setOpenSectionAi(null)}
                currentValues={sectionCurrentValues('property_info')}
                onApply={(fields) => applySectionFields('property_info', fields)}
              />
            )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('property_type')}</Label>
                {!isEdit && (
                  <button
                    type="button"
                    onClick={() => setStep('select')}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    {t('change_type')}
                  </button>
                )}
              </div>
              <Select value={form.type} disabled>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('type_cash')}</SelectItem>
                  <SelectItem value="installment">{t('type_installment')}</SelectItem>
                  <SelectItem value="rented">{t('type_rented')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="flex items-center gap-1">
                  {t('usage_type_label')}
                  <span className="text-destructive">*</span>
                </Label>
                <span className="text-[11px] text-muted-foreground">{t('usage_type_subtitle')}</span>
              </div>
              <div
                role="radiogroup"
                aria-label={t('usage_type_title')}
                className="inline-flex w-full items-stretch gap-1 rounded-xl border border-border bg-muted/60 p-1"
              >
                {[
                  { key: 'residential', icon: Home, label: t('usage_type_residential') },
                  { key: 'commercial', icon: Store, label: t('usage_type_commercial') },
                  { key: 'land', icon: TreePine, label: t('usage_type_land') },
                ].map(({ key, icon: Icon, label }) => {
                  const selected = form.usage_type === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setForm((f) => ({ ...f, usage_type: key }))}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]',
                        selected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-card hover:text-foreground',
                      )}
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <NationalityField
              label={t('country')}
              required
              placeholder={t('country_select')}
              value={form.country}
              onChange={(v) => setForm((f) => ({ ...f, country: v }))}
              heightClass="min-h-[44px]"
            />
            <CityField
              label={t('area')}
              required
              country={form.country}
              value={form.area}
              onChange={(en) => setForm((f) => ({ ...f, area: en }))}
              heightClass="min-h-[44px]"
            />
            <div className="space-y-2">
              <Label>{t('building')}</Label>
              <Input value={form.building} onChange={set('building')} required className="min-h-[44px]" />
            </div>
            {form.usage_type !== 'land' && (
              <div className="space-y-2">
                <Label>{t('unit_number')}</Label>
                <Input value={form.unit_number} onChange={set('unit_number')} required className="min-h-[44px]" />
              </div>
            )}
            {form.type !== 'rented' && (
              <>
                <SizeField
                  value={form.property_size}
                  unit={form.property_size_unit}
                  onValueChange={set('property_size')}
                  onUnitChange={set('property_size_unit')}
                  t={t}
                />
                <div className="space-y-2">
                  <Label>{t('ai_field_developer')}</Label>
                  <Input value={form.developer} onChange={set('developer')} className="min-h-[44px]" />
                </div>
              </>
            )}
          </div>
          </div>
          </>
          )}

          {form.type === 'cash' && (() => {
            const matchProp = {
              id: property?.id,
              owner: property?.owner || effectiveOwner,
              building: form.building,
              unit_number: form.unit_number,
              type: 'cash',
            };
            const rented = ownerProps.some((p) => {
              if (!p || p.type !== 'rented') return false;
              if (property?.id && p.id === property.id) return true;
              const o = typeof p.owner === 'string' ? p.owner : p.owner?.id || '';
              const mo = typeof matchProp.owner === 'string' ? matchProp.owner : matchProp.owner?.id || '';
              if (mo && o && mo !== o) return false;
              return (
                String(p.building || '').trim().toLowerCase() === String(form.building || '').trim().toLowerCase() &&
                String(p.unit_number || '').trim().toLowerCase() === String(form.unit_number || '').trim().toLowerCase()
              );
            });
            const rentalLabel = rented ? t('status_rented_green') : t('status_not_rented');
            const rentalColor = rented
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200/60'
              : 'text-orange-700 bg-orange-50 border-orange-200/60';

            return (
            <div className="space-y-4 rounded-xl border p-4">
              {isConvert && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
                  {t('convert_to_cash_hint')}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('total_property_price')}</Label>
                  <MoneyInput
                    min="0"
                    value={form.total_price}
                    onChange={set('total_price')}
                    className="min-h-[44px]"
                  />
                </div>
                <DateField
                  label={t('purchase_date')}
                  optionalLabel
                  value={form.purchase_date}
                  onChange={set('purchase_date')}
                  heightClass="min-h-[44px]"
                />
              </div>

              {renderServiceFees()}

              <p className="text-xs text-muted-foreground">{t('rental_match_hint')}</p>

              {/* Cash property summary */}
              <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <BadgeCheck size={16} className="text-primary" />
                  <p className="text-sm font-bold">{t('cash_summary')}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center gap-3 rounded-lg border border-blue-200/60 bg-blue-50/50 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Banknote size={17} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">{t('cash_summary_price')}</p>
                      <p className="text-base font-bold tabular-nums text-emerald-800" dir="ltr">
                        {formatMoney(num(form.total_price), lang)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Receipt size={17} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">{t('cash_summary_service')}</p>
                      <p className="text-base font-bold tabular-nums text-primary" dir="ltr">
                        {num(form.service_charge_amount)
                          ? `${formatMoney(num(form.service_charge_amount), lang)}${form.service_charge_frequency === 'yearly' ? ` · ${t('freq_yearly')}` : ''}`
                          : t('summary_none')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <CalendarDays size={17} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">{t('cash_summary_purchase')}</p>
                      <p className="text-base font-bold tabular-nums text-emerald-800" dir="ltr">
                        {form.purchase_date ? formatDate(form.purchase_date, lang) : t('summary_none')}
                      </p>
                    </div>
                  </div>
                  <div className={cn('flex items-center gap-3 rounded-lg border p-3', rentalColor)}>
                    <span
                      className={cn(
                        'h-3 w-3 shrink-0 rounded-full',
                        rented ? 'bg-emerald-500' : 'bg-orange-500',
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">{t('cash_summary_rental_status')}</p>
                      <p className="text-base font-bold">{rentalLabel}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {form.type === 'installment' && (() => {
            const downPaid = num(form.down_payment);
            const installmentsPaid = rows
              .filter((r) => r.status === 'paid')
              .reduce((s, r) => s + num(r.amount), 0);
            const totalPaid = downPaid + installmentsPaid;
            const totalPrice = num(form.total_price);
            const remainingBalance = Math.max(0, totalPrice - totalPaid);
            const nextInst = rows
              .filter((r) => r.status !== 'paid' && r.due_date)
              .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
            const nextSvc = nextServiceDate(form.service_charge_date, form.service_charge_frequency);
            const handoverLabel =
              form.handover_status === 'handover_completed'
                ? t('handover_completed')
                : t('under_construction');
            const rented = ownerProps.some((p) => {
              if (!p || p.type !== 'rented') return false;
              if (property?.id && p.id === property.id) return true;
              const o = typeof p.owner === 'string' ? p.owner : p.owner?.id || '';
              const mo = property?.owner || effectiveOwner;
              const moId = typeof mo === 'string' ? mo : mo?.id || '';
              if (moId && o && moId !== o) return false;
              return (
                String(p.building || '').trim().toLowerCase() === String(form.building || '').trim().toLowerCase() &&
                String(p.unit_number || '').trim().toLowerCase() === String(form.unit_number || '').trim().toLowerCase()
              );
            });
            const rentalLabel = rented ? t('status_rented_green') : t('status_not_rented');

            // Payment-plan validation: compare sum of installments to total price.
            const totalPayments = rows.reduce((s, r) => s + num(r.amount), 0);
            const planMatch = totalPrice > 0 && totalPayments > 0 && Math.abs(totalPayments - totalPrice) < 0.5;
            const preCount = rowsByPhase('pre_handover').length;
            const handoverCount = rowsByPhase('handover').length;
            const postCount = rowsByPhase('post_handover').length;

            return (
            <div className="flex flex-col gap-5">
              {isConvert && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
                  {t('convert_to_installment_hint')}
                </div>
              )}

              {/* ---- Section 1: Property Information ---- */}
              <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <SectionHead
                  icon={Landmark}
                  title={t('sec_property_info')}
                  showAi
                  hint={t('sec_property_info_hint')}
                  aiActive={openSectionAi === 'property_info'}
                  onAiClick={() => toggleSectionAi('property_info')}
                />
                {openSectionAi === 'property_info' && (
                  <SectionAiAssistant
                    section="property_info"
                    open
                    onOpenChange={(o) => !o && setOpenSectionAi(null)}
                    currentValues={sectionCurrentValues('property_info')}
                    onApply={(fields) => applySectionFields('property_info', fields)}
                  />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{t('property_type')}</Label>
                      {!isEdit && (
                        <button
                          type="button"
                          onClick={() => setStep('select')}
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                          {t('change_type')}
                        </button>
                      )}
                    </div>
                    <Select value={form.type} disabled>
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">{t('type_cash')}</SelectItem>
                        <SelectItem value="installment">{t('type_installment')}</SelectItem>
                        <SelectItem value="rented">{t('type_rented')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <Label className="flex items-center gap-1">
                        {t('usage_type_label')}
                        <span className="text-destructive">*</span>
                      </Label>
                      <span className="text-[11px] text-muted-foreground">{t('usage_type_subtitle')}</span>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={t('usage_type_title')}
                      className="inline-flex w-full items-stretch gap-1 rounded-xl border border-border bg-muted/60 p-1"
                    >
                      {[
                        { key: 'residential', icon: Home, label: t('usage_type_residential') },
                        { key: 'commercial', icon: Store, label: t('usage_type_commercial') },
                        { key: 'land', icon: TreePine, label: t('usage_type_land') },
                      ].map(({ key, icon: Icon, label }) => {
                        const selected = form.usage_type === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setForm((f) => ({ ...f, usage_type: key }))}
                            className={cn(
                              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]',
                              selected
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-card hover:text-foreground',
                            )}
                          >
                            <Icon size={15} className="shrink-0" />
                            <span className="truncate">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <NationalityField
                    label={t('country')}
                    required
                    placeholder={t('country_select')}
                    value={form.country}
                    onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                    heightClass="min-h-[44px]"
                  />
                  <CityField
                    label={t('area')}
                    required
                    country={form.country}
                    value={form.area}
                    onChange={(en) => setForm((f) => ({ ...f, area: en }))}
                    heightClass="min-h-[44px]"
                  />
                  <div className="space-y-2">
                    <Label>{t('building')}</Label>
                    <Input value={form.building} onChange={set('building')} required className="min-h-[44px]" />
                  </div>
                  {form.usage_type !== 'land' && (
                    <div className="space-y-2">
                      <Label>{t('unit_number')}</Label>
                      <Input value={form.unit_number} onChange={set('unit_number')} required className="min-h-[44px]" />
                    </div>
                  )}
                  <SizeField
                    value={form.property_size}
                    unit={form.property_size_unit}
                    onValueChange={set('property_size')}
                    onUnitChange={set('property_size_unit')}
                    t={t}
                  />
                  <div className="space-y-2">
                    <Label>{t('ai_field_developer')}</Label>
                    <Input value={form.developer} onChange={set('developer')} className="min-h-[44px]" />
                  </div>
                  <DateField
                    label={t('purchase_date')}
                    optionalLabel
                    value={form.purchase_date}
                    onChange={set('purchase_date')}
                    heightClass="min-h-[44px]"
                  />
                </div>
              </div>

              {/* ---- Purchase Details / Payment Plan ---- */}
              <div className="order-5 rounded-xl border bg-card p-4 space-y-4 shadow-sm">
                <SectionHead
                  icon={Banknote}
                  title={lang === 'ar' ? 'تفاصيل الشراء / خطة الدفع' : 'Purchase Details / Payment Plan'}
                />
                {openSectionAi === 'purchase_details' && (
                  <SectionAiAssistant
                    section="purchase_details"
                    open
                    onOpenChange={(o) => !o && setOpenSectionAi(null)}
                    currentValues={sectionCurrentValues('purchase_details')}
                    onApply={(fields) => applySectionFields('purchase_details', fields)}
                  />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('total_price')}</Label>
                    <MoneyInput
                      min="0"
                      value={form.total_price}
                      onChange={set('total_price')}
                      required={!isEdit || isConvert}
                      className="min-h-[44px]"
                    />
                  </div>
                </div>

                {/* Purchase Fees — fully optional, flexible, country-agnostic
                    (e.g. UAE 4% registration). Each fee is an independent
                    card: name → calculation method (fixed amount | percentage)
                    → the single relevant value field. Percentage fees are
                    computed from the total price in the background. */}
                <div className="rounded-lg border bg-accent/30 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold">{t('purchase_fees_section')}</p>
                      <p className="text-[11px] text-muted-foreground">{t('purchase_fee_optional_hint')}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setForm((f) => ({ ...f, purchase_fees: [...f.purchase_fees, { name: '', type: 'fixed', percent: '', amount: '' }] }))}
                      className="min-h-[36px]"
                    >
                      <Plus size={14} className="me-1" />
                      {t('purchase_fee_add')}
                    </Button>
                  </div>
                  {form.purchase_fees.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('purchase_fee_empty')}</p>
                  ) : (
                    <div className="space-y-2">
                      {form.purchase_fees.map((fee, i) => {
                        const totalPrice = num(form.total_price);
                        const pct = num(fee.percent);
                        const computedAmount = fee.type === 'percent' && totalPrice > 0 && pct > 0
                          ? Math.round(totalPrice * pct) / 100
                          : 0;
                        return (
                          <div key={i} className="rounded-lg border bg-card p-2.5 space-y-2">
                            {/* Row 1 — fee name + delete */}
                            <div className="flex items-end gap-2">
                              <div className="flex-1 space-y-1">
                                <Label className="text-[11px]">{t('purchase_fee_name')}</Label>
                                <Input
                                  value={fee.name}
                                  onChange={(e) => setForm((f) => { const p = [...f.purchase_fees]; p[i] = { ...p[i], name: e.target.value }; return { ...f, purchase_fees: p }; })}
                                  placeholder={lang === 'ar' ? 'رسوم التسجيل / رسوم إدارية…' : 'Registration fee / Admin fee…'}
                                  className="min-h-[40px]"
                                />
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => setForm((f) => ({ ...f, purchase_fees: f.purchase_fees.filter((_, j) => j !== i) }))}
                                className="min-h-[40px] min-w-[40px] text-destructive hover:bg-red-50"
                                aria-label={t('remove_installment')}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>

                            {/* Row 2 — calculation method */}
                            <div className="space-y-1">
                              <Label className="text-[11px]">{t('purchase_fee_calc_method')}</Label>
                              <Select
                                value={fee.type || 'fixed'}
                                onValueChange={(v) => setForm((f) => {
                                  const p = [...f.purchase_fees];
                                  p[i] = { ...p[i], type: v, percent: '', amount: '' };
                                  return { ...f, purchase_fees: p };
                                })}
                              >
                                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fixed">{t('purchase_fee_fixed')}</SelectItem>
                                  <SelectItem value="percent">{t('purchase_fee_percent')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Row 3 — only the relevant value field */}
                            {fee.type === 'percent' ? (
                              <div className="space-y-1.5">
                                <div className="space-y-1">
                                  <Label className="text-[11px]">{t('purchase_fee_percent_value')}</Label>
                                  <div className="relative">
                                    <PercentInput
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={fee.percent}
                                      onChange={(e) => setForm((f) => {
                                        const p = [...f.purchase_fees];
                                        const nextPct = e.target.value;
                                        const tp = num(f.total_price ?? form.total_price);
                                        const computed = tp > 0 && num(nextPct) > 0
                                          ? String(Math.round(tp * num(nextPct)) / 100)
                                          : '';
                                        p[i] = { ...p[i], percent: nextPct, amount: computed };
                                        return { ...f, purchase_fees: p };
                                      })}
                                      className="min-h-[40px]"
                                    />
                                  </div>
                                </div>
                                {totalPrice > 0 && pct > 0 && (
                                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400" dir="ltr">
                                    {t('purchase_fee_computed')}: {formatMoney(computedAmount, lang)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <Label className="text-[11px]">{t('purchase_fee_amount_value')}</Label>
                                <MoneyInput
                                  min="0"
                                  value={fee.amount}
                                  onChange={(e) => setForm((f) => { const p = [...f.purchase_fees]; p[i] = { ...p[i], amount: e.target.value }; return { ...f, purchase_fees: p }; })}
                                  className="min-h-[40px]"
                                />
                              </div>
                            )}

                            {/* Row 4 — add another independent fee */}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setForm((f) => ({ ...f, purchase_fees: [...f.purchase_fees, { name: '', type: 'fixed', percent: '', amount: '' }] }))}
                              className="min-h-[36px] w-full justify-center border-dashed"
                            >
                              <Plus size={14} className="me-1" />
                              {t('purchase_fee_add_another')}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Payment Method / Financing — required, no default */}
                <div
                  ref={paymentMethodRef}
                  className={cn(
                    'rounded-lg border bg-accent/30 p-3 space-y-3 transition-colors',
                    paymentMethodError && 'border-destructive ring-1 ring-destructive/40 bg-red-50/60 dark:bg-red-950/20',
                  )}
                >
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-bold">{t('payment_method_section')}</p>
                    <span className="text-destructive">*</span>
                  </div>
                  <Select
                    value={form.payment_method}
                    onValueChange={(v) => { setPaymentMethodError(false); set('payment_method')(v); }}
                  >
                    <SelectTrigger className={cn('min-h-[44px]', paymentMethodError && 'border-destructive')}>
                      <SelectValue placeholder={t('payment_method_section')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">{t('payment_method_full')}</SelectItem>
                      <SelectItem value="company_installments">{t('payment_method_company')}</SelectItem>
                      <SelectItem value="bank_installments">{t('payment_method_bank')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {paymentMethodError && (
                    <p className="text-xs font-medium text-destructive">{t('payment_method_required')}</p>
                  )}
                  {form.payment_method && form.payment_method !== 'full' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px]">{t('duration_years')}</Label>
                        <Input type="number" min="0" inputMode="numeric" placeholder="0" value={form.payment_duration_years} onChange={set('payment_duration_years')} dir="ltr" className="min-h-[40px] tabular-nums" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">{t('duration_months')}</Label>
                        <Input type="number" min="0" inputMode="numeric" placeholder="0" value={form.payment_duration_months} onChange={set('payment_duration_months')} dir="ltr" className="min-h-[40px] tabular-nums" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Plan type selector — controls which builder sections appear
                    below. Does not affect the AI reader, PDF upload, or the
                    manual installment rows. */}
                <div className="rounded-lg border bg-accent/30 p-3 space-y-2">
                  <Label className="text-xs font-bold">{t('plan_type')}</Label>
                  <Select
                    value={planType || 'none'}
                    onValueChange={(v) => {
                      const next = v === 'none' ? '' : v;
                      // Clear any committed plan when switching shapes so the
                      // builder starts fresh from the suggested stages.
                      if (next !== planType) {
                        setRows([]);
                        setPlanStages([]);
                        setPlanType(next);
                        setPlanEntryMode('');
                      }
                    }}
                  >
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue placeholder={t('plan_type')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('plan_type')}</SelectItem>
                      <SelectItem value="type1">{t('plan_type_1')}</SelectItem>
                      <SelectItem value="type2">{t('plan_type_2')}</SelectItem>
                      <SelectItem value="type4">{t('plan_type_4')}</SelectItem>
                      <SelectItem value="type5">{t('plan_type_5')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t('plan_type_hint')}
                  </p>
                </div>

                {/* After plan type: manual builder only (Smart Plan Reader AI retired). */}
                {!!planType && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={planEntryMode === 'builder' ? 'default' : 'outline'}
                      onClick={() => setPlanEntryMode('builder')}
                      className="min-h-[44px] gap-1.5 px-2 text-[11px] leading-snug sm:text-xs justify-center font-bold"
                    >
                      <Layers size={15} className="shrink-0" />
                      <span className="text-center leading-snug">
                        {lang === 'ar' ? 'بناء خطة الدفع' : 'Build payment plan'}
                      </span>
                    </Button>
                  </div>
                )}

                {!!planType && planEntryMode === 'smart' && (
                  <SmartPaymentPlanReader
                    key={`smart-plan-${planType || 'plan'}-${planResetKey}`}
                    totalPrice={form.total_price}
                    handoverDate={form.expected_handover_date}
                    existingHashes={smartImportHashes}
                    onApprove={handleApproveSmartPlan}
                  />
                )}

                {!!planType && planEntryMode === 'builder' && (
                  <PaymentPlanStageBuilder
                    key={`builder-plan-${planType || 'plan'}-${planResetKey}`}
                    planType={planType}
                    initialStages={
                      planStages.length ? planStages : suggestedStagesForType(planType)
                    }
                    resetKey={planType || 'plan'}
                    totalPrice={form.total_price}
                    purchaseDate={form.purchase_date}
                    handoverDate={form.expected_handover_date}
                    onGenerate={handleCreatePlan}
                  />
                )}

                {/* Validation: total payments vs total price */}
                {rows.length > 0 && totalPrice > 0 && (
                  <div
                    className={cn(
                      'rounded-lg border p-3 text-xs',
                      planMatch
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800',
                    )}
                  >
                    <p className="font-semibold">{planMatch ? t('plan_match') : t('plan_mismatch')}</p>
                    <p className="mt-0.5 text-muted-foreground" dir="ltr">
                      {t('plan_total_payments')}: {formatMoney(totalPayments, lang)} · {t('summary_total_price')}: {formatMoney(totalPrice, lang)}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {t('phase_pre_handover')}: {preCount} · {t('phase_handover')}: {handoverCount} · {t('phase_post_handover')}: {postCount} · {t('plan_summary_total_count')}: {rows.length}
                    </p>
                  </div>
                )}
              </div>

              {/* ---- Section 4: Handover ---- */}
              <div className="order-2 rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <SectionHead
                  icon={ShieldCheck}
                  title={t('sec_handover')}
                />
                {openSectionAi === 'handover' && (
                  <SectionAiAssistant
                    section="handover"
                    open
                    onOpenChange={(o) => !o && setOpenSectionAi(null)}
                    currentValues={sectionCurrentValues('handover')}
                    onApply={(fields) => applySectionFields('handover', fields)}
                  />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('handover_status')}</Label>
                    <Select
                      value={form.handover_status}
                      onValueChange={(v) => setForm((f) => ({ ...f, handover_status: v }))}
                    >
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="under_construction">{t('under_construction')}</SelectItem>
                        <SelectItem value="handover_completed">{t('handover_completed')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DateField
                    label={t('expected_handover_date')}
                    value={form.expected_handover_date}
                    onChange={set('expected_handover_date')}
                    heightClass="min-h-[44px]"
                  />
                </div>
                {form.handover_status === 'handover_completed' && (
                  <DateField
                    label={t('actual_handover_date')}
                    value={form.actual_handover_date}
                    onChange={set('actual_handover_date')}
                    heightClass="min-h-[44px]"
                  />
                )}
                {handoverCount > 0 && form.expected_handover_date && (
                  <p className="text-xs text-muted-foreground">{t('handover_linked')}</p>
                )}
              </div>

              {/* ---- Section 5: Service Fees ---- */}
              {renderServiceFees('order-3')}

          {/* ---- Installments List ----
              Shown only for installment properties. Collapsed by default with
              an always-visible summary (count · total).
              Expanding reveals a paginated, scroll-bounded list (10 per page).
              No calculation/extraction logic is touched — display only. */}
          {form.type === 'installment' && (() => {
            const renderInstRow = (row, i) => (
              <div className="rounded-lg border bg-card p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {t('installment_number')} {i + 1}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeRow(i)}
                    className="min-h-[36px] min-w-[36px] text-destructive hover:bg-red-50"
                    aria-label={t('remove_installment')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t('amount')}</Label>
                    <MoneyInput
                      min="0"
                      value={row.amount}
                      onChange={(e) => updateRow(i, 'amount', e.target.value)}
                      className="min-h-[40px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t('installment_phase')}</Label>
                    <Select
                      value={row.phase || 'pre_handover'}
                      onValueChange={(v) => updateRowPhase(i, v)}
                    >
                      <SelectTrigger className="min-h-[40px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first_payment">{t('phase_first_payment')}</SelectItem>
                        <SelectItem value="pre_handover">{t('phase_pre_handover')}</SelectItem>
                        <SelectItem value="handover">{t('phase_handover')}</SelectItem>
                        <SelectItem value="post_handover">{t('phase_post_handover')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t('installment_percentage')}</Label>
                    <PercentInput
                      min="0"
                      value={row.percentage}
                      onChange={(e) => updateRow(i, 'percentage', e.target.value)}
                      className="min-h-[40px]"
                    />
                  </div>
                  <DateField
                    label={t('due_date')}
                    value={row.due_date}
                    onChange={(v) => updateRow(i, 'due_date', v)}
                    heightClass="min-h-[40px]"
                  />
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t('payment_status')}</Label>
                    <Select
                      value={row.status}
                      onValueChange={(v) => updateRow(i, 'status', v)}
                    >
                      <SelectTrigger className="min-h-[40px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unpaid">{t('payment_unpaid')}</SelectItem>
                        <SelectItem value="paid">{t('payment_paid')}</SelectItem>
                        <SelectItem value="overdue">{t('payment_overdue')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px]">{t('installment_note')}</Label>
                    <Input
                      value={row.note}
                      onChange={(e) => updateRow(i, 'note', e.target.value)}
                      className="min-h-[40px]"
                    />
                  </div>
                </div>
              </div>
            );

            const totalAmount = rows.reduce((s, r) => s + num(r.amount), 0);
            // Order rows by phase group, then by their original index, so the
            // paginated view stays grouped (first_payment → pre → handover → post).
            const orderedRows = phaseGroups.flatMap((g) =>
              rows
                .map((row, i) => ({ row, i }))
                .filter(({ row }) => (row.phase || 'pre_handover') === g.key),
            );
            const PAGE_SIZE = 10;
            const totalPages = Math.max(1, Math.ceil(orderedRows.length / PAGE_SIZE));
            const page = Math.min(Math.max(1, instPage), totalPages);
            const pageRows = orderedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            const prevIcon = lang === 'ar' ? <ChevronRight size={14} /> : <ChevronLeft size={14} />;
            const nextIcon = lang === 'ar' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />;

            return (
              <div className="order-6 rounded-xl border bg-card p-4 space-y-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <ListOrdered size={16} className="text-primary" />
                  <p className="text-sm font-bold">
                    {lang === 'ar' ? 'قائمة الأقساط' : 'Installments List'}
                  </p>
                </div>

                {/* Always-visible summary — no need to expand the list */}
                {rows.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="rounded-lg border bg-accent/40 p-3">
                      <p className="text-[11px] text-muted-foreground">
                        {lang === 'ar' ? 'عدد الأقساط' : 'Installments'}
                      </p>
                      <p className="text-base font-bold tabular-nums">{rows.length}</p>
                    </div>
                    <div className="rounded-lg border bg-accent/40 p-3">
                      <p className="text-[11px] text-muted-foreground">
                        {lang === 'ar' ? 'إجمالي المبلغ' : 'Total amount'}
                      </p>
                      <p className="text-base font-bold tabular-nums" dir="ltr">
                        {formatMoney(totalAmount, lang)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed bg-accent/30 px-3 py-4 text-center text-xs text-muted-foreground">
                    {t('add_installment')}
                  </p>
                )}

                {/* Clear expand/collapse + add-installment controls */}
                {rows.length > 0 && (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setInstallmentsExpanded((v) => {
                          if (!v) setInstPage(1);
                          return !v;
                        });
                      }}
                      className="min-h-[40px] gap-2"
                    >
                      {installmentsExpanded
                        ? (lang === 'ar' ? 'إخفاء التفاصيل' : 'Hide details')
                        : (lang === 'ar' ? 'عرض كل الأقساط' : 'Show all installments')}
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowNewInst((v) => !v)}
                        className="min-h-[36px]"
                      >
                        <Plus size={14} className="me-1" />
                        {t('add_installment')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmClearPlan(true)}
                        className="min-h-[36px] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={14} className="me-1" />
                        {lang === 'ar' ? 'مسح الكل' : 'Clear all'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Add-installment mini-form */}
                {showNewInst && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <p className="text-xs font-bold">{t('add_installment')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-[11px]">{t('amount')}</Label>
                        <MoneyInput
                          min="0"
                          value={newInst.amount}
                          onChange={(e) => setNewInst((n) => ({ ...n, amount: e.target.value }))}
                          className="min-h-[40px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">{t('installment_phase')}</Label>
                        <Select
                          value={newInst.phase}
                          onValueChange={(v) => setNewInst((n) => ({ ...n, phase: v }))}
                        >
                          <SelectTrigger className="min-h-[40px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="first_payment">{t('phase_first_payment')}</SelectItem>
                            <SelectItem value="pre_handover">{t('phase_pre_handover')}</SelectItem>
                            <SelectItem value="handover">{t('phase_handover')}</SelectItem>
                            <SelectItem value="post_handover">{t('phase_post_handover')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">{t('installment_percentage')}</Label>
                        <PercentInput
                          min="0"
                          value={newInst.percentage}
                          onChange={(e) => setNewInst((n) => ({ ...n, percentage: e.target.value }))}
                          className="min-h-[40px]"
                        />
                      </div>
                      <DateField
                        label={t('due_date')}
                        value={newInst.due_date}
                        onChange={(v) => setNewInst((n) => ({ ...n, due_date: v }))}
                        heightClass="min-h-[40px]"
                      />
                      <div className="space-y-1">
                        <Label className="text-[11px]">{t('payment_status')}</Label>
                        <Select
                          value={newInst.status}
                          onValueChange={(v) => setNewInst((n) => ({ ...n, status: v }))}
                        >
                          <SelectTrigger className="min-h-[40px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unpaid">{t('payment_unpaid')}</SelectItem>
                            <SelectItem value="paid">{t('payment_paid')}</SelectItem>
                            <SelectItem value="overdue">{t('payment_overdue')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-[11px]">{t('installment_note')}</Label>
                        <Input
                          value={newInst.note}
                          onChange={(e) => setNewInst((n) => ({ ...n, note: e.target.value }))}
                          className="min-h-[40px]"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowNewInst(false)}
                        className="min-h-[40px]"
                      >
                        {t('cancel')}
                      </Button>
                      <Button
                        type="button"
                        onClick={commitNewInst}
                        disabled={!num(newInst.amount) || !newInst.due_date}
                        className="min-h-[40px]"
                      >
                        {t('add_installment')}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Expanded list — scroll-bounded + paginated (10 per page) */}
                {rows.length > 0 && installmentsExpanded && (
                  <div className="space-y-3">
                    <div className="max-h-[560px] overflow-y-auto pe-1 space-y-3">
                      {pageRows.map(({ row, i }) => renderInstRow(row, i))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between gap-2 border-t pt-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={page <= 1}
                          onClick={() => setInstPage((p) => Math.max(1, p - 1))}
                          className="min-h-[36px] gap-1"
                        >
                          {prevIcon}
                          {lang === 'ar' ? 'السابق' : 'Previous'}
                        </Button>
                        <span className="text-xs font-medium text-muted-foreground tabular-nums">
                          {lang === 'ar' ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={page >= totalPages}
                          onClick={() => setInstPage((p) => Math.min(totalPages, p + 1))}
                          className="min-h-[36px] gap-1"
                        >
                          {lang === 'ar' ? 'التالي' : 'Next'}
                          {nextIcon}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

              {/* ---- Section 6: Documents ---- */}
              <div className="order-7 rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <div className="flex items-center gap-2">
                    <FileCheck2 size={16} className="text-primary" />
                    <p className="text-sm font-bold">{t('sec_documents')}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    {t('sec_documents_hint')}
                  </span>
                </div>
                <PlainFileUpload
                  label={t('title_deed_pdf')}
                  required={!isEdit}
                  file={files.title_deed_pdf}
                  fileUrl={fileUrls.title_deed_pdf}
                  existing={property?.title_deed_pdf}
                  existingUrl={property?.title_deed_pdf_url}
                  record={property}
                  fieldKey="title_deed_pdf_inst"
                  onFileChange={setFile('title_deed_pdf')}
                  t={t}
                />
                <AdditionalDocsUpload
                  files={files.additional_documents}
                  names={form.additional_doc_names}
                  urls={fileUrls.additional_documents}
                  onFilesChange={(arr, urls) => { setFiles((f) => ({ ...f, additional_documents: arr })); setFileUrls((f) => ({ ...f, additional_documents: urls || arr.map(() => '') })); }}
                  onNamesChange={(arr) => setForm((s) => ({ ...s, additional_doc_names: arr }))}
                  existing={property?.additional_documents}
                  existingDocs={property?.additional_documents_urls}
                  record={property}
                  t={t}
                />
              </div>

              {/* ---- Section 7: Property Summary ---- */}
              <div className="order-8 rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <BadgeCheck size={16} className="text-primary" />
                  <p className="text-sm font-bold">{t('installment_summary')}</p>
                </div>

                {/* Group 1 — Price & balance */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('summary_group_contract') || t('installment_summary')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="flex items-center gap-3 rounded-lg border border-blue-200/60 bg-blue-50/50 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Banknote size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_total_price')}</p>
                        <p className="text-base font-bold tabular-nums text-blue-800" dir="ltr">{formatMoney(totalPrice, lang)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <CircleDollarSign size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_total_paid')}</p>
                        <p className="text-base font-bold tabular-nums text-emerald-700" dir="ltr">{formatMoney(totalPaid, lang)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-red-200/60 bg-red-50/40 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <TrendingUp size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_remaining_balance')}</p>
                        <p className="text-base font-bold tabular-nums text-red-600" dir="ltr">{formatMoney(remainingBalance, lang)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Group 2 — Next installment & service charge */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('summary_group_payments') || t('upcoming_payments')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <CalendarClock size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_next_installment')}</p>
                        <p className="text-base font-bold tabular-nums text-primary" dir="ltr">
                          {nextInst ? `${formatMoney(num(nextInst.amount), lang)} · ${formatDate(nextInst.due_date, lang)}` : t('summary_none')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Receipt size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_service_charge')}</p>
                        <p className="text-base font-bold tabular-nums text-emerald-800" dir="ltr">
                          {num(form.service_charge_amount) ? formatMoney(num(form.service_charge_amount), lang) : t('summary_none')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-emerald-200/60 bg-emerald-50/40 p-3 sm:col-span-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        {form.service_charge_frequency === 'yearly' ? <Repeat size={17} /> : <CalendarDays size={17} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">
                          {form.service_charge_frequency === 'yearly' ? t('next_service_recurring') : t('summary_next_service')}
                        </p>
                        <p className="text-base font-bold tabular-nums text-emerald-800" dir="ltr">
                          {nextSvc ? formatDate(nextSvc, lang) : t('summary_none')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Group 3 — Purchase date, handover & rental occupancy */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('summary_group_next') || t('summary')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-3 rounded-lg border bg-accent/40 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <CalendarDays size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_purchase_date')}</p>
                        <p className="text-base font-bold tabular-nums" dir="ltr">{form.purchase_date ? formatDate(form.purchase_date, lang) : t('summary_none')}</p>
                      </div>
                    </div>
                    <div className={cn('flex items-center gap-3 rounded-lg border p-3', form.handover_status === 'handover_completed' ? 'border-emerald-200/60 bg-emerald-50/50 text-emerald-700' : 'border-amber-200/60 bg-amber-50/50 text-amber-700')}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <ShieldCheck size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_handover')}</p>
                        <p className="text-base font-bold">{handoverLabel}</p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3 sm:col-span-2',
                        rented
                          ? 'border-emerald-200/60 bg-emerald-50/50 text-emerald-700'
                          : 'border-orange-200/60 bg-orange-50/50 text-orange-700',
                      )}
                    >
                      <span
                        className={cn(
                          'h-3 w-3 shrink-0 rounded-full',
                          rented ? 'bg-emerald-500' : 'bg-orange-500',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('cash_summary_rental_status')}</p>
                        <p className="text-base font-bold">{rentalLabel}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {form.type === 'rented' && (() => {
            const totalScheduled = rentRows.reduce((s, r) => s + num(r.amount), 0);
            const totalCollected = rentRows
              .filter((r) => r.status === 'paid')
              .reduce((s, r) => s + num(r.amount), 0);
            const remaining = Math.max(0, totalScheduled - totalCollected);
            const nextDue = rentRows
              .filter((r) => r.status !== 'paid' && r.due_date)
              .map((r) => r.due_date)
              .sort()[0];

            return (
            <div className="space-y-4 rounded-xl border p-4">
              {/* Tenant Information section — required docs first, then editable fields */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-foreground">{t('tenant_info_section')}</p>
                  <p className="text-xs text-muted-foreground">{t('tenant_info_hint')}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AiDocReader
                    fileField
                    type="tenant"
                    label={t('tenant_passport_or_residence')}
                    buttonLabel={t('tenant_passport_or_residence')}
                    title={t('ai_tenant_title')}
                    description={t('ai_tenant_desc')}
                    required={!isEdit}
                    file={files.tenant_document}
                    existing={property?.tenant_document}
                    record={property}
                    onFileChange={setFile('tenant_document')}
                    hint={hint}
                    renderReview={renderTenantReview}
                    onApply={(d) => guardApply(d, applyTenantData, tenantConflict)}
                  />
                  <AiDocReader
                    fileField
                    type="rental"
                    label={t('lease_contract')}
                    buttonLabel={t('lease_contract')}
                    title={t('ai_rental_title')}
                    description={t('ai_rental_desc')}
                    required={!isEdit}
                    file={files.lease_contract}
                    existing={property?.lease_contract}
                    record={property}
                    onFileChange={setFile('lease_contract')}
                    hint={hint}
                    renderReview={renderRentalReview}
                    onApply={(d) => guardApply(d, applyRentalData, rentalConflict)}
                  />
                </div>
              </div>

              {/* Tenant information fields (auto-filled when possible, always editable) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('tenant_name')}</Label>
                  <Input value={form.tenant_name} onChange={set('tenant_name')} required className="min-h-[44px]" />
                </div>
                <div className="space-y-2">
                  <Label>{t('tenant_email')}</Label>
                  <Input type="email" value={form.tenant_email} onChange={set('tenant_email')} required dir="ltr" className="min-h-[44px]" />
                </div>
              </div>
              <PhoneField
                label={t('tenant_phone')}
                value={form.tenant_phone}
                onChange={(v) => setForm((f) => ({ ...f, tenant_phone: v }))}
                heightClass="min-h-[44px]"
              />

              {/* Contract dates + annual rent + security deposit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DateField
                  label={t('contract_start_date')}
                  value={form.contract_start_date}
                  onChange={set('contract_start_date')}
                  heightClass="min-h-[44px]"
                />
                <DateField
                  label={t('contract_end_date')}
                  value={form.contract_end_date}
                  onChange={set('contract_end_date')}
                  heightClass="min-h-[44px]"
                />
                <div className="space-y-2">
                  <Label>{t('rent_amount')}</Label>
                  <MoneyInput min="0" value={form.rent_amount} onChange={set('rent_amount')} required className="min-h-[44px]" />
                </div>
                <div className="space-y-2">
                  <Label>{t('security_deposit')}</Label>
                  <MoneyInput min="0" value={form.security_deposit} onChange={set('security_deposit')} className="min-h-[44px]" />
                </div>
              </div>

              {/* Dynamic cheque / payment schedule */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    {t('ai_field_payments')}{' '}
                    <span className="text-xs text-muted-foreground">({rentRows.length})</span>
                  </Label>
                  <Button type="button" size="sm" variant="outline" onClick={addRentRow} className="min-h-[36px]">
                    <Plus size={14} className="me-1" />
                    {t('add_cheque')}
                  </Button>
                </div>

                {rentRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed bg-accent/30 px-3 py-4 text-center text-xs text-muted-foreground">
                    {t('add_cheque')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {rentRows.map((row, i) => {
                      const paid = row.status === 'paid';
                      return (
                        <div
                          key={i}
                          className={cn(
                            'grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.1fr_auto] gap-2 items-end rounded-lg border bg-card p-2.5',
                            paid ? 'border-emerald-300 bg-emerald-50/40' : 'border-red-200 bg-red-50/30',
                          )}
                        >
                          <div className="space-y-1">
                            <Label className="text-[11px]">{t('cheque_amount')}</Label>
                            <MoneyInput
                              min="0"
                              value={row.amount}
                              onChange={(e) => updateRentRow(i, 'amount', e.target.value)}
                              className="min-h-[40px]"
                            />
                          </div>
                          <DateField
                            label={t('due_date')}
                            value={row.due_date}
                            onChange={(v) => updateRentRow(i, 'due_date', v)}
                            heightClass="min-h-[40px]"
                          />
                          <div className="space-y-1">
                            <Label className="text-[11px]">{t('payment_status')}</Label>
                            <div className="flex items-center gap-2 min-h-[40px]">
                              <span
                                className={cn(
                                  'inline-flex h-3 w-3 rounded-full shrink-0',
                                  paid ? 'bg-emerald-500' : 'bg-red-500',
                                )}
                              />
                              <span className={cn('text-sm font-medium', paid ? 'text-emerald-700' : 'text-red-600')}>
                                {paid ? t('collected') : t('not_collected')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 min-h-[40px]">
                            <Button
                              type="button"
                              size="sm"
                              variant={paid ? 'default' : 'outline'}
                              onClick={() => updateRentRow(i, 'status', paid ? 'unpaid' : 'paid')}
                              className={cn('min-h-[40px]', paid && 'bg-emerald-600 hover:bg-emerald-700')}
                            >
                              {t('collected')}
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => removeRentRow(i)}
                              className="min-h-[40px] min-w-[40px] text-destructive hover:bg-red-50"
                              aria-label={t('remove_installment')}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Rental summary */}
              <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Landmark size={16} className="text-primary" />
                  <p className="text-sm font-bold">{t('rental_summary')}</p>
                </div>

                {/* Group 1 — Contract values */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('summary_group_contract') || t('rental_summary')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-3 rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Wallet size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_annual_rent')}</p>
                        <p className="text-base font-bold tabular-nums text-emerald-800" dir="ltr">{formatMoney(num(form.rent_amount), lang)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <ShieldCheck size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_security_deposit')}</p>
                        <p className="text-base font-bold tabular-nums text-emerald-800" dir="ltr">{formatMoney(num(form.security_deposit), lang)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Group 2 — Payment progress */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('summary_group_payments') || t('ai_field_payments')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="flex items-center gap-3 rounded-lg border bg-accent/40 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Receipt size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_total_payments')}</p>
                        <p className="text-base font-bold tabular-nums">{rentRows.length}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-emerald-200/60 bg-emerald-50/50 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <CircleDollarSign size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_total_collected')}</p>
                        <p className="text-base font-bold tabular-nums text-emerald-700" dir="ltr">{formatMoney(totalCollected, lang)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-red-200/60 bg-red-50/40 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <TrendingUp size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{t('summary_remaining')}</p>
                        <p className="text-base font-bold tabular-nums text-red-600" dir="ltr">{formatMoney(remaining, lang)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Group 3 — Next due date */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('summary_group_next') || t('summary_next_due')}
                  </p>
                  <div className="flex items-center gap-3 rounded-lg border border-violet-200/60 bg-violet-50/40 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <CalendarClock size={17} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">{t('summary_next_due')}</p>
                      <p className="text-base font-bold tabular-nums text-violet-800" dir="ltr">{nextDue ? formatDate(nextDue, lang) : t('summary_none')}</p>
                    </div>
                  </div>
                </div>
              </div>

              </div>
            );
          })()}

          {/* Alerts & Follow-up step — enable + reminder presets for this property */}
          <div className="order-4">
            <AlertsStep
              value={alertsConfig}
              onChange={setAlertsConfig}
              aiOpen={openSectionAi === 'alerts'}
              onAiOpenChange={(o) => setOpenSectionAi(o ? 'alerts' : null)}
              onAiApply={(fields) => applySectionFields('alerts', fields)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => requestClose()} className="min-h-[44px]">
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving} className="min-h-[44px]">
              {saving ? t('loading') : t('save')}
            </Button>
          </div>
        </form>
        )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>

      {/* Overwrite confirmation for AI-extracted data */}
      <Dialog open={!!confirmApply} onOpenChange={(o) => { if (!o) setConfirmApply(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('ai_property_title')}</DialogTitle>
            <DialogDescription>{confirmApply?.message || ''}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmApply(null)} className="min-h-[44px]">
              {t('ai_keep_manual')}
            </Button>
            <Button type="button" onClick={() => confirmApply?.onConfirm?.()} className="min-h-[44px]">
              {t('ai_yes_overwrite')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm clearing the complete payment plan before resetting it. */}
      <Dialog open={confirmClearPlan} onOpenChange={(o) => { if (!o) setConfirmClearPlan(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{lang === 'ar' ? 'مسح خطة الدفع' : 'Clear payment plan'}</DialogTitle>
            <DialogDescription>
              {lang === 'ar'
                ? 'هل أنت متأكد من مسح كل الأقساط؟ هذا الإجراء لا يمكن التراجع عنه.'
                : 'Are you sure you want to clear all installments? This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmClearPlan(false)} className="min-h-[44px]">
              {t('cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={clearPaymentPlan} className="min-h-[44px]">
              {lang === 'ar' ? 'نعم، مسح الكل' : 'Yes, clear all'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm property type conversion (same permanent Property ID) */}
      <Dialog open={confirmConvert} onOpenChange={(o) => { if (!o) setConfirmConvert(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('convert_property_type')}</DialogTitle>
            <DialogDescription>
              {convertTarget === 'installment'
                ? t('convert_confirm_to_installment')
                : t('convert_confirm_to_cash')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmConvert(false)} className="min-h-[44px]">
              {t('cancel')}
            </Button>
            <Button type="button" disabled={saving} onClick={() => performSave()} className="min-h-[44px]">
              {saving ? t('loading') : t('confirm_convert')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default PropertyForm;
