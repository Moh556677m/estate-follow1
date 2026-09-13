import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { cn } from '@/lib/utils';
import { StatusDot } from '@/components/shared';

// These are live pings, not PocketBase records, so there is no realtime
// event to subscribe to — a short poll is the only way to keep this
// automatically current without a page reload.
const POLL_MS = 20000;

async function ping(url, timeout = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compact, self-refreshing status strip for the admin Overview page.
 * Pings the same two real endpoints SystemHealthPanel uses (PocketBase
 * /api/health and the Express /hcgi/api/health) on a timer and links
 * through to the full System Health tab for the complete breakdown
 * (email, analytics, search integrations, webhooks…).
 */
export default function SystemStatusStrip({ basePath = '/dashboard' }) {
  const { lang } = useLanguage();
  const L = useCallback((ar, en) => (lang === 'ar' ? ar : en), [lang]);
  const [dbOk, setDbOk] = useState(null); // null = checking
  const [apiOk, setApiOk] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);
  const mountedRef = useRef(true);

  const runCheck = useCallback(async () => {
    const [db, api] = await Promise.all([
      ping(`${pb.baseUrl}/api/health`),
      ping('/hcgi/api/health'),
    ]);
    if (!mountedRef.current) return;
    setDbOk(db);
    setApiOk(api);
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    runCheck();
    const id = setInterval(runCheck, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [runCheck]);

  const checking = dbOk === null || apiOk === null;
  const allUp = dbOk && apiOk;

  return (
    <Link
      to={`${basePath}/system-health`}
      className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot
          color={checking ? 'gray' : dbOk ? 'green' : 'red'}
          label={`${L('قاعدة البيانات', 'Database')} · ${L(
            checking ? 'جارٍ الفحص' : dbOk ? 'متصلة' : 'غير متصلة',
            checking ? 'Checking' : dbOk ? 'Online' : 'Offline',
          )}`}
        />
        <StatusDot
          color={checking ? 'gray' : apiOk ? 'green' : 'red'}
          label={`${L('خادم API', 'API Server')} · ${L(
            checking ? 'جارٍ الفحص' : apiOk ? 'متصل' : 'غير متصل',
            checking ? 'Checking' : apiOk ? 'Online' : 'Offline',
          )}`}
        />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              checking ? 'bg-slate-400' : allUp ? 'bg-emerald-500 animate-pulse' : 'bg-red-500 animate-pulse',
            )}
          />
          {L('مباشر', 'Live')}
          {checkedAt && (
            <span dir="ltr" className="ms-1">
              · {checkedAt.toLocaleTimeString(lang === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
        {L('كل حالات الخدمات', 'Full service status')}
        <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
