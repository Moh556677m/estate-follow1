import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, History } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getLifetimeReturn } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

function Tile({ label, value, tone }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${tone || ''}`} dir="ltr">{value}</p>
    </div>
  );
}

// Feature Management batch — Lifetime Return. Net Property Profit
// generalized to "since acquisition" (all-time), reading BOTH income
// sources this codebase has (legacy `payments` + current `rent_payments`
// checks — the same gap already found and fixed for the Property Calendar
// in task #8). ROI% is against the same cost/equity basis used by
// Portfolio Net Worth / LTV — never a market valuation.
export default function LifetimeReturnPanel() {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getLifetimeReturn());
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const available = isAvailable('lifetime_return');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'العائد مدى الحياة' : 'Lifetime Return'}
        reason={features.lifetime_return?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><History size={20} />{isAr ? 'العائد مدى الحياة' : 'Lifetime Return'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'صافي التدفق النقدي منذ شراء كل عقار، ونسبة العائد النقدي مقابل تكلفة الشراء المسجّلة.' : 'Net cash generated since each property was acquired, and a cash-on-cash return % against the recorded purchase cost.'}
        </p>
        <p className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {isAr
            ? 'هذه النسبة مبنية على تكلفة الشراء المسجّلة وليست تقييمًا للسوق.'
            : 'This return is based on the recorded purchase cost, not a market valuation.'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data || data.properties.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          {isAr ? 'لا توجد عقارات معتمدة بعد.' : 'No approved properties yet.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label={isAr ? 'إجمالي الإيجار المحصّل' : 'Total rent collected'} value={formatMoney(data.totals.rentIncome, lang)} />
            <Tile label={isAr ? 'إجمالي الأقساط المدفوعة' : 'Total installments paid'} value={formatMoney(data.totals.installmentsPaid, lang)} />
            <Tile label={isAr ? 'إجمالي المصروفات' : 'Total expenses'} value={formatMoney(data.totals.expenses, lang)} />
            <Tile
              label={isAr ? 'صافي التدفق النقدي' : 'Net cash flow'}
              value={formatMoney(data.totals.netCashFlow, lang)}
              tone={data.totals.netCashFlow >= 0 ? 'text-emerald-600' : 'text-destructive'}
            />
          </div>
          {data.portfolioRoiPct !== null && (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{isAr ? 'عائد المحفظة الإجمالي' : 'Portfolio-wide return'}</p>
              <p className={`text-2xl font-bold ${data.portfolioRoiPct >= 0 ? 'text-emerald-600' : 'text-destructive'}`} dir="ltr">
                {data.portfolioRoiPct}%
              </p>
            </div>
          )}

          <div className="rounded-xl border bg-card divide-y">
            {data.properties.map((p) => (
              <div key={p.propertyId} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.building}{p.unit_number ? ` · ${p.unit_number}` : ''}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {isAr ? 'إيجار' : 'Rent'} {formatMoney(p.rentIncome, lang)} · {isAr ? 'أقساط' : 'Installments'} {formatMoney(p.installmentsPaid, lang)} · {isAr ? 'مصروفات' : 'Expenses'} {formatMoney(p.expenses, lang)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${p.netCashFlow >= 0 ? 'text-emerald-600' : 'text-destructive'}`} dir="ltr">
                    {formatMoney(p.netCashFlow, lang)}
                  </p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {p.roiPct !== null ? `${p.roiPct}% ${isAr ? 'عائد' : 'ROI'}` : (isAr ? 'لا سعر مسجّل' : 'No price recorded')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
