import React, { useEffect, useState } from 'react';
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
  // Keep rendering the last non-null property while the dialog closes, so the
  // <Dialog> stays mounted throughout and Radix runs its own close animation
  // and body-pointer-events cleanup, instead of the whole subtree (dialog +
  // portal + overlay) being yanked out mid-open by an early `return null` —
  // which is what was leaving the admin dashboard frozen/unclickable.
  const [lastProperty, setLastProperty] = useState(property);
  useEffect(() => {
    if (property) setLastProperty(property);
  }, [property]);
  const displayProperty = property || lastProperty;

  if (!displayProperty) return null;

  const propPays = (payments || []).filter((p) => p.property === displayProperty.id);
  const installments = propPays.filter((p) => p.kind === 'installment');
  const rents = propPays.filter((p) => p.kind === 'rent');

  const submit = async () => {
    if (!note.trim()) return;
    await onAction(mode, note.trim());
    setMode(null);
    setNote('');
  };

  const typeLabel =
    displayProperty.type === 'cash'
      ? t('type_cash')
      : displayProperty.type === 'installment'
        ? t('type_installment')
        : t('type_rented');

  return (
    <>
    <Dialog open={!!property} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {t('review_submission')}
            <StatusBadge status={displayProperty.status} />
          </DialogTitle>
          <DialogDescription>{propertyLabel(displayProperty)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Owner information */}
          <Section title={t('owner_information')}>
            <Row label={t('name')} value={owner?.name} />
            <Row label={t('email')} value={owner?.email} />
            <Row label={t('phone')} value={owner?.phone || displayProperty.owner_phone} />
            <Row label={t('nationality')} value={owner?.nationality ? countryName(owner.nationality, lang) : '—'} />
            <Row label={t('gender')} value={owner?.gender ? (owner.gender === 'male' ? t('male') : t('female')) : '—'} />
            <Row label={t('joined')} value={formatDate(owner?.created, lang)} />
          </Section>

          {/* Property details */}
          <Section title={t('property_details')}>
            <Row label={t('property_type')} value={typeLabel} />
            <Row label={t('country')} value={countryName(displayProperty.country, lang)} />
            <Row label={t('area')} value={displayProperty.area} />
            <Row label={t('building')} value={displayProperty.building} />
            <Row label={t('unit_number')} value={displayProperty.unit_number} />
            <Row label={t('property_size')} value={displayProperty.property_size} />
            <Row label={t('developer')} value={displayProperty.developer} />
            {displayProperty.type === 'installment' && (
              <>
                <Row
                  label={t('handover_status')}
                  value={
                    displayProperty.handover_status === 'handover_completed'
                      ? t('handover_completed')
                      : t('under_construction')
                  }
                />
                <Row label={t('expected_handover_date')} value={formatDate(displayProperty.expected_handover_date, lang)} />
                <Row label={t('installments_count')} value={displayProperty.installments_count} />
              </>
            )}
          </Section>

          {/* Purchase / installment info */}
          {(displayProperty.type === 'cash' || displayProperty.type === 'installment') && (
            <Section title={t('purchase_info')}>
              <Row label={t('total_price')} value={formatMoney(displayProperty.total_price, lang)} />
              <Row label={t('down_payment')} value={formatMoney(displayProperty.down_payment, lang)} />
              <Row label={t('total_paid')} value={formatMoney(displayProperty.total_paid, lang)} />
              <Row label={t('purchase_date')} value={formatDate(displayProperty.purchase_date, lang)} />
              <Row label={t('service_charge_amount')} value={formatMoney(displayProperty.service_charge_amount, lang)} />
              <Row label={t('service_charge_date')} value={formatDate(displayProperty.service_charge_date, lang)} />
              <Row
                label={t('service_charge_frequency')}
                value={
                  displayProperty.service_charge_frequency === 'yearly'
                    ? t('freq_yearly')
                    : displayProperty.service_charge_frequency === 'one_time'
                      ? t('freq_one_time')
                      : '—'
                }
              />
            </Section>
          )}

          {/* Installment plan */}
          {displayProperty.type === 'installment' && installments.length > 0 && (
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
          {displayProperty.type === 'rented' && (
            <>
              <Section title={t('rental_details')}>
                <Row label={t('tenant_name')} value={displayProperty.tenant_name} />
                <Row label={t('tenant_phone')} value={displayProperty.tenant_phone} />
                <Row label={t('tenant_email')} value={displayProperty.tenant_email} />
                <Row label={t('rent_amount')} value={formatMoney(displayProperty.rent_amount, lang)} />
                <Row label={t('security_deposit')} value={formatMoney(displayProperty.security_deposit, lang)} />
                <Row label={t('contract_start_date')} value={formatDate(displayProperty.contract_start_date, lang)} />
                <Row label={t('contract_end_date')} value={formatDate(displayProperty.contract_end_date, lang)} />
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
              <DocButton record={displayProperty} field="title_deed_pdf" label={t('title_deed_pdf')} />
              <DocButton record={displayProperty} field="tenant_document" label={t('tenant_document')} />
              <DocButton record={displayProperty} field="lease_contract" label={t('lease_contract')} />
            </div>
            {displayProperty.review_note && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                <b>{t('review_note')}:</b> {displayProperty.review_note}
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
