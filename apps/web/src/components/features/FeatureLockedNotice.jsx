import React from 'react';
import { Lock } from 'lucide-react';

// Task #17 — shared "this feature is not available to you right now" card.
// Extracted from MonthlyReportsPanel.jsx's gating pattern (the first real
// consumer of GET /ef/my-entitlements) so every one of the 11 new
// Central-Features panels shows the exact same, already-reviewed UI instead
// of 11 slightly different copies of the same card.
export const REASON_LABELS = {
  disabled_by_admin: { ar: 'هذه الميزة غير مفعّلة حاليًا.', en: 'This feature is currently disabled.' },
  account_type_not_eligible: { ar: 'نوع حسابك غير مؤهل لهذه الميزة.', en: 'Your account type is not eligible for this feature.' },
  plan_not_eligible: { ar: 'باقتك الحالية لا تشمل هذه الميزة.', en: 'Your current plan does not include this feature.' },
  min_property_count_not_met: { ar: 'تحتاج عددًا أكبر من العقارات لتفعيل هذه الميزة.', en: 'You need more properties to unlock this feature.' },
  not_included_in_plan: { ar: 'هذه الميزة غير مشمولة في باقتك الحالية.', en: 'This feature is not included in your current plan.' },
  feature_not_configured: { ar: 'هذه الميزة غير متاحة بعد.', en: 'This feature is not available yet.' },
  unauthorized: { ar: 'يجب تسجيل الدخول لاستخدام هذه الميزة.', en: 'You must be signed in to use this feature.' },
};

export function reasonLabel(reason, isAr) {
  const entry = REASON_LABELS[reason];
  if (entry) return isAr ? entry.ar : entry.en;
  return isAr ? 'هذه الميزة غير متاحة لحسابك حاليًا.' : 'This feature is not available for your account right now.';
}

export default function FeatureLockedNotice({ title, reason, isAr, onUpgrade }) {
  return (
    <div className="rounded-2xl border bg-card p-8 text-center space-y-3 max-w-md mx-auto mt-8">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock size={22} />
      </span>
      {title && <p className="font-bold">{title}</p>}
      <p className="text-sm text-muted-foreground">{reasonLabel(reason, isAr)}</p>
      {onUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 min-h-[40px]"
        >
          {isAr ? 'الترقية / الاشتراك' : 'Upgrade / Subscribe'}
        </button>
      )}
    </div>
  );
}
