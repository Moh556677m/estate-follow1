import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, CreditCard } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getLtv } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

function bucketColor(bucket) {
  if (bucket === 'healthy') return 'text-emerald-600';
  if (bucket === 'moderate') return 'text-amber-600';
  if (bucket === 'high') return 'text-red-600';
  return 'text-muted-foreground';
}

// Feature Management batch — LTV (Loan-to-Value). Outstanding installment
// balance as a % of each property's recorded total price — a cost basis,
// same as Portfolio Net Worth, never a market valuation.
export default function LtvPanel() {
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
      setData(await getLtv());
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const available = isAvailable('ltv_ratio');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'نسبة القرض إلى القيمة (LTV)' : 'Loan-to-Value (LTV)'}
        reason={features.ltv_ratio?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><CreditCard size={20} />{isAr ? 'نسبة القرض إلى القيمة (LTV)' : 'Loan-to-Value (LTV)'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'الرصيد المتبقي من الأقساط كنسبة من السعر الإجمالي، لكل عقار بالتقسيط.' : 'Outstanding installment balance as a percentage of total price, for each installment property.'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data || data.properties.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          {isAr ? 'لا توجد عقارات بالتقسيط بعد.' : 'No installment properties yet.'}
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-primary/5 border-primary/30 p-4">
            <p className="text-xs text-muted-foreground">{isAr ? 'متوسط المحفظة المرجّح' : 'Weighted portfolio average'}</p>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{data.portfolioLtvPct != null ? `${data.portfolioLtvPct}%` : '—'}</p>
          </div>
          <div className="space-y-2">
            {data.properties.map((p) => (
              <div key={p.propertyId} className="rounded-xl border bg-card px-4 py-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-sm">{p.building} / {p.unit_number}</p>
                  <div className={`font-bold tabular-nums ${bucketColor(p.bucket)}`} dir="ltr">
                    {p.ltvPct != null ? `${p.ltvPct}%` : (isAr ? 'غير معروف' : 'Unknown')}
                  </div>
                </div>
                {p.hasPrice && (
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {isAr ? 'المتبقي' : 'Outstanding'}: {formatMoney(p.outstanding, lang)} / {formatMoney(p.totalPrice, lang)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
