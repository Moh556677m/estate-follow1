import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, TrendingUp, KeyRound, CheckSquare, Receipt, AlertTriangle, Building2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import { getCommandCenter } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #18 — Command Center. One glance-able summary combining numbers the
// other Task #17/#18 features already compute server-side (GET
// /ef/features/command-center) — no second calculation, just assembled.
export default function CommandCenterPanel() {
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
      setData(await getCommandCenter());
    } catch (err) {
      setError(String(err?.message || (isAr ? 'تعذر تحميل البيانات' : 'Could not load data')));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const available = isAvailable('command_center');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  useRealtimeRefresh(load, ['payments', 'owner_expenses', 'owner_tasks', 'properties'], { enabled: available, debounceMs: 600 });

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'مركز القيادة' : 'Command Center'}
        reason={features.command_center?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={20} /></div>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const tiles = [
    { icon: Building2, label: isAr ? 'العقارات' : 'Properties', value: data.property_count, onClick: () => navigate('/dashboard/residential') },
    { icon: KeyRound, label: isAr ? 'معدل الإشغال' : 'Occupancy', value: `${data.occupancy_rate}%`, onClick: () => navigate('/dashboard/occupancy') },
    { icon: TrendingUp, label: isAr ? 'صافي الربح (السنة)' : 'Net profit (YTD)', value: formatMoney(data.net_profit_ytd, lang), onClick: () => navigate('/dashboard/net-profit'), highlight: data.net_profit_ytd >= 0 },
    { icon: Receipt, label: isAr ? 'مصاريف هذا الشهر' : 'This month expenses', value: formatMoney(data.month_expenses, lang), onClick: () => navigate('/dashboard/expenses') },
    { icon: CheckSquare, label: isAr ? 'مهام مفتوحة' : 'Open tasks', value: data.open_task_count, onClick: () => navigate('/dashboard/tasks') },
    { icon: AlertTriangle, label: isAr ? 'مدفوعات متأخرة' : 'Overdue payments', value: data.overdue_payment_count, onClick: () => navigate('/dashboard/due-payments'), warn: data.overdue_payment_count > 0 },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{isAr ? 'مركز القيادة' : 'Command Center'}</h2>
        <p className="text-sm text-muted-foreground">{isAr ? 'ملخص سريع يجمع أهم أرقام محفظتك في مكان واحد.' : 'A quick summary bringing your portfolio\'s key numbers together.'}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            type="button"
            onClick={tile.onClick}
            className="rounded-xl border bg-card p-4 text-start hover:bg-accent transition-colors"
          >
            <tile.icon size={16} className={tile.warn ? 'text-red-600' : 'text-primary'} />
            <p className={`mt-2 text-xl font-bold tabular-nums ${tile.highlight === false ? 'text-red-600' : tile.warn ? 'text-red-600' : ''}`} dir="ltr">{tile.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{tile.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
