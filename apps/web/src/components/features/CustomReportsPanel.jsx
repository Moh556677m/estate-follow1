import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, FileSpreadsheet, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getNetProfit, listExpenses } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #18 — Custom Reports. Composes Task #17's existing net-profit route
// + the owner_expenses list with owner-chosen filters (year, properties,
// expense category) and renders/exports client-side — no second reporting
// engine, no new server route.
export default function CustomReportsPanel({ properties = [] } = {}) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [year, setYear] = useState(new Date().getFullYear());
  const [propertyIds, setPropertyIds] = useState([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return [now, now - 1, now - 2, now - 3];
  }, []);

  const available = isAvailable('custom_reports');

  const run = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [netProfit, expenses] = await Promise.all([
        getNetProfit({ year, propertyIds: propertyIds.length ? propertyIds : undefined }),
        listExpenses(user.id, category !== 'all' ? { category } : {}),
      ]);
      const wantedIds = propertyIds.length ? new Set(propertyIds) : null;
      const filteredExpenses = expenses.filter((x) => {
        if (!wantedIds) return true;
        return wantedIds.has(x.property);
      });
      setResult({ netProfit, expenses: filteredExpenses });
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [user, year, propertyIds, category]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'تقارير مخصصة' : 'Custom Reports'}
        reason={features.custom_reports?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const toggleProperty = (id) => {
    setPropertyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const exportCsv = () => {
    if (!result) return;
    const rows = [['section', 'label', 'amount']];
    result.netProfit.properties.forEach((p) => {
      rows.push(['net_profit', `${p.building}/${p.unit_number}`, p.netProfit]);
    });
    result.expenses.forEach((x) => {
      rows.push(['expense', `${x.category} — ${x.title}`, x.amount]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-report-${year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><FileSpreadsheet size={18} />{isAr ? 'تقارير مخصصة' : 'Custom Reports'}</h2>
        <p className="text-sm text-muted-foreground">{isAr ? 'اختر الفلاتر ثم اعرض أو صدّر تقريرًا من بياناتك الحقيقية.' : 'Pick filters, then view or export a report built from your real data.'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="all">{isAr ? 'كل فئات المصاريف' : 'All expense categories'}</option>
          {['maintenance', 'service_fee', 'insurance', 'tax', 'management_fee', 'utilities', 'other'].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Button onClick={run} disabled={loading} className="min-h-[40px] gap-2">
          {loading && <Loader2 className="animate-spin" size={16} />}
          {isAr ? 'إنشاء التقرير' : 'Generate report'}
        </Button>
      </div>

      {properties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleProperty(p.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium min-h-[32px] ${propertyIds.includes(p.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card'}`}
            >
              {p.building}/{p.unit_number}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" onClick={exportCsv} className="min-h-[36px] gap-1.5"><Download size={14} />{isAr ? 'تصدير CSV' : 'Export CSV'}</Button>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold mb-2">{isAr ? 'صافي الربح حسب العقار' : 'Net profit by property'}</p>
            {result.netProfit.properties.map((p) => (
              <div key={p.propertyId} className="flex items-center justify-between text-sm py-1">
                <span>{p.building}/{p.unit_number}</span>
                <span className="font-semibold tabular-nums" dir="ltr">{formatMoney(p.netProfit, lang)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold mb-2">{isAr ? 'المصاريف' : 'Expenses'}</p>
            {result.expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isAr ? 'لا توجد مصاريف مطابقة.' : 'No matching expenses.'}</p>
            ) : result.expenses.map((x) => (
              <div key={x.id} className="flex items-center justify-between text-sm py-1">
                <span>{x.category} — {x.title}</span>
                <span className="font-semibold tabular-nums" dir="ltr">{formatMoney(x.amount, lang)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
