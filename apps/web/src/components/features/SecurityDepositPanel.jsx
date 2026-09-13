import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getSecurityDeposits, updateSecurityDeposit } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import { notify } from '@/lib/notify';
import FeatureLockedNotice from './FeatureLockedNotice';

const STATUS_LABEL = {
  held: { en: 'Held', ar: 'محتجز' },
  partially_returned: { en: 'Partially returned', ar: 'مسترد جزئيًا' },
  returned: { en: 'Returned', ar: 'مسترد بالكامل' },
  forfeited: { en: 'Forfeited', ar: 'مصادَر' },
};

// Feature Management batch — Security Deposit Management. Reads the summary
// from task-security-deposits.pb.js; edits (status/returned amount/return
// date/notes) write straight to the tenancies record via
// updateSecurityDeposit() — the owner already owns that row.
export default function SecurityDepositPanel() {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSecurityDeposits();
      setData(res);
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const available = isAvailable('security_deposit_management');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  const draftFor = (row) => drafts[row.tenancyId] || {
    status: row.status,
    returnedAmount: row.returnedAmount,
    returnDate: row.returnDate ? String(row.returnDate).slice(0, 10) : '',
    notes: row.notes,
  };

  const setDraft = (tenancyId, patch) => {
    setDrafts((prev) => ({ ...prev, [tenancyId]: { ...draftFor({ tenancyId, ...prev[tenancyId] }), ...prev[tenancyId], ...patch } }));
  };

  const save = async (row) => {
    const draft = draftFor(row);
    setSavingId(row.tenancyId);
    try {
      await updateSecurityDeposit(row.tenancyId, {
        deposit_status: draft.status,
        deposit_returned_amount: Number(draft.returnedAmount) || 0,
        deposit_return_date: draft.returnDate || null,
        deposit_deduction_notes: draft.notes || '',
      });
      notify.success(isAr ? 'تم الحفظ' : 'Saved', row.building ? `${row.building} / ${row.unit_number}` : '');
      await load();
    } catch (err) {
      notify.error(isAr ? 'تعذر الحفظ' : 'Could not save', String(err?.message || ''));
    } finally {
      setSavingId(null);
    }
  };

  if (gateLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  }
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'إدارة التأمين (الوديعة)' : 'Security Deposit Management'}
        reason={features.security_deposit_management?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Wallet size={20} />{isAr ? 'إدارة التأمين (الوديعة)' : 'Security Deposit Management'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'متابعة تأمين كل عقد إيجار: محتجز، مسترد، أو مصادَر.' : 'Track every lease\'s deposit: held, returned, or forfeited.'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data || data.deposits.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          {isAr ? 'لا توجد تأمينات مسجّلة بعد.' : 'No deposits recorded yet.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryTile label={isAr ? 'إجمالي التأمينات' : 'Total deposits'} value={formatMoney(data.totals.totalDeposits, lang)} />
            <SummaryTile label={isAr ? 'إجمالي المسترد' : 'Total returned'} value={formatMoney(data.totals.totalReturned, lang)} />
            <SummaryTile label={isAr ? 'المتبقي المستحق' : 'Outstanding'} value={formatMoney(data.totals.totalOutstanding, lang)} highlight />
          </div>
          <div className="space-y-2.5">
            {data.deposits.map((row) => {
              const draft = draftFor(row);
              return (
                <div key={row.tenancyId} className="rounded-xl border bg-card px-4 py-3 shadow-sm space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-[160px]">
                      <p className="font-semibold text-sm">{row.building} / {row.unit_number}</p>
                      <p className="text-xs text-muted-foreground">{row.tenantName}</p>
                    </div>
                    <div className="font-bold tabular-nums" dir="ltr">{formatMoney(row.deposit, lang)}</div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <select
                      value={draft.status}
                      onChange={(ev) => setDraft(row.tenancyId, { status: ev.target.value })}
                      className="min-h-[36px] rounded-lg border bg-background px-2 py-1.5 text-xs"
                    >
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{isAr ? v.ar : v.en}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={draft.returnedAmount}
                      onChange={(ev) => setDraft(row.tenancyId, { returnedAmount: ev.target.value })}
                      placeholder={isAr ? 'المبلغ المسترد' : 'Returned amount'}
                      className="min-h-[36px] w-32 rounded-lg border bg-background px-2 py-1.5 text-xs"
                    />
                    <input
                      type="date"
                      value={draft.returnDate}
                      onChange={(ev) => setDraft(row.tenancyId, { returnDate: ev.target.value })}
                      className="min-h-[36px] rounded-lg border bg-background px-2 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      value={draft.notes}
                      onChange={(ev) => setDraft(row.tenancyId, { notes: ev.target.value })}
                      placeholder={isAr ? 'ملاحظات الخصم' : 'Deduction notes'}
                      className="min-h-[36px] flex-1 min-w-[160px] rounded-lg border bg-background px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => save(row)}
                      disabled={savingId === row.tenancyId}
                      className="min-h-[36px] rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {savingId === row.tenancyId ? <Loader2 className="animate-spin" size={14} /> : (isAr ? 'حفظ' : 'Save')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, highlight }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-primary/5 border-primary/30' : 'bg-card'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums" dir="ltr">{value}</p>
    </div>
  );
}
