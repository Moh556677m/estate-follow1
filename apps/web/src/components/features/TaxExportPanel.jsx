import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, FileDown, Globe2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { fetchTaxExportCsv, getTaxSummary } from '@/lib/ownerFeaturesClient';
import { notify } from '@/lib/notify';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #18 — Tax / Accounting Export. Downloads a REAL CSV of the owner's
// own income (paid rent/installments, now from BOTH the legacy `payments`
// collection AND the current rental flow's `rent_payments` checks — the
// same gap already found and fixed for the Property Calendar was still
// open here and is closed the same way) and expenses for a chosen year,
// assembled server-side (GET /ef/features/tax-export) — never a
// client-side re-derivation.
//
// Feature Management batch — feature #14 "Tax / Country Accounting
// Center" extends this SAME feature (no new feature_entitlements row, per
// Mohamed's explicit confirmation) with a per-country breakdown, for
// owners with properties in more than one country.
export default function TaxExportPanel() {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [year, setYear] = useState(new Date().getFullYear());
  const [downloading, setDownloading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return [now, now - 1, now - 2, now - 3, now - 4];
  }, []);

  const available = isAvailable('tax_accounting_export');

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      setSummary(await getTaxSummary({ year }));
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [year]);

  useEffect(() => {
    if (!gateLoading && available) loadSummary();
  }, [gateLoading, available, loadSummary]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'تصدير ضريبي / محاسبي' : 'Tax / Accounting Export'}
        reason={features.tax_accounting_export?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const download = async () => {
    setDownloading(true);
    try {
      const csv = await fetchTaxExportCsv(year);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-export-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify.error(isAr ? 'تعذر التصدير' : 'Could not export', String(err?.message || ''));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><FileDown size={18} />{isAr ? 'تصدير ضريبي / محاسبي' : 'Tax / Accounting Export'}</h2>
        <p className="text-sm text-muted-foreground">{isAr ? 'ملف CSV حقيقي بكل الدخل والمصاريف لسنة محددة، جاهز لمحاسبك.' : 'A real CSV of all income and expenses for a chosen year, ready for your accountant.'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Button onClick={download} disabled={downloading} className="min-h-[40px] gap-2">
          {downloading ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
          {isAr ? 'تنزيل CSV' : 'Download CSV'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr ? 'يشمل الملف: نوع الحركة (دخل/مصروف)، الفئة، العقار، الدولة، التاريخ، المبلغ، العملة.' : 'The file includes: type (income/expense), category, property, country, date, amount, currency.'}
      </p>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Globe2 size={16} />{isAr ? 'تفصيل حسب الدولة' : 'Breakdown by country'}</h3>
        {summaryLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin" size={16} /></div>
        ) : !summary || Object.keys(summary.byCountry || {}).length === 0 ? (
          <p className="text-sm text-muted-foreground">{isAr ? 'لا توجد بيانات لهذه السنة.' : 'No data for this year.'}</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(summary.byCountry).map(([country, v]) => (
              <div key={country} className="flex items-center justify-between text-sm rounded-lg border px-3 py-2">
                <span className="font-medium">{country}</span>
                <span className="text-muted-foreground text-xs flex gap-3" dir="ltr">
                  <span>{isAr ? 'دخل' : 'Income'} {formatMoney(v.income, lang)}</span>
                  <span>{isAr ? 'مصاريف' : 'Expenses'} {formatMoney(v.expenses, lang)}</span>
                  <span className={v.net >= 0 ? 'text-emerald-600 font-semibold' : 'text-destructive font-semibold'}>{isAr ? 'صافي' : 'Net'} {formatMoney(v.net, lang)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
