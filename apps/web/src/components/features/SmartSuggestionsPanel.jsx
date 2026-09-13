import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Lightbulb, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getMonthlySuggestions } from '@/lib/ownerFeaturesClient';
import FeatureLockedNotice from './FeatureLockedNotice';

const SEVERITY_STYLE = {
  high: { border: 'border-red-300/60', bg: 'bg-red-50 dark:bg-red-950/20', icon: AlertTriangle, iconColor: 'text-red-600' },
  medium: { border: 'border-amber-300/60', bg: 'bg-amber-50 dark:bg-amber-950/20', icon: AlertTriangle, iconColor: 'text-amber-600' },
  low: { border: 'border-blue-300/60', bg: 'bg-blue-50 dark:bg-blue-950/20', icon: Info, iconColor: 'text-blue-600' },
};

// Feature Management batch — Smart Monthly Suggestions (feature #13). Per
// Mohamed's explicit clarification: suggestions computed from the owner's
// OWN recorded data (see task-smart-suggestions.pb.js) — never AI-
// generated text, so `basis: 'computed_from_your_data'` is always
// disclosed rather than implying any AI involvement.
export default function SmartSuggestionsPanel() {
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
      setData(await getMonthlySuggestions());
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const available = isAvailable('smart_monthly_suggestions');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'الاقتراحات الشهرية الذكية' : 'Smart Monthly Suggestions'}
        reason={features.smart_monthly_suggestions?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Lightbulb size={20} />{isAr ? 'الاقتراحات الشهرية الذكية' : 'Smart Monthly Suggestions'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'اقتراحات مبنية بالكامل على بياناتك الفعلية المسجّلة — وليست نصًا مولّدًا بالذكاء الاصطناعي.' : 'Suggestions computed entirely from your own recorded data — not AI-generated text.'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={18} /></div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data || data.suggestions.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          {isAr ? 'لا توجد اقتراحات حاليًا — كل شيء يبدو بخير.' : 'No suggestions right now — everything looks fine.'}
        </div>
      ) : (
        <div className="space-y-2">
          {data.suggestions.map((s) => {
            const style = SEVERITY_STYLE[s.severity] || SEVERITY_STYLE.low;
            const Icon = style.icon;
            return (
              <div key={s.key} className={`rounded-xl border ${style.border} ${style.bg} p-4 flex items-start gap-3`}>
                <Icon size={18} className={`${style.iconColor} shrink-0 mt-0.5`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{isAr ? s.title_ar : s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{isAr ? s.detail_ar : s.detail}</p>
                </div>
                {s.route && (
                  <button
                    type="button"
                    onClick={() => navigate(s.route)}
                    className="shrink-0 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {isAr ? 'فتح' : 'Open'}<ChevronRight size={13} className={isAr ? 'rotate-180' : ''} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
