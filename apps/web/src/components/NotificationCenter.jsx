import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, Building2, Wallet, Megaphone, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import pb from '@/lib/pocketbaseClient';
import {
  markNotificationRead,
  markAllRead,
  deleteNotification,
  logNotificationOpen,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'unread', ar: 'غير المقروء', en: 'Unread' },
  { key: 'all', ar: 'الكل', en: 'All' },
  { key: 'properties', ar: 'العقارات', en: 'Properties', cats: ['installment', 'rent', 'service', 'contract', 'handover'] },
  { key: 'payments', ar: 'المدفوعات', en: 'Payments', cats: ['installment', 'rent', 'service'] },
  { key: 'updates', ar: 'التحديثات', en: 'Updates', cats: ['platform', 'inactivity'] },
];

const categoryIcon = (cat) => {
  if (['installment', 'rent', 'service'].includes(cat)) return Wallet;
  if (['contract', 'handover'].includes(cat)) return Building2;
  if (['platform', 'inactivity'].includes(cat)) return Megaphone;
  return Bell;
};

export default function NotificationCenter() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const tr = (ar, en) => (lang === 'ar' ? ar : en);

  const load = React.useCallback(async () => {
    if (!user) return;
    try {
      const rows = await pb.collection('notifications').getFullList({
        sort: '-created',
        filter: `user = "${user.id}"`,
        requestKey: `nc-list-${user.id}`,
      });
      setNotifications(rows);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return undefined;
    let debounce = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(load, 300);
    };
    void pb.collection('notifications').subscribe('*', schedule).catch(() => {});
    return () => {
      if (debounce) clearTimeout(debounce);
      void pb.collection('notifications').unsubscribe('*').catch(() => {});
    };
  }, [load, user]);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter);
    return notifications.filter((n) => {
      if (f.key === 'unread') return !n.read;
      if (f.key === 'all') return true;
      if (f.cats) return f.cats.includes(n.category);
      return true;
    });
  }, [notifications, filter]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = async (n) => {
    if (!n.read) {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    logNotificationOpen(n.id).catch(() => {});
    if (n.link) navigate(n.link);
  };

  const handleDelete = async (e, n) => {
    e.stopPropagation();
    await deleteNotification(n.id);
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
  };

  const handleAllRead = async () => {
    await markAllRead(user.id);
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors min-h-[36px]',
                filter === f.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {lang === 'ar' ? f.ar : f.en}
              {f.key === 'unread' && unreadCount > 0 && (
                <span className="ms-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleAllRead} className="min-h-[36px]">
            <CheckCheck size={14} className="me-1.5" />
            {tr('تعليم الكل كمقروء', 'Mark all read')}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="py-12 text-center text-muted-foreground">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <Bell size={32} className="mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            {tr('لا توجد إشعارات حالياً.', 'No notifications yet.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const Icon = categoryIcon(n.category);
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(n)}
                onKeyDown={(e) => e.key === 'Enter' && handleOpen(n)}
                className={cn(
                  'group flex items-start gap-3 rounded-xl border px-4 py-3 shadow-sm transition-colors cursor-pointer',
                  n.read ? 'bg-card' : 'bg-primary/5 border-primary/30',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    n.read ? 'bg-accent text-muted-foreground' : 'bg-primary/15 text-primary',
                  )}
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-sm truncate', !n.read && 'font-bold')}>{n.title}</p>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                      <Clock size={11} />
                      {formatRelative(n.created, lang)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-line line-clamp-3">
                      {n.body}
                    </p>
                  )}
                  {n.link && (
                    <p className="mt-1 text-[11px] text-primary font-medium">
                      {tr('اضغط للفتح ←', 'Click to open →')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!n.read && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markNotificationRead(n.id);
                        setNotifications((prev) =>
                          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
                        );
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary"
                      aria-label={tr('تعليم كمقروء', 'Mark read')}
                    >
                      <Check size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, n)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={tr('حذف', 'Delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatRelative(dateStr, lang) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return lang === 'ar' ? 'الآن' : 'now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return lang === 'ar' ? `قبل ${m} د` : `${m}m ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return lang === 'ar' ? `قبل ${h} س` : `${h}h ago`;
  }
  const days = Math.floor(diff / 86400);
  if (days < 30) return lang === 'ar' ? `قبل ${days} يوم` : `${days}d ago`;
  return d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB');
}
