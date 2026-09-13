import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardEdit,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge, DocButton } from '@/components/shared';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDate, formatMoney, propertyLabel } from '@/lib/api';
import { countryName } from '@/lib/countries';

const Row = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className="text-sm font-medium break-words" dir="auto">{value || '—'}</p>
  </div>
);

const Section = ({ title, children }) => (
  <div className="rounded-xl border bg-card p-4 space-y-3">
    <h4 className="text-sm font-bold text-primary">{title}</h4>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>
  </div>
);

const PropertyReviewModal = ({ property, owner, payments, onClose, onAction }) => {
  const { t, lang } = useLanguage();
  const [mode, setMode] = useState(null); // 'reject' | 'changes'
  const [note, setNote] = useState('');

  if (!property) return null;

  const propPays = (payments || []).filter((p) => p.property === property.id);
  const installments = propPays.filter((p) => p.kind === 'installment');
  const rents = propPays.filter((p) => p.kind === 'rent');

  const submit = async () => {
    if (!note.trim()) return;
    await onAction(mode, note.trim());
    setMode(null);
    setNote('');
  };

  const typeLabel =
    property.type === 'cash'
      ? t('type_cash')
      : property.type === 'installment'
        ? t('type_installment')
        : t('type_rented');

  return (
    <>
    <Dialog open={!!property} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {t('review_submission')}
            <StatusBadge status={property.status} />
          </DialogTitle>
          <DialogDescription>{propertyLabel(property)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Owner information */}
          <Section title={t('owner_information')}>
            <Row label={t('name')} value={owner?.name} />
            <Row label={t('email')} value={owner?.email} />
            <Row label={t('phone')} value={owner?.phone || property.owner_phone} />
            <Row label={t('nationality')} value={owner?.nationality ? countryName(owner.nationality, lang) : '—'} />
            <Row label={t('gender')} value={owner?.gender ? (owner.gender === 'male' ? t('male') : t('female')) : '—'} />
            <Row label={t('joined')} value={formatDate(owner?.created, lang)} />
          </Section>

          {/* Property details */}
          <Section title={t('property_details')}>
            <Row label={t('property_type')} value={typeLabel} />
            <Row label={t('country')} value={countryName(property.country, lang)} />
            <Row label={t('area')} value={property.area} />
            <Row label={t('building')} value={property.building} />
            <Row label={t('unit_number')} value={property.unit_number} />
            <Row label={t('property_size')} value={property.property_size} />
            <Row label={t('developer')} value={property.developer} />
            {property.type === 'installment' && (
              <>
                <Row
                  label={t('handover_status')}
                  value={
                    property.handover_status === 'handover_completed'
                      ? t('handover_completed')
                      : t('under_construction')
                  }
                />
                <Row label={t('expected_handover_date')} value={formatDate(property.expected_handover_date, lang)} />
                <Row label={t('installments_count')} value={property.installments_count} />
              </>
            )}
          </Section>

          {/* Purchase / installment info */}
          {(property.type === 'cash' || property.type === 'installment') && (
            <Section title={t('purchase_info')}>
              <Row label={t('total_price')} value={formatMoney(property.total_price, lang)} />
              <Row label={t('down_payment')} value={formatMoney(property.down_payment, lang)} />
              <Row label={t('total_paid')} value={formatMoney(property.total_paid, lang)} />
              <Row label={t('purchase_date')} value={formatDate(property.purchase_date, lang)} />
              <Row label={t('service_charge_amount')} value={formatMoney(property.service_charge_amount, lang)} />
              <Row label={t('service_charge_date')} value={formatDate(property.service_charge_date, lang)} />
              <Row
                label={t('service_charge_frequency')}
                value={
                  property.service_charge_frequency === 'yearly'
                    ? t('freq_yearly')
                    : property.service_charge_frequency === 'one_time'
                      ? t('freq_one_time')
                      : '—'
                }
              />
            </Section>
          )}

          {/* Installment plan */}
          {property.type === 'installment' && installments.length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <h4 className="text-sm font-bold text-primary">{t('installment_plan')}</h4>
              <div className="divide-y">
                {installments.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="flex-1 truncate">{p.label}</span>
                    <span className="tabular-nums font-semibold" dir="ltr">{formatMoney(p.amount, lang)}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">{formatDate(p.due_date, lang)}</span>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rental details */}
          {property.type === 'rented' && (
            <>
              <Section title={t('rental_details')}>
                <Row label={t('tenant_name')} value={property.tenant_name} />
                <Row label={t('tenant_phone')} value={property.tenant_phone} />
                <Row label={t('tenant_email')} value={property.tenant_email} />
                <Row label={t('rent_amount')} value={formatMoney(property.rent_amount, lang)} />
                <Row label={t('security_deposit')} value={formatMoney(property.security_deposit, lang)} />
                <Row label={t('contract_start_date')} value={formatDate(property.contract_start_date, lang)} />
                <Row label={t('contract_end_date')} value={formatDate(property.contract_end_date, lang)} />
              </Section>
              {rents.length > 0 && (
                <div className="rounded-xl border bg-card p-4 space-y-2">
                  <h4 className="text-sm font-bold text-primary">{t('rental_details')}</h4>
                  <div className="divide-y">
                    {rents.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="flex-1 truncate">{p.label}</span>
                        <span className="tabular-nums font-semibold" dir="ltr">{formatMoney(p.amount, lang)}</span>
                        <span className="text-xs text-muted-foreground" dir="ltr">{formatDate(p.due_date, lang)}</span>
                        <StatusBadge status={p.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Documents */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h4 className="text-sm font-bold text-primary">{t('uploaded_documents')}</h4>
            <div className="flex flex-wrap gap-2">
              <DocButton record={owner} field="passport_pdf" label={t('passport')} />
              <DocButton record={owner} field="residence_pdf" label={t('residence')} />
              <DocButton record={property} field="title_deed_pdf" label={t('title_deed_pdf')} />
              <DocButton record={property} field="tenant_document" label={t('tenant_document')} />
              <DocButton record={property} field="lease_contract" label={t('lease_contract')} />
            </div>
            {property.review_note && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                <b>{t('review_note')}:</b> {property.review_note}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!mode ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button onClick={() => onAction('approve', '')} className="min-h-[44px]">
                <Check size={16} className="me-1.5" />
                {t('approve')}
              </Button>
              <Button variant="outline" onClick={() => { setMode('changes'); setNote(''); }} className="min-h-[44px]">
                <ClipboardEdit size={16} className="me-1.5" />
                {t('request_changes')}
              </Button>
              <Button variant="destructive" onClick={() => { setMode('reject'); setNote(''); }} className="min-h-[44px]">
                <X size={16} className="me-1.5" />
                {t('reject')}
              </Button>
              <Button variant="ghost" onClick={onClose} className="min-h-[44px] ms-auto">
                {t('cancel')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle size={16} className={mode === 'reject' ? 'text-destructive' : 'text-[hsl(var(--gold))]'} />
                {mode === 'reject' ? t('rejection_reason') : t('changes_note')}
              </div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={mode === 'reject' ? t('rejection_reason_placeholder') : t('changes_note_placeholder')}
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMode(null)} className="min-h-[44px]">
                  {t('cancel')}
                </Button>
                <Button
                  variant={mode === 'reject' ? 'destructive' : 'default'}
                  onClick={submit}
                  disabled={!note.trim()}
                  className="min-h-[44px]"
                >
                  {mode === 'reject' ? t('reject') : t('request_changes')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default PropertyReviewModal;
