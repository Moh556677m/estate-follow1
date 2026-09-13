import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  Plus,
  Search,
  Share2,
  Trash2,
  ZoomIn,
  ZoomOut,
  X,
  ShieldCheck,
  RefreshCw,
  Link2,
  Unlink,
  Building2,
  ChevronRight,
  ArrowRight,
  Mail,
  Phone,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { getFileUrl, formatDate } from '@/lib/api';
import { uploadToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';
import { countryName } from '@/lib/countries';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import SecureShareDialog from '@/components/features/SecureShareDialog';
import { useNavigate } from 'react-router-dom';
import { needsProfileCompletion } from '@/lib/profileCompletion';

/* ---------- helpers ---------- */

const TABS = ['my', 'ownership', 'installment', 'rental'];

// Map each tab to the document categories it owns. CRITICAL: the "my" tab
// maps to the `my_documents` category — previously it filtered `category === 'my'`
// which never matched, so the count (correct) showed a number while the list
// (wrong) was empty. This single source of truth drives both count and list.
const TAB_CATEGORIES = {
  my: ['my_documents'],
  ownership: ['ownership'],
  installment: ['installment'],
  rental: ['rental', 'tenant'],
};

// Build a short-lived, authorized (token) URL for any document source.
async function docUrl(doc) {
  if (!doc) return null;
  const r = doc.record;
  // Prefer Cloudinary URL fields when present (new uploads are stored there).
  if (r) {
    if (doc.source === 'property') {
      if (r.title_deed_pdf_url && doc.filename === r.title_deed_pdf) return r.title_deed_pdf_url;
      if (r.lease_contract_url && doc.filename === r.lease_contract) return r.lease_contract_url;
      if (r.tenant_document_url && doc.filename === r.tenant_document) return r.tenant_document_url;
    } else if (doc.source === 'custom') {
      if (r.file_url) return r.file_url;
    } else if (doc.source === 'user') {
      if (r.document_file_url) return r.document_file_url;
      if (r.passport_file_url) return r.passport_file_url;
      if (r.residence_file_url) return r.residence_file_url;
    }
  }
  if (doc.source === 'custom') {
    return getFileUrl(doc.record, doc.record?.file);
  }
  // user / property source -> the file field lives on the record.
  return getFileUrl(doc.record, doc.filename);
}

function fileKind(filename) {
  const n = String(filename || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg';
  if (n.endsWith('.png')) return 'png';
  if (n.endsWith('.webp')) return 'webp';
  return 'other';
}

function contractStatus(endDate) {
  if (!endDate) return null;
  const d = new Date(String(endDate).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'ending_soon';
  return 'active';
}

/* ---------- normalized document builder ---------- */

function normDoc({
  id,
  source,
  record,
  filename,
  name,
  type,
  category,
  property,
  tenantName,
  tenantPhone,
  tenantEmail,
  contractStart,
  contractEnd,
  created,
  canDelete,
}) {
  const p = property || null;
  return {
    id,
    source,
    record,
    filename,
    name,
    type,
    category,
    property: p,
    building: p?.building || '',
    unit: p?.unit_number || '',
    city: p?.city || p?.area || '',
    country: p?.country || '',
    tenantName: tenantName || '',
    tenantPhone: tenantPhone || '',
    tenantEmail: tenantEmail || '',
    contractStart: contractStart || '',
    contractEnd: contractEnd || '',
    created: created || '',
    canDelete: !!canDelete,
  };
}

/* ---------- small UI pieces ---------- */

function FilterSelect({ value, onChange, options, placeholder, label }) {
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DocActions({ doc, onPreview, onShare, onDelete }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const kind = fileKind(doc.filename);
  const previewable = kind !== 'other';

  const open = async () => {
    if (previewable) {
      onPreview(doc);
      return;
    }
    setBusy(true);
    try {
      const url = await docUrl(doc);
      if (url) window.open(url, '_blank', 'noopener');
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const url = await docUrl(doc);
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename || doc.name || 'document';
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 min-h-[34px] disabled:opacity-60"
      >
        <Eye size={13} />
        {t('docs_open')}
      </button>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent min-h-[34px] disabled:opacity-60"
      >
        <Download size={13} />
        {t('docs_download')}
      </button>
      <button
        type="button"
        onClick={() => onShare(doc)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent min-h-[34px]"
      >
        <Share2 size={13} />
        {t('docs_share')}
      </button>
      {doc.canDelete && (
        <button
          type="button"
          onClick={() => onDelete(doc)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 min-h-[34px]"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function DocCard({ doc, onPreview, onShare, onDelete }) {
  const { t, lang } = useLanguage();
  const cStatus = doc.contractEnd ? contractStatus(doc.contractEnd) : null;
  const statusKey =
    cStatus === 'active'
      ? 'docs_contract_active'
      : cStatus === 'expired'
        ? 'docs_contract_expired'
        : cStatus === 'ending_soon'
          ? 'docs_contract_ending_soon'
          : null;
  const statusColor =
    cStatus === 'active'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : cStatus === 'expired'
        ? 'bg-red-100 text-red-800 border-red-200'
        : cStatus === 'ending_soon'
          ? 'bg-orange-100 text-orange-800 border-orange-200'
          : '';

  return (
    <div className="rounded-xl border bg-card px-4 py-3.5 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <FileText size={18} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold break-words">{doc.name}</p>
            <span className="rounded-full bg-primary/8 text-primary px-2 py-0.5 text-[10px] font-semibold">
              {t(`docs_type_${doc.type}`) || doc.type}
            </span>
            {doc.property ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Link2 size={10} /> {t('docs_linked')}
              </span>
            ) : (
              doc.source === 'custom' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Unlink size={10} /> {t('docs_unlinked')}
                </span>
              )
            )}
            {statusKey && (
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusColor)}>
                {t(statusKey)}
              </span>
            )}
          </div>
          {doc.property ? (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span><b className="font-medium text-foreground/80">{t('docs_building')}:</b> {doc.building}</span>
              <span><b className="font-medium text-foreground/80">{t('docs_unit')}:</b> {doc.unit}</span>
              {doc.city && <span><b className="font-medium text-foreground/80">{t('docs_city')}:</b> {doc.city}</span>}
              {doc.country && (
                <span><b className="font-medium text-foreground/80">{t('docs_country')}:</b> {countryName(doc.country, lang)}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('owner_info')}</p>
          )}
          {doc.tenantName && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span><b className="font-medium text-foreground/80">{t('docs_tenant_name')}:</b> {doc.tenantName}</span>
              {doc.contractStart && (
                <span><b className="font-medium text-foreground/80">{t('docs_contract_start')}:</b> <span dir="ltr">{formatDate(doc.contractStart, lang)}</span></span>
              )}
              {doc.contractEnd && (
                <span><b className="font-medium text-foreground/80">{t('docs_contract_end')}:</b> <span dir="ltr">{formatDate(doc.contractEnd, lang)}</span></span>
              )}
            </div>
          )}
          {doc.created && (
            <p className="text-[11px] text-muted-foreground/80">
              {t('docs_added_on')}: <span dir="ltr">{formatDate(doc.created, lang)}</span>
            </p>
          )}
        </div>
      </div>
      <DocActions doc={doc} onPreview={onPreview} onShare={onShare} onDelete={onDelete} />
    </div>
  );
}

// Compact row used inside a property detail view (property info already shown
// in the detail header, so we only render name + type + actions).
function DocRow({ doc, onPreview, onShare, onDelete }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <FileText size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold break-words">{doc.name}</p>
        <span className="rounded-full bg-primary/8 text-primary px-2 py-0.5 text-[10px] font-semibold">
          {t(`docs_type_${doc.type}`) || doc.type}
        </span>
      </div>
      <DocActions doc={doc} onPreview={onPreview} onShare={onShare} onDelete={onDelete} />
    </div>
  );
}

function EmptyDocs({ message, onAdd, addLabel }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <FileText size={22} strokeWidth={1.6} />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onAdd && (
        <Button size="sm" onClick={onAdd} className="min-h-[36px]">
          <Plus size={14} className="me-1" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}

// A single property row: building — unit — city — country. Click opens detail.
function PropertyRow({ property, docCount, onClick }) {
  const { t, lang } = useLanguage();
  const isRtl = lang === 'ar';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-start flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-sm transition-colors hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Building2 size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">
            {property.building || '—'} — {t('docs_unit')} {property.unit_number || '—'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {property.city || property.area || '—'}
            {property.country ? ` — ${countryName(property.country, lang)}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary tabular-nums">
          {docCount}
        </span>
        <ChevronRight
          size={18}
          className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
          style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}
        />
      </div>
    </button>
  );
}

/* ---------- Preview modal ---------- */

function PreviewModal({ doc, onClose, onShare }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const kind = doc ? fileKind(doc.filename) : 'other';

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setZoom(1);
    if (!doc) return undefined;
    docUrl(doc).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  if (!doc) return null;
  const previewable = kind !== 'other';

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FileText size={18} className="text-primary" />
            <span className="break-words">{doc.name}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">{doc.name}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-muted/30 flex items-center justify-center">
          {!url ? (
            <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
              <RefreshCw size={16} className="animate-spin" />
              {t('loading')}
            </div>
          ) : !previewable ? (
            <div className="py-16 px-6 text-center text-sm text-muted-foreground max-w-md">
              {t('docs_preview_not_supported')}
            </div>
          ) : kind === 'pdf' ? (
            <iframe
              title={doc.name}
              src={url}
              className="w-full h-[70vh] border-0 bg-white"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 overflow-auto">
              <img
                src={url}
                alt={doc.name}
                style={{ transform: `scale(${zoom})` }}
                className="max-w-full max-h-[60vh] object-contain transition-transform origin-center rounded shadow-sm"
              />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  className="min-h-[34px]"
                >
                  <ZoomOut size={14} className="me-1" />
                  {t('docs_zoom_out')}
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                  className="min-h-[34px]"
                >
                  <ZoomIn size={14} className="me-1" />
                  {t('docs_zoom_in')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onShare(doc)}
            className="min-h-[36px]"
          >
            <Share2 size={14} className="me-1" />
            {t('docs_share')}
          </Button>
          {url && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const a = document.createElement('a');
                a.href = url;
                a.download = doc.filename || doc.name || 'document';
                a.target = '_blank';
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
              className="min-h-[36px]"
            >
              <Download size={14} className="me-1" />
              {t('docs_download')}
            </Button>
          )}
          <Button size="sm" onClick={onClose} className="min-h-[36px]">
            <X size={14} className="me-1" />
            {t('docs_close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Add document dialog ---------- */

function AddDocumentDialog({ open, onOpenChange, category, properties, tenancies = [], onSaved }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [linked, setLinked] = useState('yes');
  const [propertyId, setPropertyId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  // Properties relevant to this category. "Rental"/"tenant" documents can be
  // added for any property that has ever had a tenancy linked to it (not
  // only ones currently type === "rented" — that classification is now
  // permanent and unrelated to whether a tenancy exists).
  const rentedPropertyIds = useMemo(
    () => new Set(tenancies.map((tc) => tc.property)),
    [tenancies],
  );
  const relevantProps = useMemo(() => {
    if (category === 'ownership') return properties.filter((p) => p.type === 'cash');
    if (category === 'installment') return properties.filter((p) => p.type === 'installment');
    if (category === 'rental' || category === 'tenant') {
      return properties.filter((p) => rentedPropertyIds.has(p.id) || p.type === 'rented');
    }
    return properties;
  }, [properties, category, rentedPropertyIds]);

  const selectedProp = useMemo(
    () => relevantProps.find((p) => p.id === propertyId) || null,
    [relevantProps, propertyId],
  );

  // For tenant documents / rental contracts, the tenant comes from the property.
  const showTenant = category === 'tenant' || category === 'rental';

  useEffect(() => {
    if (open) {
      setName('');
      setLinked(relevantProps.length > 0 ? 'yes' : 'no');
      setPropertyId('');
      setTenantName('');
      setFile(null);
      setErr('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [open, relevantProps.length]);

  const submit = async () => {
    setErr('');
    if (!name.trim()) {
      setErr(t('docs_name_required'));
      return;
    }
    if (!file) {
      setErr(t('docs_file_required'));
      return;
    }
    setSaving(true);
    try {
      // Upload to Cloudinary first (falls back to PB file storage if unset).
      let cloudUrl = '';
      try {
        if (await isCloudinaryConfigured()) {
          const res = await uploadToCloudinary(file);
          cloudUrl = res?.url || '';
        }
      } catch (upErr) {
        setErr(String(upErr?.message || t('something_wrong')));
        setSaving(false);
        return;
      }
      const fd = new FormData();
      fd.append('owner', user.id);
      fd.append('name', name.trim());
      fd.append('category', category);
      if (linked === 'yes' && propertyId) {
        fd.append('property', propertyId);
      }
      if (showTenant) {
        const tn = tenantName.trim() || selectedProp?.tenant_name || '';
        if (tn) fd.append('tenant_name', tn);
        if (selectedProp?.tenant_phone) fd.append('tenant_phone', selectedProp.tenant_phone);
        if (selectedProp?.tenant_email) fd.append('tenant_email', selectedProp.tenant_email);
      }
      if (cloudUrl) {
        fd.append('file_url', cloudUrl);
      } else {
        fd.append('file', file);
      }
      await pb.collection('owner_documents').create(fd, { requestKey: `doc-create-${Date.now()}` });
      onSaved && onSaved();
      onOpenChange(false);
    } catch (e) {
      setErr(String(e?.response?.message || e?.message || t('something_wrong')));
    } finally {
      setSaving(false);
    }
  };

  const titleKey =
    category === 'my_documents'
      ? 'docs_add_document'
      : category === 'rental'
        ? 'docs_add_rental_contract'
        : category === 'tenant'
          ? 'docs_add_tenant_document'
          : 'docs_add_contract';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription className="sr-only">{t(titleKey)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-name">{t('docs_name')}</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('docs_name_placeholder')}
              className="h-10"
            />
          </div>

          {category !== 'my_documents' && (
            <div className="space-y-2">
              <Label>{t('docs_linked_property')}</Label>
              <Select value={linked} onValueChange={setLinked}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">{t('docs_yes')}</SelectItem>
                  <SelectItem value="no">{t('docs_no')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {category !== 'my_documents' && linked === 'yes' && (
            <div className="space-y-2">
              <Label>{t('docs_select_property')}</Label>
              {relevantProps.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-2">
                  {t('empty_properties')}
                </p>
              ) : (
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={t('docs_select_property')} />
                  </SelectTrigger>
                  <SelectContent>
                    {relevantProps.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.building} / {p.unit_number}
                        {p.area ? ` — ${p.area}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedProp && (
                <p className="text-[11px] text-muted-foreground">
                  {t('docs_auto_filled')}: {selectedProp.building} / {selectedProp.unit_number}
                  {selectedProp.city ? ` · ${selectedProp.city}` : ''}
                  {selectedProp.country ? ` · ${countryName(selectedProp.country, lang)}` : ''}
                </p>
              )}
            </div>
          )}

          {showTenant && linked === 'yes' && selectedProp && (
            <div className="space-y-2">
              <Label htmlFor="tenant-name">{t('docs_tenant_name')}</Label>
              <Input
                id="tenant-name"
                value={tenantName || selectedProp.tenant_name || ''}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder={selectedProp.tenant_name || t('docs_no_tenant')}
                className="h-10"
              />
              <p className="text-[11px] text-muted-foreground">{t('docs_one_tenant')}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="doc-file">{t('docs_file')}</Label>
            <input
              ref={fileRef}
              id="doc-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground file:me-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground file:font-medium hover:file:bg-primary/90 cursor-pointer"
            />
            {file && <p className="text-[11px] text-muted-foreground">{file.name}</p>}
          </div>

          {err && (
            <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">{err}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="min-h-[36px]"
          >
            {t('docs_cancel')}
          </Button>
          <Button size="sm" onClick={submit} disabled={saving} className="min-h-[36px]">
            {saving ? <RefreshCw size={14} className="me-1 animate-spin" /> : <Plus size={14} className="me-1" />}
            {t('docs_save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Property detail view ---------- */

function InfoLine({ icon, label, value, dir }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
        {icon}
      </span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium truncate" dir={dir}>{value || '—'}</span>
    </div>
  );
}

function PropertyDetail({ property, docs, tab, onBack, onPreview, onShare, onDelete, onAdd }) {
  const { t, lang } = useLanguage();
  const isRtl = lang === 'ar';
  const isRental = tab === 'rental';

  const contracts = isRental ? docs.filter((d) => d.category === 'rental') : docs;
  const tenantDocs = isRental ? docs.filter((d) => d.category === 'tenant') : [];

  const addBtnKey =
    tab === 'rental'
      ? 'docs_add_rental_contract'
      : tab === 'ownership' || tab === 'installment'
        ? 'docs_add_contract'
        : 'docs_add_document';
  const addCat = tab === 'rental' ? 'rental' : tab;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowRight size={16} style={{ transform: isRtl ? 'scaleX(-1)' : 'rotate(180deg)' }} />
        {t('docs_back')}
      </button>

      {/* Property data */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 size={16} />
          </span>
          <p className="text-sm font-bold">{t('docs_property_details')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <InfoLine icon={<Building2 size={14} />} label={t('docs_building')} value={property.building} />
          <InfoLine icon={<FileText size={14} />} label={t('docs_unit')} value={property.unit_number} />
          <InfoLine icon={<Building2 size={14} />} label={t('docs_city')} value={property.city || property.area} />
          <InfoLine
            icon={<Building2 size={14} />}
            label={t('docs_country')}
            value={property.country ? countryName(property.country, lang) : ''}
          />
        </div>
      </div>

      {/* Tenant data (rental only) */}
      {isRental && (
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UserRound size={16} />
            </span>
            <p className="text-sm font-bold">{t('docs_tenant_data')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <InfoLine icon={<UserRound size={14} />} label={t('docs_tenant_name')} value={property.tenant_name} />
            <InfoLine icon={<Mail size={14} />} label={t('docs_tenant_email')} value={property.tenant_email} dir="ltr" />
            <InfoLine icon={<Phone size={14} />} label={t('docs_tenant_phone')} value={property.tenant_phone} dir="ltr" />
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold">{t('docs_documents')}</h3>
          <Button size="sm" variant="outline" onClick={() => onAdd(addCat)} className="min-h-[34px]">
            <Plus size={14} className="me-1" />
            {t(addBtnKey)}
          </Button>
        </div>

        {isRental ? (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{t('docs_section_contracts')}</p>
              {contracts.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  {t('docs_empty_rental')}
                </p>
              ) : (
                contracts.map((d) => (
                  <DocRow key={d.id} doc={d} onPreview={onPreview} onShare={onShare} onDelete={onDelete} />
                ))
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{t('docs_section_tenant_docs')}</p>
              {tenantDocs.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  {t('docs_empty_tenant_docs')}
                </p>
              ) : (
                tenantDocs.map((d) => (
                  <DocRow key={d.id} doc={d} onPreview={onPreview} onShare={onShare} onDelete={onDelete} />
                ))
              )}
            </div>
          </>
        ) : docs.length === 0 ? (
          <EmptyDocs message={t('docs_no_docs_property')} onAdd={() => onAdd(addCat)} addLabel={t(addBtnKey)} />
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <DocRow key={d.id} doc={d} onPreview={onPreview} onShare={onShare} onDelete={onDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- main component ---------- */

export default function DocumentsCenter({ properties = [] }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ownerDocs, setOwnerDocs] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('my');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState('my_documents');
  // When set, the property detail view replaces the list for the active tab.
  const [selected, setSelected] = useState(null);
  // Task #17 — Secure Sharing: a real, revocable/expiring link instead of
  // navigator.share(rawFileUrl). Only offered when the feature is entitled;
  // otherwise shareDoc() falls back to the previous raw-share behavior so
  // Digital Vault keeps working on its own without Secure Sharing.
  const { isAvailable: isFeatureAvailable } = useFeatureEntitlements();
  const [shareDialogDoc, setShareDialogDoc] = useState(null);

  // Load custom owner documents.
  const loadDocs = useCallback(async () => {
    if (!user) return;
    try {
      const [rows, tRows, tenantRows] = await Promise.all([
        pb.collection('owner_documents').getFullList({
          sort: '-created',
          requestKey: `owner-docs-${user.id}`,
        }),
        pb.collection('tenancies').getFullList({
          sort: '-created',
          requestKey: `owner-tenancies-${user.id}`,
        }).catch(() => []),
        pb.collection('tenants').getFullList({
          sort: '-created',
          requestKey: `owner-tenants-${user.id}`,
        }).catch(() => []),
      ]);
      setOwnerDocs(rows);
      setTenancies(tRows || []);
      setTenants(tenantRows || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // Realtime auto-sync: custom documents + tenancies update live.
  useEffect(() => {
    if (!user) return undefined;
    let debounce = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => loadDocs(), 300);
    };
    ['owner_documents', 'tenancies', 'tenants'].forEach((c) => {
      void pb.collection(c).subscribe('*', schedule).catch(() => {});
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      ['owner_documents', 'tenancies', 'tenants'].forEach((c) => {
        void pb.collection(c).unsubscribe('*').catch(() => {});
      });
    };
  }, [user, loadDocs]);

  // Build the full aggregated document list (auto + custom), no duplicates.
  // One record per source field — a contract uploaded from the property page
  // appears here automatically; deleting/replacing it there updates here too.
  const allDocs = useMemo(() => {
    const list = [];

    // 1) My Documents — owner identity document (auto, from the profile).
    //    The users record stores a single `document_file` + `document_type`
    //    (passport | residence), not separate passport_pdf/residence_pdf.
    if (user?.document_file) {
      const dtype = String(user.document_type || 'passport').toLowerCase();
      const isResidence = dtype === 'residence';
      list.push(
        normDoc({
          id: `user-identity`,
          source: 'user',
          record: user,
          filename: user.document_file,
          name: isResidence ? t('docs_type_residence') : t('docs_type_passport'),
          type: isResidence ? 'residence' : 'passport',
          category: 'my_documents',
          created: user.created,
          canDelete: false,
        }),
      );
    }

    // 2) Property-linked documents (auto) — single record per property field.
    properties.forEach((p) => {
      if (p.title_deed_pdf || p.title_deed_pdf_url) {
        const cat = p.type === 'installment' ? 'installment' : 'ownership';
        list.push(
          normDoc({
            id: `prop-${p.id}-title_deed_pdf`,
            source: 'property',
            record: p,
            filename: p.title_deed_pdf || p.title_deed_pdf_url,
            name: t('docs_type_title_deed'),
            type: 'title_deed',
            category: cat,
            property: p,
            created: p.created,
            canDelete: false,
          }),
        );
      }
      // Renting no longer flips a property's type to "rented" — the lease
      // and tenant documents live on the linked `tenancies` (+ `tenants`)
      // record instead, found by property_id. A property can have more than
      // one tenancy over time; every one with its own lease file is listed
      // (not just the active one) so past leases are never lost from view.
      // Legacy `p.type === 'rented'` properties that predate the rebuild
      // (not yet backfilled) still show their old flat fields as a fallback.
      const propTenancies = tenancies.filter((tc) => tc.property === p.id);
      propTenancies.forEach((tc) => {
        if (tc.lease_contract) {
          list.push(
            normDoc({
              id: `tenancy-${tc.id}-lease_contract`,
              source: 'tenancy',
              record: tc,
              filename: tc.lease_contract,
              name: t('docs_type_lease'),
              type: 'lease',
              category: 'rental',
              property: p,
              tenantName: tc.tenant_name,
              tenantPhone: tc.tenant_phone,
              tenantEmail: tc.tenant_email,
              contractStart: tc.start_date,
              contractEnd: tc.end_date,
              created: tc.created,
              canDelete: false,
            }),
          );
        }
        const tenantRec = tc.tenant ? tenants.find((tn) => tn.id === tc.tenant) : null;
        if (tenantRec?.id_document) {
          list.push(
            normDoc({
              id: `tenancy-${tc.id}-tenant_document`,
              source: 'tenancy',
              record: tenantRec,
              filename: tenantRec.id_document,
              name: t('docs_type_tenant_doc'),
              type: 'tenant_doc',
              category: 'tenant',
              property: p,
              tenantName: tc.tenant_name,
              tenantPhone: tc.tenant_phone,
              tenantEmail: tc.tenant_email,
              created: tc.created,
              canDelete: false,
            }),
          );
        }
      });
      // Legacy fallback — a property record that still has the old flat
      // rental fields (type === "rented", not yet migrated) keeps showing
      // them here so nothing already visible ever disappears.
      if (p.type === 'rented' && (p.lease_contract || p.lease_contract_url)) {
        list.push(
          normDoc({
            id: `prop-${p.id}-lease_contract`,
            source: 'property',
            record: p,
            filename: p.lease_contract || p.lease_contract_url,
            name: t('docs_type_lease'),
            type: 'lease',
            category: 'rental',
            property: p,
            tenantName: p.tenant_name,
            tenantPhone: p.tenant_phone,
            tenantEmail: p.tenant_email,
            contractStart: p.contract_start_date,
            contractEnd: p.contract_end_date,
            created: p.created,
            canDelete: false,
          }),
        );
      }
      if (p.type === 'rented' && (p.tenant_document || p.tenant_document_url)) {
        list.push(
          normDoc({
            id: `prop-${p.id}-tenant_document`,
            source: 'property',
            record: p,
            filename: p.tenant_document || p.tenant_document_url,
            name: t('docs_type_tenant_doc'),
            type: 'tenant_doc',
            category: 'tenant',
            property: p,
            tenantName: p.tenant_name,
            tenantPhone: p.tenant_phone,
            tenantEmail: p.tenant_email,
            created: p.created,
            canDelete: false,
          }),
        );
      }
    });

    // 3) Custom documents added by the owner.
    ownerDocs.forEach((d) => {
      const prop = properties.find((p) => p.id === d.property) || null;
      list.push(
        normDoc({
          id: `custom-${d.id}`,
          source: 'custom',
          record: d,
          filename: d.file,
          name: d.name,
          type: d.category === 'my_documents' ? 'custom' : 'contract',
          category: d.category,
          property: prop,
          tenantName: d.tenant_name || prop?.tenant_name,
          tenantPhone: d.tenant_phone || prop?.tenant_phone,
          tenantEmail: d.tenant_email || prop?.tenant_email,
          contractStart: prop?.contract_start_date,
          contractEnd: prop?.contract_end_date,
          created: d.created,
          canDelete: true,
        }),
      );
    });

    return list;
  }, [user, properties, ownerDocs, tenancies, tenants, t]);

  /* ---------- filtering ---------- */

  const matchesSearch = (doc, q) => {
    if (!q) return true;
    const hay = [
      doc.name,
      doc.building,
      doc.unit,
      doc.city,
      doc.country,
      countryName(doc.country, 'en'),
      countryName(doc.country, 'ar'),
      doc.tenantName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q.toLowerCase());
  };

  const withinDate = (created, key) => {
    if (!created || key === 'any') return true;
    const d = new Date(String(created).replace(' ', 'T')).getTime();
    if (Number.isNaN(d)) return true;
    const days = { '7': 7, '30': 30, '90': 90 }[key] || 0;
    return Date.now() - d <= days * 86400000;
  };

  // Single source of truth: count and list both use TAB_CATEGORIES, so they
  // can never diverge again.
  const docsForTab = (tab) => {
    const cats = TAB_CATEGORIES[tab] || [tab];
    return allDocs.filter((d) => cats.includes(d.category) && matchesSearch(d, search));
  };

  const applyFilters = (docs, tab) => {
    const f = filters[tab] || {};
    return docs.filter((d) => {
      if (f.country && f.country !== 'all' && d.country !== f.country) return false;
      if (f.city && f.city !== 'all' && d.city !== f.city) return false;
      if (f.building && f.building !== 'all' && d.building !== f.building) return false;
      if (f.unit && f.unit !== 'all' && d.unit !== f.unit) return false;
      if (f.property && f.property !== 'all' && (d.property?.id || '') !== f.property) return false;
      if (f.tenant && f.tenant !== 'all' && d.tenantName !== f.tenant) return false;
      if (f.type && f.type !== 'all' && d.type !== f.type) return false;
      if (f.date && f.date !== 'any' && !withinDate(d.created, f.date)) return false;
      if (f.contractStatus && f.contractStatus !== 'all') {
        const st = d.contractEnd ? contractStatus(d.contractEnd) : null;
        if (st !== f.contractStatus) return false;
      }
      if (f.endDate && f.endDate !== 'all') {
        const st = d.contractEnd ? contractStatus(d.contractEnd) : null;
        if (f.endDate === 'expired' && st !== 'expired') return false;
        if (f.endDate === 'active' && !(st === 'active' || st === 'ending_soon')) return false;
      }
      return true;
    });
  };

  const setFilter = (tab, key, value) => {
    setFilters((prev) => ({
      ...prev,
      [tab]: { ...(prev[tab] || {}), [key]: value },
    }));
  };

  /* ---------- filter option builders ---------- */

  const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));

  const propOptions = (tab) => {
    const relevant =
      tab === 'ownership'
        ? properties.filter((p) => p.type === 'cash')
        : tab === 'installment'
          ? properties.filter((p) => p.type === 'installment')
          : tab === 'rental'
            ? properties.filter(
                (p) => p.type === 'rented' || tenancies.some((tc) => tc.property === p.id),
              )
            : properties;
    return [
      { value: 'all', label: t('docs_filter_all') },
      ...relevant.map((p) => ({
        value: p.id,
        label: `${p.building} / ${p.unit_number}`,
      })),
    ];
  };

  const countryOptions = (docs) => [
    { value: 'all', label: t('docs_filter_all') },
    ...unique(docs.map((d) => d.country)).map((c) => ({
      value: c,
      label: countryName(c, lang) || c,
    })),
  ];
  const cityOptions = (docs) => [
    { value: 'all', label: t('docs_filter_all') },
    ...unique(docs.map((d) => d.city)).map((c) => ({ value: c, label: c })),
  ];
  const buildingOptions = (docs) => [
    { value: 'all', label: t('docs_filter_all') },
    ...unique(docs.map((d) => d.building)).map((c) => ({ value: c, label: c })),
  ];
  const unitOptions = (docs) => [
    { value: 'all', label: t('docs_filter_all') },
    ...unique(docs.map((d) => d.unit)).map((c) => ({ value: c, label: c })),
  ];
  const tenantOptions = (docs) => [
    { value: 'all', label: t('docs_filter_all') },
    ...unique(docs.map((d) => d.tenantName)).map((c) => ({ value: c, label: c })),
  ];

  const typeOptionsMy = [
    { value: 'all', label: t('docs_filter_all') },
    { value: 'passport', label: t('docs_type_passport') },
    { value: 'residence', label: t('docs_type_residence') },
    { value: 'custom', label: t('docs_type_custom') },
  ];

  const dateOptions = [
    { value: 'any', label: t('docs_date_any') },
    { value: '7', label: t('docs_date_7') },
    { value: '30', label: t('docs_date_30') },
    { value: '90', label: t('docs_date_90') },
  ];

  const contractStatusOptions = [
    { value: 'all', label: t('docs_filter_all') },
    { value: 'active', label: t('docs_contract_active') },
    { value: 'ending_soon', label: t('docs_contract_ending_soon') },
    { value: 'expired', label: t('docs_contract_expired') },
  ];

  /* ---------- actions ---------- */

  const openAdd = (category) => {
    // Restricted, sensitive action: uploading a document requires a complete
    // profile. Staff/admins are exempt (they're not owners completing a
    // signup profile). Browsing/viewing existing documents is never gated.
    if (user && !user.is_super_admin && needsProfileCompletion(user)) {
      notify.error(t('owner_action_needs_profile_title'), t('owner_action_needs_profile_body'));
      navigate('/dashboard/profile');
      return;
    }
    setAddCategory(category);
    setAddOpen(true);
  };

  const shareDoc = async (doc) => {
    // Secure Sharing entitled: open the real revocable/expiring-link dialog
    // (document_shares) instead of sharing the raw file URL directly.
    if (isFeatureAvailable('secure_sharing') && doc?.filename) {
      setShareDialogDoc(doc);
      return;
    }
    try {
      const url = await docUrl(doc);
      if (!url) return;
      if (navigator.share) {
        await navigator.share({ title: doc.name, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        notify.success(t('docs_share_copied'), doc.name);
      } else {
        notify.warning(t('docs_share_unsupported'), doc.name);
      }
    } catch {
      /* user cancelled or unsupported */
    }
  };

  const deleteDoc = async (doc) => {
    if (!doc.canDelete) {
      notify.warning(t('docs_delete_only_custom'), doc.name);
      return;
    }
    if (!window.confirm(t('docs_delete_confirm'))) return;
    try {
      await pb.collection('owner_documents').delete(doc.record.id, { requestKey: `doc-del-${doc.record.id}` });
      notify.success(t('docs_deleted') || (lang === 'ar' ? 'تم حذف المستند' : 'Document deleted'), doc.name);
    } catch (err) {
      notify.error(t('something_wrong'), String(err?.message || err));
    }
  };

  /* ---------- grouping for property sections ---------- */

  // Group a tab's documents by property. Returns { groups, standalone }.
  const propertyGroups = (tab) => {
    const docs = applyFilters(docsForTab(tab), tab);
    const withProp = {};
    const standalone = [];
    docs.forEach((d) => {
      if (d.property) {
        if (!withProp[d.property.id]) withProp[d.property.id] = { property: d.property, docs: [] };
        withProp[d.property.id].docs.push(d);
      } else {
        standalone.push(d);
      }
    });
    return { groups: Object.values(withProp), standalone };
  };

  /* ---------- render ---------- */

  const renderFilters = (tab, docs) => {
    const f = filters[tab] || {};
    if (tab === 'my') {
      return (
        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label={t('docs_filter_type')}
            value={f.type || 'all'}
            onChange={(v) => setFilter(tab, 'type', v)}
            options={typeOptionsMy}
            placeholder={t('docs_filter_all')}
          />
          <FilterSelect
            label={t('docs_filter_date')}
            value={f.date || 'any'}
            onChange={(v) => setFilter(tab, 'date', v)}
            options={dateOptions}
            placeholder={t('docs_date_any')}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label={t('docs_filter_country')}
          value={f.country || 'all'}
          onChange={(v) => setFilter(tab, 'country', v)}
          options={countryOptions(docs)}
          placeholder={t('docs_filter_all')}
        />
        <FilterSelect
          label={t('docs_filter_city')}
          value={f.city || 'all'}
          onChange={(v) => setFilter(tab, 'city', v)}
          options={cityOptions(docs)}
          placeholder={t('docs_filter_all')}
        />
        <FilterSelect
          label={t('docs_filter_building')}
          value={f.building || 'all'}
          onChange={(v) => setFilter(tab, 'building', v)}
          options={buildingOptions(docs)}
          placeholder={t('docs_filter_all')}
        />
        <FilterSelect
          label={t('docs_filter_unit')}
          value={f.unit || 'all'}
          onChange={(v) => setFilter(tab, 'unit', v)}
          options={unitOptions(docs)}
          placeholder={t('docs_filter_all')}
        />
        <FilterSelect
          label={t('docs_filter_property')}
          value={f.property || 'all'}
          onChange={(v) => setFilter(tab, 'property', v)}
          options={propOptions(tab)}
          placeholder={t('docs_filter_all')}
        />
        {tab === 'rental' && (
          <>
            <FilterSelect
              label={t('docs_filter_tenant')}
              value={f.tenant || 'all'}
              onChange={(v) => setFilter(tab, 'tenant', v)}
              options={tenantOptions(docs)}
              placeholder={t('docs_filter_all')}
            />
            <FilterSelect
              label={t('docs_filter_contract_status')}
              value={f.contractStatus || 'all'}
              onChange={(v) => setFilter(tab, 'contractStatus', v)}
              options={contractStatusOptions}
              placeholder={t('docs_filter_all')}
            />
            <FilterSelect
              label={t('docs_filter_end_date')}
              value={f.endDate || 'all'}
              onChange={(v) => setFilter(tab, 'endDate', v)}
              options={[
                { value: 'all', label: t('docs_filter_all') },
                { value: 'active', label: t('docs_contract_active') },
                { value: 'expired', label: t('docs_contract_expired') },
              ]}
              placeholder={t('docs_filter_all')}
            />
          </>
        )}
      </div>
    );
  };

  const renderMyTab = (docs) => {
    if (docs.length === 0) {
      return (
        <EmptyDocs
          message={t('docs_empty_my')}
          onAdd={() => openAdd('my_documents')}
          addLabel={t('docs_empty_add_doc')}
        />
      );
    }
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-end gap-3">
          <Button size="sm" variant="outline" onClick={() => openAdd('my_documents')} className="min-h-[34px]">
            <Plus size={14} className="me-1" />
            {t('docs_add_document')}
          </Button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {docs.map((d) => (
            <DocCard key={d.id} doc={d} onPreview={setPreviewDoc} onShare={shareDoc} onDelete={deleteDoc} />
          ))}
        </div>
      </div>
    );
  };

  const renderPropertyTab = (tab) => {
    const { groups, standalone } = propertyGroups(tab);
    const addBtnKey =
      tab === 'rental'
        ? 'docs_add_rental_contract'
        : 'docs_add_contract';
    const addCat = tab === 'rental' ? 'rental' : tab;
    const emptyKey = tab === 'ownership' ? 'docs_empty_ownership' : tab === 'installment' ? 'docs_empty_installment' : 'docs_empty_rental';

    if (groups.length === 0 && standalone.length === 0) {
      return (
        <EmptyDocs
          message={t(emptyKey)}
          onAdd={() => openAdd(addCat)}
          addLabel={t(addBtnKey)}
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-3">
          <Button size="sm" variant="outline" onClick={() => openAdd(addCat)} className="min-h-[34px]">
            <Plus size={14} className="me-1" />
            {t(addBtnKey)}
          </Button>
        </div>
        {groups.length > 0 && (
          <div className="space-y-2.5">
            {groups.map(({ property, docs }) => (
              <PropertyRow
                key={property.id}
                property={property}
                docCount={docs.length}
                onClick={() => setSelected({ property, docs, tab })}
              />
            ))}
          </div>
        )}
        {standalone.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">{t('docs_unlinked')}</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {standalone.map((d) => (
                <DocCard key={d.id} doc={d} onPreview={setPreviewDoc} onShare={shareDoc} onDelete={deleteDoc} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTab = (tab) => {
    const tabDocs = docsForTab(tab);
    const filtered = applyFilters(tabDocs, tab);
    if (tab === 'my') return renderMyTab(filtered);
    return renderPropertyTab(tab);
  };

  // Count per tab — same TAB_CATEGORIES as the list, so count == files shown.
  const tabCounts = useMemo(() => {
    const counts = { my: 0, ownership: 0, installment: 0, rental: 0 };
    allDocs.forEach((d) => {
      TABS.forEach((tab) => {
        const cats = TAB_CATEGORIES[tab] || [tab];
        if (cats.includes(d.category)) counts[tab] += 1;
      });
    });
    return counts;
  }, [allDocs]);

  const searchPlaceholderKey = `docs_search_${activeTab}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">{t('docs_center_subtitle')}</p>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v);
          setSelected(null);
        }}
        className="w-full"
      >
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <TabsList className="h-auto w-max min-w-full">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap"
              >
                {t(`docs_tab_${tab}`)}
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums">
                  {tabCounts[tab]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Search with inline privacy lock + short note */}
        <div className="mt-4 space-y-1.5">
          <div className="relative">
            <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(searchPlaceholderKey)}
              className="h-10 ps-9 pe-9"
            />
            <ShieldCheck
              size={15}
              className="absolute top-1/2 -translate-y-1/2 end-3 text-emerald-600 pointer-events-none"
            />
          </div>
          <p className="text-[11px] text-muted-foreground ps-1">{t('docs_privacy_note')}</p>
        </div>

        {/* Filters per tab */}
        <div className="mt-4">
          {TABS.map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-0">
              <div className="space-y-4">
                {renderFilters(tab, docsForTab(tab))}
                {loading ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">{t('docs_loading')}</p>
                ) : selected && selected.tab === tab ? (
                  <PropertyDetail
                    property={selected.property}
                    docs={selected.docs}
                    tab={tab}
                    onBack={() => setSelected(null)}
                    onPreview={setPreviewDoc}
                    onShare={shareDoc}
                    onDelete={deleteDoc}
                    onAdd={openAdd}
                  />
                ) : (
                  renderTab(tab)
                )}
              </div>
            </TabsContent>
          ))}
        </div>
      </Tabs>

      {/* Preview modal */}
      <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} onShare={shareDoc} />

      {/* Secure Sharing dialog (Task #17) */}
      <SecureShareDialog doc={shareDialogDoc} open={!!shareDialogDoc} onClose={() => setShareDialogDoc(null)} />

      {/* Add dialog */}
      <AddDocumentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        category={addCategory}
        properties={properties}
        tenancies={tenancies}
        onSaved={loadDocs}
      />

    </div>
  );
}
