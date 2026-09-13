import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Banknote, Info } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getPortfolioNetWorth } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

// Feature Management batch — Portfolio Net Worth. IMPORTANT: this is a
// cost/equity basis (purchase price + amount actually paid) — this repo has
// no market-valuation/appraisal data source, so it is never shown as a
// live market value. task-networth-ltv.pb.js's `basis` field makes this
// explicit and this panel always discloses it.
export default function PortfolioNetWorthPanel() {
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
      setData(await getPortfolioNetWorth());
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const available = isAvailable('portfolio_net_worth');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'صافي ثروة المحفظة' : 'Portfolio Net Worth'}
        reason={features.portfolio_net_worth?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Banknote size={20} />{isAr ? 'صافي ثروة المحفظة' : 'Portfolio Net Worth'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'إجمالي حقوق الملكية عبر محفظتك، على أساس سعر الشراء والمبلغ المسدد فعليًا.' : 'Total equity across your portfolio, based on purchase price and amount actually paid.'}
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>
          {isAr
            ? 'هذا أساس تكلفة/حقوق ملكية من السعر المسجّل — وليس تقييم سوق حي (لا يوجد مصدر تقييم عقاري متصل).'
            : 'This is a cost/equity basis from the recorded price — not a live market valuation (no appraisal source is connected).'}
        </span>
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
          <div className="rounded-xl border bg-primary/5 border-primary/30 p-4">
            <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي صافي الثروة' : 'Total net worth'}</p>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{formatMoney(data.totalNetWorth, lang)}</p>
            {data.unknownPriceCount > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                {isAr
                  ? `${data.unknownPriceCount} عقار بدون سعر مسجّل — تم استبعاده من الإجمالي`
                  : `${data.unknownPriceCount} propert${data.unknownPriceCount > 1 ? 'ies' : 'y'} without a recorded price — excluded from the total`}
              </p>
            )}
          </div>

          {Object.keys(data.byCountry || {}).length > 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(data.byCountry).map(([country, amount]) => (
                <div key={country} className="rounded-xl border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{country}</p>
                  <p className="text-sm font-bold tabular-nums" dir="ltr">{formatMoney(amount, lang)}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {data.properties.map((p) => (
              <div key={p.propertyId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
                <p className="font-semibold text-sm">{p.building} / {p.unit_number}</p>
                {p.hasPrice ? (
                  <div className="font-bold tabular-nums" dir="ltr">{formatMoney(p.equity, lang)}</div>
                ) : (
                  <span className="text-xs text-muted-foreground">{isAr ? 'لا يوجد سعر مسجّل' : 'No price recorded'}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
