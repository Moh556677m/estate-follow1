import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

function relativeTime(dateStr, L) {
  const then = new Date(String(dateStr || '').replace(' ', 'T'));
  if (Number.isNaN(then.getTime())) return '—';
  const diffSec = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (diffSec < 45) return L('الآن', 'just now');
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return L(`منذ ${diffMin} د`, `${diffMin}m ago`);
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return L(`منذ ${diffHr} س`, `${diffHr}h ago`);
  const diffDay = Math.round(diffHr / 24);
  return L(`منذ ${diffDay} يوم`, `${diffDay}d ago`);
}

/**
 * Compact live feed for the Overview page. Consumes the `activity` array
 * AdminDashboard already keeps fresh via its realtime subscription on the
 * `activity_logs` collection — no separate fetch or subscription needed
 * here. Relative timestamps re-render on a short timer so "2m ago" keeps
 * advancing on its own, without a page reload.
 */
export default function RecentActivityFeed({ activity = [], limit = 6, basePath = '/dashboard' }) {
  const { t, lang } = useLanguage();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  // Forces a re-render every 30s so relative labels ("2m ago") stay current
  // even when no new activity has come in.
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const items = activity.slice(0, limit);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity size={16} />
          </span>
          <p className="font-bold">{L('النشاط الأخير', 'Recent activity')}</p>
        </div>
        <Link
          to={`${basePath}/activity`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          {L('عرض الكل', 'View all')}
          <ChevronRight size={14} />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('empty_activity') || L('لا يوجد نشاط بعد', 'No activity yet')}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/40">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{t(a.action) || a.action}</span>
                {(a.expand?.user?.name || a.expand?.user?.email) && (
                  <span className="text-muted-foreground"> · {a.expand.user.name || a.expand.user.email}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap" dir="ltr">
                {relativeTime(a.created, L)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
