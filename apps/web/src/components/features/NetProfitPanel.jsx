import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getNetProfit } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #17 — Net Property Profit. Real per-property net profit (rent income
// minus expenses minus installments paid), computed server-side in
// task17-features.pb.js from actual `payments`/`owner_expenses` rows — this
// panel only renders what the server already calculated.
export default function NetProfitPanel({ propertyIds } = {}) {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getNetProfit({ year, propertyIds });
      setData(res);
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, JSON.stringify(propertyIds || [])]);

  const available = isAvailable('net_property_profit');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return [now, now - 1, now - 2, now - 3];
  }, []);

  if (gateLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  }
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'صافي ربح العقار' : 'Net Property Profit'}
        reason={features.net_property_profit?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{isAr ? 'صافي ربح العقار' : 'Net Property Profit'}</h2>
          <p className="text-sm text-muted-foreground">
            {isAr ? 'دخل الإيجار ناقص المصاريف ناقص الأقساط المسددة لكل عقار.' : 'Rent income minus expenses minus paid installments, per property.'}
          </p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="min-h-[40px] rounded-lg border bg-card px-3 py-2 text-sm"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryTile label={isAr ? 'إجمالي الدخل' : 'Total income'} value={formatMoney(data.totals.rentIncome, lang)} positive />
            <SummaryTile label={isAr ? 'إجمالي المصاريف والأقساط' : 'Total expenses + installments'} value={formatMoney(data.totals.expenses + data.totals.installmentsPaid, lang)} />
            <SummaryTile label={isAr ? 'صافي الربح' : 'Net profit'} value={formatMoney(data.totals.netProfit, lang)} positive={data.totals.netProfit >= 0} highlight />
          </div>
          <div className="space-y-2.5">
            {data.properties.map((p) => (
              <div key={p.propertyId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
                <div className="min-w-[160px]">
                  <p className="font-semibold text-sm">{p.building} / {p.unit_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? 'دخل' : 'Income'} {formatMoney(p.rentIncome, lang)} · {isAr ? 'مصاريف' : 'Exp.'} {formatMoney(p.expenses, lang)} · {isAr ? 'أقساط' : 'Inst.'} {formatMoney(p.installmentsPaid, lang)}
                  </p>
                </div>
                <div className={`flex items-center gap-1.5 font-bold tabular-nums ${p.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} dir="ltr">
                  {p.netProfit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {formatMoney(p.netProfit, lang)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, positive, highlight }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-primary/5 border-primary/30' : 'bg-card'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${highlight ? (positive ? 'text-emerald-600' : 'text-red-600') : ''}`} dir="ltr">{value}</p>
    </div>
  );
}
