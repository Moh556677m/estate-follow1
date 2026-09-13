import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getCashFlowForecast } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #17 — Cash Flow Forecast. Deliberately NOT a predictive model: it
// totals ALREADY-SCHEDULED upcoming/overdue `payments` rows by month, per
// the server route's own doc comment. Never invents a number.
export default function CashFlowForecastPanel() {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [months, setMonths] = useState(6);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getCashFlowForecast({ months });
      setData(res);
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [months, isAr]);

  const available = isAvailable('cash_flow_forecast');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'توقع التدفق النقدي' : 'Cash Flow Forecast'}
        reason={features.cash_flow_forecast?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const maxTotal = data ? Math.max(1, ...data.months.map((m) => m.total)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{isAr ? 'توقع التدفق النقدي' : 'Cash Flow Forecast'}</h2>
          <p className="text-sm text-muted-foreground">
            {isAr ? 'مجاميع المدفوعات المجدولة فعليًا (أقساط وإيجارات) حسب الشهر — ليس نموذج تنبؤ.' : 'Real, already-scheduled payment totals (installments + rent) by month — not a predictive model.'}
          </p>
        </div>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="min-h-[40px] rounded-lg border bg-card px-3 py-2 text-sm">
          {[3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} {isAr ? 'أشهر' : 'months'}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div className="space-y-2.5">
          {data.months.map((m) => (
            <div key={m.month} className="rounded-xl border bg-card px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold" dir="ltr">{m.month}</span>
                <span className="font-bold tabular-nums" dir="ltr">{formatMoney(m.total, lang)}</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((m.total / maxTotal) * 100)}%` }} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{isAr ? 'أقساط' : 'Installments'}: {formatMoney(m.installments, lang)}</span>
                <span>{isAr ? 'إيجار' : 'Rent'}: {formatMoney(m.rent, lang)}</span>
                {m.overdue > 0 && <span className="text-red-600">{isAr ? 'متأخر' : 'Overdue'}: {formatMoney(m.overdue, lang)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
