import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, History } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getPropertyTimeline } from '@/lib/ownerFeaturesClient';
import { formatDateTime } from '@/lib/dateFormat';
import FeatureLockedNotice from './FeatureLockedNotice';

const ACTION_LABELS = {
  property_created: { ar: 'تم إنشاء العقار', en: 'Property created' },
  property_approved: { ar: 'تمت الموافقة على العقار', en: 'Property approved' },
  property_rejected: { ar: 'تم رفض العقار', en: 'Property rejected' },
  property_suspended: { ar: 'تم تعليق العقار', en: 'Property suspended' },
  property_resubmitted: { ar: 'أُعيد تقديم العقار', en: 'Property resubmitted' },
  property_deleted: { ar: 'تم حذف العقار', en: 'Property deleted' },
  property_updated: { ar: 'تم تعديل العقار', en: 'Property updated' },
  payment_marked_paid: { ar: 'تم تسجيل دفعة كمدفوعة', en: 'A payment was marked paid' },
  expense_recorded: { ar: 'تم تسجيل مصروف', en: 'An expense was recorded' },
  expense_updated: { ar: 'تم تعديل مصروف', en: 'An expense was updated' },
};

// Task #17 — Property Timeline. Reads the pre-existing `activity_logs`
// collection (already written to by platform.pb.js for property/payment
// lifecycle events, plus this task's new expense_recorded/expense_updated
// writer) — no separate log table.
export default function PropertyTimelinePanel({ propertyId, property } = {}) {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError('');
    try {
      setData(await getPropertyTimeline(propertyId));
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل السجل' : 'Could not load the timeline')));
    } finally {
      setLoading(false);
    }
  }, [propertyId, isAr]);

  const available = isAvailable('property_timeline');
  useEffect(() => {
    if (!gateLoading && available && propertyId) load();
  }, [gateLoading, available, propertyId, load]);

  if (gateLoading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={18} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'الخط الزمني للعقار' : 'Property Timeline'}
        reason={features.property_timeline?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }
  if (!propertyId) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold flex items-center gap-1.5"><History size={15} />{isAr ? 'الخط الزمني للعقار' : 'Property Timeline'}{property ? ` — ${property.building}/${property.unit_number}` : ''}</h3>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin" size={16} /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data || data.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{isAr ? 'لا توجد أحداث مسجّلة بعد.' : 'No recorded events yet.'}</p>
      ) : (
        <ol className="relative ms-3 border-s-2 border-border space-y-4 py-1">
          {data.events.map((ev, i) => (
            <li key={i} className="ps-4 relative">
              <span className="absolute -start-[9px] top-1 h-3.5 w-3.5 rounded-full bg-primary border-2 border-background" />
              <p className="text-sm font-medium">{isAr ? ACTION_LABELS[ev.action]?.ar : ACTION_LABELS[ev.action]?.en || ev.action}</p>
              {ev.details && <p className="text-xs text-muted-foreground">{ev.details}</p>}
              <p className="text-[11px] text-muted-foreground/80" dir="ltr">{formatDateTime(ev.created, lang)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
