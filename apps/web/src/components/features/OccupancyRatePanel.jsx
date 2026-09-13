import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, KeyRound } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getOccupancy } from '@/lib/ownerFeaturesClient';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #17 — Occupancy Rate. Current rate + a REAL historical trend read
// from the owner's own stored monthly_reports snapshots (Task #12) —
// never a fabricated trend line.
export default function OccupancyRatePanel() {
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
      setData(await getOccupancy());
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const available = isAvailable('occupancy_rate');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'معدل الإشغال' : 'Occupancy Rate'}
        reason={features.occupancy_rate?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">{isAr ? 'معدل الإشغال' : 'Occupancy Rate'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-primary/5 border-primary/30 p-4 text-center">
          <p className="text-3xl font-black tabular-nums text-primary" dir="ltr">{data.rate}%</p>
          <p className="text-xs text-muted-foreground mt-1">{isAr ? 'معدل الإشغال الحالي' : 'Current occupancy'}</p>
        </div>
        <Tile label={isAr ? 'إجمالي العقارات' : 'Total properties'} value={data.total} />
        <Tile label={isAr ? 'مؤجرة' : 'Rented'} value={data.rented} icon={KeyRound} />
        <Tile label={isAr ? 'شاغرة' : 'Vacant'} value={data.vacant} />
      </div>

      {data.history?.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">{isAr ? 'الاتجاه التاريخي (من التقارير الشهرية)' : 'Historical trend (from monthly reports)'}</p>
          <div className="space-y-2">
            {data.history.map((h) => (
              <div key={h.period} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-muted-foreground" dir="ltr">{h.period}</span>
                <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${h.rate}%` }} />
                </div>
                <span className="w-12 shrink-0 text-xs font-semibold tabular-nums" dir="ltr">{h.rate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <p className="text-2xl font-bold tabular-nums" dir="ltr">{value}</p>
      <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">{Icon && <Icon size={12} />}{label}</p>
    </div>
  );
}
