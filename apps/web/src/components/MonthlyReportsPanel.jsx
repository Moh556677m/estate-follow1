import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  Building2,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Loader2,
  Lock,
  Receipt,
  ScrollText,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { formatMoney } from '@/lib/api';
import { cn } from '@/lib/utils';

// Owner-facing "التقارير الشهرية" (Task #12). Each row in `monthly_reports`
// is a FROZEN snapshot generated server-side (see
// apps/pocketbase/pb_hooks/lib-monthly-reports.js) — this panel only reads
// and displays it; it never re-derives or recalculates anything client-side,
// so what an owner sees here always matches exactly what was generated and
// emailed for that month.
//
// Gated by the `monthly_property_reports` feature entitlement (GET
// /ef/my-entitlements), the same mechanism already wired up in
// SubscriptionManagementPanel.jsx's generic Feature Entitlement editor — no
// new admin UI needed, only this consumer.

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-bold tabular-nums" dir="ltr">{value}</p>
      </div>
    </div>
  );
}

function ReportCard({ report, lang, isAr }) {
  const [open, setOpen] = useState(false);
  const money = (v) => formatMoney(v, lang);

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-start hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CalendarRange size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="font-bold" dir="ltr">{report.period}</p>
            <p className="text-xs text-muted-foreground">
              {isAr ? 'تم الإنشاء: ' : 'Generated: '}
              {report.generated_at ? new Date(report.generated_at).toLocaleDateString(isAr ? 'ar' : 'en-GB') : '—'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="shrink-0 text-muted-foreground" /> : <ChevronDown size={18} className="shrink-0 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <StatTile icon={Building2} label={isAr ? 'عقارات معتمدة' : 'Approved properties'} value={report.approved_count ?? 0} />
            <StatTile icon={KeyRound} label={isAr ? 'مؤجرة' : 'Rented'} value={report.rented_count ?? 0} />
            <StatTile icon={KeyRound} label={isAr ? 'شاغرة' : 'Vacant'} value={report.vacant_count ?? 0} />
            <StatTile icon={ScrollText} label={isAr ? 'عقود تنتهي هذا الشهر' : 'Contracts expiring this month'} value={report.expiring_contracts ?? 0} />
            <StatTile icon={TrendingUp} label={isAr ? 'الدخل الشهري' : 'Monthly income'} value={money(report.monthly_income)} />
            <StatTile icon={Receipt} label={isAr ? 'رسوم الخدمة السنوية' : 'Yearly service charges'} value={money(report.yearly_charges)} />
            <StatTile icon={Wallet} label={isAr ? 'أقساط هذا الشهر' : 'Installments this month'} value={money(report.monthly_installments)} />
            <StatTile icon={Wallet} label={isAr ? 'مدفوعات قادمة' : 'Upcoming payments'} value={report.upcoming_payments ?? 0} />
            <StatTile icon={Receipt} label={isAr ? 'مدفوعات متأخرة' : 'Overdue payments'} value={report.due_payments ?? 0} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {report.emailed
              ? (isAr ? 'تم إرسال هذا التقرير عبر البريد الإلكتروني.' : 'This report was emailed to you.')
              : (isAr ? 'لم يتم إرسال هذا التقرير بالبريد بعد.' : 'This report has not been emailed yet.')}
          </p>
        </div>
      )}
    </div>
  );
}

export default function MonthlyReportsPanel() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const isAr = lang === 'ar';

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [entitlement, setEntitlement] = useState(null); // { available, reason } | null while loading
  const [error, setError] = useState('');

  const loadEntitlement = useCallback(async () => {
    try {
      const res = await pb.send('/ef/my-entitlements', { method: 'GET' });
      const f = res?.features?.monthly_property_reports;
      setEntitlement(f ? { available: !!f.available, reason: f.reason || '' } : { available: false, reason: 'feature_not_configured' });
    } catch {
      setEntitlement({ available: false, reason: 'error' });
    }
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await pb.collection('monthly_reports').getFullList({ sort: '-period', requestKey: 'monthly-reports-mine' });
      setReports(rows);
    } catch (err) {
      setError(String(err?.message || (isAr ? 'حدث خطأ غير متوقع' : 'Something went wrong')));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => {
    loadEntitlement();
  }, [loadEntitlement]);

  useEffect(() => {
    if (entitlement?.available) loadReports();
    else setLoading(false);
  }, [entitlement, loadReports]);

  useRealtimeRefresh(loadReports, ['monthly_reports'], { enabled: !!entitlement?.available });

  const reasonLabel = useMemo(() => {
    const map = {
      disabled_by_admin: isAr ? 'هذه الميزة غير مفعّلة حاليًا.' : 'This feature is currently disabled.',
      account_type_not_eligible: isAr ? 'نوع حسابك غير مؤهل لهذه الميزة.' : 'Your account type is not eligible for this feature.',
      plan_not_eligible: isAr ? 'باقتك الحالية لا تشمل هذه الميزة.' : 'Your current plan does not include this feature.',
      min_property_count_not_met: isAr ? 'تحتاج عددًا أكبر من العقارات لتفعيل هذه الميزة.' : 'You need more properties to unlock this feature.',
      not_included_in_plan: isAr ? 'هذه الميزة غير مشمولة في باقتك الحالية.' : 'This feature is not included in your current plan.',
      feature_not_configured: isAr ? 'هذه الميزة غير متاحة بعد.' : 'This feature is not available yet.',
    };
    return map[entitlement?.reason] || (isAr ? 'هذه الميزة غير متاحة لحسابك حاليًا.' : 'This feature is not available for your account right now.');
  }, [entitlement, isAr]);

  if (loading && entitlement === null) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (entitlement && !entitlement.available) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center space-y-3 max-w-md mx-auto mt-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock size={22} />
        </span>
        <p className="font-bold">{isAr ? 'التقارير الشهرية غير متاحة' : 'Monthly Reports unavailable'}</p>
        <p className="text-sm text-muted-foreground">{reasonLabel}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{isAr ? 'التقارير الشهرية' : 'Monthly Reports'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? 'ملخص تلقائي لأداء محفظتك العقارية يُنشأ ويُرسل لبريدك في بداية كل شهر.'
            : 'An automatic summary of your property portfolio, generated and emailed at the start of every month.'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          {isAr
            ? 'لا توجد تقارير بعد. سيُنشأ أول تقرير في بداية الشهر القادم.'
            : 'No reports yet. Your first report will be generated at the start of next month.'}
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} lang={lang} isAr={isAr} />
          ))}
        </div>
      )}
    </div>
  );
}
