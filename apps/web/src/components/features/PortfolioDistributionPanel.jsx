import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, FolderTree } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getPortfolioDistribution } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

function Group({ title, data, lang }) {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v.count, 0);
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      <div className="space-y-1.5">
        {entries.map(([key, v]) => {
          const pct = total > 0 ? Math.round((v.count / total) * 1000) / 10 : 0;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="capitalize">{key}</span>
                <span className="text-muted-foreground" dir="ltr">{v.count} · {pct}% · {formatMoney(v.value, lang)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-accent/50 overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Feature Management batch — Portfolio Distribution. Pure grouping of your
// own properties by usage type / payment type / country, computed
// server-side in task-portfolio-distribution.pb.js — value figures use the
// same cost/equity basis as Portfolio Net Worth (never a market valuation).
export default function PortfolioDistributionPanel() {
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
      setData(await getPortfolioDistribution());
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const available = isAvailable('portfolio_distribution');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'توزيع المحفظة' : 'Portfolio Distribution'}
        reason={features.portfolio_distribution?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><FolderTree size={20} />{isAr ? 'توزيع المحفظة' : 'Portfolio Distribution'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'كيف تتوزّع عقاراتك حسب نوع الاستخدام ونوع الدفع والدولة.' : 'How your properties break down by usage type, payment type, and country.'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data || data.totalProperties === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          {isAr ? 'لا توجد عقارات معتمدة بعد.' : 'No approved properties yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Group title={isAr ? 'حسب نوع الاستخدام' : 'By usage type'} data={data.byUsageType} lang={lang} />
          <Group title={isAr ? 'حسب نوع الدفع' : 'By payment type'} data={data.byPaymentType} lang={lang} />
          <Group title={isAr ? 'حسب الدولة' : 'By country'} data={data.byCountry} lang={lang} />
          <Group title={isAr ? 'حسب الحالة' : 'By status'} data={data.byStatus} lang={lang} />
        </div>
      )}
    </div>
  );
}
