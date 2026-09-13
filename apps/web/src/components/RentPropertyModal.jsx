import React, { useState } from 'react';
import { CalendarClock, KeyRound, Loader2, Plus, Trash2, UserRound, Wallet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { notify } from '@/lib/notify';
import { propertyLabel } from '@/lib/api';

// Rent an EXISTING cash/installment property — the manual, no-AI counterpart
// to Estate AI's "existing property" rent branch. Never touches the
// property's own fields or `type`; only creates a tenant + tenancy + checks
// (rent_payments) linked via property_id/owner_id. Reachable from the
// Vacant list, My Properties, and the Property Profile page.
const emptyCheck = () => ({ amount: '', due_date: '', check_number: '' });

const RentPropertyModal = ({ open, onOpenChange, property, onSaved }) => {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === 'ar';

  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantNationality, setTenantNationality] = useState('');
  const [tenantIdFile, setTenantIdFile] = useState(null);
  const [leaseFile, setLeaseFile] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deposit, setDeposit] = useState('');
  const [checks, setChecks] = useState([emptyCheck()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  if (!property) return null;

  const reset = () => {
    setTenantName('');
    setTenantPhone('');
    setTenantEmail('');
    setTenantNationality('');
    setTenantIdFile(null);
    setLeaseFile(null);
    setStartDate('');
    setEndDate('');
    setDeposit('');
    setChecks([emptyCheck()]);
    setErr('');
  };

  const close = (val) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const updateCheck = (i, key, v) => {
    setChecks((prev) => prev.map((c, idx) => (idx === i ? { ...c, [key]: v } : c)));
  };
  const addCheck = () => setChecks((prev) => [...prev, emptyCheck()]);
  const removeCheck = (i) => setChecks((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!tenantName.trim()) {
      setErr(ar ? 'اسم المستأجر مطلوب' : 'Tenant name is required');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      // 1) Tenant record (owner-scoped, reusable, holds the passport/ID file).
      let tenantId = null;
      try {
        if (tenantIdFile) {
          const fd = new FormData();
          fd.append('owner', user.id);
          fd.append('name', tenantName.trim());
          fd.append('phone', tenantPhone || '');
          fd.append('email', tenantEmail || '');
          fd.append('nationality', tenantNationality || '');
          fd.append('id_document', tenantIdFile);
          const tRec = await pb.collection('tenants').create(fd, {
            requestKey: `rent-tenant-${property.id}`,
          });
          tenantId = tRec?.id || null;
        } else {
          const tRec = await pb.collection('tenants').create(
            {
              owner: user.id,
              name: tenantName.trim(),
              phone: tenantPhone || '',
              email: tenantEmail || '',
              nationality: tenantNationality || '',
            },
            { requestKey: `rent-tenant-${property.id}` },
          );
          tenantId = tRec?.id || null;
        }
      } catch {
        /* best-effort — the tenancy still keeps the snapshot fields */
      }

      // 2) Tenancy — linked via property_id + owner_id. The property's own
      //    row (building, unit, country, type) is never touched.
      const validChecks = checks.filter((c) => c.amount !== '' && c.due_date);
      const tenancyPayload = {
        property: property.id,
        owner: user.id,
        ...(tenantId ? { tenant: tenantId } : {}),
        tenant_name: tenantName.trim(),
        tenant_phone: tenantPhone || '',
        tenant_email: tenantEmail || '',
        tenant_nationality: tenantNationality || '',
        start_date: startDate || '',
        end_date: endDate || '',
        security_deposit: Number(deposit) || 0,
        payments_count: validChecks.length,
        status: 'active',
      };
      let tenancyRec;
      if (leaseFile) {
        const fd = new FormData();
        Object.entries(tenancyPayload).forEach(([k, v]) => fd.append(k, v));
        fd.append('lease_contract', leaseFile);
        tenancyRec = await pb.collection('tenancies').create(fd, {
          requestKey: `rent-tenancy-${property.id}`,
        });
      } else {
        tenancyRec = await pb.collection('tenancies').create(tenancyPayload, {
          requestKey: `rent-tenancy-${property.id}`,
        });
      }

      // 3) Checks (rent_payments), one per row with an amount + due date.
      await Promise.all(
        validChecks.map((c, i) =>
          pb.collection('rent_payments').create(
            {
              tenancy: tenancyRec.id,
              property: property.id,
              owner: user.id,
              check_number: c.check_number && !Number.isNaN(Number(c.check_number))
                ? Number(c.check_number)
                : null,
              amount: String(c.amount),
              due_date: c.due_date,
              status: 'pending',
            },
            { requestKey: `rent-check-${property.id}-${i}` },
          ),
        ),
      );

      notify.success(
        ar ? 'تم تأجير العقار' : 'Property rented',
        ar ? 'لم يتم تكرار بيانات العقار.' : "The property's own data was not duplicated.",
      );
      close(false);
      onSaved?.();
    } catch (e) {
      setErr(
        e?.response?.message ||
          (ar ? 'تعذر حفظ بيانات الإيجار. حاول مرة أخرى.' : 'Could not save the rental. Try again.'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound size={18} className="text-primary" />
            {ar ? 'تأجير هذا العقار' : 'Rent this property'}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{propertyLabel(property)}</p>
        </DialogHeader>

        <div className="space-y-4 text-start" dir={ar ? 'rtl' : 'ltr'}>
          <div className="rounded-lg border bg-background/60 p-3 space-y-2.5">
            <p className="text-xs font-bold flex items-center gap-1.5">
              <UserRound size={13} className="text-primary" /> {ar ? 'بيانات المستأجر' : 'Tenant data'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  {ar ? 'الاسم' : 'Name'}
                </Label>
                <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  {ar ? 'الهاتف' : 'Phone'}
                </Label>
                <Input value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} className="h-9 text-xs" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  {ar ? 'البريد' : 'Email'}
                </Label>
                <Input value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} className="h-9 text-xs" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  {ar ? 'الجنسية' : 'Nationality'}
                </Label>
                <Input value={tenantNationality} onChange={(e) => setTenantNationality(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground">
                {ar ? 'جواز السفر/الهوية (اختياري)' : 'Passport/ID (optional)'}
              </Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setTenantIdFile(e.target.files?.[0] || null)} className="h-9 text-xs" />
            </div>
          </div>

          <div className="rounded-lg border bg-background/60 p-3 space-y-2.5">
            <p className="text-xs font-bold flex items-center gap-1.5">
              <CalendarClock size={13} className="text-primary" /> {ar ? 'عقد الإيجار' : 'Lease contract'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  {ar ? 'تاريخ البداية' : 'Start date'}
                </Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-xs" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  {ar ? 'تاريخ النهاية' : 'End date'}
                </Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-xs" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  {ar ? 'التأمين' : 'Security deposit'}
                </Label>
                <Input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="h-9 text-xs" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">
                  {ar ? 'ملف عقد الإيجار (اختياري)' : 'Lease file (optional)'}
                </Label>
                <Input type="file" accept=".pdf,image/*" onChange={(e) => setLeaseFile(e.target.files?.[0] || null)} className="h-9 text-xs" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-background/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Wallet size={13} className="text-primary" /> {ar ? 'الشيكات/الدفعات' : 'Checks/payments'}
              </p>
              <button
                type="button"
                onClick={addCheck}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80"
              >
                <Plus size={12} /> {ar ? 'إضافة شيك' : 'Add check'}
              </button>
            </div>
            <div className="space-y-2">
              {checks.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-end">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{ar ? 'رقم الشيك' : '#'}</Label>
                    <Input value={c.check_number} onChange={(e) => updateCheck(i, 'check_number', e.target.value)} className="h-8 text-xs" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{ar ? 'القيمة' : 'Amount'}</Label>
                    <Input type="number" value={c.amount} onChange={(e) => updateCheck(i, 'amount', e.target.value)} className="h-8 text-xs" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{ar ? 'التاريخ' : 'Date'}</Label>
                    <Input type="date" value={c.due_date} onChange={(e) => updateCheck(i, 'due_date', e.target.value)} className="h-8 text-xs" dir="ltr" />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCheck(i)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border text-red-600 hover:bg-red-50"
                    aria-label={ar ? 'حذف' : 'Remove'}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={saving}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving && <Loader2 size={14} className="me-1.5 animate-spin" />}
              {ar ? 'حفظ' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RentPropertyModal;
