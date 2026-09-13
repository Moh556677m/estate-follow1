import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Columns3, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import pb from '@/lib/pocketbaseClient';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import { getNetProfit } from '@/lib/ownerFeaturesClient';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

// Task #17 — Property Comparison. Reuses the net-profit aggregation route
// (propertyIds filter) instead of a second calculation — see the comment
// atop task17-features.pb.js.
export default function PropertyComparisonPanel({ properties = [] } = {}) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tenancies, setTenancies] = useState([]);

  const available = isAvailable('property_comparison');

  useEffect(() => {
    if (!user || !available) return;
    pb.collection('tenancies').getFullList({ filter: `owner = "${user.id}" && status = "active"` }).then(setTenancies).catch(() => setTenancies([]));
  }, [user, available]);

  const load = useCallback(async () => {
    if (selected.length < 2) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      setData(await getNetProfit({ propertyIds: selected }));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { load(); }, [load]);

  const activeByProperty = useMemo(() => {
    const m = {};
    tenancies.forEach((t) => { m[t.property] = true; });
    return m;
  }, [tenancies]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'مقارنة العقارات' : 'Property Comparison'}
        reason={features.property_comparison?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const toggle = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));
  };

  const rows = data?.properties || [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Columns3 size={18} />{isAr ? 'مقارنة العقارات' : 'Property Comparison'}</h2>
        <p className="text-sm text-muted-foreground">{isAr ? 'اختر عقارين إلى 4 للمقارنة جنبًا إلى جنب.' : 'Pick 2 to 4 properties to compare side by side.'}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {properties.map((p) => {
          const active = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium min-h-[32px] ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card'}`}
            >
              {p.building}/{p.unit_number}
              {active && <X size={12} />}
            </button>
          );
        })}
      </div>

      {selected.length < 2 ? (
        <p className="text-sm text-muted-foreground">{isAr ? 'اختر عقارين على الأقل.' : 'Select at least 2 properties.'}</p>
      ) : loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={18} /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="text-start p-2 text-xs text-muted-foreground font-medium">{isAr ? 'المقياس' : 'Metric'}</th>
                {rows.map((r) => (
                  <th key={r.propertyId} className="p-2 text-xs font-bold border-b">{r.building}/{r.unit_number}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'rentIncome', label: isAr ? 'دخل الإيجار' : 'Rent income' },
                { key: 'expenses', label: isAr ? 'المصاريف' : 'Expenses' },
                { key: 'installmentsPaid', label: isAr ? 'الأقساط المسددة' : 'Installments paid' },
                { key: 'netProfit', label: isAr ? 'صافي الربح' : 'Net profit' },
              ].map((row) => (
                <tr key={row.key}>
                  <td className="p-2 text-xs text-muted-foreground border-b">{row.label}</td>
                  {rows.map((r) => (
                    <td key={r.propertyId} className={`p-2 border-b font-semibold tabular-nums ${row.key === 'netProfit' ? (r[row.key] >= 0 ? 'text-emerald-600' : 'text-red-600') : ''}`} dir="ltr">
                      {formatMoney(r[row.key], lang)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="p-2 text-xs text-muted-foreground">{isAr ? 'حالة الإشغال' : 'Occupancy'}</td>
                {rows.map((r) => (
                  <td key={r.propertyId} className="p-2 text-xs">
                    {activeByProperty[r.propertyId] ? (isAr ? 'مؤجر' : 'Rented') : (isAr ? 'شاغر' : 'Vacant')}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
