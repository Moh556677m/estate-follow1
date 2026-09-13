import React, { useEffect, useState } from 'react';
import { Loader2, FileText, Download } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getPropertyStatement, fetchPropertyStatementCsv } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import { notify } from '@/lib/notify';
import FeatureLockedNotice from './FeatureLockedNotice';

function defaultFrom() {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

// Feature Management batch — Property Statements. An itemized income/
// expense statement for one property over a chosen date range, computed
// server-side in task-property-statements.pb.js from real payments/
// rent_payments/owner_expenses rows (both the legacy and current rental
// data sources — see that file's header comment).
export default function PropertyStatementsPanel({ properties = [] } = {}) {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [propertyId, setPropertyId] = useState('');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!propertyId && properties.length > 0) setPropertyId(properties[0].id);
  }, [properties, propertyId]);

  const available = isAvailable('property_statements');

  const generate = async () => {
    if (!propertyId) return;
    setLoading(true);
    setError('');
    try {
      setData(await getPropertyStatement({ propertyId, from, to }));
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر توليد الكشف' : 'Could not generate statement')));
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    if (!propertyId) return;
    setExporting(true);
    try {
      const csv = await fetchPropertyStatementCsv({ propertyId, from, to });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement-${propertyId}-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify.error(isAr ? 'تعذر التصدير' : 'Could not export', String(err?.message || ''));
    } finally {
      setExporting(false);
    }
  };

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'كشوف حساب العقار' : 'Property Statements'}
        reason={features.property_statements?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><FileText size={20} />{isAr ? 'كشوف حساب العقار' : 'Property Statements'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'كشف دخل ومصاريف مفصّل لعقار واحد خلال أي فترة تختارها.' : 'An itemized income/expense statement for one property over any date range.'}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
          {properties.map((p) => <option key={p.id} value={p.id}>{p.building} / {p.unit_number}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm" />
        <Button onClick={generate} disabled={!propertyId || loading} className="min-h-[40px]">
          {loading ? <Loader2 className="animate-spin" size={16} /> : (isAr ? 'توليد الكشف' : 'Generate')}
        </Button>
        {data && (
          <Button variant="outline" onClick={downloadCsv} disabled={exporting} className="min-h-[40px] gap-1">
            <Download size={15} />{isAr ? 'تصدير CSV' : 'Export CSV'}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <SummaryTile label={isAr ? 'الدخل' : 'Income'} value={formatMoney(data.totals.totalIncome, lang)} />
            <SummaryTile label={isAr ? 'الأقساط' : 'Installments'} value={formatMoney(data.totals.totalInstallments, lang)} />
            <SummaryTile label={isAr ? 'المصاريف' : 'Expenses'} value={formatMoney(data.totals.totalExpenses, lang)} />
            <SummaryTile label={isAr ? 'صافي الربح' : 'Net profit'} value={formatMoney(data.totals.netProfit, lang)} highlight positive={data.totals.netProfit >= 0} />
          </div>
          <div className="space-y-1.5">
            {data.lines.length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">{isAr ? 'لا توجد حركات في هذه الفترة.' : 'No transactions in this period.'}</div>
            ) : data.lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
                <span className="truncate">{l.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">{l.date}</span>
                <span className={`font-semibold tabular-nums shrink-0 ${l.type === 'expense' || l.type === 'installment' ? 'text-red-600' : 'text-emerald-600'}`} dir="ltr">
                  {l.type === 'expense' || l.type === 'installment' ? '-' : '+'}{formatMoney(l.amount, lang)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, highlight, positive }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'bg-primary/5 border-primary/30' : 'bg-card'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${highlight ? (positive ? 'text-emerald-600' : 'text-red-600') : ''}`} dir="ltr">{value}</p>
    </div>
  );
}
