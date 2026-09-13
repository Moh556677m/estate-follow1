import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import { EmptyState, StatCard } from '@/components/shared';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { formatDate, formatMoney } from '@/lib/api';
import { cn } from '@/lib/utils';
import { packageLabel } from '@/lib/subscriptionUtils';

// Subscription Revenues — fully automatic.
//
// Every number here is derived from `subscription_orders` rows whose status is
// `paid` — i.e. rows that the signed Stripe webhook (or the Stripe-API
// fallback) flipped to paid after Stripe itself confirmed the payment. There
// is NO manual "add payment" action and NO delete action: revenues are a
// read-only mirror of real Stripe-confirmed payments. Pending / failed /
// cancelled orders are deliberately excluded — they are not real payments and
// must never be counted as revenue.
const PAID_STATUSES = ['paid', 'approved'];

const RevenuePanel = ({ users = [] }) => {
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch only Stripe-confirmed (paid) orders. We pull the full list and
      // filter client-side because the `status` select holds several values
      // and we want both `paid` and legacy `approved` rows.
      const list = await pb.collection('subscription_orders').getFullList({
        sort: '-processed_at,-created',
        expand: 'user',
        requestKey: 'revenue-paid-orders',
      });
      setRows(list.filter((r) => PAID_STATUSES.includes(r.status)));
    } catch {
      setError(t('something_wrong'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: the moment the Stripe webhook flips an order to `paid`, the
  // revenue numbers update automatically — from this tab, another admin tab,
  // or the webhook itself.
  useRealtimeRefresh(load, ['subscription_orders', 'users']);

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  // Use the Stripe-confirmed processing date; fall back to created.
  const paidDate = (r) => {
    const d = r.processed_at ? new Date(r.processed_at) : null;
    if (d && !isNaN(d.getTime())) return d;
    return r.created ? new Date(r.created) : null;
  };

  const totals = useMemo(() => {
    const allTime = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const monthly = rows
      .filter((r) => {
        const d = paidDate(r);
        return d && d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const yearly = rows
      .filter((r) => {
        const d = paidDate(r);
        return d && d.getFullYear() === y;
      })
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return { allTime, monthly, yearly, count: rows.length };
  }, [rows, y, m]);

  const byUser = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const id = r.user;
      if (!map[id]) {
        map[id] = {
          user: r.expand?.user || users.find((u) => u.id === id),
          total: 0,
          rows: [],
        };
      }
      map[id].total += Number(r.amount) || 0;
      map[id].rows.push(r);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [rows, users]);

  if (loading) {
    return <p className="py-16 text-center text-muted-foreground">{t('loading')}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t('revenue_title')}</h2>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'جميع الأرقام محسوبة تلقائيًا من عمليات الدفع المؤكدة فعلًا عبر Stripe. لا يمكن إدخال أو حذف أي دفعة يدويًا.'
              : 'Every figure is calculated automatically from payments actually confirmed by Stripe. No payment can be added or deleted manually.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Wallet}
          label={t('stat_revenue_all')}
          value={formatMoney(totals.allTime, lang)}
        />
        <StatCard
          icon={Wallet}
          label={t('stat_revenue_month')}
          value={formatMoney(totals.monthly, lang)}
        />
        <StatCard
          icon={Wallet}
          label={t('stat_revenue_year')}
          value={formatMoney(totals.yearly, lang)}
        />
        <StatCard
          icon={Wallet}
          label={isAr ? 'عمليات دفع مؤكدة' : 'Confirmed payments'}
          value={totals.count}
        />
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <h3 className="font-bold">{t('revenue_by_user')}</h3>
        {byUser.length === 0 ? (
          <EmptyState message={t('empty_revenue')} icon={Wallet} />
        ) : (
          <div className="space-y-2">
            {byUser.map((g) => (
              <div
                key={g.user?.id || Math.random()}
                className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-semibold">
                    {g.user?.name || g.user?.email || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {g.user?.email}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums" dir="ltr">
                  {formatMoney(g.total, lang)}
                </p>
                <span className="text-xs text-muted-foreground">
                  {g.rows.length} {t('payments_count')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <h3 className="font-bold">{t('all_subscription_payments')}</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty_revenue')}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-semibold">
                    {r.expand?.user?.name || r.expand?.user?.email || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.package === 'extra_property'
                      ? isAr
                        ? 'عقار إضافي'
                        : 'Extra property'
                      : packageLabel(r.package, t)}{' '}
                    · {formatDate(r.processed_at || r.created, lang)}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums" dir="ltr">
                  {formatMoney(r.amount, lang)} {r.currency || ''}
                </p>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    'bg-emerald-100 text-emerald-800 border-emerald-200',
                  )}
                >
                  {t('sub_paid')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RevenuePanel;
