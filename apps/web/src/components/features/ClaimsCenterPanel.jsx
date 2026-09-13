import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, ShieldAlert, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import { listClaims, createClaim, updateClaim, deleteClaim } from '@/lib/ownerFeaturesClient';
import { notify } from '@/lib/notify';
import { formatMoney, formatDate } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

const TYPE_LABEL = {
  damage: { en: 'Damage', ar: 'ضرر' },
  unpaid_rent: { en: 'Unpaid rent', ar: 'إيجار غير مسدد' },
  deposit_dispute: { en: 'Deposit dispute', ar: 'نزاع تأمين' },
  other: { en: 'Other', ar: 'أخرى' },
};
const STATUS_LABEL = {
  open: { en: 'Open', ar: 'مفتوحة' },
  under_review: { en: 'Under review', ar: 'قيد المراجعة' },
  resolved: { en: 'Resolved', ar: 'محلولة' },
  rejected: { en: 'Rejected', ar: 'مرفوضة' },
};

// Feature Management batch — Claims Center. A real, new claim record
// (tenant_claims) — create is server-gated by task-claims-hooks.pb.js's
// requireFeature check, same pattern as Task Center's owner_tasks.
export default function ClaimsCenterPanel({ properties = [] } = {}) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [claimType, setClaimType] = useState('damage');
  const [propertyId, setPropertyId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('open');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setClaims(await listClaims(user.id));
    } catch {
      /* keep last-known list on transient failure */
    } finally {
      setLoading(false);
    }
  }, [user]);

  const available = isAvailable('claims_center');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  useRealtimeRefresh(load, ['tenant_claims'], { enabled: available });

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'مركز المطالبات' : 'Claims Center'}
        reason={features.claims_center?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const addClaim = async (e) => {
    e.preventDefault();
    if (!description.trim() || !amount || saving) return;
    setSaving(true);
    try {
      await createClaim({
        owner: user.id,
        property: propertyId || null,
        tenant_name: tenantName.trim(),
        claim_type: claimType,
        amount: Number(amount) || 0,
        description: description.trim(),
        status: 'open',
      });
      setDescription('');
      setAmount('');
      setTenantName('');
      setPropertyId('');
      setClaimType('damage');
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر إضافة المطالبة' : 'Could not add claim', String(err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (claim, status) => {
    setClaims((cs) => cs.map((c) => (c.id === claim.id ? { ...c, status } : c)));
    try {
      await updateClaim(claim.id, { status });
    } catch {
      load();
    }
  };

  const remove = async (claim) => {
    setClaims((cs) => cs.filter((c) => c.id !== claim.id));
    try {
      await deleteClaim(claim.id);
    } catch {
      load();
    }
  };

  const visible = claims.filter((c) => (filter === 'all' ? true : filter === 'open' ? (c.status === 'open' || c.status === 'under_review') : (c.status === 'resolved' || c.status === 'rejected')));
  const propById = Object.fromEntries(properties.map((p) => [p.id, p]));
  const openTotal = claims.filter((c) => c.status === 'open' || c.status === 'under_review').reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><ShieldAlert size={20} />{isAr ? 'مركز المطالبات' : 'Claims Center'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'متابعة مطالبات الأضرار والإيجار غير المسدد ونزاعات التأمين ضد المستأجرين.' : 'Track damage, unpaid-rent and deposit-dispute claims against tenants.'}
        </p>
      </div>

      <div className="rounded-xl border bg-primary/5 border-primary/30 p-4">
        <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي المطالبات المفتوحة' : 'Total open claims'}</p>
        <p className="text-lg font-bold tabular-nums" dir="ltr">{formatMoney(openTotal, lang)}</p>
      </div>

      <form onSubmit={addClaim} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <select value={claimType} onChange={(e) => setClaimType(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{isAr ? v.ar : v.en}</option>)}
        </select>
        {properties.length > 0 && (
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="">{isAr ? 'بدون عقار' : 'No property'}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.building} / {p.unit_number}</option>)}
          </select>
        )}
        <input
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          placeholder={isAr ? 'اسم المستأجر' : 'Tenant name'}
          className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={isAr ? 'المبلغ' : 'Amount'}
          className="min-h-[40px] w-28 rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={isAr ? 'وصف المطالبة...' : 'Claim description...'}
          className="min-h-[40px] flex-1 min-w-[200px] rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={saving || !description.trim() || !amount} className="min-h-[40px] gap-1">
          <Plus size={15} />{isAr ? 'إضافة' : 'Add'}
        </Button>
      </form>

      <div className="flex gap-2">
        {['open', 'closed', 'all'].map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1.5 text-xs font-medium min-h-[32px] ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-card'}`}>
            {f === 'open' ? (isAr ? 'مفتوحة' : 'Open') : f === 'closed' ? (isAr ? 'مغلقة' : 'Closed') : (isAr ? 'الكل' : 'All')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={18} /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">{isAr ? 'لا توجد مطالبات.' : 'No claims.'}</div>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card px-4 py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {isAr ? TYPE_LABEL[c.claim_type]?.ar : TYPE_LABEL[c.claim_type]?.en}
                    {c.tenant_name ? ` — ${c.tenant_name}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{c.description}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                    <span>{formatDate(c.created, lang)}</span>
                    {c.property && propById[c.property] && <span className="flex items-center gap-1"><Building2 size={11} />{propById[c.property].building}</span>}
                  </p>
                </div>
                <div className="font-bold tabular-nums shrink-0" dir="ltr">{formatMoney(c.amount, lang)}</div>
                <button type="button" onClick={() => remove(c)} className="shrink-0 text-muted-foreground hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
              <select
                value={c.status}
                onChange={(e) => setStatus(c, e.target.value)}
                className="min-h-[32px] rounded-lg border bg-background px-2 py-1 text-xs"
              >
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{isAr ? v.ar : v.en}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
