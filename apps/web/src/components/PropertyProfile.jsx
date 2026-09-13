import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileText,
  HardHat,
  History,
  Home,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
  Repeat,
  Store,
  TreePine,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { formatDate, formatMoney, getFileUrl, daysUntil, propertyLabel } from '@/lib/api';
import { countryName } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { StatusBadge, StatusDot, installmentState, propertyIndicator } from '@/components/shared';
import {
  buildEvents,
  loadManualAlerts,
  loadAdminAlertSettings,
} from '@/lib/alertsClient';
import PropertyTimelinePanel from '@/components/features/PropertyTimelinePanel';

// Property Profile — a single page that gathers everything about one property:
//   1. Property data (building, unit, type, usage, area, country, price, handover…)
//   2. Fees (purchase fees / service fees stored on the property)
//   3. Installment schedule + payment status (payments linked to this property)
//   4. Alerts & follow-up (auto + manual alerts for this property only)
//   5. Documents (auto-indexed from property fields + custom docs linked to it)
//
// Reachable from the sidebar usage sections (residential / commercial / land)
// and from the Documents Center. The document list is an INDEX — files are
// never copied; they are referenced from their real source (property record
// fields or owner_documents rows linked via the `property` relation).

const USAGE_ICON = {
  residential: Home,
  commercial: Store,
  land: TreePine,
};

const TYPE_ICON = {
  cash: Banknote,
  installment: CreditCard,
  rented: KeyRound,
};

function InfoLine({ icon, label, value, dir }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
        {icon}
      </span>
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium truncate" dir={dir}>{value || '—'}</span>
    </div>
  );
}

function SectionCard({ icon, title, action, children }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            {icon}
          </span>
          <h3 className="text-sm font-bold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// A single document row in the property profile. `doc` is a normalized object:
// { id, source, record, filename, fileUrl, name, type, canDelete, onDelete }
function DocRow({ doc, onDelete }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      let url = doc.fileUrl || null;
      if (!url && doc.record && doc.filename) {
        url = await getFileUrl(doc.record, doc.filename);
      }
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
      let url = doc.fileUrl || null;
      if (!url && doc.record && doc.filename) {
        url = await getFileUrl(doc.record, doc.filename);
      }
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
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background/60 px-3.5 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <FileText size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold break-words">{doc.name}</p>
        <span className="rounded-full bg-primary/8 text-primary px-2 py-0.5 text-[10px] font-semibold">
          {t(`docs_type_${doc.type}`) || doc.type}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 min-h-[34px] disabled:opacity-60"
        >
          <Eye size={13} /> {t('docs_open')}
        </button>
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent min-h-[34px] disabled:opacity-60"
        >
          <Download size={13} /> {t('docs_download')}
        </button>
        {doc.canDelete && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(doc)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 min-h-[34px]"
          >
            {t('docs_delete')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PropertyProfile({
  propertyId,
  properties,
  payments,
  tenancies = [],
  rentPayments = [],
  onEdit,
  onConvert,
  onRent,
  onMarkCheckCollected,
}) {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const isRtl = lang === 'ar';
  const ar = isRtl;

  const [manualAlerts, setManualAlerts] = useState([]);
  const [adminDefaults, setAdminDefaults] = useState({});
  const [ownerDocs, setOwnerDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  const property = useMemo(
    () => properties.find((p) => p.id === propertyId) || null,
    [properties, propertyId],
  );

  const loadAux = useCallback(async () => {
    if (!propertyId) return;
    try {
      const [ma, aa] = await Promise.all([
        loadManualAlerts().catch(() => []),
        loadAdminAlertSettings().catch(() => ({})),
      ]);
      setManualAlerts(ma);
      setAdminDefaults(aa || {});
    } catch {
      /* ignore */
    }
    try {
      const rows = await pb.collection('owner_documents').getFullList({
        filter: `property = "${propertyId}"`,
        sort: '-created',
        requestKey: `profile-docs-${propertyId}-${Date.now()}`,
      });
      setOwnerDocs(rows);
    } catch {
      setOwnerDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [propertyId]);

  useEffect(() => {
    loadAux();
  }, [loadAux]);

  // Realtime: keep docs + alerts in sync.
  useEffect(() => {
    if (!propertyId) return undefined;
    let debounce = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => loadAux(), 350);
    };
    ['owner_documents', 'property_alerts', 'payments'].forEach((c) => {
      void pb.collection(c).subscribe('*', schedule).catch(() => {});
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      ['owner_documents', 'property_alerts', 'payments'].forEach((c) => {
        void pb.collection(c).unsubscribe('*').catch(() => {});
      });
    };
  }, [propertyId, loadAux]);

  const propPayments = useMemo(
    () => payments.filter((p) => p.property === propertyId),
    [payments, propertyId],
  );

  // Rental — an additive tenancy linked via property_id, never a mutation of
  // this property's own type/fields. A property can have several tenancies
  // over time; only the active one is shown here.
  const activeTenancy = useMemo(
    () => tenancies.find((tc) => tc.property === propertyId && tc.status === 'active') || null,
    [tenancies, propertyId],
  );
  const tenancyChecks = useMemo(
    () => (activeTenancy ? rentPayments.filter((c) => c.tenancy === activeTenancy.id) : []),
    [rentPayments, activeTenancy],
  );

  // Alerts scoped to this property only.
  const events = useMemo(() => {
    if (!property) return [];
    const evs = buildEvents({
      properties: [property],
      payments: propPayments,
      manualAlerts,
      adminDefaults,
    });
    return evs.filter((e) => e.propertyId === propertyId || e.property === propertyId);
  }, [property, propPayments, manualAlerts, adminDefaults]);

  const purchaseFees = useMemo(() => {
    let raw = property?.purchase_fees;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    return Array.isArray(raw) ? raw : [];
  }, [property]);

  // Build the document index: property-attached files + linked owner_documents.
  // (Declared before the early return so hook order stays stable.)
  const docIndex = useMemo(() => {
    if (!property) return [];
    const list = [];
    if (property.title_deed_pdf || property.title_deed_pdf_url) {
      list.push({
        id: `prop-title_deed_pdf`,
        source: 'property',
        record: property,
        filename: property.title_deed_pdf,
        fileUrl: property.title_deed_pdf_url || null,
        name: t('docs_type_title_deed'),
        type: 'title_deed',
        canDelete: false,
      });
    }
    if (activeTenancy?.lease_contract) {
      list.push({
        id: `tenancy-${activeTenancy.id}-lease_contract`,
        source: 'tenancy',
        record: activeTenancy,
        filename: activeTenancy.lease_contract,
        name: t('docs_type_lease'),
        type: 'lease',
        canDelete: false,
      });
    }
    // Legacy fallback — a not-yet-migrated property still using the old flat
    // rental fields directly.
    if (property.type === 'rented' && (property.lease_contract || property.lease_contract_url)) {
      list.push({
        id: `prop-lease_contract`,
        source: 'property',
        record: property,
        filename: property.lease_contract,
        fileUrl: property.lease_contract_url || null,
        name: t('docs_type_lease'),
        type: 'lease',
        canDelete: false,
      });
    }
    if (property.type === 'rented' && (property.tenant_document || property.tenant_document_url)) {
      list.push({
        id: `prop-tenant_document`,
        source: 'property',
        record: property,
        filename: property.tenant_document,
        fileUrl: property.tenant_document_url || null,
        name: t('docs_type_tenant_doc'),
        type: 'tenant_doc',
        canDelete: false,
      });
    }
    ownerDocs.forEach((d) => {
      list.push({
        id: `custom-${d.id}`,
        source: 'custom',
        record: d,
        filename: d.file,
        fileUrl: d.file_url || null,
        name: d.name,
        type: d.category === 'my_documents' ? 'custom' : 'contract',
        canDelete: true,
      });
    });
    return list;
  }, [property, ownerDocs, activeTenancy, t]);

  if (!property) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard/home')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowRight size={16} style={{ transform: isRtl ? '' : 'rotate(180deg)' }} />
          {t('docs_back')}
        </button>
        <p className="py-16 text-center text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  const UsageIcon = USAGE_ICON[property.usage_type] || Home;
  const TypeIcon = TYPE_ICON[property.type] || Building2;
  const ind = propertyIndicator(property, properties);
  const st = installmentState(property, payments);

  const typeLabel =
    property.type === 'cash'
      ? t('type_cash')
      : property.type === 'installment'
        ? t('type_installment')
        : t('type_rented');
  const usageLabel = t(`usage_type_${property.usage_type}`) || property.usage_type || '—';

  // Payment summary
  const pays = propPayments.filter((x) => x.kind === 'installment' || x.kind === 'rent');
  const paidTotal =
    (property.type === 'installment' ? Number(property.down_payment || 0) : 0) +
    pays.filter((x) => x.status === 'paid').reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalPrice = Number(property.total_price || property.rent_amount || 0);
  const remaining = Math.max(0, totalPrice - paidTotal);
  const progress =
    totalPrice > 0 ? Math.min(100, Math.round((paidTotal / totalPrice) * 100)) : null;

  const deleteDoc = async (doc) => {
    if (!window.confirm(t('docs_delete_confirm'))) return;
    try {
      await pb.collection('owner_documents').delete(doc.record.id, {
        requestKey: `profile-doc-del-${doc.record.id}-${Date.now()}`,
      });
      setOwnerDocs((prev) => prev.filter((d) => d.id !== doc.record.id));
    } catch {
      /* ignore */
    }
  };

  const backToSection = property.usage_type || 'residential';

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate(`/dashboard/${backToSection}`)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowRight size={16} style={{ transform: isRtl ? '' : 'rotate(180deg)' }} />
        {t('docs_back')}
      </button>

      {/* Header */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <UsageIcon size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-bold truncate">{propertyLabel(property)}</h2>
              <p className="text-sm text-muted-foreground truncate">
                {property.area || property.city || '—'}
                {property.country ? ` · ${countryName(property.country, lang)}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  <TypeIcon size={13} /> {typeLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  <UsageIcon size={13} /> {usageLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ind ? <StatusDot color={ind.color} label={t(ind.labelKey)} /> : <StatusBadge status={property.status} />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => onEdit(property)} className="min-h-[40px]">
            <Pencil size={14} className="me-1.5" />
            {t('edit')}
          </Button>
          {(property.type === 'cash' || property.type === 'installment') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onConvert(property, property.type === 'cash' ? 'installment' : 'cash')}
              className="min-h-[40px]"
            >
              <Repeat size={14} className="me-1.5" />
              {t('convert_property_type')}
            </Button>
          )}
          {(property.type === 'cash' || property.type === 'installment') && !activeTenancy && onRent && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRent(property)}
              className="min-h-[40px]"
            >
              <KeyRound size={14} className="me-1.5" />
              {t('rent_this_property') || (lang === 'ar' ? 'تأجير هذا العقار' : 'Rent this property')}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/dashboard/documents')}
            className="min-h-[40px]"
          >
            <FileText size={14} className="me-1.5" />
            {t('nav_documents')}
          </Button>
        </div>
      </div>

      {/* Property data */}
      <SectionCard icon={<Building2 size={16} />} title={t('docs_property_details')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <InfoLine icon={<Building2 size={14} />} label={t('docs_building')} value={property.building} />
          <InfoLine icon={<FileText size={14} />} label={t('docs_unit')} value={property.unit_number} />
          <InfoLine icon={<MapPin size={14} />} label={t('docs_city')} value={property.area || property.city} />
          <InfoLine
            icon={<MapPin size={14} />}
            label={t('docs_country')}
            value={property.country ? countryName(property.country, lang) : ''}
          />
          <InfoLine
            icon={<Home size={14} />}
            label={t('property_size')}
            value={
              property.property_size
                ? `${property.property_size} ${property.property_size_unit === 'sqft' ? (lang === 'ar' ? 'قدم²' : 'sqft') : (lang === 'ar' ? 'م²' : 'sqm')}`
                : ''
            }
            dir="ltr"
          />
          <InfoLine icon={<HardHat size={14} />} label={t('developer')} value={property.developer} />
          {property.type === 'installment' && (
            <>
              <InfoLine
                icon={<Wallet size={14} />}
                label={t('total_price')}
                value={formatMoney(property.total_price, lang)}
                dir="ltr"
              />
              <InfoLine
                icon={<Wallet size={14} />}
                label={t('down_payment')}
                value={formatMoney(property.down_payment, lang)}
                dir="ltr"
              />
              <InfoLine
                icon={<HardHat size={14} />}
                label={t('handover_status')}
                value={
                  property.handover_status === 'handover_completed'
                    ? t('handover_completed')
                    : t('under_construction')
                }
              />
              {property.expected_handover_date && (
                <InfoLine
                  icon={<CalendarClock size={14} />}
                  label={t('expected_handover_date')}
                  value={formatDate(property.expected_handover_date, lang)}
                  dir="ltr"
                />
              )}
              {property.financing_details && (
                <InfoLine icon={<CreditCard size={14} />} label={t('financing_details')} value={property.financing_details} />
              )}
            </>
          )}
          {property.type === 'rented' && (
            <>
              <InfoLine
                icon={<Wallet size={14} />}
                label={t('rent_amount')}
                value={formatMoney(property.rent_amount, lang)}
                dir="ltr"
              />
              <InfoLine
                icon={<Wallet size={14} />}
                label={t('summary_security_deposit')}
                value={formatMoney(property.security_deposit, lang)}
                dir="ltr"
              />
              {property.contract_start_date && (
                <InfoLine
                  icon={<CalendarClock size={14} />}
                  label={t('contract_start_date')}
                  value={formatDate(property.contract_start_date, lang)}
                  dir="ltr"
                />
              )}
              {property.contract_end_date && (
                <InfoLine
                  icon={<CalendarClock size={14} />}
                  label={t('contract_end_date')}
                  value={formatDate(property.contract_end_date, lang)}
                  dir="ltr"
                />
              )}
            </>
          )}
          {property.owner_phone && (
            <InfoLine icon={<Phone size={14} />} label={t('phone')} value={property.owner_phone} dir="ltr" />
          )}
          {property.owner_email && (
            <InfoLine icon={<Mail size={14} />} label={t('email')} value={property.owner_email} dir="ltr" />
          )}
        </div>
      </SectionCard>

      {/* Tenancy (rental only) — an additive record linked via property_id;
          renting this property never changed its type or fields above. */}
      {activeTenancy && (
        <SectionCard icon={<UserRound size={16} />} title={t('docs_tenant_data')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <InfoLine icon={<UserRound size={14} />} label={t('docs_tenant_name')} value={activeTenancy.tenant_name} />
            <InfoLine icon={<Phone size={14} />} label={t('docs_tenant_phone')} value={activeTenancy.tenant_phone} dir="ltr" />
            <InfoLine icon={<Mail size={14} />} label={t('docs_tenant_email')} value={activeTenancy.tenant_email} dir="ltr" />
            <InfoLine icon={<UserRound size={14} />} label={ar ? 'الجنسية' : 'Nationality'} value={activeTenancy.tenant_nationality} />
            {activeTenancy.start_date && (
              <InfoLine icon={<CalendarClock size={14} />} label={t('contract_start_date')} value={formatDate(activeTenancy.start_date, lang)} dir="ltr" />
            )}
            {activeTenancy.end_date && (
              <InfoLine icon={<CalendarClock size={14} />} label={t('contract_end_date')} value={formatDate(activeTenancy.end_date, lang)} dir="ltr" />
            )}
            <InfoLine icon={<Wallet size={14} />} label={t('summary_security_deposit')} value={formatMoney(activeTenancy.security_deposit, lang)} dir="ltr" />
          </div>
        </SectionCard>
      )}

      {/* Checks (rent_payments) for the active tenancy */}
      {activeTenancy && (
        <SectionCard icon={<Wallet size={16} />} title={ar ? 'الشيكات/الدفعات' : 'Checks / payments'}>
          {tenancyChecks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('empty_payments')}</p>
          ) : (
            <div className="space-y-2">
              {tenancyChecks.map((c) => {
                const days = daysUntil(c.due_date);
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-background/60 px-3.5 py-2.5">
                    <div className="min-w-[140px] flex-1">
                      <p className="text-sm font-semibold">
                        {c.check_number ? `${ar ? 'شيك' : 'Check'} #${c.check_number}` : (ar ? 'دفعة' : 'Payment')}
                      </p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {formatDate(c.due_date, lang)}
                        {c.status !== 'collected' && days !== null && (
                          <span className={cn('ms-1', days < 0 ? 'text-red-600' : 'text-[hsl(var(--gold))]')}>
                            · {days <= 0 ? t('due_today') : `${days} ${t('days_left')}`}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums" dir="ltr">{formatMoney(c.amount, lang)}</p>
                    <StatusBadge status={c.status === 'collected' ? 'paid' : c.status === 'bounced' ? 'rejected' : 'pending'} />
                    {c.status !== 'collected' && onMarkCheckCollected && (
                      <Button size="sm" variant="outline" onClick={() => onMarkCheckCollected(c)} className="min-h-[34px]">
                        {ar ? 'تحصيل' : 'Mark collected'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* Legacy fallback — a not-yet-migrated property still holding the old
          flat rental fields directly. */}
      {!activeTenancy && property.type === 'rented' && (property.tenant_name || property.tenant_phone || property.tenant_email) && (
        <SectionCard icon={<UserRound size={16} />} title={t('docs_tenant_data')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <InfoLine icon={<UserRound size={14} />} label={t('docs_tenant_name')} value={property.tenant_name} />
            <InfoLine icon={<Phone size={14} />} label={t('docs_tenant_phone')} value={property.tenant_phone} dir="ltr" />
            <InfoLine icon={<Mail size={14} />} label={t('docs_tenant_email')} value={property.tenant_email} dir="ltr" />
          </div>
        </SectionCard>
      )}

      {/* Fees */}
      {purchaseFees.length > 0 && (
        <SectionCard icon={<Receipt size={16} />} title={t('service_fee_section') || (lang === 'ar' ? 'الرسوم' : 'Fees')}>
          <div className="space-y-1.5">
            {purchaseFees.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border bg-background/60 px-3.5 py-2.5 text-sm"
              >
                <span className="text-muted-foreground truncate">
                  {f.label || f.type || f.name || (lang === 'ar' ? 'رسوم' : 'Fee')}
                </span>
                <span className="font-semibold tabular-nums" dir="ltr">
                  {formatMoney(f.amount != null ? f.amount : f.value, lang)}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Payment summary + schedule */}
      <SectionCard
        icon={<Wallet size={16} />}
        title={t('nav_payments') || (lang === 'ar' ? 'المدفوعات' : 'Payments')}
      >
        {pays.length === 0 && totalPrice === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty_payments')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-lg bg-accent/50 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t('total_price')}</p>
                <p className="font-bold tabular-nums" dir="ltr">{formatMoney(totalPrice, lang)}</p>
              </div>
              <div className="rounded-lg bg-accent/50 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{lang === 'ar' ? 'المدفوع' : 'Paid'}</p>
                <p className="font-bold tabular-nums text-emerald-700" dir="ltr">{formatMoney(paidTotal, lang)}</p>
              </div>
              <div className="rounded-lg bg-accent/50 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t('remaining') || (lang === 'ar' ? 'المتبقي' : 'Remaining')}</p>
                <p className="font-bold tabular-nums text-red-600" dir="ltr">{formatMoney(remaining, lang)}</p>
              </div>
              <div className="rounded-lg bg-accent/50 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t('progress_label') || (lang === 'ar' ? 'التقدم' : 'Progress')}</p>
                <p className="font-bold tabular-nums" dir="ltr">{progress != null ? `${progress}%` : '—'}</p>
              </div>
            </div>
            {progress !== null && (
              <div className="h-2 rounded-full bg-accent overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    st.kind === 'completed' ? 'bg-emerald-500' : 'bg-[hsl(var(--gold))]',
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            <div className="space-y-2 pt-1">
              {pays.map((p) => {
                const days = daysUntil(p.due_date);
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border bg-background/60 px-3.5 py-2.5"
                  >
                    <div className="min-w-[140px] flex-1">
                      <p className="text-sm font-semibold">{p.label}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {formatDate(p.due_date, lang)}
                        {p.status !== 'paid' && days !== null && (
                          <span className={cn('ms-1', days < 0 ? 'text-red-600' : 'text-[hsl(var(--gold))]')}>
                            · {days <= 0 ? t('due_today') : `${days} ${t('days_left')}`}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums" dir="ltr">{formatMoney(p.amount, lang)}</p>
                    <StatusBadge status={p.status} />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>

      {/* Alerts & follow-up */}
      <SectionCard
        icon={<Bell size={16} />}
        title={t('nav_alerts') || (lang === 'ar' ? 'التنبيهات والمتابعة' : 'Alerts & Follow-up')}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/dashboard/alerts')}
            className="min-h-[34px]"
          >
            {lang === 'ar' ? 'كل التنبيهات' : 'All alerts'}
          </Button>
        }
      >
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {lang === 'ar' ? 'لا توجد تنبيهات لهذا العقار.' : 'No alerts for this property.'}
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => {
              const overdue = !e.done && e.daysUntil < 0;
              const soon = !e.done && e.daysUntil >= 0 && e.daysUntil <= 7;
              return (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border bg-background/60 px-3.5 py-2.5"
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      e.done
                        ? 'bg-emerald-100 text-emerald-700'
                        : overdue
                          ? 'bg-red-100 text-red-700'
                          : soon
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-accent text-muted-foreground',
                    )}
                  >
                    {e.done ? <CheckCircle2 size={15} /> : <Bell size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{formatDate(e.eventDate, lang)}</p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                      e.done
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : overdue
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : soon
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {e.done
                      ? (lang === 'ar' ? 'منجز' : 'Done')
                      : overdue
                        ? (lang === 'ar' ? 'متأخر' : 'Overdue')
                        : e.daysUntil === 0
                          ? t('due_today')
                          : `${e.daysUntil} ${t('days_left')}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Documents (indexed — never copied) */}
      <SectionCard
        icon={<FileText size={16} />}
        title={t('docs_documents')}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/dashboard/documents')}
            className="min-h-[34px]"
          >
            {lang === 'ar' ? 'مركز المستندات' : 'Documents Center'}
          </Button>
        }
      >
        {loadingDocs ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 size={16} className="animate-spin me-2" />
            <span className="text-sm">{t('loading')}</span>
          </div>
        ) : docIndex.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('docs_no_docs_property')}</p>
        ) : (
          <div className="space-y-2">
            {docIndex.map((d) => (
              <DocRow key={d.id} doc={d} onDelete={deleteDoc} />
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground pt-1">{t('docs_auto_synced')}</p>
      </SectionCard>

      {/* Task #17 — Property Timeline: reuses activity_logs, no new table.
          Self-gated (renders its own locked notice when not entitled). */}
      <SectionCard icon={<History size={16} />} title={ar ? 'الخط الزمني للعقار' : 'Property Timeline'}>
        <PropertyTimelinePanel propertyId={propertyId} property={property} />
      </SectionCard>
    </div>
  );
}
