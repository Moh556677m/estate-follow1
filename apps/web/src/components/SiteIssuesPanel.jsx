import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  Check,
  Database,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ServerCrash,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import siteIssuesClient from '@/lib/siteIssuesClient';

// Task #23 — Site Issues ("مشاكل الموقع"), Super Admin only.
//
// Scope confirmed with the user (all three selected): platform-wide
// technical/data issues, the same class of problem the existing "SEO & AI
// Search" panel already surfaces (this page links out to it rather than
// duplicating its detection logic — it owns only its own SEO summary for the
// new Task #22 `site_pages` collection), and real technical issues visitors
// actually hit (uncaught frontend JS errors + failed backend API requests,
// both reported automatically — see App.jsx's <SiteIssuesReporter> and
// apps/api/src/middleware/error.js).

const SOURCE_META = {
  js_error: { label_en: 'Frontend error', label_ar: 'خطأ في الواجهة', icon: Bug, cls: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  api_error: { label_en: 'API error', label_ar: 'خطأ في الـ API', icon: ServerCrash, cls: 'bg-red-500/10 text-red-600 border-red-500/30' },
  seo: { label_en: 'SEO', label_ar: 'SEO', icon: Search, cls: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  data_integrity: { label_en: 'Data integrity', label_ar: 'تكامل البيانات', icon: Database, cls: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
};

const SEVERITY_META = {
  critical: { label_en: 'Critical', label_ar: 'حرج', cls: 'bg-red-500/10 text-red-700 border-red-500/30' },
  warning: { label_en: 'Warning', label_ar: 'تحذير', cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  info: { label_en: 'Info', label_ar: 'معلومة', cls: 'bg-slate-500/10 text-slate-600 border-slate-500/30' },
};

function SectionCard({ title, subtitle, action, children }) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-base sm:text-lg">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function groupByFingerprint(items) {
  const map = new Map();
  items.forEach((it) => {
    const key = it.fingerprint || it.id;
    if (!map.has(key)) {
      map.set(key, { ...it, count: 1, last_created: it.created });
    } else {
      const existing = map.get(key);
      existing.count += 1;
      if (it.created > existing.last_created) existing.last_created = it.created;
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.last_created > a.last_created ? 1 : -1));
}

export default function SiteIssuesPanel() {
  const { lang } = useLanguage();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const [items, setItems] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setItems(null);
    const params = {};
    if (statusFilter !== 'all') params.status = statusFilter;
    if (sourceFilter !== 'all') params.source = sourceFilter;
    siteIssuesClient
      .list(params)
      .then((res) => setItems(res.items || []))
      .catch(() => setItems([]));
  };

  useEffect(() => { load(); }, [statusFilter, sourceFilter]);

  const grouped = useMemo(() => groupByFingerprint(items || []), [items]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await siteIssuesClient.scan();
      notify.success(L(`تم الفحص — ${res.findings_created} ملاحظة جديدة`, `Scan complete — ${res.findings_created} new findings`));
      load();
    } catch (err) {
      notify.error(err?.message || L('فشل الفحص', 'Scan failed'));
    } finally {
      setScanning(false);
    }
  };

  const setStatus = async (id, status) => {
    setBusyId(id);
    try {
      await siteIssuesClient.update(id, { status });
      setItems((all) => all.map((it) => (it.id === id ? { ...it, status } : it)));
    } catch (err) {
      notify.error(err?.message || L('فشل التحديث', 'Update failed'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    setBusyId(id);
    try {
      await siteIssuesClient.remove(id);
      setItems((all) => all.filter((it) => it.id !== id));
    } catch (err) {
      notify.error(err?.message || L('فشل الحذف', 'Delete failed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <AlertTriangle size={22} />
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{L('مشاكل الموقع', 'Site Issues')}</h2>
          <p className="text-sm text-muted-foreground">
            {L(
              'أخطاء الواجهة والـ API المُبلَّغ عنها تلقائيًا من زوار حقيقيين، إضافة لفحص تكامل بيانات دوري وملخص SEO.',
              'Frontend/API errors reported automatically from real visitors, plus an on-demand data-integrity scan and an SEO summary.',
            )}
          </p>
        </div>
      </div>

      <SectionCard
        title={L('فحص تكامل البيانات', 'Data integrity scan')}
        subtitle={L('يفحص العقارات المعلّقة لفترة طويلة، الدفعات اليتيمة، صلاحيات تالفة، وصفحات منشورة بدون محتوى.', 'Checks long-pending properties, orphaned payments, corrupt permissions, and empty published pages.')}
        action={(
          <Button size="sm" onClick={runScan} disabled={scanning}>
            {scanning ? <Loader2 size={14} className="animate-spin me-1" /> : <RefreshCw size={14} className="me-1" />}
            {L('تشغيل الفحص الآن', 'Run scan now')}
          </Button>
        )}
      />

      <SectionCard
        title={L('مشاكل SEO', 'SEO issues')}
        subtitle={L('للفحص الكامل (روابط مكسورة، Canonical، فهرسة) استخدم لوحة "SEO والذكاء الاصطناعي" الحالية — هذه اللوحة لا تكرر منطقها.', 'For the full check (broken links, canonical, indexing) use the existing "SEO & AI Search" panel — this page does not duplicate its logic.')}
        action={<span className="text-xs text-muted-foreground">{L('راجع تبويب "SEO"', 'See the "SEO" tab')}</span>}
      />

      <SectionCard
        title={L('السجل', 'Log')}
        action={(
          <div className="flex flex-wrap gap-2">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{L('كل المصادر', 'All sources')}</SelectItem>
                {Object.entries(SOURCE_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{lang === 'ar' ? m.label_ar : m.label_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{L('مفتوحة', 'Open')}</SelectItem>
                <SelectItem value="resolved">{L('محلولة', 'Resolved')}</SelectItem>
                <SelectItem value="ignored">{L('متجاهَلة', 'Ignored')}</SelectItem>
                <SelectItem value="all">{L('الكل', 'All')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      >
        {items === null ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="animate-spin me-2" size={18} />
            {L('جارٍ التحميل...', 'Loading...')}
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{L('لا توجد مشاكل في هذا الفلتر 🎉', 'No issues match this filter 🎉')}</p>
        ) : (
          <div className="space-y-2">
            {grouped.map((it) => {
              const src = SOURCE_META[it.source] || SOURCE_META.js_error;
              const sev = SEVERITY_META[it.severity] || SEVERITY_META.warning;
              const Icon = src.icon;
              return (
                <div key={it.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-start gap-2 min-w-0">
                      <Icon size={16} className="mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm break-words">{it.title}</p>
                        {it.message && <p className="text-xs text-muted-foreground break-words mt-0.5">{it.message}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full border', src.cls)}>{lang === 'ar' ? src.label_ar : src.label_en}</span>
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full border', sev.cls)}>{lang === 'ar' ? sev.label_ar : sev.label_en}</span>
                      {it.count > 1 && <span className="text-[11px] px-2 py-0.5 rounded-full border bg-muted">×{it.count}</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">{new Date(it.last_created || it.created).toLocaleString()}</span>
                    <div className="flex items-center gap-1">
                      {it.status !== 'resolved' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === it.id} onClick={() => setStatus(it.id, 'resolved')}>
                          <Check size={12} className="me-1" />{L('حل', 'Resolve')}
                        </Button>
                      )}
                      {it.status !== 'ignored' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === it.id} onClick={() => setStatus(it.id, 'ignored')}>
                          <XCircle size={12} className="me-1" />{L('تجاهل', 'Ignore')}
                        </Button>
                      )}
                      {it.status !== 'open' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === it.id} onClick={() => setStatus(it.id, 'open')}>
                          <Info size={12} className="me-1" />{L('إعادة فتح', 'Reopen')}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" disabled={busyId === it.id} onClick={() => remove(it.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
