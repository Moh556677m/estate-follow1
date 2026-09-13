import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, UserCheck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getTenantScore } from '@/lib/ownerFeaturesClient';
import FeatureLockedNotice from './FeatureLockedNotice';

// Feature Management batch — Tenant Score. Real per-tenant 0-100 reliability
// score computed server-side in task-tenant-score.pb.js from actual
// rent_payments/tenancies rows — this panel only renders what the server
// already calculated, plus the plain-language reasons it returns.
export default function TenantScorePanel({ propertyId } = {}) {
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
      const res = await getTenantScore({ propertyId });
      setData(res);
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [propertyId, isAr]);

  const available = isAvailable('tenant_score');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  }
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'مؤشر تقييم المستأجر' : 'Tenant Score'}
        reason={features.tenant_score?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{isAr ? 'مؤشر تقييم المستأجر' : 'Tenant Score'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? 'درجة موثوقية من 0 إلى 100 لكل مستأجر، مبنية على تاريخ دفعات الإيجار الفعلي واكتمال العقود.'
            : 'A 0-100 reliability score per tenant, built from real rent-payment history and lease completion.'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data || data.tenants.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          {isAr ? 'لا يوجد مستأجرون بعد.' : 'No tenants yet.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <SummaryTile label={isAr ? 'متوسط المؤشر' : 'Average score'} value={String(data.averageScore)} highlight />
            <SummaryTile label={isAr ? 'موثوقون' : 'Reliable'} value={String(data.counts.reliable || 0)} tone="emerald" />
            <SummaryTile label={isAr ? 'يحتاجون متابعة' : 'Watch'} value={String(data.counts.watch || 0)} tone="amber" />
            <SummaryTile label={isAr ? 'مخاطرة' : 'Risky'} value={String(data.counts.risky || 0)} tone="red" />
          </div>
          <div className="space-y-2.5">
            {data.tenants.map((t) => (
              <div key={t.tenantId} className="rounded-xl border bg-card px-4 py-3 shadow-sm space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[160px]">
                    <p className="font-semibold text-sm">{t.name}</p>
                    {t.phone && <p className="text-xs text-muted-foreground" dir="ltr">{t.phone}</p>}
                  </div>
                  <div className={`flex items-center gap-1.5 font-bold tabular-nums ${bucketColor(t.bucket)}`} dir="ltr">
                    <UserCheck size={16} />
                    {t.score}/100
                  </div>
                </div>
                {(isAr ? t.reasons_ar : t.reasons).length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc ps-4 space-y-0.5">
                    {(isAr ? t.reasons_ar : t.reasons).map((r, i) => <li key={i}>{r}</li>)}
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
  if (bucket === 'reliable') return 'text-emerald-600';
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
