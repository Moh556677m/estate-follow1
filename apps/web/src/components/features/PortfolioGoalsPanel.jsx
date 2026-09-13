import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import { listGoals, createGoal, updateGoal, deleteGoal, getCommandCenter } from '@/lib/ownerFeaturesClient';
import { notify } from '@/lib/notify';
import { formatMoney, formatDate } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

const GOAL_LABELS = {
  net_profit: { ar: 'صافي الربح', en: 'Net profit' },
  property_count: { ar: 'عدد العقارات', en: 'Property count' },
  occupancy_rate: { ar: 'معدل الإشغال', en: 'Occupancy rate' },
};

// Task #18 — Portfolio Goals. A real target the owner sets, with progress
// computed from the SAME live numbers Command Center already assembles
// (net_profit_ytd / property_count / occupancy_rate) — never a second,
// separately-tracked "current value".
export default function PortfolioGoalsPanel() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [goals, setGoals] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [goalType, setGoalType] = useState('net_profit');
  const [targetValue, setTargetValue] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [g, cc] = await Promise.all([listGoals(user.id), getCommandCenter().catch(() => null)]);
      setGoals(g);
      setCurrent(cc);
    } catch {
      /* keep last-known list on transient failure */
    } finally {
      setLoading(false);
    }
  }, [user]);

  const available = isAvailable('portfolio_goals');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  useRealtimeRefresh(load, ['owner_goals'], { enabled: available });

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'أهداف المحفظة' : 'Portfolio Goals'}
        reason={features.portfolio_goals?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const currentValueFor = (type) => {
    if (!current) return null;
    if (type === 'net_profit') return current.net_profit_ytd;
    if (type === 'property_count') return current.property_count;
    if (type === 'occupancy_rate') return current.occupancy_rate;
    return null;
  };
  const displayValue = (type, v) => (type === 'net_profit' ? formatMoney(v, lang) : type === 'occupancy_rate' ? `${v}%` : v);

  const addGoal = async (e) => {
    e.preventDefault();
    if (!targetValue || saving) return;
    setSaving(true);
    try {
      await createGoal({
        owner: user.id,
        goal_type: goalType,
        target_value: Number(targetValue) || 0,
        target_date: targetDate || null,
        status: 'active',
      });
      setTargetValue('');
      setTargetDate('');
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر الحفظ' : 'Could not save', String(err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (goal) => {
    setGoals((gs) => gs.filter((g) => g.id !== goal.id));
    try {
      await deleteGoal(goal.id);
    } catch {
      load();
    }
  };

  const markAchieved = async (goal) => {
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? { ...g, status: 'achieved' } : g)));
    try {
      await updateGoal(goal.id, { status: 'achieved' });
    } catch {
      load();
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Target size={18} />{isAr ? 'أهداف المحفظة' : 'Portfolio Goals'}</h2>
        <p className="text-sm text-muted-foreground">{isAr ? 'حدّد هدفًا حقيقيًا وتابع التقدّم مقابل بياناتك الحيّة.' : 'Set a real target and track progress against your live data.'}</p>
      </div>

      <form onSubmit={addGoal} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <select value={goalType} onChange={(e) => setGoalType(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
          {Object.keys(GOAL_LABELS).map((k) => <option key={k} value={k}>{isAr ? GOAL_LABELS[k].ar : GOAL_LABELS[k].en}</option>)}
        </select>
        <input type="number" min="0" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder={isAr ? 'القيمة المستهدفة' : 'Target value'} className="min-h-[40px] w-40 rounded-lg border bg-background px-3 py-2 text-sm" />
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm" />
        <Button type="submit" disabled={saving || !targetValue} className="min-h-[40px] gap-1"><Plus size={15} />{isAr ? 'إضافة هدف' : 'Add goal'}</Button>
      </form>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={18} /></div>
      ) : goals.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">{isAr ? 'لا توجد أهداف بعد.' : 'No goals yet.'}</div>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const curVal = currentValueFor(g.goal_type);
            const pct = curVal != null && g.target_value > 0 ? Math.min(100, Math.round((curVal / g.target_value) * 100)) : null;
            return (
              <div key={g.id} className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{isAr ? GOAL_LABELS[g.goal_type]?.ar : GOAL_LABELS[g.goal_type]?.en}</p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? 'الهدف' : 'Target'}: {displayValue(g.goal_type, g.target_value)}
                      {g.target_date && <> · {formatDate(g.target_date, lang)}</>}
                      {g.status === 'achieved' && <span className="text-emerald-600"> · {isAr ? 'تم تحقيقه' : 'Achieved'}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {g.status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => markAchieved(g)} className="min-h-[32px]">{isAr ? 'تحقّق' : 'Mark achieved'}</Button>
                    )}
                    <button type="button" onClick={() => remove(g)} className="text-muted-foreground hover:text-red-600"><Trash2 size={16} /></button>
                  </div>
                </div>
                {pct != null && (
                  <div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{isAr ? 'الحالي' : 'Current'}: {displayValue(g.goal_type, curVal)} ({pct}%)</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
