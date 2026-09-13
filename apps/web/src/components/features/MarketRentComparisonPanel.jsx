import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Columns3, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import {
  getMarketRentComparison,
  listMarketComparables,
  createMarketComparable,
  deleteMarketComparable,
} from '@/lib/ownerFeaturesClient';
import { notify } from '@/lib/notify';
import { formatMoney } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

const VERDICT_LABEL = {
  above_average: { en: 'Above your recorded comparables', ar: 'أعلى من المقارنات المسجّلة', color: 'text-amber-600' },
  below_average: { en: 'Below your recorded comparables', ar: 'أقل من المقارنات المسجّلة', color: 'text-red-600' },
  in_line: { en: 'In line with your recorded comparables', ar: 'مطابق للمقارنات المسجّلة', color: 'text-emerald-600' },
  no_comparables: { en: 'No comparables recorded yet', ar: 'لا توجد مقارنات مسجّلة بعد', color: 'text-muted-foreground' },
};

// Feature Management batch — Market Rent Comparison. IMPORTANT: this panel
// NEVER shows a live market feed — there is no external listings-portal
// integration in this codebase. Every comparison is built only from
// comparables the owner records themselves, and that is always disclosed.
export default function MarketRentComparisonPanel({ properties = [] } = {}) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();

  const [comparison, setComparison] = useState(null);
  const [comparables, setComparables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [areaLabel, setAreaLabel] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [source, setSource] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [cmp, comps] = await Promise.all([
        getMarketRentComparison({}),
        listMarketComparables(user.id),
      ]);
      setComparison(cmp);
      setComparables(comps);
    } catch {
      /* keep last-known data on transient failure */
    } finally {
      setLoading(false);
    }
  }, [user]);

  const available = isAvailable('market_rent_comparison');
  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isAr ? 'مقارنة الإيجار بالسوق' : 'Market Rent Comparison'}
        reason={features.market_rent_comparison?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const addComparable = async (e) => {
    e.preventDefault();
    if (!areaLabel.trim() || !rentAmount || saving) return;
    setSaving(true);
    try {
      await createMarketComparable({
        owner: user.id,
        property: propertyId || null,
        area_label: areaLabel.trim(),
        bedrooms: bedrooms ? Number(bedrooms) : null,
        rent_amount: Number(rentAmount) || 0,
        source: source.trim(),
        date_recorded: new Date().toISOString().slice(0, 10),
      });
      setAreaLabel(''); setBedrooms(''); setRentAmount(''); setSource(''); setPropertyId('');
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر الإضافة' : 'Could not add', String(err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    setComparables((cs) => cs.filter((c) => c.id !== id));
    try {
      await deleteMarketComparable(id);
      load();
    } catch {
      load();
    }
  };

  const propById = Object.fromEntries(properties.map((p) => [p.id, p]));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Columns3 size={20} />{isAr ? 'مقارنة الإيجار بالسوق' : 'Market Rent Comparison'}</h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? 'قارن إيجار عقارك بالمقارنات التي تسجّلها بنفسك.' : 'Compare your property\'s rent against the comparables you record yourself.'}
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>
          {isAr
            ? 'هذه المقارنة مبنية فقط على البيانات التي تُسجّلها أنت بنفسك — وليست بيانات سوق حيّة أو متصلة بمواقع إعلانات خارجية.'
            : 'This comparison is built only from data you record yourself — it is not a live market feed or connected to any external listings site.'}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={18} /></div>
      ) : (
        <div className="space-y-2.5">
          {(comparison?.properties || []).map((p) => {
            const v = VERDICT_LABEL[p.verdict];
            return (
              <div key={p.propertyId} className="rounded-xl border bg-card px-4 py-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-sm">{p.building} / {p.unit_number}</p>
                  <div className="text-sm font-bold tabular-nums" dir="ltr">{formatMoney(p.ownRent, lang)}</div>
                </div>
                <p className={`text-xs font-medium ${v.color}`}>{isAr ? v.ar : v.en}</p>
                {p.comparableCount > 0 && (
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {isAr ? 'متوسط المقارنات' : 'Comparables average'}: {formatMoney(p.averageComparable, lang)}
                    {' '}({p.comparableCount} {isAr ? 'مقارنة' : 'comparables'})
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border bg-card p-3 space-y-3">
        <p className="text-sm font-semibold">{isAr ? 'إضافة مقارنة جديدة' : 'Add a new comparable'}</p>
        <form onSubmit={addComparable} className="flex flex-wrap items-center gap-2">
          {properties.length > 0 && (
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="">{isAr ? 'بدون ربط بعقار' : 'Not linked to a property'}</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.building} / {p.unit_number}</option>)}
            </select>
          )}
          <input value={areaLabel} onChange={(e) => setAreaLabel(e.target.value)} placeholder={isAr ? 'المنطقة/المبنى' : 'Area/building'} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm" />
          <input type="number" min="0" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} placeholder={isAr ? 'غرف' : 'Bedrooms'} className="min-h-[40px] w-24 rounded-lg border bg-background px-3 py-2 text-sm" />
          <input type="number" min="0" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} placeholder={isAr ? 'الإيجار' : 'Rent'} className="min-h-[40px] w-28 rounded-lg border bg-background px-3 py-2 text-sm" />
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder={isAr ? 'المصدر (رابط/ملاحظة)' : 'Source (link/note)'} className="min-h-[40px] flex-1 min-w-[160px] rounded-lg border bg-background px-3 py-2 text-sm" />
          <Button type="submit" disabled={saving || !areaLabel.trim() || !rentAmount} className="min-h-[40px] gap-1">
            <Plus size={15} />{isAr ? 'إضافة' : 'Add'}
          </Button>
        </form>

        {comparables.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t">
            {comparables.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 text-xs">
                <span>
                  {c.area_label} {c.bedrooms ? `· ${c.bedrooms}BR` : ''} — <span className="font-semibold" dir="ltr">{formatMoney(c.rent_amount, lang)}</span>
                  {c.property && propById[c.property] ? ` (${propById[c.property].building})` : ''}
                </span>
                <button type="button" onClick={() => remove(c.id)} className="shrink-0 text-muted-foreground hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
