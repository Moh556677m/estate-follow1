import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Receipt, Wrench } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import { listExpenses, createExpense, updateExpense, deleteExpense } from '@/lib/ownerFeaturesClient';
import { notify } from '@/lib/notify';
import { formatMoney, formatDate } from '@/lib/api';
import FeatureLockedNotice from './FeatureLockedNotice';

const CATEGORIES = ['maintenance', 'service_fee', 'insurance', 'tax', 'management_fee', 'utilities', 'other'];
const CATEGORY_LABELS = {
  maintenance: { ar: 'صيانة', en: 'Maintenance' },
  service_fee: { ar: 'رسوم خدمة', en: 'Service fee' },
  insurance: { ar: 'تأمين', en: 'Insurance' },
  tax: { ar: 'ضريبة', en: 'Tax' },
  management_fee: { ar: 'رسوم إدارة', en: 'Management fee' },
  utilities: { ar: 'مرافق', en: 'Utilities' },
  other: { ar: 'أخرى', en: 'Other' },
};

// Task #17 — Expense Center + Maintenance Center. ONE ledger
// (owner_expenses), Maintenance Center is simply this same panel with
// `mode="maintenance"` (category locked + a status workflow shown), so a
// maintenance cost recorded here also counts in the general Expense Center
// total automatically — no second collection, no separate total to keep in
// sync.
export default function ExpenseCenterPanel({ properties = [], mode = 'all' } = {}) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const { loading: gateLoading, isAvailable, features } = useFeatureEntitlements();
  const isMaintenance = mode === 'maintenance';
  const featureKey = isMaintenance ? 'maintenance_center' : 'expense_center';

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(isMaintenance ? 'maintenance' : 'other');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [propertyId, setPropertyId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await listExpenses(user.id, isMaintenance ? { category: 'maintenance' } : {});
      setExpenses(rows);
    } catch {
      /* keep last-known list on transient failure */
    } finally {
      setLoading(false);
    }
  }, [user, isMaintenance]);

  // Maintenance Center works if EITHER maintenance_center OR expense_center
  // is entitled (mirrors the server-side create guard in task17-hooks.pb.js).
  const available = isMaintenance
    ? (isAvailable('maintenance_center') || isAvailable('expense_center'))
    : isAvailable('expense_center');

  useEffect(() => {
    if (!gateLoading && available) load();
  }, [gateLoading, available, load]);

  useRealtimeRefresh(load, ['owner_expenses'], { enabled: available });

  if (gateLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={20} /></div>;
  if (!available) {
    return (
      <FeatureLockedNotice
        title={isMaintenance ? (isAr ? 'مركز الصيانة' : 'Maintenance Center') : (isAr ? 'مركز المصاريف' : 'Expense Center')}
        reason={features[featureKey]?.reason}
        isAr={isAr}
        onUpgrade={() => navigate('/dashboard/subscription')}
      />
    );
  }

  const addExpense = async (e) => {
    e.preventDefault();
    if (!title.trim() || !amount || saving) return;
    setSaving(true);
    try {
      await createExpense({
        owner: user.id,
        title: title.trim(),
        amount: Number(amount) || 0,
        category: isMaintenance ? 'maintenance' : category,
        date,
        property: propertyId || null,
        status: isMaintenance ? 'planned' : 'recorded',
      });
      setTitle('');
      setAmount('');
      setPropertyId('');
      load();
    } catch (err) {
      notify.error(isAr ? 'تعذر الحفظ' : 'Could not save', String(err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (expense, status) => {
    setExpenses((xs) => xs.map((x) => (x.id === expense.id ? { ...x, status } : x)));
    try {
      await updateExpense(expense.id, { status });
    } catch {
      load();
    }
  };

  const remove = async (expense) => {
    setExpenses((xs) => xs.filter((x) => x.id !== expense.id));
    try {
      await deleteExpense(expense.id);
    } catch {
      load();
    }
  };

  const total = expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const propById = Object.fromEntries(properties.map((p) => [p.id, p]));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          {isMaintenance ? <Wrench size={18} /> : <Receipt size={18} />}
          {isMaintenance ? (isAr ? 'مركز الصيانة' : 'Maintenance Center') : (isAr ? 'مركز المصاريف' : 'Expense Center')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isMaintenance
            ? (isAr ? 'عرض فئة الصيانة من مركز المصاريف، مع سير حالة.' : 'The maintenance-category view of Expense Center, with a status workflow.')
            : (isAr ? 'تسجيل ومراجعة كل مصاريف العقارات حسب الفئة.' : 'Record and review all property-related expenses by category.')}
        </p>
      </div>

      <div className="rounded-xl border bg-primary/5 border-primary/30 p-4">
        <p className="text-xs text-muted-foreground">{isAr ? 'الإجمالي' : 'Total'}</p>
        <p className="text-2xl font-bold tabular-nums" dir="ltr">{formatMoney(total, lang)}</p>
      </div>

      <form onSubmit={addExpense} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isAr ? 'الوصف' : 'Title'} className="min-h-[40px] flex-1 min-w-[140px] rounded-lg border bg-background px-3 py-2 text-sm" />
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={isAr ? 'المبلغ' : 'Amount'} className="min-h-[40px] w-32 rounded-lg border bg-background px-3 py-2 text-sm" />
        {!isMaintenance && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
            {CATEGORIES.map((c) => <option key={c} value={c}>{isAr ? CATEGORY_LABELS[c].ar : CATEGORY_LABELS[c].en}</option>)}
          </select>
        )}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm" />
        {properties.length > 0 && (
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="min-h-[40px] rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="">{isAr ? 'بدون عقار' : 'No property'}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.building} / {p.unit_number}</option>)}
          </select>
        )}
        <Button type="submit" disabled={saving || !title.trim() || !amount} className="min-h-[40px] gap-1">
          <Plus size={15} />{isAr ? 'إضافة' : 'Add'}
        </Button>
      </form>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={18} /></div>
      ) : expenses.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">{isAr ? 'لا توجد مصاريف مسجّلة.' : 'No expenses recorded.'}</div>
      ) : (
        <div className="space-y-2">
          {expenses.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3">
              <div className="min-w-[160px] flex-1">
                <p className="text-sm font-medium">{x.title}</p>
                <p className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                  <span>{isAr ? CATEGORY_LABELS[x.category]?.ar : CATEGORY_LABELS[x.category]?.en}</span>
                  <span>{formatDate(x.date, lang)}</span>
                  {x.property && propById[x.property] && <span>{propById[x.property].building}</span>}
                </p>
              </div>
              <span className="font-bold tabular-nums text-sm" dir="ltr">{formatMoney(x.amount, lang)}</span>
              {isMaintenance && (
                <select value={x.status} onChange={(e) => setStatus(x, e.target.value)} className="min-h-[32px] rounded-lg border bg-background px-2 py-1 text-xs">
                  <option value="planned">{isAr ? 'مخطط' : 'Planned'}</option>
                  <option value="in_progress">{isAr ? 'قيد التنفيذ' : 'In progress'}</option>
                  <option value="done">{isAr ? 'منجز' : 'Done'}</option>
                </select>
              )}
              <button type="button" onClick={() => remove(x)} className="text-muted-foreground hover:text-red-600">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
