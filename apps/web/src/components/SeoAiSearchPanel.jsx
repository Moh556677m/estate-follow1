import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronRight,
  Code,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Hash,
  HelpCircle,
  LayoutDashboard,
  Link2,
  ListChecks,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Unlink,
  Wand2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import integratedAiClient from '@/lib/integratedAiClient';
import { isSuperAdmin as checkSuperAdmin } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/api';
import { loadSettingsAudit, writeSettingsAudit } from '@/lib/settingsAudit';
import { EmptyState } from '@/components/shared';
import {
  buildDefaultCms,
  mergeCms,
  uid,
  DEFAULT_ROBOTS_TXT,
} from '@/lib/cmsDefaults';

/* ---------------- helpers ---------------- */

function deepClone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

function L(ar, en, lang) {
  return lang === 'ar' ? ar : en;
}

/* ---------------- Search & AI integrations: honest status ----------------
   The "connected" badge is DERIVED from real credentials actually present,
   never from a manual toggle. The only integration we can verify FROM INSIDE
   the site is Google Analytics, because its gtag.js snippet is hardcoded in
   index.html and fires on every page. Everything else (Search Console, Bing,
   Tag Manager) is at most "configured" — credentials entered here, but final
   verification/deployment happens on the external platform and cannot be
   confirmed from inside the site. We never claim "connected" for those. */

// Must match the Measurement ID hardcoded in apps/web/index.html (gtag.js).
const REAL_GA_MEASUREMENT_ID = 'G-G5N5852F44';

// Per-integration validation + UI config. `deriveStatus` returns one of:
//   'connected'      — genuinely live & verifiable from inside the site (GA only)
//   'configured'     — credentials entered, but external verification/deploy needed
//   'not_configured' — no usable credentials
const INTEGRATION_RULES = {
  google_analytics: {
    // GA4 Measurement ID looks like G-XXXXXXXXXX. The real one is loaded
    // site-wide via index.html, so this is the one integration we can truthfully
    // call "connected".
    realId: REAL_GA_MEASUREMENT_ID,
    fieldLabel: { ar: 'Measurement ID', en: 'Measurement ID' },
    settingsLabel: { ar: 'إعدادات إضافية', en: 'Extra settings' },
    placeholder: 'G-XXXXXXXXXX',
    derive: (it) => {
      // Use the effective value so an empty cms field still reflects the
      // real id hardcoded in index.html (GA is genuinely live either way).
      const id = String(effectiveVerification('google_analytics', it) || '').trim().toUpperCase();
      const isValid = /^G-[A-Z0-9]{4,}$/.test(id);
      return isValid ? 'connected' : 'not_configured';
    },
    note: {
      ar: 'مُحمّل فعليًا في الموقع عبر index.html برقم G-G5N5852F44 ويُطلق على كل صفحة. هذا التكامل الوحيد القابل للتحقق من داخل الموقع.',
      en: 'Actually loaded site-wide via index.html with ID G-G5N5852F44 and fires on every page. The only integration verifiable from inside the site.',
    },
  },
  google_search_console: {
    fieldLabel: { ar: 'رمز التحقق (google-site-verification)', en: 'Verification token (google-site-verification)' },
    settingsLabel: { ar: 'النطاق المُتحقَّق', en: 'Verified domain' },
    placeholder: 'google-site-verification=xxxxxxxx...',
    derive: (it) => {
      const token = String(it.verification || '').trim();
      const domain = String(it.settings || '').trim().toLowerCase();
      const hasDomain = domain.includes('estatefollow.com');
      if (token && hasDomain) return 'configured';
      if (token || hasDomain) return 'configured';
      return 'not_configured';
    },
    note: {
      ar: 'إدخال الرمز والنطاق هنا يُعدّه فقط. التحقق الفعلي يُؤكَّد من داخل Google Search Console ولا يمكن التأكد منه من داخل الموقع.',
      en: 'Entering token + domain here only configures it. Actual verification is confirmed inside Google Search Console and cannot be checked from inside the site.',
    },
  },
  google_tag_manager: {
    // A GTM container ID is GTM-XXXXXXX. A GA4 Measurement ID (G-XXXX) is NOT
    // a GTM container. No GTM snippet is loaded in index.html, so even a valid
    // GTM- ID is "configured" (not deployed), never "connected".
    fieldLabel: { ar: 'Container ID', en: 'Container ID' },
    settingsLabel: { ar: 'إعدادات إضافية', en: 'Extra settings' },
    placeholder: 'GTM-XXXXXXX',
    derive: (it) => {
      const id = String(it.verification || '').trim().toUpperCase();
      const isGtm = /^GTM-[A-Z0-9]{4,}$/.test(id);
      if (isGtm) return 'configured';
      // A G- id here is a common mistake — flag it as not configured.
      return 'not_configured';
    },
    note: {
      ar: 'لا يوجد حاوية GTM مُحمّلة في الموقع. رقم G-G5N5852F44 هو GA4 وليس حاوية GTM. أدخل Container ID بصيغة GTM-XXXXXXX ثم أضف السكربت إلى index.html لتفعيله فعليًا.',
      en: 'No GTM container is loaded in the site. G-G5N5852F44 is a GA4 id, not a GTM container. Enter a Container ID (GTM-XXXXXXX) and add the snippet to index.html to actually deploy it.',
    },
  },
  bing_webmaster: {
    fieldLabel: { ar: 'رمز التحقق (msvalidate.01)', en: 'Verification token (msvalidate.01)' },
    settingsLabel: { ar: 'إعدادات إضافية', en: 'Extra settings' },
    placeholder: 'msvalidate.01=xxxxxxxx...',
    derive: (it) => {
      const token = String(it.verification || '').trim();
      return token ? 'configured' : 'not_configured';
    },
    note: {
      ar: 'إدخال الرمز هنا يُعدّه فقط. التحقق الفعلي يُؤكَّد من داخل Bing Webmaster Tools.',
      en: 'Entering the token here only configures it. Actual verification is confirmed inside Bing Webmaster Tools.',
    },
  },
};

// Resolve the effective verification value for display (GA falls back to the
// real hardcoded id when the cms field is empty, so the UI always tells the
// truth about what is actually firing).
function effectiveVerification(key, it) {
  const rule = INTEGRATION_RULES[key];
  if (!rule) return it.verification || '';
  if (key === 'google_analytics' && !(it.verification || '').trim()) {
    return rule.realId || '';
  }
  return it.verification || '';
}

function deriveIntegrationStatus(key, it) {
  const rule = INTEGRATION_RULES[key];
  if (!rule) return 'not_configured';
  // If the integration is explicitly disabled, show "disabled" regardless.
  if (it && it.enabled === false) return 'disabled';
  return rule.derive(it || {});
}

function integrationBadge(status, lang) {
  switch (status) {
    case 'connected':
      return { text: L('متصل', 'Connected', lang), cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'configured':
      return { text: L('مُعدّ', 'Configured', lang), cls: 'bg-sky-100 text-sky-800 border-sky-200' };
    case 'disabled':
      return { text: L('متوقف', 'Off', lang), cls: 'bg-slate-100 text-slate-500 border-slate-200' };
    default:
      return { text: L('غير مُعدّ', 'Not configured', lang), cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

function scoreColor(score) {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function Card({ title, subtitle, children, actions }) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-base sm:text-lg">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function SaveBar({ saving, onSave, disabled, hint }) {
  const { lang } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-background md:bg-background/90 md:backdrop-blur py-3 px-1">
      <Button type="button" onClick={onSave} disabled={disabled || saving} className="min-h-[44px]">
        <Save size={16} className="me-1" />
        {saving ? L('جارٍ الحفظ…', 'Saving…', lang) : L('حفظ', 'Save', lang)}
      </Button>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, tone = 'default', onClick }) {
  const tones = {
    default: 'bg-card',
    ok: 'bg-emerald-50 border-emerald-200',
    warn: 'bg-amber-50 border-amber-200',
    bad: 'bg-red-50 border-red-200',
    info: 'bg-sky-50 border-sky-200',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'rounded-xl border p-4 text-start shadow-sm transition-colors min-h-[88px] flex flex-col gap-1',
        tones[tone],
        onClick && 'hover:border-primary/40 hover:bg-accent/40',
      )}
    >
      <div className="flex items-center justify-between">
        <Icon size={18} className="text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
    </button>
  );
}

function ReorderButtons({ index, total, disabled, onMove }) {
  return (
    <div className="flex gap-1">
      <Button type="button" size="sm" variant="ghost" className="min-h-[32px] h-8 w-8 p-0" disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp size={14} />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="min-h-[32px] h-8 w-8 p-0" disabled={disabled || index === total - 1} onClick={() => onMove(index, index + 1)}>
        <ArrowDown size={14} />
      </Button>
    </div>
  );
}

function ListEditor({ items, setItems, fields, opts = {}, lang, disabled }) {
  const { allowAdd = true, allowDelete = true, addLabel = L('إضافة', 'Add', lang), newItem } = opts;
  return (
    <div className="space-y-3">
      {(items || []).map((item, idx) => (
        <div key={item.id || idx} className="rounded-lg border p-3 space-y-2 bg-background/50">
          <div className="flex flex-wrap items-center gap-2">
            <ReorderButtons index={idx} total={items.length} disabled={disabled} onMove={(from, to) => {
              const next = [...items];
              const [m] = next.splice(from, 1);
              next.splice(to, 0, m);
              setItems(next);
            }} />
            {'active' in item && (
              <Button type="button" size="sm" variant="outline" className="min-h-[32px]" disabled={disabled}
                onClick={() => setItems(items.map((x, i) => (i === idx ? { ...x, active: !x.active } : x)))}>
                {item.active ? <Eye size={13} /> : <Eye size={13} className="opacity-40" />}
              </Button>
            )}
            {'visible' in item && (
              <Button type="button" size="sm" variant="outline" className="min-h-[32px]" disabled={disabled}
                onClick={() => setItems(items.map((x, i) => (i === idx ? { ...x, visible: !x.visible } : x)))}>
                {item.visible ? <Eye size={13} /> : <Eye size={13} className="opacity-40" />}
              </Button>
            )}
            {allowDelete && (
              <Button type="button" size="sm" variant="ghost" className="min-h-[32px] text-destructive ms-auto" disabled={disabled}
                onClick={() => { if (window.confirm(L('حذف هذا العنصر؟', 'Delete this item?', lang))) setItems(items.filter((_, i) => i !== idx)); }}>
                <Trash2 size={13} />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fields.map((f) => (
              <div key={f.key} className={cn('space-y-1', f.span && 'sm:col-span-2')}>
                <Label className="text-xs">{f.label}</Label>
                {f.type === 'textarea' ? (
                  <Textarea value={item[f.key] || ''} rows={f.rows || 2} dir={f.dir || 'auto'} disabled={disabled}
                    onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, [f.key]: e.target.value } : x)))} />
                ) : f.type === 'select' ? (
                  <Select value={String(item[f.key] ?? '')} disabled={disabled}
                    onValueChange={(v) => setItems(items.map((x, i) => (i === idx ? { ...x, [f.key]: v } : x)))}>
                    <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input value={item[f.key] ?? ''} dir={f.dir || 'auto'} type={f.type || 'text'} disabled={disabled} className="min-h-[40px]"
                    onChange={(e) => {
                      const val = f.type === 'number' ? Number(e.target.value) : e.target.value;
                      setItems(items.map((x, i) => (i === idx ? { ...x, [f.key]: val } : x)));
                    }} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {allowAdd && !disabled && (
        <Button type="button" variant="outline" className="min-h-[44px]"
          onClick={() => setItems([...items, newItem ? newItem(items.length) : { id: uid('item') }])}>
          <Plus size={14} className="me-1" />{addLabel}
        </Button>
      )}
    </div>
  );
}

/* ---------------- tabs config ---------------- */

const TABS = [
  { id: 'overview', ar: 'نظرة عامة', en: 'Overview', icon: LayoutDashboard },
  { id: 'global', ar: 'SEO العام', en: 'Global SEO', icon: Globe },
  { id: 'pages', ar: 'SEO الصفحات', en: 'Page SEO', icon: FileText },
  { id: 'keywords', ar: 'الكلمات المفتاحية', en: 'Keywords', icon: Tag },
  { id: 'kwai', ar: 'الكلمات المفتاحية وموضوعات الذكاء الاصطناعي', en: 'Keywords & AI Topics', icon: Hash },
  { id: 'ai', ar: 'AI Search', en: 'AI Search', icon: Bot },
  { id: 'brand', ar: 'Brand Entity', en: 'Brand Entity', icon: Network },
  { id: 'sitemap', ar: 'Sitemap', en: 'Sitemap', icon: Network },
  { id: 'indexing', ar: 'الفهرسة', en: 'Indexing', icon: ListChecks },
  { id: 'robots', ar: 'Robots.txt', en: 'Robots.txt', icon: FileText },
  { id: 'structured', ar: 'البيانات المنظّمة', en: 'Structured Data', icon: Code },
  { id: 'performance', ar: 'الأداء', en: 'Performance', icon: Zap },
  { id: 'redirects', ar: 'التوجيهات', en: 'Redirects', icon: Link2 },
  { id: 'broken', ar: 'الروابط المكسورة', en: 'Broken Links', icon: Unlink },
  { id: 'searchperf', ar: 'أداء البحث', en: 'Search Performance', icon: TrendingUp },
  { id: 'content', ar: 'المحتوى', en: 'Content & Knowledge Hub', icon: FileText },
  { id: 'faq', ar: 'الأسئلة الشائعة', en: 'FAQ', icon: HelpCircle },
  { id: 'integrations', ar: 'التكاملات', en: 'Integrations', icon: Settings2 },
  { id: 'audit', ar: 'سجل التعديلات', en: 'Audit Log', icon: Activity },
];

/* ---------------- main component ---------------- */

export default function SeoAiSearchPanel() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const isSuperAdmin = checkSuperAdmin(user);

  const [record, setRecord] = useState(null);
  const [cms, setCms] = useState(() => buildDefaultCms());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [active, setActive] = useState('overview');
  const [search, setSearch] = useState('');
  const [editingPage, setEditingPage] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const undoStack = useRef([]);

  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await pb.collection('platform_settings').getFullList({ sort: 'created' });
      if (rows.length) {
        const r = rows[0];
        setRecord(r);
        setCms(mergeCms(r.cms));
      } else {
        setRecord(null);
        setCms(buildDefaultCms());
      }
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadAudit = useCallback(async () => {
    if (!isSuperAdmin) return;
    setAuditLoading(true);
    try {
      const rows = await loadSettingsAudit();
      setAudit(rows);
    } finally {
      setAuditLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => { load(); loadAudit(); }, [load, loadAudit]);

  // Live: SEO/AI-search settings and audit log update in real time.
  useRealtimeRefresh(load, ['platform_settings']);
  useRealtimeRefresh(loadAudit, ['settings_audit_logs']);

  const writeAudit = async (section, action, summary, oldVal, newVal) => {
    await writeSettingsAudit({
      user,
      section: `seo:${section}`,
      action,
      summary,
      oldValue: oldVal,
      newValue: newVal,
      requestKeyPrefix: 'seo-audit',
    });
  };

  const saveAll = async (sectionLabel) => {
    if (!isSuperAdmin) return;
    setSaving(true);
    setError('');
    try {
      const oldSnap = record ? deepClone(record.cms || {}) : null;
      const fd = new FormData();
      fd.append('cms', JSON.stringify(cms));
      let saved;
      if (record) {
        saved = await pb.collection('platform_settings').update(record.id, fd, { requestKey: `seo-save-${Date.now()}` });
      } else {
        // create needs required fields; platform_settings has no required non-system fields
        saved = await pb.collection('platform_settings').create(fd, { requestKey: `seo-create-${Date.now()}` });
      }
      setRecord(saved);
      setCms(mergeCms(saved.cms));
      await writeAudit(sectionLabel || 'all', 'save', L(`حفظ قسم SEO: ${sectionLabel}`, `Saved SEO section: ${sectionLabel}`, lang), oldSnap, deepClone(cms));
      try {
        window.dispatchEvent(new CustomEvent('estatefollow-cms-updated', { detail: { cms: saved.cms, brand: saved } }));
      } catch { /* ignore */ }
      flash(t('settings_saved'));
      undoStack.current = [];
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setSaving(false);
    }
  };

  const pushUndo = () => { undoStack.current.push(deepClone(cms)); };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (prev) setCms(prev);
  };

  const filteredTabs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return TABS;
    return TABS.filter((x) => x.id.includes(q) || x.ar.includes(search.trim()) || x.en.toLowerCase().includes(q));
  }, [search]);

  /* ---- derived metrics ---- */
  const pages = cms.seo_pages || [];
  const indexable = pages.filter((p) => p.index !== false);
  const noindex = pages.filter((p) => p.index === false);
  const missingTitles = pages.filter((p) => !p.seo_title_en && !p.seo_title_ar);
  const missingDesc = pages.filter((p) => !p.meta_desc_en && !p.meta_desc_ar);
  const dupTitles = useMemo(() => {
    const seen = {};
    const dups = [];
    pages.forEach((p) => {
      const k = (p.seo_title_en || p.seo_title_ar || '').trim().toLowerCase();
      if (!k) return;
      if (seen[k]) dups.push(p);
      else seen[k] = true;
    });
    return dups;
  }, [pages]);
  const structuredErrors = pages.filter((p) => p.structured_data && p.structured_data !== 'WebSite' && !p.seo_title_en);
  const brokenLinks = []; // no live scanner; populated when integration reports
  const gsc = cms.seo_integrations?.google_search_console;
  const gaInt = cms.seo_integrations?.google_analytics;
  const hasSearchData = deriveIntegrationStatus('google_search_console', gsc) === 'configured';
  const hasPerfData = deriveIntegrationStatus('google_analytics', gaInt) === 'connected';

  const healthScore = useMemo(() => {
    if (!pages.length) return 0;
    let s = 0;
    s += 25 * (pages.filter((p) => p.seo_title_en || p.seo_title_ar).length / pages.length);
    s += 25 * (pages.filter((p) => p.meta_desc_en || p.meta_desc_ar).length / pages.length);
    s += 15 * (indexable.length / pages.length);
    s += 10 * (pages.filter((p) => p.structured_data).length / pages.length);
    s += 10 * (cms.seo?.canonical_domain ? 1 : 0);
    s += 5 * (cms.seo?.og_image_url ? 1 : 0);
    s += 5 * (cms.robots_txt ? 1 : 0);
    s += 5 * (hasSearchData ? 1 : 0);
    return Math.round(s);
  }, [pages, indexable, cms, hasSearchData]);

  /* ---------------- renderers ---------------- */

  const renderOverview = () => (
    <div className="space-y-5">
      <Card title={L('SEO Health Score', 'SEO Health Score', lang)} subtitle={L('تقييم شامل لحالة الـ SEO في المنصة', 'Overall SEO health for the platform', lang)}>
        <div className="flex items-center gap-4">
          <div className={cn('text-5xl font-black tabular-nums', scoreColor(healthScore))}>{healthScore}</div>
          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${healthScore}%` }} />
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <MiniStat icon={FileText} label={L('الصفحات العامة', 'Public Pages', lang)} value={pages.length} onClick={() => setActive('pages')} />
        <MiniStat icon={Check} label={L('قابلة للفهرسة', 'Indexable', lang)} value={indexable.length} tone="ok" onClick={() => setActive('indexing')} />
        <MiniStat icon={AlertTriangle} label={L('صفحات بها مشاكل', 'Pages with Issues', lang)} value={missingTitles.length + missingDesc.length} tone="warn" onClick={() => setActive('indexing')} />
        <MiniStat icon={FileText} label={L('Missing Titles', 'Missing Titles', lang)} value={missingTitles.length} tone="warn" onClick={() => setActive('indexing')} />
        <MiniStat icon={FileText} label={L('Missing Descriptions', 'Missing Descriptions', lang)} value={missingDesc.length} tone="warn" onClick={() => setActive('indexing')} />
        <MiniStat icon={Unlink} label={L('الروابط المكسورة', 'Broken Links', lang)} value={brokenLinks.length} tone="bad" onClick={() => setActive('broken')} />
        <MiniStat icon={Network} label={L('Sitemap Status', 'Sitemap Status', lang)} value={cms.robots_txt ? L('مفعّل', 'Active', lang) : L('—', '—', lang)} onClick={() => setActive('sitemap')} />
        <MiniStat icon={Code} label={L('Structured Data Errors', 'Structured Data Errors', lang)} value={structuredErrors.length} tone="bad" onClick={() => setActive('structured')} />
        <MiniStat icon={Zap} label={L('Mobile Performance', 'Mobile Performance', lang)} value={hasPerfData ? L('مرتبط', 'Connected', lang) : L('غير مرتبط', 'Not connected', lang)} tone={hasPerfData ? 'ok' : 'warn'} onClick={() => setActive('performance')} />
        <MiniStat icon={Bot} label={L('AI Visibility', 'AI Visibility', lang)} value={cms.ai_search?.review_status === 'published' ? L('منشور', 'Published', lang) : L('مسودة', 'Draft', lang)} tone="info" onClick={() => setActive('ai')} />
      </div>
    </div>
  );

  const renderGlobal = () => {
    const s = cms.seo || {};
    const setSeo = (patch) => { pushUndo(); setCms((c) => ({ ...c, seo: { ...c.seo, ...patch } })); };
    return (
      <div className="space-y-4">
        <Card title={L('SEO العام', 'Global SEO', lang)} subtitle={L('إعدادات الـ SEO الأساسية للمنصة. أي تعديل يظهر فورًا في الموقع.', 'Core SEO settings. Changes apply live.', lang)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ['site_title_en', L('عنوان الموقع (إنجليزي)', 'Site Title (EN)', 'ltr')],
              ['site_title_ar', L('عنوان الموقع (عربي)', 'Site Title (AR)', 'rtl')],
              ['brand_name', L('اسم العلامة', 'Brand Name', 'ltr')],
              ['canonical_domain', L('النطاق الأساسي', 'Canonical Domain', 'ltr')],
              ['meta_title_en', 'Meta Title EN', 'ltr'],
              ['meta_title_ar', 'Meta Title AR', 'rtl'],
              ['og_title', L('Open Graph Title', 'Open Graph Title', 'ltr')],
            ].map(([k, label, dir]) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input value={s[k] || ''} dir={dir} disabled={!isSuperAdmin} className="min-h-[40px]"
                  onChange={(e) => setSeo({ [k]: e.target.value })} />
              </div>
            ))}
            {[
              ['meta_description_en', 'Meta Description EN', 'ltr'],
              ['meta_description_ar', 'Meta Description AR', 'rtl'],
              ['og_description', L('Open Graph Description', 'Open Graph Description', 'ltr')],
            ].map(([k, label, dir]) => (
              <div key={k} className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{label}</Label>
                <Textarea value={s[k] || ''} dir={dir} rows={2} disabled={!isSuperAdmin}
                  onChange={(e) => setSeo({ [k]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">{L('صورة المشاركة الافتراضية', 'Default Social Image (URL)', lang)}</Label>
              <Input value={s.og_image_url || ''} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]"
                onChange={(e) => setSeo({ og_image_url: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('أيقونة الموقع (Favicon)', 'Site Icon (Favicon)', lang)}</Label>
              <Input value={record?.site_icon_url || ''} dir="ltr" disabled className="min-h-[40px]"
                onChange={() => {}} />
              <p className="text-[11px] text-muted-foreground">
                {L(
                  'تُدار من مركز التحكم ← الهوية (Favicon / أيقونة الموقع). الحفظ يحدّث الأيقونة فورًا مع كسر الكاش.',
                  'Managed in Control Center → Branding (Favicon / Site Icon). Saving updates the icon live with cache busting.',
                  lang,
                )}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('X / Twitter Card', 'X / Twitter Card', lang)}</Label>
              <Select value={s.twitter_card || 'summary_large_image'} disabled={!isSuperAdmin} onValueChange={(v) => setSeo({ twitter_card: v })}>
                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">summary</SelectItem>
                  <SelectItem value="summary_large_image">summary_large_image</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('اللغة الافتراضية', 'Default Language', lang)}</Label>
              <Select value={s.default_language || 'ar'} disabled={!isSuperAdmin} onValueChange={(v) => setSeo({ default_language: v })}>
                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{L('اللغات المدعومة (مفصولة بفاصلة)', 'Supported Languages (comma separated)', lang)}</Label>
              <Input value={(s.supported_languages || []).join(', ')} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]"
                onChange={(e) => setSeo({ supported_languages: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            </div>
          </div>
        </Card>
        <SaveBar saving={saving} onSave={() => saveAll('global')} disabled={!isSuperAdmin} hint={L('يظهر فعليًا في الموقع فور الحفظ', 'Applies live on save', lang)} />
      </div>
    );
  };

  const renderPages = () => {
    if (editingPage) {
      const p = pages.find((x) => x.id === editingPage);
      if (!p) { setEditingPage(null); return null; }
      const setP = (patch) => { pushUndo(); setCms((c) => ({ ...c, seo_pages: c.seo_pages.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) })); };
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-[36px]" onClick={() => setEditingPage(null)}>
              <ChevronRight size={14} className={lang === 'ar' ? 'rotate-180' : ''} />{L('رجوع', 'Back', lang)}
            </Button>
            <h3 className="font-bold">{lang === 'ar' ? p.name_ar : p.name_en}</h3>
          </div>
          <Card title={L('تحرير SEO للصفحة', 'Edit Page SEO', lang)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['seo_title_en', 'SEO Title EN', 'ltr'],
                ['seo_title_ar', 'SEO Title AR', 'rtl'],
                ['meta_desc_en', 'Meta Description EN', 'ltr'],
                ['meta_desc_ar', 'Meta Description AR', 'rtl'],
                ['h1', 'H1', 'auto'],
                ['slug', 'URL Slug', 'ltr'],
                ['canonical', 'Canonical URL', 'ltr'],
                ['social_image', L('صورة المشاركة', 'Social Image (URL)', lang), 'ltr'],
                ['ai_description', L('AI Description', 'AI Description', lang), 'auto'],
              ].map(([k, label, dir]) => (
                <div key={k} className={cn('space-y-1', (k === 'meta_desc_en' || k === 'meta_desc_ar' || k === 'ai_description') && 'sm:col-span-2')}>
                  <Label className="text-xs">{label}</Label>
                  {k.includes('desc') || k === 'ai_description' ? (
                    <Textarea value={p[k] || ''} dir={dir} rows={2} disabled={!isSuperAdmin} onChange={(e) => setP({ [k]: e.target.value })} />
                  ) : (
                    <Input value={p[k] || ''} dir={dir} disabled={!isSuperAdmin} className="min-h-[40px]" onChange={(e) => setP({ [k]: e.target.value })} />
                  )}
                </div>
              ))}
              <div className="space-y-1">
                <Label className="text-xs">Index / Noindex</Label>
                <Select value={p.index === false ? 'noindex' : 'index'} disabled={!isSuperAdmin} onValueChange={(v) => setP({ index: v === 'index' })}>
                  <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="index">index</SelectItem><SelectItem value="noindex">noindex</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Follow / Nofollow</Label>
                <Select value={p.follow === false ? 'nofollow' : 'follow'} disabled={!isSuperAdmin} onValueChange={(v) => setP({ follow: v === 'follow' })}>
                  <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="follow">follow</SelectItem><SelectItem value="nofollow">nofollow</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{L('البيانات المنظّمة', 'Structured Data', lang)}</Label>
                <Select value={p.structured_data || 'none'} disabled={!isSuperAdmin} onValueChange={(v) => setP({ structured_data: v === 'none' ? '' : v })}>
                  <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{L('بدون', 'None', lang)}</SelectItem>
                    <SelectItem value="WebSite">WebSite</SelectItem>
                    <SelectItem value="Organization">Organization</SelectItem>
                    <SelectItem value="LocalBusiness">LocalBusiness</SelectItem>
                    <SelectItem value="FAQPage">FAQPage</SelectItem>
                    <SelectItem value="Article">Article</SelectItem>
                    <SelectItem value="BreadcrumbList">BreadcrumbList</SelectItem>
                    <SelectItem value="LoginAction">LoginAction</SelectItem>
                    <SelectItem value="CreateAction">CreateAction</SelectItem>
                    <SelectItem value="PasswordResetAction">PasswordResetAction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">{L('الكلمات المفتاحية المستهدفة', 'Target Keywords', lang)}</Label>
                <Input value={(p.keywords || []).join(', ')} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]"
                  onChange={(e) => setP({ keywords: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                <p className="text-[11px] text-muted-foreground">{L('أداة تنظيم فقط — لا تكرار تلقائي.', 'Organization only — no auto keyword stuffing.', lang)}</p>
              </div>
            </div>
          </Card>
          <Card title={L('معاينة البحث', 'Search Preview', lang)}>
            <div className="rounded-lg border p-3 bg-background max-w-2xl">
              <p className="text-[12px] text-emerald-700 truncate" dir="ltr">{p.canonical || `https://${cms.seo?.canonical_domain || 'example.com'}${p.url}`}</p>
              <p className="text-lg text-blue-700 truncate">{p.seo_title_en || p.seo_title_ar || (lang === 'ar' ? p.name_ar : p.name_en)}</p>
              <p className="text-sm text-muted-foreground line-clamp-2">{p.meta_desc_en || p.meta_desc_ar || L('— لا يوجد وصف —', '— no description —', lang)}</p>
            </div>
          </Card>
          <SaveBar saving={saving} onSave={() => saveAll('pages')} disabled={!isSuperAdmin} />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <Card title={L('SEO لكل صفحة', 'Page SEO', lang)} subtitle={L('كل صفحة عامة جديدة تظهر هنا تلقائيًا.', 'New public pages appear here automatically.', lang)}>
          <div className="space-y-2">
            {pages.map((p) => {
              const score = Math.round(((p.seo_title_en || p.seo_title_ar ? 35 : 0) + (p.meta_desc_en || p.meta_desc_ar ? 35 : 0) + (p.structured_data ? 15 : 0) + (p.index !== false ? 15 : 0)));
              const status = p.index === false ? L('noindex', 'noindex', lang) : L('index', 'index', lang);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-sm font-semibold">{lang === 'ar' ? p.name_ar : p.name_en}</p>
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">{p.url}</p>
                  </div>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', p.index === false ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200')}>{status}</span>
                  <span className={cn('text-sm font-bold tabular-nums', scoreColor(score))}>{score}</span>
                  <Button size="sm" variant="outline" className="min-h-[34px]" onClick={() => setEditingPage(p.id)} disabled={!isSuperAdmin}>
                    <Pencil size={13} className="me-1" />{L('تحرير', 'Edit', lang)}
                  </Button>
                </div>
              );
            })}
            {pages.length === 0 && <EmptyState message={L('لا توجد صفحات عامة.', 'No public pages.', lang)} icon={FileText} />}
          </div>
        </Card>
      </div>
    );
  };

  const renderKeywords = () => {
    const kw = cms.keywords || [];
    const setKw = (list) => { pushUndo(); setCms((c) => ({ ...c, keywords: list })); };
    return <KeywordsTab kw={kw} setKw={setKw} isSuperAdmin={isSuperAdmin} lang={lang} pages={pages} saving={saving} onSave={() => saveAll('keywords')} />;
  };

  const renderKwai = () => {
    const items = cms.keyword_ai || [];
    const kwPages = cms.keyword_ai_pages || [];
    const setItems = (list) => { pushUndo(); setCms((c) => ({ ...c, keyword_ai: list })); };
    return (
      <KeywordsAiTopicsTab
        items={items}
        setItems={setItems}
        pages={kwPages}
        seoPages={pages}
        isSuperAdmin={isSuperAdmin}
        lang={lang}
        saving={saving}
        onSave={() => saveAll('kwai')}
      />
    );
  };

  const renderAi = () => {
    const a = cms.ai_search || {};
    const setA = (patch) => { pushUndo(); setCms((c) => ({ ...c, ai_search: { ...c.ai_search, ...patch } })); };
    const listField = (key, label) => (
      <div className="space-y-1 sm:col-span-2">
        <Label className="text-xs">{label}</Label>
        <Textarea value={(a[key] || []).join('\n')} rows={3} disabled={!isSuperAdmin}
          onChange={(e) => setA({ [key]: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
        <p className="text-[11px] text-muted-foreground">{L('عنصر في كل سطر', 'One per line', lang)}</p>
      </div>
    );
    return (
      <div className="space-y-4">
        <Card title={L('AI Search Optimization', 'AI Search Optimization', lang)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{L('AI Description', 'AI Description', lang)}</Label>
              <Textarea value={a.ai_description || ''} rows={3} disabled={!isSuperAdmin} onChange={(e) => setA({ ai_description: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{L('Entity Summary', 'Entity Summary', lang)}</Label>
              <Textarea value={a.entity_summary || ''} rows={3} disabled={!isSuperAdmin} onChange={(e) => setA({ entity_summary: e.target.value })} />
            </div>
            {listField('main_topics', L('المواضيع الرئيسية', 'Main Topics', lang))}
            {listField('main_services', L('الخدمات الرئيسية', 'Main Services', lang))}
            {listField('key_questions', L('الأسئلة الرئيسية', 'Key Questions', lang))}
            {listField('ai_topics', L('AI Topics', 'AI Topics', lang))}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{L('FAQ Mapping', 'FAQ Mapping', lang)}</Label>
              <Textarea value={a.faq_mapping || ''} rows={2} disabled={!isSuperAdmin} onChange={(e) => setA({ faq_mapping: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{L('Source / Reference Settings', 'Source / Reference Settings', lang)}</Label>
              <Input value={a.source_settings || ''} disabled={!isSuperAdmin} className="min-h-[40px]" onChange={(e) => setA({ source_settings: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{L('AI-Friendly Content', 'AI-Friendly Content', lang)}</Label>
              <Textarea value={a.ai_friendly_content || ''} rows={4} disabled={!isSuperAdmin} onChange={(e) => setA({ ai_friendly_content: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{L('Structured Summary', 'Structured Summary', lang)}</Label>
              <Textarea value={a.structured_summary || ''} rows={3} disabled={!isSuperAdmin} onChange={(e) => setA({ structured_summary: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('حالة المراجعة', 'Content Review Status', lang)}</Label>
              <Select value={a.review_status || 'draft'} disabled={!isSuperAdmin} onValueChange={(v) => setA({ review_status: v })}>
                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{L('مسودة', 'Draft', lang)}</SelectItem>
                  <SelectItem value="review">{L('قيد المراجعة', 'In Review', lang)}</SelectItem>
                  <SelectItem value="published">{L('منشور', 'Published', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
        <SaveBar saving={saving} onSave={() => saveAll('ai')} disabled={!isSuperAdmin} />
      </div>
    );
  };

  const renderBrand = () => {
    const b = cms.brand_entity || {};
    const setB = (patch) => { pushUndo(); setCms((c) => ({ ...c, brand_entity: { ...c.brand_entity, ...patch } })); };
    const input = (k, label, dir = 'auto') => (
      <div key={k} className="space-y-1">
        <Label className="text-xs">{label}</Label>
        <Input value={b[k] || ''} dir={dir} disabled={!isSuperAdmin} className="min-h-[40px]" onChange={(e) => setB({ [k]: e.target.value })} />
      </div>
    );
    const textarea = (k, label, dir = 'auto', rows = 3) => (
      <div key={k} className="space-y-1 sm:col-span-2">
        <Label className="text-xs">{label}</Label>
        <Textarea value={b[k] || ''} rows={rows} dir={dir} disabled={!isSuperAdmin} onChange={(e) => setB({ [k]: e.target.value })} />
      </div>
    );
    return (
      <div className="space-y-4">
        <Card title={L('Brand Entity & AI Identity', 'Brand Entity & AI Identity', lang)}
          subtitle={L(
            'المصدر المركزي والوحيد لهوية Estate Follow. أي تعديل هنا يظهر فورًا في كل الصفحات العامة والبيانات المنظّمة — بدون تعديل يدوي صفحة بصفحة.',
            'The single central source of truth for Estate Follow identity. Any change here applies live to every public page and structured data — no per-page edits.',
            lang,
          )}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {input('name_en', 'Official Brand Name (EN)', 'ltr')}
            {input('name_ar', L('الاسم الرسمي (عربي)', 'Official Brand Name (AR)', 'rtl'), 'rtl')}
            {input('display_name', L('اسم العرض (Display Name)', 'Display Name', 'auto'), 'auto')}
            {input('website', L('الموقع الرسمي', 'Official Website', 'ltr'), 'ltr')}
            {input('logo', L('الشعار (رابط)', 'Logo (URL)', 'ltr'), 'ltr')}
            {textarea('short_desc_ar', L('وصف مختصر (عربي)', 'Short Description (AR)', 'rtl'), 'rtl', 2)}
            {textarea('short_desc_en', L('وصف مختصر (إنجليزي)', 'Short Description (EN)', 'ltr'), 'ltr', 2)}
            {textarea('long_desc_ar', L('وصف مفصّل (عربي)', 'Full Description (AR)', 'rtl'), 'rtl', 4)}
            {textarea('long_desc_en', L('وصف مفصّل (إنجليزي)', 'Full Description (EN)', 'ltr'), 'ltr', 4)}
            <div className="space-y-1">
              <Label className="text-xs">{L('الخدمات (عربي) — خدمة في كل سطر', 'Services (AR) — one per line', lang)}</Label>
              <Textarea value={(b.services_ar || []).join('\n')} rows={5} dir="rtl" disabled={!isSuperAdmin}
                onChange={(e) => setB({ services_ar: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('الخدمات (إنجليزي) — خدمة في كل سطر', 'Services (EN) — one per line', lang)}</Label>
              <Textarea value={(b.services_en || []).join('\n')} rows={5} dir="ltr" disabled={!isSuperAdmin}
                onChange={(e) => setB({ services_en: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
            </div>
            {textarea('audience_ar', L('الجمهور المستهدف (عربي)', 'Target Audience (AR)', 'rtl'), 'rtl', 2)}
            {textarea('audience_en', L('الجمهور المستهدف (إنجليزي)', 'Target Audience (EN)', 'ltr'), 'ltr', 2)}
            <div className="space-y-1">
              <Label className="text-xs">{L('الدول المخدومة (ISO codes)', 'Countries Served (ISO codes)', lang)}</Label>
              <Input value={(b.countries || []).join(', ')} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]"
                onChange={(e) => setB({ countries: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('اللغات', 'Languages', lang)}</Label>
              <Input value={(b.languages || []).join(', ')} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]"
                onChange={(e) => setB({ languages: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('بريد التواصل', 'Contact Email', lang)}</Label>
              <Input value={b.contact?.email || ''} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]"
                onChange={(e) => setB({ contact: { ...b.contact, email: e.target.value } })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('هاتف التواصل', 'Contact Phone', lang)}</Label>
              <Input value={b.contact?.phone || ''} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]"
                onChange={(e) => setB({ contact: { ...b.contact, phone: e.target.value } })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{L('روابط التواصل (منصة|رابط في كل سطر)', 'Social Profiles (platform|url per line)', lang)}</Label>
              <Textarea value={Object.entries(b.social_profiles || {}).map(([k, v]) => `${k}|${v}`).join('\n')} rows={3} dir="ltr" disabled={!isSuperAdmin}
                onChange={(e) => {
                  const map = {};
                  e.target.value.split('\n').forEach((line) => { const [k, v] = line.split('|').map((s) => (s || '').trim()); if (k) map[k] = v || ''; });
                  setB({ social_profiles: map });
                }} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {L(
              'يُستخدم الاسم الرسمي والوصف والشعار في كل الصفحات العامة والـ Structured Data (Organization / WebSite) و Open Graph. لا تكرّر هذه البيانات يدويًا في صفحات أخرى.',
              'The official name, description and logo are used across all public pages and structured data (Organization / WebSite) and Open Graph. Do not hardcode these in other pages.',
              lang,
            )}
          </p>
        </Card>
        <SaveBar saving={saving} onSave={() => saveAll('brand')} disabled={!isSuperAdmin} hint={L('يُحفظ في الخادم ويظهر فورًا في كل الصفحات العامة.', 'Saved to backend and applies live to all public pages.', lang)} />
      </div>
    );
  };

  const renderSitemap = () => {
    const urls = indexable.length;
    const lastUpdated = record?.updated || record?.created || '—';
    return (
      <div className="space-y-4">
        <Card title={L('Sitemap', 'Sitemap', lang)}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MiniStat icon={Check} label={L('الحالة', 'Status', lang)} value={L('مفعّل', 'Active', lang)} tone="ok" />
            <MiniStat icon={RefreshCw} label={L('آخر تحديث', 'Last Updated', lang)} value={formatDate(lastUpdated, lang)} />
            <MiniStat icon={FileText} label={L('عدد الروابط', 'Number of URLs', lang)} value={urls} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => saveAll('sitemap')}>
              <RefreshCw size={14} className="me-1" />{L('إعادة التوليد', 'Regenerate Sitemap', lang)}
            </Button>
            <a href="/sitemap.xml" target="_blank" rel="noreferrer">
              <Button type="button" variant="ghost" className="min-h-[44px]">
                <ExternalLink size={14} className="me-1" />{L('عرض Sitemap', 'View Sitemap', lang)}
              </Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground">{L('يتحدث تلقائيًا عند تغير الصفحات العامة.', 'Updates automatically when public pages change.', lang)}</p>
        </Card>
      </div>
    );
  };

  const renderIndexing = () => {
    const orphan = pages.filter((p) => !p.canonical && p.index !== false);
    const items = [
      { label: L('صفحات قابلة للفهرسة', 'Indexable Pages', lang), value: indexable.length, tone: 'ok', rows: indexable },
      { label: L('صفحات noindex', 'Noindex Pages', lang), value: noindex.length, tone: 'info', rows: noindex },
      { label: L('Missing Titles', 'Missing Titles', lang), value: missingTitles.length, tone: 'warn', rows: missingTitles },
      { label: L('Missing Descriptions', 'Missing Descriptions', lang), value: missingDesc.length, tone: 'warn', rows: missingDesc },
      { label: L('عناوين مكررة', 'Duplicate Titles', lang), value: dupTitles.length, tone: 'bad', rows: dupTitles },
      { label: L('مشاكل Canonical', 'Canonical Issues', lang), value: pages.filter((p) => p.index !== false && !p.canonical).length, tone: 'warn', rows: pages.filter((p) => p.index !== false && !p.canonical) },
      { label: L('صفحات يتيمة', 'Orphan Pages', lang), value: orphan.length, tone: 'warn', rows: orphan },
      { label: L('مشاكل التوجيه', 'Redirect Problems', lang), value: (cms.redirects || []).filter((r) => !r.new_url).length, tone: 'bad', rows: (cms.redirects || []).filter((r) => !r.new_url) },
    ];
    return (
      <div className="space-y-4">
        <Card title={L('الفهرسة', 'Indexing', lang)}>
          <div className="space-y-2">
            {items.map((it) => (
              <details key={it.label} className="rounded-lg border bg-card">
                <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 text-sm">
                  <span className="font-medium">{it.label}</span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs font-bold',
                    it.tone === 'ok' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                    it.tone === 'warn' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                    it.tone === 'bad' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-slate-100 text-slate-700 border-slate-200')}>
                    {it.value}
                  </span>
                </summary>
                <div className="border-t px-3 py-2 space-y-1">
                  {it.rows.length ? it.rows.map((p) => (
                    <button key={p.id} type="button" onClick={() => { setActive('pages'); setEditingPage(p.id); }} className="block w-full text-start text-xs py-1 hover:text-primary">
                      {lang === 'ar' ? p.name_ar : p.name_en} <span className="text-muted-foreground" dir="ltr">{p.url}</span>
                    </button>
                  )) : <p className="text-xs text-muted-foreground">{L('لا توجد صفحات.', 'No pages.', lang)}</p>}
                </div>
              </details>
            ))}
          </div>
        </Card>
      </div>
    );
  };

  const renderRobots = () => (
    <div className="space-y-4">
      <Card title="Robots.txt" subtitle={L('تحذير: تعديل خاطئ قد يمنع فهرسة الموقع.', 'Warning: incorrect edits can block indexing.', lang)}
        actions={<Button type="button" size="sm" variant="outline" className="min-h-[36px]" disabled={!isSuperAdmin}
          onClick={() => { if (window.confirm(L('استعادة الافتراضي؟', 'Restore default?', lang))) { pushUndo(); setCms((c) => ({ ...c, robots_txt: DEFAULT_ROBOTS_TXT })); } }}>
          <RotateCcw size={13} className="me-1" />{L('استعادة الافتراضي', 'Restore Default', lang)}
        </Button>}>
        <Textarea value={cms.robots_txt || ''} rows={10} dir="ltr" disabled={!isSuperAdmin} className="font-mono text-sm"
          onChange={(e) => { pushUndo(); setCms((c) => ({ ...c, robots_txt: e.target.value })); }} />
      </Card>
      <SaveBar saving={saving} onSave={() => saveAll('robots')} disabled={!isSuperAdmin} />
    </div>
  );

  const renderStructured = () => (
    <div className="space-y-4">
      <Card title={L('البيانات المنظّمة', 'Structured Data', lang)} subtitle={L('Schema.org فقط.', 'Schema.org only.', lang)}>
        <div className="space-y-2">
          {pages.map((p) => {
            const has = !!p.structured_data;
            const valid = has && (p.seo_title_en || p.seo_title_ar);
            const state = !has ? L('بدون', 'None', lang) : valid ? L('صالح', 'Valid', lang) : L('تحذير', 'Warning', lang);
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-semibold">{lang === 'ar' ? p.name_ar : p.name_en}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">{p.structured_data || '—'}</p>
                </div>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                  !has ? 'bg-slate-100 text-slate-600 border-slate-200' : valid ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200')}>
                  {state}
                </span>
                <Button size="sm" variant="outline" className="min-h-[34px]" onClick={() => { setActive('pages'); setEditingPage(p.id); }} disabled={!isSuperAdmin}>
                  <Pencil size={13} className="me-1" />{L('تحرير', 'Edit', lang)}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );

  const renderPerformance = () => (
    <div className="space-y-4">
      <Card title={L('الأداء', 'Performance', lang)}>
        {hasPerfData ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MiniStat icon={Zap} label="LCP" value="—" />
            <MiniStat icon={Zap} label="INP" value="—" />
            <MiniStat icon={Zap} label="CLS" value="—" />
            <MiniStat icon={Zap} label={L('زمن التحميل', 'Page Load', lang)} value="—" />
            <MiniStat icon={Zap} label={L('أداء الموبايل', 'Mobile Performance', lang)} value="—" />
            <MiniStat icon={Zap} label={L('أداء الكمبيوتر', 'Desktop Performance', lang)} value="—" />
          </div>
        ) : (
          <EmptyState message={L('لم يتم ربط مصدر بيانات بعد. اربط Google Analytics من قسم التكاملات.', 'No data source connected yet. Connect Google Analytics in Integrations.', lang)} icon={Zap} />
        )}
      </Card>
    </div>
  );

  const renderRedirects = () => {
    const list = cms.redirects || [];
    const setList = (l) => { pushUndo(); setCms((c) => ({ ...c, redirects: l })); };
    return (
      <div className="space-y-4">
        <Card title={L('مدير التوجيهات', 'Redirect Manager', lang)}>
          <ListEditor items={list} setItems={setList} disabled={!isSuperAdmin} lang={lang} t={t}
            addLabel={L('+ إضافة توجيه', '+ Add Redirect', lang)}
            newItem={() => ({ id: uid('red'), old_url: '', new_url: '', type: '301', active: true })}
            fields={[
              { key: 'old_url', label: L('الرابط القديم', 'Old URL', lang), dir: 'ltr' },
              { key: 'new_url', label: L('الرابط الجديد', 'New URL', lang), dir: 'ltr' },
              { key: 'type', label: L('النوع', 'Type', lang), type: 'select', options: [{ value: '301', label: '301' }, { value: '302', label: '302' }] },
            ]} />
        </Card>
        <SaveBar saving={saving} onSave={() => saveAll('redirects')} disabled={!isSuperAdmin} />
      </div>
    );
  };

  const renderBroken = () => (
    <div className="space-y-4">
      <Card title={L('الروابط المكسورة', 'Broken Links', lang)} subtitle={L('فحص دوري للصفحات العامة.', 'Periodic checks of public pages.', lang)}>
        {brokenLinks.length ? (
          <div className="space-y-2">
            {brokenLinks.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm">
                <span className="font-mono text-xs truncate flex-1" dir="ltr">{b.url}</span>
                <span className="text-xs text-muted-foreground">{b.source}</span>
                <span className="rounded-full bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 text-[11px] font-semibold">{b.status}</span>
                <a href={b.url} target="_blank" rel="noreferrer" className="inline-flex">
                  <Button type="button" size="sm" variant="outline" className="min-h-[32px]">
                    <ExternalLink size={13} className="me-1" />{L('إصلاح', 'Fix', lang)}
                  </Button>
                </a>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message={L('لا توجد روابط مكسورة مسجّلة. يبدأ الفحص بعد ربط Search Console.', 'No broken links recorded. Scanning starts after connecting Search Console.', lang)} icon={Unlink} />
        )}
      </Card>
    </div>
  );

  const renderSearchPerf = () => (
    <div className="space-y-4">
      <Card title={L('أداء البحث', 'Search Performance', lang)}>
        {hasSearchData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat icon={TrendingUp} label={L('نقرات', 'Clicks', lang)} value="—" />
            <MiniStat icon={Eye} label={L('ظهور', 'Impressions', lang)} value="—" />
            <MiniStat icon={TrendingUp} label="CTR" value="—" />
            <MiniStat icon={TrendingUp} label={L('متوسط الترتيب', 'Avg Position', lang)} value="—" />
          </div>
        ) : (
          <EmptyState message={L('لم يتم ربط Google Search Console. اربطه من قسم التكاملات لعرض النقرات والظهور والترتيب.', 'Google Search Console not connected. Connect it in Integrations to see clicks, impressions and position.', lang)} icon={TrendingUp} />
        )}
      </Card>
    </div>
  );

  const renderContent = () => {
    const list = cms.content_hub || [];
    const setList = (l) => { pushUndo(); setCms((c) => ({ ...c, content_hub: l })); };
    return (
      <div className="space-y-4">
        <Card title={L('المحتوى ومركز المعرفة', 'Content & Knowledge Hub', lang)}>
          <ListEditor items={list} setItems={setList} disabled={!isSuperAdmin} lang={lang} t={t}
            addLabel={L('+ إنشاء مقال', '+ Create Article', lang)}
            newItem={(order) => ({ id: uid('art'), title_en: '', title_ar: '', slug: '', body_en: '', body_ar: '', category: '', tags: [], image: '', author: '', status: 'draft', seo_title: '', seo_desc: '', keywords: [], sources: '', related: [], order })}
            fields={[
              { key: 'title_en', label: 'Title EN', dir: 'ltr' },
              { key: 'title_ar', label: 'Title AR', dir: 'rtl' },
              { key: 'slug', label: 'Slug', dir: 'ltr' },
              { key: 'category', label: L('التصنيف', 'Category', lang), dir: 'ltr' },
              { key: 'author', label: L('الكاتب', 'Author', lang), dir: 'ltr' },
              { key: 'status', label: L('الحالة', 'Status', lang), type: 'select', options: [
                { value: 'draft', label: L('مسودة', 'Draft', lang) },
                { value: 'publish', label: L('نشر', 'Publish', lang) },
                { value: 'schedule', label: L('جدولة', 'Schedule', lang) },
              ] },
              { key: 'tags', label: L('الوسوم (مفصولة بفاصلة)', 'Tags (comma)', lang), dir: 'ltr' },
              { key: 'image', label: L('الصورة (رابط)', 'Image (URL)', lang), dir: 'ltr' },
              { key: 'seo_title', label: 'SEO Title', dir: 'ltr' },
              { key: 'seo_desc', label: 'SEO Description', dir: 'ltr' },
              { key: 'keywords', label: L('الكلمات المفتاحية', 'Keywords', lang), dir: 'ltr' },
              { key: 'sources', label: L('المصادر', 'Sources', lang), dir: 'ltr' },
              { key: 'body_en', label: 'Body EN', dir: 'ltr', type: 'textarea', span: true, rows: 5 },
              { key: 'body_ar', label: 'Body AR', dir: 'rtl', type: 'textarea', span: true, rows: 5 },
            ]} />
        </Card>
        <SaveBar saving={saving} onSave={() => saveAll('content')} disabled={!isSuperAdmin} />
      </div>
    );
  };

  const renderFaq = () => {
    const list = cms.seo_faq || [];
    const setList = (l) => { pushUndo(); setCms((c) => ({ ...c, seo_faq: l })); };
    return (
      <div className="space-y-4">
        <Card title={L('الأسئلة الشائعة', 'FAQ', lang)}>
          <ListEditor items={list} setItems={setList} disabled={!isSuperAdmin} lang={lang} t={t}
            addLabel={L('+ إضافة سؤال', '+ Add FAQ', lang)}
            newItem={(order) => ({ id: uid('faq'), question_en: '', question_ar: '', answer_en: '', answer_ar: '', page: '', keywords: '', order, visible: true })}
            fields={[
              { key: 'question_en', label: 'Question EN', dir: 'ltr' },
              { key: 'question_ar', label: 'Question AR', dir: 'rtl' },
              { key: 'answer_en', label: 'Answer EN', dir: 'ltr', type: 'textarea', span: true, rows: 2 },
              { key: 'answer_ar', label: 'Answer AR', dir: 'rtl', type: 'textarea', span: true, rows: 2 },
              { key: 'page', label: L('الصفحة', 'Page', lang), dir: 'ltr' },
              { key: 'keywords', label: L('الكلمات المفتاحية', 'Keywords', lang), dir: 'ltr' },
              { key: 'order', label: L('الترتيب', 'Order', lang), type: 'number', dir: 'ltr' },
            ]} />
        </Card>
        <SaveBar saving={saving} onSave={() => saveAll('faq')} disabled={!isSuperAdmin} />
      </div>
    );
  };

  const renderIntegrations = () => {
    const ints = cms.seo_integrations || {};
    const labels = {
      google_search_console: 'Google Search Console',
      bing_webmaster: 'Bing Webmaster',
      google_analytics: 'Google Analytics',
      google_tag_manager: 'Google Tag Manager',
    };
    const setInt = (key, patch) => { pushUndo(); setCms((c) => ({ ...c, seo_integrations: { ...c.seo_integrations, [key]: { ...c.seo_integrations[key], ...patch } } })); };
    return (
      <div className="space-y-4">
        <Card title={L('تكاملات البحث و AI', 'Search & AI Integrations', lang)}
          subtitle={L(
            'الحالة مشتقّة من القيم الفعلية المُدخلة، وليست مجرد مفتاح تشغيل. "متصل" يظهر فقط للتكاملات التي يمكن التحقق منها من داخل الموقع (Google Analytics). بقية الخدمات "مُعدّ" عند إدخال بياناتها، والتحقق النهائي يتم على المنصة الخارجية.',
            'Status is derived from the actual values entered, not a toggle. "Connected" is shown only for integrations verifiable from inside the site (Google Analytics). Other services show "Configured" once their credentials are entered; final verification happens on the external platform.',
            lang,
          )}>
          <div className="space-y-3">
            {Object.entries(labels).map(([key, label]) => {
              const it = ints[key] || {};
              const rule = INTEGRATION_RULES[key] || {};
              const status = deriveIntegrationStatus(key, it);
              const badge = integrationBadge(status, lang);
              const effVerification = effectiveVerification(key, it);
              const isGa = key === 'google_analytics';
              return (
                <div key={key} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm">{label}</p>
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', badge.cls)}>
                        {badge.text}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={!!it.enabled} disabled={!isSuperAdmin}
                          onChange={(e) => setInt(key, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-[hsl(var(--primary))]" />
                        {L('تفعيل', 'ON', lang)}
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{rule.fieldLabel ? (lang === 'ar' ? rule.fieldLabel.ar : rule.fieldLabel.en) : L('رمز التحقق', 'Verification', lang)}</Label>
                      <Input value={effVerification} dir="ltr" disabled={!isSuperAdmin} placeholder={rule.placeholder || ''} className="min-h-[40px]"
                        onChange={(e) => setInt(key, { verification: e.target.value })} />
                      {isGa && !it.verification && (
                        <p className="text-[11px] text-emerald-700">
                          {L('القيمة الافتراضية الفعلية من index.html.', 'Default actual value from index.html.', lang)}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{rule.settingsLabel ? (lang === 'ar' ? rule.settingsLabel.ar : rule.settingsLabel.en) : L('الإعدادات', 'Settings', lang)}</Label>
                      <Input value={it.settings || ''} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]"
                        placeholder={key === 'google_search_console' ? 'estatefollow.com' : ''}
                        onChange={(e) => setInt(key, { settings: e.target.value })} />
                    </div>
                  </div>
                  {rule.note && (
                    <p className="text-[11px] text-muted-foreground">{lang === 'ar' ? rule.note.ar : rule.note.en}</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{L('أي محرك بحث أو تكامل AI مستقبلي يُضاف هنا تلقائيًا.', 'Future search engines or AI integrations are added here automatically.', lang)}</p>
        </Card>
        <SaveBar saving={saving} onSave={() => saveAll('integrations')} disabled={!isSuperAdmin} />
      </div>
    );
  };

  const renderAudit = () => (
    <div className="space-y-4">
      <Card title={L('سجل التعديلات', 'Audit Log', lang)} subtitle={L('ما تغيّر، القيم القديمة والجديدة، التاريخ، الأدمن.', 'What changed, old/new values, date, admin.', lang)}
        actions={<Button type="button" size="sm" variant="outline" className="min-h-[36px]" onClick={loadAudit}>{t('retry')}</Button>}>
        {auditLoading ? <p className="text-sm text-muted-foreground py-8 text-center">{t('loading')}</p> :
          audit.length === 0 ? <EmptyState message={L('لا توجد تعديلات مسجّلة بعد', 'No audit entries yet', lang)} icon={Activity} /> :
          <div className="space-y-2">
            {audit.map((a) => (
              <div key={a.id} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <p className="font-semibold">{a.section} · {a.action}</p>
                  <span className="text-xs text-muted-foreground" dir="ltr">{formatDate(a.created, lang)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{a.admin_email || a.expand?.admin?.email || '—'}{a.summary ? ` · ${a.summary}` : ''}</p>
              </div>
            ))}
          </div>}
      </Card>
    </div>
  );

  const bodies = {
    overview: renderOverview,
    global: renderGlobal,
    pages: renderPages,
    keywords: renderKeywords,
    kwai: renderKwai,
    ai: renderAi,
    brand: renderBrand,
    sitemap: renderSitemap,
    indexing: renderIndexing,
    robots: renderRobots,
    structured: renderStructured,
    performance: renderPerformance,
    redirects: renderRedirects,
    broken: renderBroken,
    searchperf: renderSearchPerf,
    content: renderContent,
    faq: renderFaq,
    integrations: renderIntegrations,
    audit: renderAudit,
  };

  if (loading) {
    return <p className="py-16 text-center text-muted-foreground">{t('loading')}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles size={18} />
          </span>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{L('SEO والذكاء الاصطناعي', 'SEO & AI Search', lang)}</h2>
            <p className="text-sm text-muted-foreground">{L('مركز إدارة كامل لتحسين محركات البحث والبحث بالذكاء الاصطناعي.', 'Full management center for SEO and AI search optimization.', lang)}</p>
          </div>
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{t('settings_readonly')}</div>
      )}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div>}

      <div className="relative">
        <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L('ابحث في أقسام SEO…', 'Search SEO sections…', lang)} className="ps-9 min-h-[44px]" />
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <nav className="lg:w-56 shrink-0 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          {filteredTabs.map((s) => {
            const Icon = s.icon;
            return (
              <button key={s.id} type="button" onClick={() => { setActive(s.id); setEditingPage(null); }}
                className={cn('rounded-lg border px-3 py-2.5 text-sm font-medium text-start whitespace-nowrap transition-colors min-h-[40px] inline-flex items-center gap-2',
                  active === s.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent')}>
                <Icon size={15} className="shrink-0" />
                {lang === 'ar' ? s.ar : s.en}
              </button>
            );
          })}
        </nav>
        <div className="flex-1 min-w-0">
          {(bodies[active] || bodies.overview)()}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Keywords tab (separate for local filter state) ---------------- */

function KeywordsTab({ kw, setKw, isSuperAdmin, lang, pages, saving, onSave }) {
  const [q, setQ] = useState('');
  const [fCountry, setFCountry] = useState('all');
  const [fLang, setFLang] = useState('all');
  const [fPage, setFPage] = useState('all');

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return kw.filter((k) => {
      if (qq && !(k.term || '').toLowerCase().includes(qq)) return false;
      if (fCountry !== 'all' && (k.country || '') !== fCountry) return false;
      if (fLang !== 'all' && (k.lang || '') !== fLang) return false;
      if (fPage !== 'all' && (k.page || '') !== fPage) return false;
      return true;
    });
  }, [kw, q, fCountry, fLang, fPage]);

  const add = () => {
    setKw([...kw, { id: uid('kw'), term: '', lang: lang === 'ar' ? 'ar' : 'en', country: '', page: '', type: 'primary', intent: 'informational', active: true }]);
  };
  const update = (id, patch) => setKw(kw.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  const remove = (id) => { if (window.confirm(L('حذف هذه الكلمة؟', 'Delete this keyword?', lang))) setKw(kw.filter((k) => k.id !== id)); };

  const intentOpts = [
    { value: 'informational', label: L('معلوماتي', 'Informational', lang) },
    { value: 'commercial', label: L('تجاري', 'Commercial', lang) },
    { value: 'navigational', label: L('تنقّلي', 'Navigational', lang) },
    { value: 'transactional', label: L('تعاملي', 'Transactional', lang) },
  ];
  const typeOpts = [
    { value: 'primary', label: L('أساسية', 'Primary', lang) },
    { value: 'secondary', label: L('ثانوية', 'Secondary', lang) },
  ];

  return (
    <div className="space-y-4">
      <Card title={L('الكلمات المفتاحية', 'Keywords', lang)} subtitle={L('أداة تنظيم فقط — لا تكرار تلقائي.', 'Organization only — no auto keyword stuffing.', lang)}
        actions={<Button type="button" size="sm" className="min-h-[36px]" onClick={add} disabled={!isSuperAdmin}><Plus size={14} className="me-1" />{L('إضافة كلمة', 'Add Keyword', lang)}</Button>}>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('بحث…', 'Search…', lang)} className="min-h-[40px]" />
          <Input value={fCountry === 'all' ? '' : fCountry} onChange={(e) => setFCountry(e.target.value || 'all')} placeholder={L('الدولة', 'Country', lang)} className="min-h-[40px]" dir="ltr" />
          <Select value={fLang} onValueChange={setFLang}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L('كل اللغات', 'All languages', lang)}</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fPage} onValueChange={setFPage}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L('كل الصفحات', 'All pages', lang)}</SelectItem>
              {pages.map((p) => <SelectItem key={p.id} value={p.url}>{lang === 'ar' ? p.name_ar : p.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {filtered.map((k) => (
            <div key={k.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input value={k.term || ''} dir="auto" disabled={!isSuperAdmin} className="min-h-[40px] flex-1 min-w-[160px]"
                  onChange={(e) => update(k.id, { term: e.target.value })} />
                <Button type="button" size="sm" variant="outline" className="min-h-[36px]" disabled={!isSuperAdmin}
                  onClick={() => update(k.id, { active: !k.active })}>
                  {k.active ? L('مفعّل', 'Active', lang) : L('متوقف', 'Off', lang)}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="min-h-[36px] text-destructive" disabled={!isSuperAdmin} onClick={() => remove(k.id)}>
                  <Trash2 size={13} />
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Select value={k.lang || 'en'} disabled={!isSuperAdmin} onValueChange={(v) => update(k.id, { lang: v })}>
                  <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ar">العربية</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
                </Select>
                <Input value={k.country || ''} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]" placeholder={L('الدولة', 'Country', lang)} onChange={(e) => update(k.id, { country: e.target.value })} />
                <Select value={k.page || 'none'} disabled={!isSuperAdmin} onValueChange={(v) => update(k.id, { page: v === 'none' ? '' : v })}>
                  <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{L('بدون صفحة', 'No page', lang)}</SelectItem>
                    {pages.map((p) => <SelectItem key={p.id} value={p.url}>{lang === 'ar' ? p.name_ar : p.name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={k.type || 'primary'} disabled={!isSuperAdmin} onValueChange={(v) => update(k.id, { type: v })}>
                  <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{typeOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={k.intent || 'informational'} disabled={!isSuperAdmin} onValueChange={(v) => update(k.id, { intent: v })}>
                  <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{intentOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <EmptyState message={L('لا توجد كلمات مفتاحية بعد.', 'No keywords yet.', lang)} icon={Tag} />}
        </div>
      </Card>
      <SaveBar saving={saving} onSave={onSave} disabled={!isSuperAdmin} hint={L('يُحفظ في الخادم ويظهر فورًا.', 'Saved to backend and applies live.', lang)} />
    </div>
  );
}

/* ---------------- Keywords & AI Topics tab ---------------- */

const KWAI_KIND_LABEL = {
  keyword: { ar: 'كلمة بحث', en: 'Search Keyword' },
  topic: { ar: 'موضوع AI', en: 'AI Topic' },
  query: { ar: 'سؤال AI', en: 'AI Query' },
};

const KWAI_KIND_TONE = {
  keyword: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  topic: 'bg-sky-100 text-sky-800 border-sky-200',
  query: 'bg-violet-100 text-violet-800 border-violet-200',
};

const KWAI_GROUP_LABEL = {
  general: { ar: 'عام', en: 'General' },
  auth: { ar: 'الدخول والحسابات', en: 'Auth & Accounts' },
  property: { ar: 'إدارة العقارات', en: 'Property Management' },
  brokerage: { ar: 'الوساطة العقارية', en: 'Brokerage' },
};

// Parse the AI's delimited suggestion lines into structured pending items.
function parseKwAiSuggestions(text) {
  const out = [];
  (text || '').split('\n').forEach((line) => {
    const raw = line.trim();
    if (!raw) return;
    const m = raw.match(/^(KEYWORD|TOPIC|QUERY)\s*:\s*(.+)$/i);
    if (!m) return;
    const kind = m[1].toLowerCase();
    const parts = m[2].split('|').map((s) => (s || '').trim());
    const term = parts[0] || '';
    if (!term) return;
    const lang = (parts[1] || '').toLowerCase() === 'ar' ? 'ar' : 'en';
    if (kind === 'keyword') {
      const intent = ['informational', 'commercial', 'navigational', 'transactional'].includes(parts[2]?.toLowerCase())
        ? parts[2].toLowerCase() : 'informational';
      const role = parts[3]?.toLowerCase() === 'primary' ? 'primary' : 'secondary';
      out.push({ kind, term, lang, intent, role });
    } else {
      out.push({ kind, term, lang });
    }
  });
  return out;
}

function KeywordsAiTopicsTab({ items, setItems, pages, seoPages, isSuperAdmin, lang, saving, onSave }) {
  const [q, setQ] = useState('');
  const [fPage, setFPage] = useState('all');
  const [fLang, setFLang] = useState('all');
  const [fCountry, setFCountry] = useState('all');
  const [fType, setFType] = useState('all');
  const [fActive, setFActive] = useState('all');

  // AI suggestions state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPage, setAiPage] = useState(pages[0]?.key || 'all');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiRaw, setAiRaw] = useState('');
  const abortRef = useRef(null);

  const L = useCallback((ar, en) => (lang === 'ar' ? ar : en), [lang]);

  const countries = useMemo(() => {
    const set = new Set();
    items.forEach((k) => { if (k.country) set.add(k.country); });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((k) => {
      if (qq && !(k.term || '').toLowerCase().includes(qq)) return false;
      if (fPage !== 'all' && (k.page || '') !== fPage) return false;
      if (fLang !== 'all' && (k.lang || '') !== fLang) return false;
      if (fCountry !== 'all' && (k.country || '') !== fCountry) return false;
      if (fType !== 'all' && (k.kind || '') !== fType) return false;
      if (fActive !== 'all' && ((fActive === 'active') !== !!k.active)) return false;
      return true;
    });
  }, [items, q, fPage, fLang, fCountry, fType, fActive]);

  const counts = useMemo(() => {
    const c = { keyword: 0, topic: 0, query: 0, active: 0 };
    filtered.forEach((k) => { c[k.kind] = (c[k.kind] || 0) + 1; if (k.active) c.active += 1; });
    return c;
  }, [filtered]);

  const add = (kind) => {
    setItems([...items, {
      id: uid('kwai'),
      kind,
      term: '',
      lang: lang === 'ar' ? 'ar' : 'en',
      country: '',
      page: fPage !== 'all' ? fPage : (pages[0]?.key || ''),
      role: 'secondary',
      intent: 'informational',
      active: true,
    }]);
  };
  const update = (id, patch) => setItems(items.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  const remove = (id) => { if (window.confirm(L('حذف هذا العنصر؟', 'Delete this item?', lang))) setItems(items.filter((k) => k.id !== id)); };
  const duplicate = (id) => {
    const orig = items.find((k) => k.id === id);
    if (!orig) return;
    setItems([...items, { ...orig, id: uid('kwai'), term: orig.term ? `${orig.term} (copy)` : '', active: true }]);
  };

  const intentOpts = [
    { value: 'informational', label: L('معلوماتي', 'Informational', lang) },
    { value: 'commercial', label: L('تجاري', 'Commercial', lang) },
    { value: 'navigational', label: L('تنقّلي', 'Navigational', lang) },
    { value: 'transactional', label: L('تعاملي', 'Transactional', lang) },
  ];
  const roleOpts = [
    { value: 'primary', label: L('أساسية', 'Primary', lang) },
    { value: 'secondary', label: L('ثانوية', 'Secondary', lang) },
  ];

  const pageLabel = (key) => {
    const p = pages.find((x) => x.key === key);
    return p ? (lang === 'ar' ? p.name_ar : p.name_en) : key;
  };

  // Group pages by group for the page filter dropdown.
  const groupedPages = useMemo(() => {
    const map = new Map();
    pages.forEach((p) => {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group).push(p);
    });
    return Array.from(map.entries());
  }, [pages]);

  /* ---- AI suggestions ---- */
  const runAiSuggestions = useCallback(async () => {
    if (aiLoading) return;
    setAiError('');
    setAiSuggestions([]);
    setAiRaw('');
    const pageKey = aiPage === 'all' ? (pages[0]?.key || '') : aiPage;
    const page = pages.find((p) => p.key === pageKey) || seoPages.find((p) => p.key === pageKey);
    if (!page) {
      setAiError(L('اختر صفحة أولاً.', 'Select a page first.', lang));
      return;
    }
    const name = lang === 'ar' ? (page.name_ar || page.name_en) : (page.name_en || page.name_ar);
    const url = page.url || '';
    const desc = (page.meta_desc_en || page.meta_desc_ar || page.ai_description || page.description || '').trim();
    const prompt = [
      `You are an SEO & AI-search strategist for "Estate Follow", a bilingual (Arabic/English) property management platform.`,
      `For the page "${name}" (URL: ${url}${desc ? `, description: ${desc}` : ''}), suggest:`,
      `- 6 search keywords (mix primary/secondary, Arabic & English, with a search intent each)`,
      `- 5 AI topics / entity topics`,
      `- 5 AI search queries (real questions people type into AI assistants, Arabic & English)`,
      `Return ONLY lines in this exact format, no headings, no commentary, no extra text:`,
      `KEYWORD: <term> | <lang=ar|en> | <intent=informational|commercial|navigational|transactional> | <role=primary|secondary>`,
      `TOPIC: <term> | <lang=ar|en>`,
      `QUERY: <term> | <lang=ar|en>`,
      `Do NOT invent search volume, competition, ranking, or AI-mention numbers. Suggest terms only.`,
    ].join('\n');

    setAiLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await integratedAiClient.stream('/integrated-ai/stream', {
        body: { message: [{ type: 'text', text: prompt }] },
        images: [],
        signal: controller.signal,
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json || json === '[DONE]') continue;
          try {
            const evt = JSON.parse(json);
            if (evt.type === 'content' && evt.data && typeof evt.data.content === 'string') {
              full += evt.data.content;
              setAiRaw(full);
              setAiSuggestions(parseKwAiSuggestions(full));
            } else if (evt.type === 'error') {
              throw new Error(evt.data?.content || 'AI error');
            }
          } catch { /* ignore keepalive */ }
        }
      }
      setAiSuggestions(parseKwAiSuggestions(full));
    } catch (err) {
      if (err?.name !== 'AbortError') setAiError(String(err?.message || L('تعذّر إنشاء الاقتراحات.', 'Failed to generate suggestions.', lang)));
    } finally {
      setAiLoading(false);
      abortRef.current = null;
    }
  }, [aiLoading, aiPage, pages, seoPages, lang, L]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const addSuggestion = (s) => {
    setItems([...items, {
      id: uid('kwai'),
      kind: s.kind,
      term: s.term,
      lang: s.lang || 'en',
      country: '',
      page: aiPage === 'all' ? (pages[0]?.key || '') : aiPage,
      role: s.role || 'secondary',
      intent: s.intent || 'informational',
      active: true,
    }]);
  };

  const renderKwaiItem = (k) => (
    <div key={k.id} className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', KWAI_KIND_TONE[k.kind] || 'bg-slate-100 text-slate-700 border-slate-200')}>
          {lang === 'ar' ? KWAI_KIND_LABEL[k.kind].ar : KWAI_KIND_LABEL[k.kind].en}
        </span>
        <Input value={k.term || ''} dir="auto" disabled={!isSuperAdmin} className="min-h-[40px] flex-1 min-w-[160px]"
          placeholder={L('النص…', 'Text…', lang)}
          onChange={(e) => update(k.id, { term: e.target.value })} />
        <Button type="button" size="sm" variant="outline" className="min-h-[36px]" disabled={!isSuperAdmin}
          onClick={() => update(k.id, { active: !k.active })}>
          {k.active ? L('مفعّل', 'Active', lang) : L('متوقف', 'Off', lang)}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-[36px]" disabled={!isSuperAdmin} onClick={() => duplicate(k.id)} title={L('نسخ', 'Copy', lang)}>
          <Copy size={13} />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-[36px] text-destructive" disabled={!isSuperAdmin} onClick={() => remove(k.id)}>
          <Trash2 size={13} />
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Select value={k.lang || 'en'} disabled={!isSuperAdmin} onValueChange={(v) => update(k.id, { lang: v })}>
          <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ar">العربية</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
        </Select>
        <Input value={k.country || ''} dir="ltr" disabled={!isSuperAdmin} className="min-h-[40px]" placeholder={L('الدولة', 'Country', lang)} onChange={(e) => update(k.id, { country: e.target.value })} />
        <Select value={k.page || 'none'} disabled={!isSuperAdmin} onValueChange={(v) => update(k.id, { page: v === 'none' ? '' : v })}>
          <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{L('بدون صفحة', 'No page', lang)}</SelectItem>
            {groupedPages.map(([group, ps]) => (
              <SelectGroup key={group}>
                <SelectLabel>{lang === 'ar' ? KWAI_GROUP_LABEL[group]?.ar || group : KWAI_GROUP_LABEL[group]?.en || group}</SelectLabel>
                {ps.map((p) => <SelectItem key={p.key} value={p.key}>{lang === 'ar' ? p.name_ar : p.name_en}</SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {k.kind === 'keyword' ? (
          <>
            <Select value={k.role || 'secondary'} disabled={!isSuperAdmin} onValueChange={(v) => update(k.id, { role: v })}>
              <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
              <SelectContent>{roleOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={k.intent || 'informational'} disabled={!isSuperAdmin} onValueChange={(v) => update(k.id, { intent: v })}>
              <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
              <SelectContent>{intentOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </>
        ) : (
          <div className="col-span-2 text-[11px] text-muted-foreground flex items-center">
            {L('الصفحة المرتبطة', 'Target page', lang)}: <span className="font-medium mx-1">{pageLabel(k.page) || L('—', '—', lang)}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card
        title={L('الكلمات المفتاحية وموضوعات الذكاء الاصطناعي', 'Keywords & AI Topics', lang)}
        subtitle={L(
          'اربط كل صفحة بكلمات البحث التقليدية وموضوعات الذكاء الاصطناعي وأسئلة AI الحقيقية. أداة تخطيط وتنظيم فقط — لا حشو ولا كلمات مخفية.',
          'Link every page to traditional search keywords, AI topics and real AI queries. Planning tool only — no stuffing, no hidden keywords.',
          lang,
        )}
        actions={
          <Button type="button" size="sm" className="min-h-[36px]" disabled={!isSuperAdmin} onClick={() => { setAiOpen((v) => !v); setAiSuggestions([]); setAiRaw(''); setAiError(''); }}>
            <Wand2 size={14} className="me-1" />{L('اقتراح بالذكاء الاصطناعي', 'Suggest with AI', lang)}
          </Button>
        }
      >
        {/* counts */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 font-semibold">{L('كلمات بحث', 'Keywords', lang)}: {counts.keyword}</span>
          <span className="rounded-full bg-sky-100 text-sky-800 border border-sky-200 px-2.5 py-1 font-semibold">{L('موضوعات AI', 'AI Topics', lang)}: {counts.topic}</span>
          <span className="rounded-full bg-violet-100 text-violet-800 border border-violet-200 px-2.5 py-1 font-semibold">{L('أسئلة AI', 'AI Queries', lang)}: {counts.query}</span>
          <span className="rounded-full bg-muted text-muted-foreground border px-2.5 py-1 font-semibold">{L('مفعّل', 'Active', lang)}: {counts.active}</span>
        </div>

        {/* search + filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('ابحث في الكلمات والموضوعات والأسئلة…', 'Search keywords, topics, queries…', lang)} className="min-h-[40px]" />
          <Select value={fPage} onValueChange={setFPage}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L('كل الصفحات', 'All pages', lang)}</SelectItem>
              {groupedPages.map(([group, ps]) => (
                <SelectGroup key={group}>
                  <SelectLabel>{lang === 'ar' ? KWAI_GROUP_LABEL[group]?.ar || group : KWAI_GROUP_LABEL[group]?.en || group}</SelectLabel>
                  {ps.map((p) => <SelectItem key={p.key} value={p.key}>{lang === 'ar' ? p.name_ar : p.name_en}</SelectItem>)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L('كل الأنواع', 'All types', lang)}</SelectItem>
              <SelectItem value="keyword">{L('كلمات بحث', 'Search Keyword', lang)}</SelectItem>
              <SelectItem value="topic">{L('موضوعات AI', 'AI Topic', lang)}</SelectItem>
              <SelectItem value="query">{L('أسئلة AI', 'AI Query', lang)}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fLang} onValueChange={setFLang}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L('كل اللغات', 'All languages', lang)}</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fCountry} onValueChange={setFCountry}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L('كل الدول', 'All countries', lang)}</SelectItem>
              {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fActive} onValueChange={setFActive}>
            <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L('الكل', 'All', lang)}</SelectItem>
              <SelectItem value="active">{L('مفعّل', 'Active', lang)}</SelectItem>
              <SelectItem value="disabled">{L('متوقف', 'Disabled', lang)}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* add buttons */}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="min-h-[40px]" disabled={!isSuperAdmin} onClick={() => add('keyword')}>
            <Plus size={14} className="me-1" />{L('إضافة كلمة مفتاحية', 'Add Keyword', lang)}
          </Button>
          <Button type="button" size="sm" variant="outline" className="min-h-[40px]" disabled={!isSuperAdmin} onClick={() => add('topic')}>
            <Plus size={14} className="me-1" />{L('إضافة موضوع AI', 'Add AI Topic', lang)}
          </Button>
          <Button type="button" size="sm" variant="outline" className="min-h-[40px]" disabled={!isSuperAdmin} onClick={() => add('query')}>
            <Plus size={14} className="me-1" />{L('إضافة AI Query', 'Add AI Query', lang)}
          </Button>
        </div>

        {/* list */}
        <div className="space-y-2">
          {filtered.map(renderKwaiItem)}
          {filtered.length === 0 && <EmptyState message={L('لا توجد عناصر مطابقة بعد.', 'No matching items yet.', lang)} icon={Hash} />}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {L(
            'لا يتم عرض حجم البحث أو المنافسة أو الترتيب أو ذِكر الذكاء الاصطناعي كأرقام حقيقية — لا يوجد اتصال بمصدر بيانات بحث حقيقي. الكلمات هنا أداة تخطيط وتنظيم فقط.',
            'Search volume, competition, ranking and AI mentions are NOT shown as real numbers — no real search data source is connected. These keywords are a planning/organization tool only.',
            lang,
          )}
        </p>
      </Card>

      {/* AI suggestions panel */}
      {aiOpen && (
        <Card
          title={L('اقتراح كلمات و AI Queries', 'Suggest Keywords & AI Queries', lang)}
          subtitle={L(
            'يقرأ الذكاء الاصطناعي اسم الصفحة ووصفها ويقترح كلمات وموضوعات وأسئلة. لا يُنشر شيء تلقائياً — اضغط "إضافة" لكل اقتراح توافق عليه.',
            'AI reads the page name and description and suggests keywords, topics and queries. Nothing is published automatically — click "Add" for each suggestion you approve.',
            lang,
          )}
          actions={
            <Button type="button" size="sm" variant="ghost" className="min-h-[36px]" onClick={() => setAiOpen(false)}>{L('إغلاق', 'Close', lang)}</Button>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Select value={aiPage} onValueChange={setAiPage} disabled={!isSuperAdmin || aiLoading}>
              <SelectTrigger className="min-h-[40px] min-w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {groupedPages.map(([group, ps]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{lang === 'ar' ? KWAI_GROUP_LABEL[group]?.ar || group : KWAI_GROUP_LABEL[group]?.en || group}</SelectLabel>
                    {ps.map((p) => <SelectItem key={p.key} value={p.key}>{lang === 'ar' ? p.name_ar : p.name_en}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" className="min-h-[40px]" disabled={!isSuperAdmin || aiLoading} onClick={runAiSuggestions}>
              <Wand2 size={14} className="me-1" />{aiLoading ? L('جارٍ الاقتراح…', 'Suggesting…', lang) : L('اقتراح الآن', 'Suggest now', lang)}
            </Button>
          </div>

          {aiError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{aiError}</div>}

          {aiLoading && !aiSuggestions.length && (
            <p className="text-sm text-muted-foreground py-4 text-center">{L('جارٍ تولي الاقتراحات…', 'Generating suggestions…', lang)}</p>
          )}

          {aiSuggestions.length > 0 && (
            <div className="space-y-2">
              {aiSuggestions.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
                  <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', KWAI_KIND_TONE[s.kind])}>
                    {lang === 'ar' ? KWAI_KIND_LABEL[s.kind].ar : KWAI_KIND_LABEL[s.kind].en}
                  </span>
                  <span className="text-sm flex-1 min-w-[160px]" dir="auto">{s.term}</span>
                  <span className="text-[11px] text-muted-foreground">{s.lang === 'ar' ? 'العربية' : 'English'}{s.kind === 'keyword' ? ` · ${s.role} · ${s.intent}` : ''}</span>
                  <Button type="button" size="sm" variant="outline" className="min-h-[32px]" disabled={!isSuperAdmin} onClick={() => addSuggestion(s)}>
                    <Plus size={13} className="me-1" />{L('إضافة', 'Add', lang)}
                  </Button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                {L('الاقتراحات لا تُحفظ إلا بعد إضافتها ثم حفظ القسم.', 'Suggestions are not saved until you add them and save the section.', lang)}
              </p>
            </div>
          )}

          {!aiLoading && !aiSuggestions.length && !aiError && (
            <p className="text-xs text-muted-foreground">{L('اختر صفحة واضغط "اقتراح الآن".', 'Pick a page and click "Suggest now".', lang)}</p>
          )}

          {aiRaw && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">{L('عرض النص الخام', 'Show raw output', lang)}</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-[11px]" dir="ltr">{aiRaw}</pre>
            </details>
          )}
        </Card>
      )}

      <SaveBar saving={saving} onSave={onSave} disabled={!isSuperAdmin} hint={L('يُحفظ في الخادم ويظهر فورًا.', 'Saved to backend and applies live.', lang)} />
    </div>
  );
}
