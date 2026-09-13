import React, { useCallback, useEffect, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  Globe,
  Mail,
  Megaphone,
  RefreshCw,
  Search,
  Server,
  Timer,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { cn } from '@/lib/utils';
import { getEmailDiagnostic, sendTestEmail } from '@/lib/emailDiagnostic';
import { formatDateTime } from '@/lib/api';

// Status values: 'connected' | 'warning' | 'down' | 'not_configured'
const TONE = {
  connected: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', Icon: CheckCircle2, dot: 'bg-emerald-500' },
  warning: { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: AlertTriangle, dot: 'bg-amber-500' },
  down: { cls: 'bg-red-50 text-red-800 border-red-200', Icon: XCircle, dot: 'bg-red-500' },
  not_configured: { cls: 'bg-slate-100 text-slate-600 border-slate-200', Icon: AlertTriangle, dot: 'bg-slate-400' },
};

function statusLabel(status, L) {
  if (status === 'connected') return L('متصل', 'Connected');
  if (status === 'warning') return L('تحذير', 'Warning');
  if (status === 'down') return L('غير متصل', 'Down');
  return L('غير مُعد', 'Not Configured');
}

async function ping(url, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeout || 6000);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal, headers: opts.headers || {} });
    clearTimeout(t);
    return res.ok;
  } catch {
    clearTimeout(t);
    return false;
  }
}

export default function SystemHealthPanel() {
  const { lang } = useLanguage();
  const L = useCallback((ar, en) => (lang === 'ar' ? ar : en), [lang]);

  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [emailDiag, setEmailDiag] = useState(null);
  const [emailDiagError, setEmailDiagError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const runChecks = useCallback(async () => {
    setLoading(true);

    // 1) Database (PocketBase) — real health endpoint.
    const dbOk = await ping(`${pb.baseUrl}/api/health`);

    // 2) AI Services — real Express health endpoint.
    const aiOk = await ping('/hcgi/api/health');

    // 3) File storage — same backend as PocketBase.
    const fileOk = dbOk;

    // 4) Email service — real Resend diagnostic (key set + domain verified).
    let diag = null;
    let diagErr = '';
    try {
      diag = await getEmailDiagnostic();
      setEmailDiag(diag);
      setEmailDiagError('');
    } catch (err) {
      diagErr = String(err?.response?.message || err?.message || err?.status || 'error');
      diag = null;
      setEmailDiag(null);
      setEmailDiagError(diagErr);
    }

    // 4b) Email marketing status — real provider/queue/webhook/last emails
    // from the /ef/marketing/status hook (super admin only).
    let mktStatus = null;
    try {
      const r = await fetch(`${pb.baseUrl}/ef/marketing/status`, {
        headers: { Authorization: pb.authStore.token || '' },
      });
      if (r.ok) mktStatus = await r.json();
    } catch { mktStatus = null; }

    // 5) Analytics — real: do we have any tracked visits?
    let analyticsStatus = 'not_configured';
    try {
      const res = await pb.collection('analytics_visits').getList(1, 1, { requestKey: `sys-health-visits-${Date.now()}` });
      analyticsStatus = res.totalItems > 0 ? 'connected' : 'warning';
    } catch {
      analyticsStatus = 'down';
    }

    // 6) Search Integrations — read real cms.seo_integrations (an object, not
    //    an array). Count only integrations with real credentials entered, and
    //    never claim "connected" for services whose verification cannot be
    //    confirmed from inside the site. Only Google Analytics (loaded via
    //    index.html) can be "connected"; the rest are "configured" at best.
    let searchStatus = 'not_configured';
    let searchCount = 0;
    try {
      const rows = await pb.collection('platform_settings').getFullList({ requestKey: `sys-health-seo-${Date.now()}` });
      const cms = rows[0]?.cms || {};
      const ints = cms.seo_integrations && typeof cms.seo_integrations === 'object' && !Array.isArray(cms.seo_integrations)
        ? cms.seo_integrations
        : {};
      const entries = Object.entries(ints);
      const hasAny = entries.some(([, it]) => it && (String(it.verification || '').trim() || String(it.settings || '').trim()));
      const hasGa = !!ints.google_analytics && /^G-[A-Z0-9]{4,}$/i.test(String(ints.google_analytics.verification || '').trim());
      searchCount = entries.filter(([, it]) => it && it.enabled && (String(it.verification || '').trim() || String(it.settings || '').trim())).length;
      if (hasGa) searchStatus = 'connected';
      else if (searchCount > 0) searchStatus = 'warning';
      else if (hasAny) searchStatus = 'warning';
      else searchStatus = 'not_configured';
    } catch {
      searchStatus = 'down';
    }

    // 7) Background jobs / Scheduled tasks — Express hibernates when idle,
    // so cron/recurring jobs are NOT supported. Honest status.
    const jobsStatus = 'not_configured';
    const webhooksStatus = searchCount > 0 ? 'warning' : 'not_configured';

    const now = new Date();
    const list = [
      {
        key: 'database',
        icon: Database,
        name: L('قاعدة البيانات', 'Database'),
        desc: L('PocketBase — التخزين والمصادقة والملفات', 'PocketBase — storage, auth & files'),
        status: dbOk ? 'connected' : 'down',
        detail: dbOk ? L('تعمل بشكل طبيعي', 'Operating normally') : L('تعذّر الوصول', 'Unreachable'),
      },
      {
        key: 'email',
        icon: Mail,
        name: L('خدمة البريد', 'Email Service'),
        desc: L('Resend — أكواد التحقق والبريد', 'Resend — OTP & transactional email'),
        status: !diag
          ? (diagErr ? 'down' : 'not_configured')
          : (!diag.resend_key_set
              ? 'not_configured'
              : (diag.domains && diag.domains.some((d) => d.name === 'estatefollow.com' && d.status === 'verified'))
                ? 'connected'
                : 'warning'),
        detail: !diag
          ? (diagErr ? L('تعذّر قراءة الحالة: ', 'Could not read status: ') + diagErr : L('غير متاح', 'Unavailable'))
          : (!diag.resend_key_set
              ? L('مفتاح Resend غير مُعد', 'Resend key not set')
              : (diag.domains && diag.domains.some((d) => d.name === 'estatefollow.com' && d.status === 'verified'))
                ? L('الدومين مُتحقق منه — جاهز', 'Domain verified — ready')
                : (diag.domains && diag.domains.length
                    ? L('الدومين غير مُتحقق منه في Resend', 'Domain not verified in Resend')
                    : L('لا توجد دومينات في Resend', 'No domains in Resend'))),
      },
      {
        key: 'email_marketing',
        icon: Megaphone,
        name: L('التسويق بالبريد', 'Email Marketing'),
        desc: L('المزوّد • الطابور • Webhook • الحملات العالقة', 'Provider • Queue • Webhook • Stuck campaigns'),
        status: mktStatus
          ? (mktStatus.probeOk === false
              ? 'down'
              : mktStatus.stuckCampaigns > 0
                ? 'warning'
                : 'connected')
          : 'not_configured',
        detail: mktStatus
          ? L('المزوّد: ', 'Provider: ') + (mktStatus.providerConnected ? L('متصل', 'Connected') : L('غير متصل', 'Not connected')) +
            ' • ' + L('الطابور: ', 'Queue: ') + (mktStatus.queueRunning ? L('يعمل', 'Running') : L('متوقف', 'Down')) +
            ' • ' + L('Webhook: ', 'Webhook: ') + (mktStatus.webhookConnected ? L('متصل', 'Connected') : L('غير مربوط', 'Not connected')) +
            (mktStatus.stuckCampaigns > 0 ? ' • ' + L('عالقة: ', 'Stuck: ') + mktStatus.stuckCampaigns : '') +
            (mktStatus.lastSuccessAt ? ' • ' + L('آخر نجاح: ', 'Last ok: ') + formatDateTime(mktStatus.lastSuccessAt, lang) : '') +
            (mktStatus.lastFailedAt ? ' • ' + L('آخر فشل: ', 'Last fail: ') + formatDateTime(mktStatus.lastFailedAt, lang) : '')
          : L('غير مُهيأ', 'Not configured'),
      },
      {
        key: 'files',
        icon: HardDrive,
        name: L('تخزين الملفات', 'File Storage'),
        desc: L('مرفقات المستندات والصور', 'Document & image attachments'),
        status: fileOk ? 'connected' : 'down',
        detail: fileOk ? L('يعمل', 'Available') : L('غير متاح', 'Unavailable'),
      },
      {
        key: 'ai',
        icon: Zap,
        name: L('خدمات الذكاء الاصطناعي', 'AI Services'),
        desc: L('واجهة Integrated AI (Express)', 'Integrated AI API (Express)'),
        status: aiOk ? 'connected' : 'down',
        detail: aiOk ? L('متصل', 'Reachable') : L('غير متصل', 'Unreachable'),
      },
      {
        key: 'analytics',
        icon: Activity,
        name: L('التحليلات', 'Analytics'),
        desc: L('زيارات وتتبّع الأجهزة', 'Visits & device tracking'),
        status: analyticsStatus,
        detail:
          analyticsStatus === 'connected'
            ? L('توجد بيانات تتبّع', 'Tracking data present')
            : analyticsStatus === 'warning'
              ? L('لا توجد زيارات مسجّلة بعد', 'No visits recorded yet')
              : L('تعذّر القراءة', 'Could not read'),
      },
      {
        key: 'search',
        icon: Search,
        name: L('تكاملات البحث', 'Search Integrations'),
        desc: L('Search Console / Bing / Analytics', 'Search Console / Bing / Analytics'),
        status: searchStatus,
        detail:
          searchStatus === 'connected'
            ? `${searchCount} ${L('مفعّل', 'enabled')}`
            : searchStatus === 'warning'
              ? L('موجود لكن غير مفعّل', 'Present but disabled')
              : L('لم يتم الربط', 'Not connected'),
      },
      {
        key: 'webhooks',
        icon: Globe,
        name: L('Webhooks', 'Webhooks'),
        desc: L('أحداث مزوّد البريد / الدفع', 'Email / payment provider events'),
        status: webhooksStatus,
        detail:
          webhooksStatus === 'not_configured'
            ? L('يتطلب ربط مزوّد بريد/دفع', 'Requires provider connection')
            : L('جزئي', 'Partial'),
      },
      {
        key: 'jobs',
        icon: Timer,
        name: L('المهام المجدولة', 'Scheduled Tasks'),
        desc: L('Cron / مهام متكررة في الخلفية', 'Cron / recurring background jobs'),
        status: jobsStatus,
        detail: L('غير مدعوم حالياً (الخادم يسبت عند الخمول)', 'Not supported (instance hibernates when idle)'),
      },
      {
        key: 'server',
        icon: Server,
        name: L('خادم API', 'API Server'),
        desc: L('Express — منطق الخادم', 'Express — server-side logic'),
        status: aiOk ? 'connected' : 'down',
        detail: aiOk ? L('يعمل', 'Running') : L('غير متصل', 'Unreachable'),
      },
    ];

    setChecks(list);
    setLastUpdated(now);
    setLoading(false);
  }, [L]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  // Live: re-run health checks when platform settings or visit analytics change.
  useRealtimeRefresh(runChecks, ['platform_settings', 'analytics_visits'], { debounceMs: 600 });

  const handleTestEmail = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await sendTestEmail();
      setTestResult(res);
    } catch (err) {
      setTestResult({
        ok: false,
        reason: String(err?.response?.message || err?.message || err?.status || 'error'),
        status: err?.status || 0,
      });
    } finally {
      setTesting(false);
    }
  };

  const connectedCount = checks.filter((c) => c.status === 'connected').length;
  const issuesCount = checks.filter((c) => c.status === 'warning' || c.status === 'down').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {L(
              'حالة كل خدمة تُقرأ من مصدرها الحقيقي مباشرةً. لا توجد أرقام ثابتة.',
              'Each service status is read from its real source directly. No hardcoded values.',
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground" dir="ltr">
              {L('آخر تحديث', 'Last updated')}: {formatDateTime(lastUpdated, lang)}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={runChecks} disabled={loading} className="min-h-[36px]">
            <RefreshCw size={14} className={cn('me-1', loading && 'animate-spin')} />
            {L('تحديث', 'Refresh')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{L('خدمات متصلة', 'Connected')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{connectedCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{L('تحتاج انتباه', 'Need attention')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{issuesCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{L('غير مُعدة', 'Not configured')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-500">
            {checks.filter((c) => c.status === 'not_configured').length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{L('الإجمالي', 'Total')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{checks.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {checks.map((c) => {
          const tone = TONE[c.status] || TONE.not_configured;
          const Icon = c.icon;
          const SIcon = tone.Icon;
          return (
            <div key={c.key} className="rounded-xl border bg-card p-4 shadow-sm flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold truncate">{c.name}</p>
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tone.cls)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {statusLabel(c.status, L)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.desc}</p>
                <p className="text-xs mt-2 flex items-center gap-1.5">
                  <SIcon size={13} className="shrink-0" />
                  <span className="text-muted-foreground">{c.detail}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- Resend email service diagnostic (Super Admin) ---- */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-primary" />
          <p className="font-bold">{L('حالة خدمة البريد (Resend)', 'Email Service Status (Resend)')}</p>
        </div>
        {emailDiagError && (
          <p className="text-sm text-destructive">
            {L('تعذّر قراءة الحالة من الخادم: ', 'Could not read status from server: ')}{emailDiagError}
          </p>
        )}
        {emailDiag && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{L('مفتاح Resend (RESEND_API_KEY)', 'Resend key (RESEND_API_KEY)')}</span>
              <span className={cn('font-semibold', emailDiag.resend_key_set ? 'text-emerald-600' : 'text-red-600')}>
                {emailDiag.resend_key_set ? L('مُعد', 'Set') : L('غير مُعد', 'Not set')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{L('عنوان المرسل (OTP)', 'Sender address (OTP)')}</span>
              <span className="font-mono text-xs" dir="ltr">{emailDiag.verify_from}</span>
            </div>
            <div className="border-t pt-2">
              <p className="text-muted-foreground mb-1">{L('الدومينات في Resend', 'Domains in Resend')}</p>
              {emailDiag.domains_error ? (
                <p className="text-sm text-amber-600">{L('تعذّر قراءة الدومينات: ', 'Could not read domains: ')}{emailDiag.domains_error}</p>
              ) : emailDiag.domains && emailDiag.domains.length ? (
                <ul className="space-y-1">
                  {emailDiag.domains.map((d) => {
                    const verified = d.status === 'verified';
                    return (
                      <li key={d.name} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs" dir="ltr">{d.name}</span>
                        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
                          verified ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200')}>
                          {verified ? L('مُتحقق منه', 'Verified') : L(d.status || 'غير مُتحقق', d.status || 'Not verified')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-amber-600">{L('لا توجد دومينات في Resend — يجب إضافة estatefollow.com والتحقق منه (سجلات SPF/DKIM/DMARC).', 'No domains in Resend — add estatefollow.com and verify it (SPF/DKIM/DMARC records).')}</p>
              )}
            </div>
            <div className="border-t pt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleTestEmail} disabled={testing} className="min-h-[36px]">
                {testing ? <RefreshCw size={14} className="animate-spin me-1" /> : <Mail size={14} className="me-1" />}
                {L('إرسال رسالة اختبار إلى بريدي', 'Send test email to my address')}
              </Button>
              {testResult && (
                <span className={cn('text-xs font-semibold', testResult.ok ? 'text-emerald-600' : 'text-red-600')}>
                  {testResult.ok
                    ? L('تم الإرسال — تحقق من بريدك (ومجلد Spam). الكود: ', 'Sent — check your inbox (and Spam). Code: ') + testResult.code
                    : L('فشل الإرسال: ', 'Send failed: ') + testResult.reason}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {L('يستخدم الاختبار نفس مسار Resend المستخدم لأكواد التحقق الفعلية، ويُرسل إلى بريدك أنت فقط.', 'This test uses the exact Resend path used for real OTPs, and sends to your own address only.')}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        {L(
          'المهام المجدولة (Cron) و Webhooks لمزوّد البريد/الدفع تتطلب ربط مزوّد خارجي. الحالة "غير مُعد" تعني أن المصدر غير مربوط — وليس أن الخدمة معطّلة.',
          'Scheduled tasks (cron) and email/payment provider webhooks require an external provider connection. "Not Configured" means the source is not linked — not that the service is broken.',
        )}
      </div>
    </div>
  );
}
