import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, HeartPulse } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getPropertyHealthScore } from '@/lib/ownerFeaturesClient';
import FeatureLockedNotice from './FeatureLockedNotice';

// Feature Management batch — Property Health Score. Real per-property 0-100
// score computed server-side in task-property-health.pb.js from actual
// payments/tenancies/owner_tasks rows — this panel only renders what the
// server already calculated, plus the plain-language reasons it returns.
export default function PropertyHealthScorePanel({ propertyIds } = {}) {
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
      const res = await getPropertyHealthScore({ propertyIds });
      setData(res);
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(propertyIds || [])]);

  const available = isAvailable('property_health_score');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  }
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'مؤشر صحة العقار' : 'Property Health Score'}
        reason={features.property_health_score?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{isAr ? 'مؤشر صحة العقار' : 'Property Health Score'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? 'درجة من 0 إلى 100 لكل عقار، مبنية على تاريخ الدفعات والإشغال والمهام المفتوحة الفعلية.'
            : 'A 0-100 score per property, built from real payment history, occupancy and open tasks.'}
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <SummaryTile label={isAr ? 'متوسط المؤشر' : 'Average score'} value={String(data.averageScore)} highlight />
            <SummaryTile label={isAr ? 'سليمة' : 'Healthy'} value={String(data.counts.healthy || 0)} tone="emerald" />
            <SummaryTile label={isAr ? 'تحتاج متابعة' : 'Watch'} value={String(data.counts.watch || 0)} tone="amber" />
            <SummaryTile label={isAr ? 'معرّضة للخطر' : 'At risk'} value={String(data.counts.at_risk || 0)} tone="red" />
          </div>
          <div className="space-y-2.5">
            {data.properties.map((p) => (
              <div key={p.propertyId} className="rounded-xl border bg-card px-4 py-3 shadow-sm space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[160px]">
                    <p className="font-semibold text-sm">{p.building} / {p.unit_number}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 font-bold tabular-nums ${bucketColor(p.bucket)}`} dir="ltr">
                    <HeartPulse size={16} />
                    {p.score}/100
                  </div>
                </div>
                {(isAr ? p.reasons_ar : p.reasons).length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc ps-4 space-y-0.5">
                    {(isAr ? p.reasons_ar : p.reasons).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function bucketColor(bucket) {
  if (bucket === 'healthy') return 'text-emerald-600';
  if (bucket === 'watch') return 'text-amber-600';
  return 'text-red-600';
}

function SummaryTile({ label, value, highlight, tone }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-red-600' : '';
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-primary/5 border-primary/30' : 'bg-card'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${toneClass}`} dir="ltr">{value}</p>
    </div>
  );
}
