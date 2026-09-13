import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, SlidersHorizontal, Info } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getNetProfit } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #18 — What-if Simulator. A PROJECTION over the real net-profit
// baseline (GET /ef/features/net-profit) — never a second source of truth.
// The three sliders adjust the REAL rentIncome/expenses totals by a
// percentage and recompute net profit client-side; the result is always
// labeled as a simulation, never presented as a stored fact or written
// anywhere.
export default function WhatIfSimulatorPanel() {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rentChange, setRentChange] = useState(0);
  const [vacancyChange, setVacancyChange] = useState(0);
  const [expenseChange, setExpenseChange] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBaseline(await getNetProfit({}));
    } catch {
      setBaseline(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const available = isAvailable('whatif_simulator');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'محاكي ماذا-لو' : 'What-if Simulator'}
        reason={features.whatif_simulator?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>;
  if (!baseline || baseline.properties.length === 0) {
    return <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">{isAr ? 'لا توجد بيانات كافية للمحاكاة بعد.' : 'Not enough data to simulate yet.'}</div>;
  }

  const t = baseline.totals;
  const projectedRent = t.rentIncome * (1 + rentChange / 100) * (1 - vacancyChange / 100);
  const projectedExpenses = t.expenses * (1 + expenseChange / 100);
  const projectedNet = projectedRent - projectedExpenses - t.installmentsPaid;
  const delta = projectedNet - t.netProfit;

  const Slider = ({ label, value, onChange, min = -50, max = 50 }) => (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums" dir="ltr">{value > 0 ? '+' : ''}{value}%</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><SlidersHorizontal size={18} />{isAr ? 'محاكي ماذا-لو' : 'What-if Simulator'}</h2>
        <p className="text-sm text-muted-foreground flex items-start gap-1.5">
          <Info size={14} className="mt-0.5 shrink-0" />
          {isAr ? 'توقّع مبني على بياناتك الحقيقية الحالية — ليس رقمًا مخزّنًا أو حقيقة، فقط محاكاة.' : "A projection over your real current data — not a stored number or a fact, just a simulation."}
        </p>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4 space-y-2 text-sm">
        <p className="font-semibold">{isAr ? 'الأساس الحقيقي الحالي' : 'Current real baseline'}</p>
        <p className="text-muted-foreground" dir="ltr">
          {isAr ? 'دخل' : 'Income'} {formatMoney(t.rentIncome, lang)} · {isAr ? 'مصاريف' : 'Expenses'} {formatMoney(t.expenses, lang)} · {isAr ? 'أقساط' : 'Installments'} {formatMoney(t.installmentsPaid, lang)} · {isAr ? 'صافي' : 'Net'} {formatMoney(t.netProfit, lang)}
        </p>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <Slider label={isAr ? 'تغيّر الإيجار' : 'Rent change'} value={rentChange} onChange={setRentChange} />
        <Slider label={isAr ? 'معدل الشغور' : 'Vacancy rate'} value={vacancyChange} onChange={setVacancyChange} min={0} max={100} />
        <Slider label={isAr ? 'تغيّر المصاريف' : 'Expense change'} value={expenseChange} onChange={setExpenseChange} />
      </div>

      <div className="rounded-xl border bg-primary/5 border-primary/30 p-4">
        <p className="text-xs text-muted-foreground">{isAr ? 'صافي الربح المتوقّع (محاكاة)' : 'Projected net profit (simulation)'}</p>
        <p className={`text-2xl font-bold tabular-nums ${projectedNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`} dir="ltr">{formatMoney(projectedNet, lang)}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {delta >= 0 ? '+' : ''}{formatMoney(delta, lang)} {isAr ? 'مقارنة بالوضع الحالي' : 'vs. current'}
        </p>
      </div>
    </div>
  );
}
