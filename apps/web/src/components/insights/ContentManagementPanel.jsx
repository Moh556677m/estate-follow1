import React, { useEffect, useState, useMemo } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  LayoutDashboard, FileText, Newspaper, Users, MessageSquare, Tag, UserCircle,
  Megaphone, Plus, Pencil, Trash2, Check, X, Search, ExternalLink, Copy,
  BarChart3, FileCode, PanelTop, PanelBottom, Home, Settings as SettingsIcon,
  ScrollText, ShieldCheck, Image as ImageIcon, Eye, EyeOff, Lock, ArrowUp, ArrowDown,
  Power, KeyRound, Ban, Crown, LayoutTemplate, GripVertical,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import ArticleForm from '@/components/insights/ArticleForm';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ARTICLE_STATUSES, contentTypeLabel, formatDateLong, articleTitle, fetchTemplates, createTemplate, deleteTemplate } from '@/lib/insights';
import { logAudit, dateRangeFilter, detectDevice, DEFAULT_HOMEPAGE_SECTIONS, HOMEPAGE_SECTION_LABELS } from '@/lib/cms';
import editorClient from '@/lib/editorClient';
import { cn } from '@/lib/utils';

const STATUS_BADGE = {
  draft: 'bg-slate-100 text-slate-600',
  in_review: 'bg-amber-100 text-amber-700',
  scheduled: 'bg-blue-100 text-blue-700',
  published: 'bg-emerald-100 text-emerald-700',
  unpublished: 'bg-orange-100 text-orange-700',
  archived: 'bg-zinc-200 text-zinc-600',
};

const EDITOR_PERMS = [
  { key: 'create', label_ar: 'إنشاء المقالات', label_en: 'Create Articles' },
  { key: 'edit', label_ar: 'تعديل المقالات', label_en: 'Edit Articles' },
  { key: 'delete', label_ar: 'حذف المقالات', label_en: 'Delete Articles' },
  { key: 'publish', label_ar: 'النشر', label_en: 'Publish' },
  { key: 'unpublish', label_ar: 'إلغاء النشر', label_en: 'Unpublish' },
  { key: 'schedule', label_ar: 'الجدولة', label_en: 'Schedule' },
  { key: 'manage_news', label_ar: 'إدارة الأخبار', label_en: 'Manage News' },
  { key: 'manage_pages', label_ar: 'إدارة الصفحات', label_en: 'Manage Pages' },
  { key: 'manage_media', label_ar: 'إدارة الوسائط', label_en: 'Manage Media' },
  { key: 'manage_comments', label_ar: 'إدارة التعليقات', label_en: 'Manage Comments' },
  { key: 'manage_categories', label_ar: 'إدارة التصنيفات', label_en: 'Manage Categories' },
  { key: 'seo_edit', label_ar: 'إدارة SEO', label_en: 'Manage SEO' },
  { key: 'manage_ads', label_ar: 'إدارة الإعلانات', label_en: 'Manage Ads' },
  { key: 'view_analytics', label_ar: 'عرض التحليلات', label_en: 'View Analytics' },
  { key: 'manage_editors', label_ar: 'إدارة المحررين', label_en: 'Manage Editors' },
];

const PLACEMENTS = [
  'header_banner', 'below_header', 'above_search', 'below_search',
  'home_hero', 'between_cards', 'above_latest', 'below_latest',
  'sidebar', 'article_top', 'article_middle', 'article_bottom',
  'above_comments', 'footer', 'custom_slot',
];

const TABS = [
  { key: 'overview', icon: LayoutDashboard, labelKey: 'editor_overview' },
  { key: 'articles', icon: FileText, labelKey: 'editor_articles' },
  { key: 'news', icon: Newspaper, labelKey: 'cms_news' },
  { key: 'pages', icon: FileCode, labelKey: 'cms_pages' },
  { key: 'editors', icon: Users, labelKey: 'cms_content_team' },
  { key: 'access', icon: ShieldCheck, labelKey: 'cms_access_security' },
  { key: 'comments', icon: MessageSquare, labelKey: 'editor_comments' },
  { key: 'categories', icon: Tag, labelKey: 'editor_categories' },
  { key: 'authors', icon: UserCircle, labelKey: 'editor_authors' },
  { key: 'media', icon: ImageIcon, labelKey: 'cms_media_library' },
  { key: 'templates', icon: LayoutTemplate, labelKey: 'cms_templates' },
  { key: 'ads', icon: Megaphone, labelKey: 'editor_ads' },
  { key: 'analytics', icon: BarChart3, labelKey: 'cms_analytics' },
  { key: 'header', icon: PanelTop, labelKey: 'cms_header' },
  { key: 'footer', icon: PanelBottom, labelKey: 'cms_footer' },
  { key: 'homepage', icon: Home, labelKey: 'cms_homepage_builder' },
  { key: 'settings', icon: SettingsIcon, labelKey: 'cms_site_settings' },
  { key: 'audit', icon: ScrollText, labelKey: 'cms_audit_log' },
];

const ContentManagementPanel = () => {
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState('overview');
  const [editArticleId, setEditArticleId] = useState(null);
  const [editTemplate, setEditTemplate] = useState(null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('editor_content_management')}</h1>
        <p className="text-sm text-muted-foreground mt-1">Estate Follow Insights — CMS</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b pb-2">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => { setTab(tb.key); setEditArticleId(null); setEditTemplate(null); }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              tab === tb.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <tb.icon size={16} /> {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview t={t} lang={lang} goArticles={() => setTab('articles')} />}
      {tab === 'articles' && (
        editArticleId !== null ? (
          <ArticleEditor articleId={editArticleId} template={editTemplate} onBack={() => { setEditArticleId(null); setEditTemplate(null); }} t={t} lang={lang} />
        ) : (
          <ArticlesAdmin t={t} lang={lang} onEdit={(id) => setEditArticleId(id)} onNew={(tpl) => { setEditTemplate(tpl || null); setEditArticleId('new'); }} contentType="article" />
        )
      )}
      {tab === 'news' && (
        editArticleId !== null ? (
          <ArticleEditor articleId={editArticleId} template={editTemplate} onBack={() => { setEditArticleId(null); setEditTemplate(null); }} t={t} lang={lang} />
        ) : (
          <ArticlesAdmin t={t} lang={lang} onEdit={(id) => setEditArticleId(id)} onNew={(tpl) => { setEditTemplate(tpl || null); setEditArticleId('new'); }} contentType="news" />
        )
      )}
      {tab === 'pages' && <PagesAdmin t={t} lang={lang} />}
      {tab === 'editors' && <EditorsAdmin t={t} lang={lang} />}
      {tab === 'access' && <AccessSecurity t={t} lang={lang} />}
      {tab === 'comments' && <CommentsAdmin t={t} lang={lang} />}
      {tab === 'categories' && <CategoriesAdmin t={t} lang={lang} />}
      {tab === 'authors' && <AuthorsAdmin t={t} lang={lang} />}
      {tab === 'media' && <MediaLibrary t={t} lang={lang} />}
      {tab === 'templates' && <TemplatesAdmin t={t} lang={lang} />}
      {tab === 'ads' && <AdsBanners t={t} lang={lang} />}
      {tab === 'analytics' && <AnalyticsAdmin t={t} lang={lang} />}
      {tab === 'header' && <MenuAdmin t={t} lang={lang} location="header" />}
      {tab === 'footer' && <MenuAdmin t={t} lang={lang} location="footer" />}
      {tab === 'homepage' && <HomepageBuilder t={t} lang={lang} />}
      {tab === 'settings' && <SiteSettings t={t} lang={lang} />}
      {tab === 'audit' && <AuditLog t={t} lang={lang} />}
    </div>
  );
};

/* ============ OVERVIEW ============ */
const Overview = ({ t, lang, goArticles }) => {
  const [stats, setStats] = useState({});
  useEffect(() => {
    (async () => {
      try {
        const [all, pub, draft, review, sched, arch, editors, activeEditors, comments, views] = await Promise.all([
          pb.collection('insights_articles').getList(1, 1, { filter: "1=1" }),
          pb.collection('insights_articles').getList(1, 1, { filter: "status='published'" }),
          pb.collection('insights_articles').getList(1, 1, { filter: "status='draft'" }),
          pb.collection('insights_articles').getList(1, 1, { filter: "status='in_review'" }),
          pb.collection('insights_articles').getList(1, 1, { filter: "status='scheduled'" }),
          pb.collection('insights_articles').getList(1, 1, { filter: "status='archived'" }),
          pb.collection('editors').getList(1, 1, { filter: "1=1" }),
          pb.collection('editors').getList(1, 1, { filter: "status='active' || active=true" }),
          pb.collection('insights_comments').getList(1, 1, { filter: "status='pending'" }),
          pb.collection('insights_article_views').getList(1, 1, { filter: "1=1" }),
        ]);
        // unique readers
        let uniqueReaders = 0;
        try {
          const allViews = await pb.collection('insights_article_views').getList(1, 1, { filter: "1=1" });
          uniqueReaders = allViews.totalItems;
        } catch { /* ignore */ }
        setStats({
          total: all.totalItems, published: pub.totalItems, draft: draft.totalItems,
          in_review: review.totalItems, scheduled: sched.totalItems, archived: arch.totalItems,
          editors: editors.totalItems, activeEditors: activeEditors.totalItems,
          comments: comments.totalItems, views: views.totalItems, uniqueReaders,
        });
      } catch { /* ignore */ }
    })();
  }, []);
  const cards = [
    { label: t('cms_total_articles'), value: stats.total, color: 'text-primary' },
    { label: t('editor_published'), value: stats.published, color: 'text-emerald-600' },
    { label: t('editor_drafts'), value: stats.draft, color: 'text-slate-600' },
    { label: t('editor_in_review'), value: stats.in_review, color: 'text-amber-600' },
    { label: t('editor_scheduled'), value: stats.scheduled, color: 'text-blue-600' },
    { label: t('cms_archived'), value: stats.archived, color: 'text-zinc-600' },
    { label: t('cms_total_views'), value: stats.views, color: 'text-purple-600' },
    { label: t('cms_unique_readers'), value: stats.uniqueReaders, color: 'text-indigo-600' },
    { label: t('editor_comments'), value: stats.comments, color: 'text-red-600' },
    { label: t('cms_total_editors'), value: stats.editors, color: 'text-teal-600' },
    { label: t('cms_active_editors'), value: stats.activeEditors, color: 'text-green-600' },
  ];
  return (
    <div className="space-y-4">
      <Button onClick={goArticles} className="min-h-[44px]"><Plus size={16} className="me-2" /> {t('editor_new_article')}</Button>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5 shadow-sm">
            <p className={cn('text-3xl font-extrabold', c.color)}>{c.value ?? 0}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ ARTICLE EDITOR ============ */
const ArticleEditor = ({ articleId, onBack, t, lang, template }) => {
  const [article, setArticle] = useState(articleId === 'new' ? {} : null);
  useEffect(() => {
    if (articleId !== 'new') {
      pb.collection('insights_articles').getOne(articleId, { expand: 'category,author,related_articles' }).then(setArticle).catch(() => setArticle({}));
    }
  }, [articleId]);
  if (!article) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  return (
    <div>
      <button onClick={onBack} className="text-sm text-primary hover:underline mb-4 inline-block">← {t('editor_articles')}</button>
      <h2 className="text-xl font-bold mb-6">{articleId === 'new' ? (template ? (lang === 'ar' ? `مقال جديد من قالب: ${template.name_ar}` : `New from template: ${template.name_en}`) : t('editor_new_article')) : t('editor_edit_article')}</h2>
      <ArticleForm article={article} template={template} client={pb} onSaved={() => { logAudit('article_save', 'insights_articles', articleId); onBack(); }} />
    </div>
  );
};

/* ============ ARTICLES / NEWS ADMIN ============ */
const ArticlesAdmin = ({ t, lang, onEdit, onNew, contentType }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => { fetchTemplates().then(setTemplates).catch(() => {}); }, []);

  const load = () => {
    setLoading(true);
    const parts = [`content_type='${contentType}'`];
    if (statusFilter !== 'all') parts.push(`status='${statusFilter}'`);
    if (search) parts.push(`(title_ar ~ "${search.replace(/"/g, '')}" || title_en ~ "${search.replace(/"/g, '')}" || slug ~ "${search.replace(/"/g, '')}")`);
    pb.collection('insights_articles').getList(1, 50, {
      filter: parts.join(' && '),
      sort: '-created', expand: 'category,author',
    }).then((r) => setItems(r.items || [])).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [statusFilter, search, contentType]);
  // Live: articles + views refresh in real time (publish, edit, delete, new view).
  useRealtimeRefresh(load, ['insights_articles', 'insights_article_views'], { deps: [statusFilter, search, contentType] });

  const quick = async (a, status) => {
    try { await pb.collection('insights_articles').update(a.id, { status, ...(status === 'published' && !a.published_at ? { published_at: new Date().toISOString() } : {}) }, { requestKey: `qa-${a.id}-${Date.now()}` }); logAudit(`article_${status}`, 'insights_articles', a.id); load(); } catch {}
  };
  const del = async (a) => { if (window.confirm(t('editor_delete') + '?')) { try { await pb.collection('insights_articles').delete(a.id, { requestKey: `del-${a.id}` }); logAudit('article_delete', 'insights_articles', a.id); load(); } catch {} } };
  const duplicate = async (a) => {
    try {
      const { id, created, updated, ...rest } = a;
      await pb.collection('insights_articles').create({ ...rest, slug: `${a.slug}-copy-${Date.now().toString(36)}`, status: 'draft', title_ar: a.title_ar ? `${a.title_ar} (نسخة)` : '', title_en: a.title_en ? `${a.title_en} (copy)` : '', views: 0, published_at: '' }, { requestKey: `dup-${a.id}-${Date.now()}` });
      logAudit('article_duplicate', 'insights_articles', a.id);
      load();
    } catch (err) { alert(String(err?.message || err)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('insights_search_placeholder')} className="h-10 ps-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('insights_all')}</SelectItem>
              {ARTICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`editor_${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setShowTemplates(true)} className="min-h-[44px]"><Plus size={16} className="me-2" /> {t('editor_new_article')}</Button>
      </div>
      {showTemplates && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm">{t('cms_create_from_template') || (lang === 'ar' ? 'إنشاء من قالب' : 'Create from template')}</h3>
            <button onClick={() => setShowTemplates(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button onClick={() => { setShowTemplates(false); onNew(null); }} className="rounded-lg border p-4 text-start hover:border-primary hover:shadow-sm transition-all">
              <FileText size={20} className="text-primary mb-2" />
              <p className="font-semibold text-sm">{lang === 'ar' ? 'مقال فارغ' : 'Blank article'}</p>
              <p className="text-xs text-muted-foreground mt-1">{lang === 'ar' ? 'ابدأ من الصفر' : 'Start from scratch'}</p>
            </button>
            {templates.map((tpl) => (
              <button key={tpl.id} onClick={() => { setShowTemplates(false); onNew(tpl); }} className="rounded-lg border p-4 text-start hover:border-primary hover:shadow-sm transition-all">
                <LayoutTemplate size={20} className="text-primary mb-2" />
                <p className="font-semibold text-sm">{lang === 'ar' ? tpl.name_ar : tpl.name_en}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lang === 'ar' ? tpl.description_ar : tpl.description_en}</p>
                <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{contentTypeLabel(tpl.content_type, t)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {loading ? <div className="space-y-2">{[0,1,2,3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div> : items.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">{t('insights_no_results')}</div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm line-clamp-1">{articleTitle(a, lang) || a.slug}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{contentTypeLabel(a.content_type, t)} {a.published_at ? `• ${formatDateLong(a.published_at, lang)}` : ''} • {a.views || 0} {lang === 'ar' ? 'مشاهدة' : 'views'}</p>
              </div>
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_BADGE[a.status])}>{t(`editor_${a.status}`)}</span>
              <div className="flex items-center gap-1">
                {a.status !== 'published' && <button onClick={() => quick(a, 'published')} title={t('editor_publish')} className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"><Check size={16} /></button>}
                {a.status === 'published' && <button onClick={() => quick(a, 'unpublished')} title={t('editor_unpublish')} className="flex h-8 w-8 items-center justify-center rounded-md text-orange-600 hover:bg-orange-50"><X size={16} /></button>}
                <button onClick={() => duplicate(a)} title={t('cms_duplicate')} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"><Copy size={15} /></button>
                <a href={`/insights/article/${a.slug}`} target="_blank" rel="noreferrer" title={t('cms_preview')} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"><ExternalLink size={15} /></a>
                <button onClick={() => onEdit(a.id)} title={t('editor_edit_article')} className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Pencil size={16} /></button>
                <button onClick={() => del(a)} title={t('editor_delete')} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============ PAGE SECTIONS BUILDER ============ */
const SECTION_TYPES = [
  { key: 'text', label_ar: 'نص', label_en: 'Text' },
  { key: 'image', label_ar: 'صورة', label_en: 'Image' },
  { key: 'video', label_ar: 'فيديو', label_en: 'Video' },
  { key: 'cta', label_ar: 'زر إجراء', label_en: 'CTA' },
  { key: 'article_grid', label_ar: 'شبكة مقالات', label_en: 'Article Grid' },
  { key: 'news_grid', label_ar: 'شبكة أخبار', label_en: 'News Grid' },
  { key: 'banner', label_ar: 'بانر', label_en: 'Banner' },
  { key: 'faq', label_ar: 'أسئلة شائعة', label_en: 'FAQ' },
  { key: 'contact_form', label_ar: 'نموذج تواصل', label_en: 'Contact Form' },
  { key: 'custom', label_ar: 'محتوى مخصص', label_en: 'Custom Block' },
];

const PageSectionsBuilder = ({ sections, onChange, t, lang }) => {
  const add = (type) => onChange([...(sections || []), { type, title_ar: '', title_en: '', content: '', url: '', image: '' }]);
  const remove = (i) => onChange(sections.filter((_, idx) => idx !== i));
  const move = (i, dir) => { const n = [...sections]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  const update = (i, field, val) => onChange(sections.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">{t('cms_page_builder') || (lang === 'ar' ? 'منشئ الصفحة' : 'Page Builder')}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{lang === 'ar' ? 'أضف أقسامًا إلى الصفحة ورتبها بالسهمين.' : 'Add sections to the page and reorder with the arrows.'}</p>
      <div className="space-y-2">
        {(sections || []).map((s, i) => (
          <div key={i} className="rounded-lg border bg-background p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => move(i, -1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"><ArrowUp size={13} /></button>
                <button type="button" onClick={() => move(i, 1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"><ArrowDown size={13} /></button>
              </div>
              <GripVertical size={15} className="text-muted-foreground" />
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{SECTION_TYPES.find((st) => st.key === s.type)?.[lang === 'ar' ? 'label_ar' : 'label_en'] || s.type}</span>
              <button type="button" onClick={() => remove(i)} className="ms-auto flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={s.title_ar || ''} onChange={(e) => update(i, 'title_ar', e.target.value)} placeholder={lang === 'ar' ? 'عنوان (عربي)' : 'Title (AR)'} dir="rtl" className="h-9 text-sm" />
              <Input value={s.title_en || ''} onChange={(e) => update(i, 'title_en', e.target.value)} placeholder={lang === 'ar' ? 'عنوان (إنجليزي)' : 'Title (EN)'} dir="ltr" className="h-9 text-sm" />
            </div>
            {(s.type === 'text' || s.type === 'custom' || s.type === 'faq') && (
              <Textarea value={s.content || ''} onChange={(e) => update(i, 'content', e.target.value)} rows={3} placeholder={lang === 'ar' ? 'المحتوى...' : 'Content...'} className="text-sm" />
            )}
            {(s.type === 'image' || s.type === 'banner') && (
              <Input value={s.image || ''} onChange={(e) => update(i, 'image', e.target.value)} dir="ltr" placeholder="Image URL" className="h-9 text-sm" />
            )}
            {(s.type === 'video' || s.type === 'cta') && (
              <Input value={s.url || ''} onChange={(e) => update(i, 'url', e.target.value)} dir="ltr" placeholder={s.type === 'video' ? 'Video URL' : 'Button URL'} className="h-9 text-sm" />
            )}
          </div>
        ))}
        {(sections || []).length === 0 && <p className="text-xs text-muted-foreground py-2">{lang === 'ar' ? 'لا توجد أقسام بعد.' : 'No sections yet.'}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {SECTION_TYPES.map((st) => (
          <button key={st.key} type="button" onClick={() => add(st.key)} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium hover:border-primary hover:text-primary transition-colors">
            <Plus size={12} /> {lang === 'ar' ? st.label_ar : st.label_en}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ============ PAGES ============ */
const PagesAdmin = ({ t, lang }) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [image, setImage] = useState(null);
  const [confirmSlug, setConfirmSlug] = useState('');

  const load = () => pb.collection('insights_pages').getFullList({ sort: 'order,created' }).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  // Live: pages refresh in real time across editor/admin tabs.
  useRealtimeRefresh(load, ['insights_pages']);

  const blank = { title_ar: '', title_en: '', slug: '', page_type: 'custom', content_ar: '', content_en: '', hero_ar: '', hero_en: '', seo_title_ar: '', seo_title_en: '', meta_description_ar: '', meta_description_en: '', show_in_header: false, show_in_footer: false, indexable: true, is_core: false, order: 0, status: 'draft', sections: [] };

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (k !== 'content_ar' && k !== 'content_en' && k !== 'sections') fd.append(k, String(v ?? '')); });
    fd.append('content_ar', form.content_ar || '');
    fd.append('content_en', form.content_en || '');
    fd.append('sections', JSON.stringify(Array.isArray(form.sections) ? form.sections : []));
    if (image) fd.append('image', image);
    try {
      if (editingId) { await pb.collection('insights_pages').update(editingId, fd, { requestKey: `pg-${editingId}` }); logAudit('page_update', 'insights_pages', editingId); }
      else { const r = await pb.collection('insights_pages').create(fd, { requestKey: `pg-new-${Date.now()}` }); logAudit('page_create', 'insights_pages', r.id); }
      setForm(null); setEditingId(null); setImage(null); load();
    } catch (err) { alert(String(err?.message || err)); }
  };

  const del = async (p) => {
    if (p.is_core) {
      const typed = window.prompt(t('cms_confirm_delete_core'));
      if (typed !== p.slug) { alert(lang === 'ar' ? 'الـ slug غير مطابق' : 'Slug does not match'); return; }
    } else {
      if (!window.confirm(t('editor_delete') + '?')) return;
    }
    try { await pb.collection('insights_pages').delete(p.id, { requestKey: `pg-del-${p.id}` }); logAudit('page_delete', 'insights_pages', p.id); load(); } catch (err) { alert(String(err?.message || err)); }
  };

  const quick = async (p, status) => { try { await pb.collection('insights_pages').update(p.id, { status }, { requestKey: `pg-${p.id}-${status}` }); logAudit(`page_${status}`, 'insights_pages', p.id); load(); } catch {} };
  const move = async (p, dir) => { try { await pb.collection('insights_pages').update(p.id, { order: (p.order || 0) + dir }, { requestKey: `pg-ord-${p.id}` }); load(); } catch {} };
  const duplicatePage = async (p) => {
    try {
      const { id, created, updated, ...rest } = p;
      const fd = new FormData();
      Object.entries({ ...rest, slug: `${p.slug}-copy-${Date.now().toString(36)}`, status: 'draft', title_ar: p.title_ar ? `${p.title_ar} (نسخة)` : '', title_en: p.title_en ? `${p.title_en} (copy)` : '', order: (p.order || 0) + 1, is_core: false }).forEach(([k, v]) => { if (k !== 'content_ar' && k !== 'content_en' && k !== 'sections' && k !== 'image') fd.append(k, String(v ?? '')); });
      fd.append('content_ar', rest.content_ar || '');
      fd.append('content_en', rest.content_en || '');
      fd.append('sections', JSON.stringify(Array.isArray(rest.sections) ? rest.sections : []));
      const r = await pb.collection('insights_pages').create(fd, { requestKey: `pg-dup-${Date.now()}` });
      logAudit('page_duplicate', 'insights_pages', r.id);
      load();
    } catch (err) { alert(String(err?.message || err)); }
  };

  if (form) {
    return (
      <form onSubmit={save} className="space-y-4 max-w-3xl">
        <button type="button" onClick={() => { setForm(null); setEditingId(null); }} className="text-sm text-primary hover:underline">← {t('cms_pages')}</button>
        <h2 className="text-xl font-bold">{editingId ? t('editor_edit_article') : t('cms_add_page')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t('cms_page_name_ar')}</Label><Input value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} dir="rtl" required /></div>
          <div className="space-y-1"><Label>{t('cms_page_name_en')}</Label><Input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/\s+/g, '-') })} dir="ltr" required /></div>
          <div className="space-y-1"><Label>{t('af_slug')}</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} dir="ltr" required /></div>
          <div className="space-y-1"><Label>{t('cms_page_type')}</Label>
            <Select value={form.page_type} onValueChange={(v) => setForm({ ...form, page_type: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['static','landing','legal','about','contact','custom'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t('cms_hero')} (AR)</Label><Input value={form.hero_ar} onChange={(e) => setForm({ ...form, hero_ar: e.target.value })} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('cms_hero')} (EN)</Label><Input value={form.hero_en} onChange={(e) => setForm({ ...form, hero_en: e.target.value })} dir="ltr" /></div>
        </div>
        <div className="space-y-1"><Label>{t('af_cover_image')}</Label><input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)} className="text-sm" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t('af_content_ar')}</Label><Textarea value={form.content_ar} onChange={(e) => setForm({ ...form, content_ar: e.target.value })} rows={6} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('af_content_en')}</Label><Textarea value={form.content_en} onChange={(e) => setForm({ ...form, content_en: e.target.value })} rows={6} dir="ltr" /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t('af_seo_title_ar')}</Label><Input value={form.seo_title_ar} onChange={(e) => setForm({ ...form, seo_title_ar: e.target.value })} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('af_seo_title_en')}</Label><Input value={form.seo_title_en} onChange={(e) => setForm({ ...form, seo_title_en: e.target.value })} dir="ltr" /></div>
          <div className="space-y-1"><Label>{t('af_meta_ar')}</Label><Input value={form.meta_description_ar} onChange={(e) => setForm({ ...form, meta_description_ar: e.target.value })} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('af_meta_en')}</Label><Input value={form.meta_description_en} onChange={(e) => setForm({ ...form, meta_description_en: e.target.value })} dir="ltr" /></div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.show_in_header} onCheckedChange={(v) => setForm({ ...form, show_in_header: !!v })} /> {t('cms_show_in_header')}</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.show_in_footer} onCheckedChange={(v) => setForm({ ...form, show_in_footer: !!v })} /> {t('cms_show_in_footer')}</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.indexable} onCheckedChange={(v) => setForm({ ...form, indexable: !!v })} /> {t('af_indexable')}</label>
        </div>

        {/* Page Builder */}
        <PageSectionsBuilder sections={Array.isArray(form.sections) ? form.sections : []} onChange={(sections) => setForm({ ...form, sections })} t={t} lang={lang} />

        <div className="space-y-1"><Label>{t('cms_status')}</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger className="h-10 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['draft','published','unpublished','hidden','archived'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="min-h-[44px]">{t('editor_save')}</Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t('cms_pages')}</h2>
        <Button onClick={() => { setForm(blank); setEditingId(null); }} className="min-h-[44px]"><Plus size={16} className="me-2" /> {t('cms_add_page')}</Button>
      </div>
      <div className="space-y-2">
        {items.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex flex-col gap-1">
              <button onClick={() => move(p, -1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"><ArrowUp size={14} /></button>
              <button onClick={() => move(p, 1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"><ArrowDown size={14} /></button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{lang === 'ar' ? (p.title_ar || p.title_en) : (p.title_en || p.title_ar)} {p.is_core && <Crown size={13} className="inline text-amber-500" />}</p>
              <p className="text-xs text-muted-foreground">/{p.slug} • {p.page_type} • {p.status}</p>
            </div>
            {p.is_core && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{lang === 'ar' ? 'أساسية' : 'core'}</span>}
            <div className="flex items-center gap-1">
              {p.status !== 'published' && <button onClick={() => quick(p, 'published')} title={t('editor_publish')} className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"><Check size={16} /></button>}
              {p.status === 'published' && <button onClick={() => quick(p, 'hidden')} title={lang === 'ar' ? 'إخفاء' : 'Hide'} className="flex h-8 w-8 items-center justify-center rounded-md text-orange-600 hover:bg-orange-50"><X size={16} /></button>}
              <button onClick={() => duplicatePage(p)} title={t('cms_duplicate')} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"><Copy size={15} /></button>
              <button onClick={() => { setForm({ ...blank, ...p, sections: Array.isArray(p.sections) ? p.sections : [] }); setEditingId(p.id); }} title={t('editor_edit_article')} className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Pencil size={16} /></button>
              <button onClick={() => del(p)} title={t('editor_delete')} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ EDITORS / CONTENT TEAM ============ */
const EditorsAdmin = ({ t, lang }) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'editor', status: 'active', permissions: {}, force_password_change: false });
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ password: '', force: false });

  const load = () => pb.collection('editors').getList(1, 50, { sort: '-created' }).then((r) => setItems(r.items || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  // Live: editors refresh in real time (create, suspend, delete, password reset).
  useRealtimeRefresh(load, ['editors']);

  const togglePerm = (k) => setForm((p) => ({ ...p, permissions: { ...p.permissions, [k]: !p.permissions[k] } }));

  const create = async (e) => {
    e.preventDefault();
    if (form.password.length < 10) { alert(lang === 'ar' ? 'كلمة المرور 10 أحرف على الأقل' : 'Password must be 10+ chars'); return; }
    try {
      await pb.collection('editors').create({
        email: form.email.trim().toLowerCase(),
        password: form.password, passwordConfirm: form.password,
        name: form.name, role: form.role, active: form.status === 'active',
        status: form.status, permissions: form.permissions, verified: true,
        is_primary: false, suspended: form.status === 'suspended',
        force_password_change: form.force_password_change,
      }, { requestKey: `editor-new-${Date.now()}` });
      logAudit('editor_create', 'editors', form.email);
      setForm({ name: '', email: '', password: '', role: 'editor', status: 'active', permissions: {}, force_password_change: false });
      setShow(false); load();
    } catch (err) { alert(String(err?.response?.message || err?.message || err)); }
  };

  const updateStatus = async (ed, status) => {
    try { await pb.collection('editors').update(ed.id, { status, active: status === 'active', suspended: status === 'suspended' }, { requestKey: `ed-${ed.id}` }); logAudit(`editor_${status}`, 'editors', ed.id); load(); } catch {}
  };
  const del = async (ed) => {
    if (ed.is_primary) { alert(lang === 'ar' ? 'لا يمكن حذف مدير المحتوى الأساسي' : 'Cannot delete Primary Content Admin'); return; }
    if (window.confirm(t('editor_delete') + '?')) { try { await pb.collection('editors').delete(ed.id, { requestKey: `ed-del-${ed.id}` }); logAudit('editor_delete', 'editors', ed.id); load(); } catch (err) { alert(String(err?.message || err)); } }
  };
  const doReset = async (e) => {
    e.preventDefault();
    if (resetForm.password.length < 10) { alert(lang === 'ar' ? 'كلمة المرور 10 أحرف على الأقل' : 'Password must be 10+ chars'); return; }
    try {
      await pb.collection('editors').update(resetTarget.id, { password: resetForm.password, passwordConfirm: resetForm.password, force_password_change: resetForm.force }, { requestKey: `ed-reset-${resetTarget.id}` });
      logAudit('editor_password_reset', 'editors', resetTarget.id);
      setResetTarget(null); setResetForm({ password: '', force: false }); load();
      alert(t('cms_saved'));
    } catch (err) { alert(String(err?.message || err)); }
  };

  const roleLabel = (r) => ({ editor: 'Editor', senior_editor: 'Senior Editor', content_manager: 'Content Manager' }[r] || r);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t('cms_content_team')}</h2>
        <Button onClick={() => { setShow((v) => !v); setEditingId(null); }} className="min-h-[44px]"><Plus size={16} className="me-2" /> {t('cms_add_editor')}</Button>
      </div>
      {show && (
        <form onSubmit={create} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t('name')}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-1"><Label>{t('email')}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" required /></div>
          <div className="space-y-1"><Label>{t('cms_temp_password')}</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" placeholder={lang === 'ar' ? '10+ أحرف' : '10+ chars'} required /></div>
          <div className="space-y-1"><Label>{t('cms_role')}</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="senior_editor">Senior Editor</SelectItem>
                <SelectItem value="content_manager">Content Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>{t('cms_status')}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('cms_active')}</SelectItem>
                <SelectItem value="inactive">{t('cms_inactive')}</SelectItem>
                <SelectItem value="suspended">{t('cms_suspended')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>{t('cms_permissions')}</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {EDITOR_PERMS.map((p) => (
                <label key={p.key} className="flex items-center gap-1.5 text-sm"><Checkbox checked={!!form.permissions[p.key]} onCheckedChange={() => togglePerm(p.key)} /> {lang === 'ar' ? p.label_ar : p.label_en}</label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={!!form.force_password_change} onCheckedChange={(v) => setForm({ ...form, force_password_change: !!v })} /> {t('cms_force_password_change')}</label>
          <div className="sm:col-span-2"><Button type="submit" className="min-h-[44px]">{t('editor_save')}</Button></div>
        </form>
      )}
      {resetTarget && (
        <form onSubmit={doReset} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <h3 className="sm:col-span-2 font-bold">{t('cms_set_temp_password')} — {resetTarget.email}</h3>
          <div className="space-y-1"><Label>{t('cms_new_password')}</Label><Input type="text" value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} dir="ltr" placeholder="10+ chars" required /></div>
          <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><Checkbox checked={!!resetForm.force} onCheckedChange={(v) => setResetForm({ ...resetForm, force: !!v })} /> {t('cms_force_password_change')}</label></div>
          <div className="sm:col-span-2 flex gap-2"><Button type="submit" className="min-h-[44px]">{t('editor_save')}</Button><Button type="button" variant="outline" onClick={() => setResetTarget(null)}>{t('cancel')}</Button></div>
        </form>
      )}
      <div className="space-y-2">
        {items.map((ed) => (
          <div key={ed.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm flex items-center gap-1.5">
                {ed.name}
                {ed.is_primary && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"><Crown size={11} /> {t('cms_primary_admin')}</span>}
                <span className="text-xs text-muted-foreground">({ed.email})</span>
              </p>
              <p className="text-xs text-muted-foreground">{roleLabel(ed.role)} • {ed.status || (ed.active === false ? 'inactive' : 'active')}</p>
            </div>
            <Select value={ed.status || (ed.active === false ? 'inactive' : 'active')} onValueChange={(v) => updateStatus(ed, v)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('cms_active')}</SelectItem>
                <SelectItem value="inactive">{t('cms_inactive')}</SelectItem>
                <SelectItem value="suspended">{t('cms_suspended')}</SelectItem>
              </SelectContent>
            </Select>
            <button onClick={() => setResetTarget(ed)} title={t('cms_set_temp_password')} className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><KeyRound size={15} /></button>
            {!ed.is_primary && <button onClick={() => del(ed)} title={t('editor_delete')} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ ACCESS & SECURITY ============ */
const AccessSecurity = ({ t, lang }) => {
  const [form, setForm] = useState({ current: '', password: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (form.password.length < 10) { setErr(lang === 'ar' ? 'كلمة المرور 10 أحرف على الأقل' : 'Password must be 10+ chars'); return; }
    if (form.password !== form.confirm) { setErr(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'); return; }
    if (!/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password)) { setErr(lang === 'ar' ? 'يجب أن تحتوي على أحرف كبيرة وصغيرة وأرقام ورمز' : 'Must include upper, lower, number, symbol'); return; }
    try {
      // Verify current password using the isolated editor client (does NOT
      // touch the Super Admin's main session).
      const primary = await pb.collection('editors').getFirstListItem('is_primary = true');
      try {
        await editorClient.collection('editors').authWithPassword(primary.email, form.current, { requestKey: `verify-pwd-${Date.now()}` });
        editorClient.authStore.clear();
      } catch {
        setErr(lang === 'ar' ? 'كلمة المرور الحالية غير صحيحة' : 'Current password is incorrect');
        return;
      }
      await pb.collection('editors').update(primary.id, { password: form.password, passwordConfirm: form.password }, { requestKey: `pwd-change-${primary.id}` });
      logAudit('portal_password_change', 'editors', primary.id);
      setForm({ current: '', password: '', confirm: '' }); setMsg(t('cms_saved'));
    } catch (err2) { setErr(String(err2?.message || err2)); }
  };

  const PwInput = ({ name, label, value }) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="relative">
        <Lock className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input type={show[name] ? 'text' : 'password'} dir="ltr" value={value} onChange={(e) => setForm({ ...form, [name]: e.target.value })} className="min-h-[44px] ps-10 pe-10" required />
        <button type="button" onClick={() => setShow({ ...show, [name]: !show[name] })} className="absolute end-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
          {show[name] ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-lg font-bold">{t('cms_change_portal_password')}</h2>
      <p className="text-sm text-muted-foreground">{t('cms_primary_admin')} — content.admin@estatefollow.com</p>
      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
        <PwInput name="current" label={t('cms_current_password')} value={form.current} />
        <PwInput name="password" label={t('cms_new_password')} value={form.password} />
        <PwInput name="confirm" label={t('cms_confirm_password')} value={form.confirm} />
        {err && <p className="text-sm text-destructive">{err}</p>}
        {msg && <p className="text-sm text-emerald-600">{msg}</p>}
        <Button type="submit" className="min-h-[44px]">{t('editor_save')}</Button>
      </form>
    </div>
  );
};

/* ============ COMMENTS (bulk) ============ */
const CommentsAdmin = ({ t, lang }) => {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(new Set());
  const load = () => pb.collection('insights_comments').getList(1, 100, { filter: `status='${filter}'`, sort: '-created', expand: 'article' }).then((r) => { setItems(r.items || []); setSelected(new Set()); }).catch(() => setItems([]));
  useEffect(() => { load(); }, [filter]);
  // Live: comments refresh in real time (new comment, approve, delete).
  useRealtimeRefresh(load, ['insights_comments'], { deps: [filter] });
  const setStatus = async (c, status) => { try { await pb.collection('insights_comments').update(c.id, { status }, { requestKey: `com-${c.id}-${status}` }); logAudit('comment_' + status, 'insights_comments', c.id); load(); } catch {} };
  const del = async (c) => { if (window.confirm(t('editor_delete') + '?')) { try { await pb.collection('insights_comments').delete(c.id, { requestKey: `com-del-${c.id}` }); load(); } catch {} } };
  const toggle = (id) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulk = async (status) => {
    const ids = [...selected];
    if (!ids.length) return;
    await Promise.all(ids.map((id, i) => pb.collection('insights_comments').update(id, { status }, { requestKey: `bulk-${id}-${i}` }).catch(() => {})));
    logAudit('comment_bulk_' + status, 'insights_comments', ids.length + '');
    load();
  };
  const bulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length || !window.confirm(t('editor_delete') + ` (${ids.length})?`)) return;
    await Promise.all(ids.map((id, i) => pb.collection('insights_comments').delete(id, { requestKey: `bulkd-${id}-${i}` }).catch(() => {})));
    logAudit('comment_bulk_delete', 'insights_comments', ids.length + '');
    load();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44 h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">{lang === 'ar' ? 'بانتظار الموافقة' : 'Pending'}</SelectItem>
            <SelectItem value="approved">{t('status_approved')}</SelectItem>
            <SelectItem value="rejected">{t('status_rejected')}</SelectItem>
            <SelectItem value="spam">Spam</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => bulk('approved')}><Check size={14} className="me-1" /> {t('cms_approve_selected')} ({selected.size})</Button>
            <Button size="sm" variant="outline" onClick={() => bulk('rejected')}><X size={14} className="me-1" /> {t('cms_reject_selected')}</Button>
            <Button size="sm" variant="outline" onClick={() => bulk('spam')}><Ban size={14} className="me-1" /> {t('cms_mark_spam_selected')}</Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete}><Trash2 size={14} className="me-1" /> {t('cms_delete_selected')}</Button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{t('cms_no_data')}</p> : items.map((c) => (
          <div key={c.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2"><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} /> <span className="font-semibold text-sm">{c.name} <span className="text-xs text-muted-foreground">({c.email})</span></span></label>
              <p className="text-xs text-muted-foreground">{formatDateLong(c.created, lang)}</p>
            </div>
            <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">{c.body}</p>
            {c.expand?.article && <p className="mt-2 text-xs text-muted-foreground">{articleTitle(c.expand.article, lang)}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setStatus(c, 'approved')}><Check size={14} className="me-1" /> {t('status_approved')}</Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(c, 'rejected')}><X size={14} className="me-1" /> {t('status_rejected')}</Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(c, 'spam')}>Spam</Button>
              <Button size="sm" variant="destructive" onClick={() => del(c)}><Trash2 size={14} className="me-1" /> {t('editor_delete')}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ TEMPLATES ============ */
const TemplatesAdmin = ({ t, lang }) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name_ar: '', name_en: '', description_ar: '', description_en: '', content_type: 'article', content_ar: '', content_en: '' });
  const [show, setShow] = useState(false);

  const load = () => fetchTemplates().then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await createTemplate(form);
      logAudit('template_create', 'insights_templates', form.name_en);
      setForm({ name_ar: '', name_en: '', description_ar: '', description_en: '', content_type: 'article', content_ar: '', content_en: '' });
      setShow(false); load();
    } catch (err) { alert(String(err?.message || err)); }
  };
  const del = async (tpl) => {
    if (tpl.is_builtin) { alert(lang === 'ar' ? 'لا يمكن حذف القوالب المدمجة' : 'Cannot delete built-in templates'); return; }
    if (window.confirm(t('editor_delete') + '?')) { try { await deleteTemplate(tpl.id); logAudit('template_delete', 'insights_templates', tpl.id); load(); } catch {} }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">{t('cms_templates') || (lang === 'ar' ? 'القوالب' : 'Templates')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{lang === 'ar' ? 'أنشئ قوالب لإعادة استخدامها عند إنشاء المحتوى.' : 'Create reusable templates for new content.'}</p>
        </div>
        <Button onClick={() => setShow((v) => !v)} className="min-h-[44px]"><Plus size={16} className="me-2" /> {lang === 'ar' ? 'قالب جديد' : 'New Template'}</Button>
      </div>
      {show && (
        <form onSubmit={save} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 max-w-3xl">
          <div className="space-y-1"><Label>{t('af_title_ar')}</Label><Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} dir="rtl" required /></div>
          <div className="space-y-1"><Label>{t('af_title_en')}</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} dir="ltr" required /></div>
          <div className="space-y-1"><Label>{t('af_description_ar')}</Label><Input value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('af_description_en')}</Label><Input value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} dir="ltr" /></div>
          <div className="space-y-1 sm:col-span-2"><Label>{t('af_content_type')}</Label>
            <Select value={form.content_type} onValueChange={(v) => setForm({ ...form, content_type: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>{['article','news','guide','legal_update','video','photo_article','official_statement'].map((ct) => <SelectItem key={ct} value={ct}>{contentTypeLabel(ct, t)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>{t('af_content_ar')}</Label><Textarea value={form.content_ar} onChange={(e) => setForm({ ...form, content_ar: e.target.value })} rows={4} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('af_content_en')}</Label><Textarea value={form.content_en} onChange={(e) => setForm({ ...form, content_en: e.target.value })} rows={4} dir="ltr" /></div>
          <div className="sm:col-span-2 flex gap-2"><Button type="submit" className="min-h-[44px]">{t('editor_save')}</Button><Button type="button" variant="outline" onClick={() => setShow(false)}>{t('cancel')}</Button></div>
        </form>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((tpl) => (
          <div key={tpl.id} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-start justify-between">
              <LayoutTemplate size={20} className="text-primary shrink-0" />
              {tpl.is_builtin ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">{lang === 'ar' ? 'مدمج' : 'built-in'}</span> : <button onClick={() => del(tpl)} className="flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>}
            </div>
            <p className="font-semibold text-sm">{lang === 'ar' ? tpl.name_ar : tpl.name_en}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{lang === 'ar' ? tpl.description_ar : tpl.description_en}</p>
            <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{contentTypeLabel(tpl.content_type, t)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ CATEGORIES ============ */
const CategoriesAdmin = ({ t, lang }) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name_ar: '', name_en: '', slug: '', description_ar: '', description_en: '' });
  const [editingId, setEditingId] = useState(null);
  const load = () => pb.collection('insights_categories').getFullList({ sort: 'name_en' }).then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, slug: form.slug || form.name_en.toLowerCase().replace(/\s+/g, '-') };
    try { if (editingId) { await pb.collection('insights_categories').update(editingId, payload, { requestKey: `cat-${editingId}` }); logAudit('category_update', 'insights_categories', editingId); } else { const r = await pb.collection('insights_categories').create(payload, { requestKey: `cat-new-${Date.now()}` }); logAudit('category_create', 'insights_categories', r.id); } setForm({ name_ar: '', name_en: '', slug: '', description_ar: '', description_en: '' }); setEditingId(null); load(); } catch (err) { alert(String(err?.message || err)); }
  };
  const del = async (c) => { if (window.confirm(t('editor_delete') + '?')) { try { await pb.collection('insights_categories').delete(c.id, { requestKey: `cat-del-${c.id}` }); logAudit('category_delete', 'insights_categories', c.id); load(); } catch {} } };
  return (
    <div className="space-y-4">
      <form onSubmit={save} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1"><Label>{t('af_title_ar')}</Label><Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} dir="rtl" required /></div>
        <div className="space-y-1"><Label>{t('af_title_en')}</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/\s+/g, '-') })} dir="ltr" required /></div>
        <div className="space-y-1"><Label>{t('af_slug')}</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} dir="ltr" /></div>
        <div className="space-y-1"><Label>{t('af_description_ar')}</Label><Input value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} dir="rtl" /></div>
        <div className="sm:col-span-2"><Button type="submit" className="min-h-[44px]">{t('editor_save')}</Button></div>
      </form>
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex-1"><p className="font-semibold text-sm">{lang === 'ar' ? c.name_ar : c.name_en}</p><p className="text-xs text-muted-foreground">{c.slug}</p></div>
            <button onClick={() => { setEditingId(c.id); setForm({ name_ar: c.name_ar, name_en: c.name_en, slug: c.slug, description_ar: c.description_ar || '', description_en: c.description_en || '' }); }} className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Pencil size={15} /></button>
            <button onClick={() => del(c)} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ AUTHORS ============ */
const AuthorsAdmin = ({ t, lang }) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', bio_ar: '', bio_en: '' });
  const [photo, setPhoto] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const load = () => pb.collection('insights_authors').getFullList({ sort: 'name' }).then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('name', form.name); fd.append('bio_ar', form.bio_ar); fd.append('bio_en', form.bio_en);
    if (photo) fd.append('photo', photo);
    try { if (editingId) { await pb.collection('insights_authors').update(editingId, fd, { requestKey: `auth-${editingId}` }); logAudit('author_update', 'insights_authors', editingId); } else { const r = await pb.collection('insights_authors').create(fd, { requestKey: `auth-new-${Date.now()}` }); logAudit('author_create', 'insights_authors', r.id); } setForm({ name: '', bio_ar: '', bio_en: '' }); setPhoto(null); setEditingId(null); load(); } catch (err) { alert(String(err?.message || err)); }
  };
  const del = async (a) => { if (window.confirm(t('editor_delete') + '?')) { try { await pb.collection('insights_authors').delete(a.id, { requestKey: `auth-del-${a.id}` }); logAudit('author_delete', 'insights_authors', a.id); load(); } catch {} } };
  return (
    <div className="space-y-4">
      <form onSubmit={save} className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1"><Label>{t('name')}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t('af_description_ar')}</Label><Textarea value={form.bio_ar} onChange={(e) => setForm({ ...form, bio_ar: e.target.value })} rows={2} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('af_description_en')}</Label><Textarea value={form.bio_en} onChange={(e) => setForm({ ...form, bio_en: e.target.value })} rows={2} dir="ltr" /></div>
        </div>
        <div className="space-y-1"><Label>{t('af_cover_image')}</Label><input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} className="text-sm" /></div>
        <Button type="submit" className="min-h-[44px] w-fit">{t('editor_save')}</Button>
      </form>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex-1"><p className="font-semibold text-sm">{a.name}</p></div>
            <button onClick={() => del(a)} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ MEDIA LIBRARY ============ */
const MediaLibrary = ({ t, lang }) => {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState({ name: '', alt_text: '', caption: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const f = search ? `name ~ "${search.replace(/"/g, '')}"` : '1=1';
    pb.collection('insights_media').getList(1, 60, { filter: f, sort: '-created' }).then((r) => setItems(r.items || [])).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [search]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', meta.name || file.name);
    const ext = file.name.split('.').pop().toLowerCase();
    const type = ['mp4','webm','mov'].includes(ext) ? 'video' : ext === 'pdf' ? 'pdf' : ['jpg','jpeg','png','webp','gif'].includes(ext) ? 'image' : 'file';
    fd.append('type', type);
    fd.append('alt_text', meta.alt_text);
    fd.append('caption', meta.caption);
    try { const r = await pb.collection('insights_media').create(fd, { requestKey: `media-new-${Date.now()}` }); logAudit('media_upload', 'insights_media', r.id); setFile(null); setMeta({ name: '', alt_text: '', caption: '' }); load(); } catch (err) { alert(String(err?.message || err)); }
  };
  const del = async (m) => { if (window.confirm(t('editor_delete') + '?')) { try { await pb.collection('insights_media').delete(m.id, { requestKey: `media-del-${m.id}` }); logAudit('media_delete', 'insights_media', m.id); load(); } catch {} } };
  const updateMeta = async (m, field, value) => { try { await pb.collection('insights_media').update(m.id, { [field]: value }, { requestKey: `media-${m.id}-${field}` }); } catch {} };
  const url = (m) => { try { return pb.files.getURL(m, m.file); } catch { return ''; } };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{t('cms_media_library')}</h2>
      <form onSubmit={upload} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1"><Label>{t('af_cover_image')}</Label><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" required /></div>
        <div className="space-y-1"><Label>{t('name')}</Label><Input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></div>
        <div className="space-y-1"><Label>Alt Text</Label><Input value={meta.alt_text} onChange={(e) => setMeta({ ...meta, alt_text: e.target.value })} /></div>
        <div className="space-y-1"><Label>Caption</Label><Input value={meta.caption} onChange={(e) => setMeta({ ...meta, caption: e.target.value })} /></div>
        <div className="sm:col-span-2"><Button type="submit" className="min-h-[44px]" disabled={!file}><Plus size={16} className="me-2" /> {lang === 'ar' ? 'رفع' : 'Upload'}</Button></div>
      </form>
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('insights_search')} className="h-10 ps-9" />
      </div>
      {loading ? <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{[0,1,2,3,4,5].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />)}</div> : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <div key={m.id} className="rounded-lg border bg-card p-3 space-y-2">
              {m.type === 'image' ? <img src={url(m)} alt={m.alt_text || ''} className="h-24 w-full rounded object-cover" loading="lazy" /> : <div className="flex h-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">{m.type}</div>}
              <p className="text-xs font-medium line-clamp-1">{m.name}</p>
              <Input value={m.alt_text || ''} onChange={(e) => updateMeta(m, 'alt_text', e.target.value)} placeholder="alt" className="h-8 text-xs" />
              <button onClick={() => del(m)} className="flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============ ADS & BANNERS ============ */
const AdsBanners = ({ t, lang }) => {
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [adForm, setAdForm] = useState(null);
  const [image, setImage] = useState(null);
  const [mobileImage, setMobileImage] = useState(null);
  const [showSlots, setShowSlots] = useState(false);

  const blank = { name: '', ad_type: 'manual', alt_text: '', link_url: '', open_new_tab: true, start_date: '', end_date: '', status: 'active', priority: 0, target_language: 'all', target_country: '', placement: 'header_banner', custom_slot: '', adsense_slot: '', responsive: true, lazy_load: true };

  const load = () => {
    pb.collection('insights_banners').getList(1, 100, { sort: '-created' }).then((r) => setItems(r.items || [])).catch(() => setItems([]));
    pb.collection('insights_ad_settings').getFullList({ sort: 'created' }).then((r) => setSettings(r[0] || null)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(adForm).forEach(([k, v]) => fd.append(k, String(v ?? '')));
    if (image) fd.append('image', image);
    if (mobileImage) fd.append('mobile_image', mobileImage);
    try {
      if (adForm.id) { await pb.collection('insights_banners').update(adForm.id, fd, { requestKey: `bn-${adForm.id}` }); logAudit('banner_update', 'insights_banners', adForm.id); }
      else { const r = await pb.collection('insights_banners').create(fd, { requestKey: `bn-new-${Date.now()}` }); logAudit('banner_create', 'insights_banners', r.id); }
      setAdForm(null); setImage(null); setMobileImage(null); load();
    } catch (err) { alert(String(err?.message || err)); }
  };
  const del = async (b) => { if (window.confirm(t('editor_delete') + '?')) { try { await pb.collection('insights_banners').delete(b.id, { requestKey: `bn-del-${b.id}` }); logAudit('banner_delete', 'insights_banners', b.id); load(); } catch {} } };
  const toggleStatus = async (b) => { try { await pb.collection('insights_banners').update(b.id, { status: b.status === 'active' ? 'paused' : 'active' }, { requestKey: `bn-${b.id}` }); load(); } catch {} };
  const saveAdSettings = async () => {
    try {
      if (settings?.id) await pb.collection('insights_ad_settings').update(settings.id, { enabled: settings.enabled, publisher_id: settings.publisher_id }, { requestKey: `ads-${settings.id}` });
      else await pb.collection('insights_ad_settings').create({ enabled: settings?.enabled, publisher_id: settings?.publisher_id, above_article: true, below_article: true, sidebar: true }, { requestKey: `ads-new-${Date.now()}` });
      logAudit('ad_settings_save', 'insights_ad_settings', settings?.id || '');
      alert(t('cms_saved'));
    } catch (err) { alert(String(err?.message || err)); }
  };

  const placementLabel = (p) => p.replace(/_/g, ' ');
  const ctr = (b) => b.impressions > 0 ? ((b.clicks / b.impressions) * 100).toFixed(1) + '%' : '—';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t('editor_ads')} & {lang === 'ar' ? 'البنرات' : 'Banners'}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSlots((v) => !v)} className="min-h-[44px]">{t('cms_custom_slots')}</Button>
          <Button onClick={() => { setAdForm(blank); }} className="min-h-[44px]"><Plus size={16} className="me-2" /> {t('cms_add_banner')}</Button>
        </div>
      </div>

      {/* AdSense settings */}
      <div className="rounded-xl border bg-card p-5 space-y-3 max-w-2xl">
        <h3 className="font-bold">{t('cms_adsense')}</h3>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!settings?.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: !!v })} /> {lang === 'ar' ? 'تفعيل الإعلانات' : 'Enable Ads'}</label>
        <div className="space-y-1"><Label>{t('cms_publisher_id')}</Label><Input value={settings?.publisher_id || ''} onChange={(e) => setSettings({ ...settings, publisher_id: e.target.value })} dir="ltr" placeholder="ca-pub-XXXXXXXXXXXXXXXX" /></div>
        <Button onClick={saveAdSettings} className="min-h-[44px]">{t('editor_save')}</Button>
      </div>

      {showSlots && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <h3 className="font-bold">{t('cms_custom_slots')}</h3>
          <p className="text-sm text-muted-foreground">{t('cms_slot_name_hint')}</p>
          <p className="text-xs text-muted-foreground">{lang === 'ar' ? 'أنشئ بانر بـ placement = custom_slot واكتب اسم الموضع. استخدم fetchBannersForSlot("name") في أي مكان بالتصميم.' : 'Create a banner with placement = custom_slot and enter the slot name. Use fetchBannersForSlot("name") anywhere in the design.'}</p>
          <div className="flex flex-wrap gap-2">
            {[...new Set(items.filter((b) => b.placement === 'custom_slot' && b.custom_slot).map((b) => b.custom_slot))].map((s) => (
              <span key={s} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-mono text-primary">{s}</span>
            ))}
            {items.filter((b) => b.placement === 'custom_slot').length === 0 && <p className="text-xs text-muted-foreground">{t('cms_no_data')}</p>}
          </div>
        </div>
      )}

      {adForm && (
        <form onSubmit={save} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 max-w-3xl">
          <div className="space-y-1"><Label>{lang === 'ar' ? 'اسم داخلي' : 'Internal Name'}</Label><Input value={adForm.name} onChange={(e) => setAdForm({ ...adForm, name: e.target.value })} required /></div>
          <div className="space-y-1"><Label>{t('cms_ad_type')}</Label>
            <Select value={adForm.ad_type} onValueChange={(v) => setAdForm({ ...adForm, ad_type: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="manual">{t('cms_manual_ad')}</SelectItem><SelectItem value="adsense">{t('cms_adsense')}</SelectItem></SelectContent>
            </Select>
          </div>
          {adForm.ad_type === 'manual' && (
            <>
              <div className="space-y-1"><Label>{t('af_cover_image')}</Label><input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] || null)} className="text-sm" /></div>
              <div className="space-y-1"><Label>{t('cms_mobile_image')}</Label><input type="file" accept="image/*" onChange={(e) => setMobileImage(e.target.files?.[0] || null)} className="text-sm" /></div>
              <div className="space-y-1"><Label>Alt Text</Label><Input value={adForm.alt_text} onChange={(e) => setAdForm({ ...adForm, alt_text: e.target.value })} /></div>
              <div className="space-y-1"><Label>Link URL</Label><Input value={adForm.link_url} onChange={(e) => setAdForm({ ...adForm, link_url: e.target.value })} dir="ltr" /></div>
            </>
          )}
          {adForm.ad_type === 'adsense' && (
            <div className="space-y-1"><Label>{t('cms_ad_unit_id')}</Label><Input value={adForm.adsense_slot} onChange={(e) => setAdForm({ ...adForm, adsense_slot: e.target.value })} dir="ltr" placeholder="1234567890" /></div>
          )}
          <div className="space-y-1"><Label>{t('cms_placement')}</Label>
            <Select value={adForm.placement} onValueChange={(v) => setAdForm({ ...adForm, placement: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>{PLACEMENTS.map((p) => <SelectItem key={p} value={p}>{placementLabel(p)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {adForm.placement === 'custom_slot' && (
            <div className="space-y-1"><Label>{t('cms_custom_slot')}</Label><Input value={adForm.custom_slot} onChange={(e) => setAdForm({ ...adForm, custom_slot: e.target.value })} dir="ltr" placeholder={t('cms_slot_name_hint')} /></div>
          )}
          <div className="space-y-1"><Label>{t('cms_start_date')}</Label><Input type="date" value={adForm.start_date?.slice(0,10) || ''} onChange={(e) => setAdForm({ ...adForm, start_date: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t('cms_end_date')}</Label><Input type="date" value={adForm.end_date?.slice(0,10) || ''} onChange={(e) => setAdForm({ ...adForm, end_date: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t('cms_target_language')}</Label>
            <Select value={adForm.target_language} onValueChange={(v) => setAdForm({ ...adForm, target_language: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t('cms_all_languages')}</SelectItem><SelectItem value="ar">العربية</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>{t('cms_target_country')}</Label><Input value={adForm.target_country} onChange={(e) => setAdForm({ ...adForm, target_country: e.target.value })} dir="ltr" placeholder={t('cms_all_countries')} /></div>
          <div className="space-y-1"><Label>{t('cms_priority')}</Label><Input type="number" value={adForm.priority} onChange={(e) => setAdForm({ ...adForm, priority: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>{t('cms_status')}</Label>
            <Select value={adForm.status} onValueChange={(v) => setAdForm({ ...adForm, status: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>{['active','paused','expired','draft'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!adForm.open_new_tab} onCheckedChange={(v) => setAdForm({ ...adForm, open_new_tab: !!v })} /> {t('cms_open_new_tab')}</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!adForm.responsive} onCheckedChange={(v) => setAdForm({ ...adForm, responsive: !!v })} /> {t('cms_responsive')}</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!adForm.lazy_load} onCheckedChange={(v) => setAdForm({ ...adForm, lazy_load: !!v })} /> {t('cms_lazy_loading')}</label>
          </div>
          <div className="sm:col-span-2 flex gap-2"><Button type="submit" className="min-h-[44px]">{t('editor_save')}</Button><Button type="button" variant="outline" onClick={() => setAdForm(null)}>{t('cancel')}</Button></div>
        </form>
      )}

      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{t('cms_no_data')}</p> : items.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{b.name} <span className="text-xs text-muted-foreground">({b.ad_type})</span></p>
              <p className="text-xs text-muted-foreground">{placementLabel(b.placement)}{b.custom_slot ? ` / ${b.custom_slot}` : ''} • {b.status} • {lang === 'ar' ? 'أولوية' : 'priority'} {b.priority || 0}</p>
              <p className="text-xs text-muted-foreground">{t('cms_impressions')}: {b.impressions || 0} • {t('cms_clicks')}: {b.clicks || 0} • {t('cms_ctr')}: {ctr(b)}</p>
            </div>
            <button onClick={() => toggleStatus(b)} title={b.status === 'active' ? t('cms_section_off') : t('cms_section_on')} className={cn('flex h-8 w-8 items-center justify-center rounded-md', b.status === 'active' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-muted-foreground hover:bg-accent')}><Power size={16} /></button>
            <button onClick={() => { setAdForm({ ...blank, ...b }); }} title={t('editor_edit_article')} className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Pencil size={16} /></button>
            <button onClick={() => del(b)} title={t('editor_delete')} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ ANALYTICS ============ */
const AnalyticsAdmin = ({ t, lang }) => {
  const [range, setRange] = useState('30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const df = dateRangeFilter(range, customStart, customEnd);
      try {
        const viewsFilter = df || '1=1';
        const [views, topArticles, topNews, articles] = await Promise.all([
          pb.collection('insights_article_views').getList(1, 500, { filter: viewsFilter, sort: '-created', expand: 'article' }),
          pb.collection('insights_articles').getList(1, 10, { filter: "status='published' && content_type='article'", sort: '-views' }),
          pb.collection('insights_articles').getList(1, 10, { filter: "status='published' && content_type='news'", sort: '-views' }),
          pb.collection('insights_articles').getList(1, 200, { filter: "status='published'", fields: 'id,title_ar,title_en,slug,views,read_time,category,author,created' }),
        ]);
        const viewItems = views.items || [];
        const uniqueReaders = new Set(viewItems.map((v) => v.reader_id).filter(Boolean)).size;
        const sources = { search: 0, social: 0, direct: 0 };
        const countries = {};
        const devices = { desktop: 0, mobile: 0, tablet: 0 };
        viewItems.forEach((v) => {
          const src = String(v.source || 'direct').toLowerCase();
          if (src.includes('google') || src.includes('bing') || src.includes('yahoo') || src.includes('search')) sources.search++;
          else if (src.includes('facebook') || src.includes('twitter') || src.includes('instagram') || src.includes('linkedin') || src.includes('whatsapp') || src.includes('youtube') || src.includes('tiktok')) sources.social++;
          else sources.direct++;
          if (v.country) countries[v.country] = (countries[v.country] || 0) + 1;
          const d = v.device || detectDevice();
          if (devices[d] !== undefined) devices[d]++;
        });
        // top authors + categories from articles
        const authorViews = {};
        const catViews = {};
        (articles.items || []).forEach((a) => {
          const v = a.views || 0;
          if (a.author) authorViews[a.author] = (authorViews[a.author] || 0) + v;
          if (a.category) catViews[a.category] = (catViews[a.category] || 0) + v;
        });
        const totalViews = (articles.items || []).reduce((s, a) => s + (a.views || 0), 0);
        const avgRead = (articles.items || []).reduce((s, a) => s + (a.read_time || 0), 0) / Math.max(1, articles.items.length);
        setData({
          pageViews: viewItems.length,
          uniqueVisitors: uniqueReaders,
          totalViews,
          topArticles: topArticles.items || [],
          topNews: topNews.items || [],
          avgReadTime: Math.round(avgRead * 10) / 10,
          sources, countries, devices,
          authorViews, catViews,
        });
      } catch { setData(null); }
      finally { setLoading(false); }
    })();
  }, [range, customStart, customEnd]);

  const ranges = ['today','7days','30days','this_month','this_year','all_time','custom'];
  const gaConnected = false; // not connected — no fake numbers
  const scConnected = false;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t('cms_analytics')}</h2>
        <div className="flex flex-wrap gap-2">
          {ranges.map((r) => (
            <button key={r} onClick={() => setRange(r)} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', range === r ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent')}>{t(`cms_${r}`)}</button>
          ))}
        </div>
      </div>
      {range === 'custom' && (
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1"><Label>{lang === 'ar' ? 'من' : 'From'}</Label><Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></div>
          <div className="space-y-1"><Label>{lang === 'ar' ? 'إلى' : 'To'}</Label><Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></div>
        </div>
      )}

      {/* GA / Search Console status */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
          <div><p className="font-semibold text-sm">Google Analytics</p><p className="text-xs text-muted-foreground">{gaConnected ? t('cms_ga_connected') : t('cms_not_connected')}</p></div>
          <Button size="sm" variant="outline" disabled>{t('cms_connect_ga')}</Button>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
          <div><p className="font-semibold text-sm">Search Console</p><p className="text-xs text-muted-foreground">{scConnected ? t('cms_sc_connected') : t('cms_not_connected')}</p></div>
          <Button size="sm" variant="outline" disabled>{t('cms_connect_sc')}</Button>
        </div>
      </div>

      {loading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('cms_page_views')} value={data.pageViews} color="text-primary" />
            <StatCard label={t('cms_unique_visitors')} value={data.uniqueVisitors} color="text-indigo-600" />
            <StatCard label={t('cms_total_views')} value={data.totalViews} color="text-purple-600" />
            <StatCard label={t('cms_avg_read_time')} value={`${data.avgReadTime}m`} color="text-blue-600" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <p className="font-semibold mb-3 text-sm">{t('cms_traffic_sources')}</p>
              <div className="space-y-2">
                <BarRow label={t('cms_search_traffic')} value={data.sources.search} max={Math.max(1, ...Object.values(data.sources))} color="bg-blue-500" />
                <BarRow label={t('cms_social_traffic')} value={data.sources.social} max={Math.max(1, ...Object.values(data.sources))} color="bg-purple-500" />
                <BarRow label={t('cms_direct_traffic')} value={data.sources.direct} max={Math.max(1, ...Object.values(data.sources))} color="bg-emerald-500" />
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="font-semibold mb-3 text-sm">{t('cms_device_type')}</p>
              <div className="space-y-2">
                <BarRow label={t('cms_desktop')} value={data.devices.desktop} max={Math.max(1, ...Object.values(data.devices))} color="bg-slate-500" />
                <BarRow label={t('cms_mobile')} value={data.devices.mobile} max={Math.max(1, ...Object.values(data.devices))} color="bg-teal-500" />
                <BarRow label={t('cms_tablet')} value={data.devices.tablet} max={Math.max(1, ...Object.values(data.devices))} color="bg-amber-500" />
              </div>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TopList title={t('cms_top_articles')} items={data.topArticles} lang={lang} t={t} />
            <TopList title={t('cms_top_news')} items={data.topNews} lang={lang} t={t} />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="font-semibold mb-3 text-sm">{t('cms_countries')}</p>
            {Object.keys(data.countries).length === 0 ? <p className="text-xs text-muted-foreground">{t('cms_no_data')}</p> : (
              <div className="space-y-2">
                {Object.entries(data.countries).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                  <BarRow key={c} label={c} value={n} max={Math.max(1, ...Object.values(data.countries))} color="bg-primary" />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const StatCard = ({ label, value, color }) => (
  <div className="rounded-xl border bg-card p-5 shadow-sm">
    <p className={cn('text-3xl font-extrabold', color)}>{value}</p>
    <p className="mt-1 text-sm text-muted-foreground">{label}</p>
  </div>
);
const BarRow = ({ label, value, max, color }) => (
  <div className="flex items-center gap-3 text-sm">
    <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
    <div className="flex-1 h-6 rounded bg-muted overflow-hidden">
      <div className={cn('h-full rounded', color)} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
    </div>
    <span className="w-10 text-end font-medium">{value}</span>
  </div>
);
const TopList = ({ title, items, lang, t }) => (
  <div className="rounded-xl border bg-card p-4">
    <p className="font-semibold mb-3 text-sm">{title}</p>
    {items.length === 0 ? <p className="text-xs text-muted-foreground">{t('cms_no_data')}</p> : (
      <div className="space-y-2">
        {items.map((a, i) => (
          <div key={a.id} className="flex items-center gap-3 text-sm">
            <span className="w-6 text-muted-foreground">{i + 1}</span>
            <a href={`/insights/article/${a.slug}`} target="_blank" rel="noreferrer" className="flex-1 line-clamp-1 hover:text-primary">{articleTitle(a, lang)}</a>
            <span className="text-muted-foreground">{a.views || 0}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

/* ============ MENU (HEADER / FOOTER) ============ */
const MenuAdmin = ({ t, lang, location }) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ label_ar: '', label_en: '', url: '', order: 0, visible: true, open_new_tab: false });
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const load = () => pb.collection('insights_menu_items').getFullList({ filter: `location='${location}'`, sort: 'order' }).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, [location]);
  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, location };
    try { if (editingId) { await pb.collection('insights_menu_items').update(editingId, payload, { requestKey: `mn-${editingId}` }); logAudit(`menu_${location}_update`, 'insights_menu_items', editingId); } else { const r = await pb.collection('insights_menu_items').create(payload, { requestKey: `mn-new-${Date.now()}` }); logAudit(`menu_${location}_create`, 'insights_menu_items', r.id); } setForm({ label_ar: '', label_en: '', url: '', order: 0, visible: true, open_new_tab: false }); setShow(false); setEditingId(null); load(); } catch (err) { alert(String(err?.message || err)); }
  };
  const del = async (m) => { if (window.confirm(t('editor_delete') + '?')) { try { await pb.collection('insights_menu_items').delete(m.id, { requestKey: `mn-del-${m.id}` }); logAudit(`menu_${location}_delete`, 'insights_menu_items', m.id); load(); } catch {} } };
  const toggleVisible = async (m) => { try { await pb.collection('insights_menu_items').update(m.id, { visible: !m.visible }, { requestKey: `mn-${m.id}` }); load(); } catch {} };
  const move = async (m, dir) => { try { await pb.collection('insights_menu_items').update(m.id, { order: (m.order || 0) + dir }, { requestKey: `mn-ord-${m.id}` }); load(); } catch {} };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{location === 'header' ? t('cms_header') : t('cms_footer')}</h2>
        <Button onClick={() => { setShow((v) => !v); setEditingId(null); }} className="min-h-[44px]"><Plus size={16} className="me-2" /> {t('cms_add_menu_item')}</Button>
      </div>
      {show && (
        <form onSubmit={save} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t('af_title_ar')}</Label><Input value={form.label_ar} onChange={(e) => setForm({ ...form, label_ar: e.target.value })} dir="rtl" required /></div>
          <div className="space-y-1"><Label>{t('af_title_en')}</Label><Input value={form.label_en} onChange={(e) => setForm({ ...form, label_en: e.target.value })} dir="ltr" required /></div>
          <div className="space-y-1 sm:col-span-2"><Label>URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} dir="ltr" placeholder="/insights/articles" required /></div>
          <div className="space-y-1"><Label>{t('cms_priority')} (order)</Label><Input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} /></div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.visible} onCheckedChange={(v) => setForm({ ...form, visible: !!v })} /> {lang === 'ar' ? 'مرئي' : 'Visible'}</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.open_new_tab} onCheckedChange={(v) => setForm({ ...form, open_new_tab: !!v })} /> {t('cms_open_new_tab')}</label>
          </div>
          <div className="sm:col-span-2"><Button type="submit" className="min-h-[44px]">{t('editor_save')}</Button></div>
        </form>
      )}
      <div className="space-y-2">
        {items.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex flex-col gap-1">
              <button onClick={() => move(m, -1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"><ArrowUp size={14} /></button>
              <button onClick={() => move(m, 1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"><ArrowDown size={14} /></button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{lang === 'ar' ? (m.label_ar || m.label_en) : (m.label_en || m.label_ar)}</p>
              <p className="text-xs text-muted-foreground">{m.url} • {m.visible ? (lang === 'ar' ? 'مرئي' : 'visible') : (lang === 'ar' ? 'مخفي' : 'hidden')}</p>
            </div>
            <button onClick={() => toggleVisible(m)} title={m.visible ? t('cms_section_off') : t('cms_section_on')} className={cn('flex h-8 w-8 items-center justify-center rounded-md', m.visible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-muted-foreground hover:bg-accent')}><Power size={16} /></button>
            <button onClick={() => { setEditingId(m.id); setForm({ label_ar: m.label_ar, label_en: m.label_en, url: m.url, order: m.order || 0, visible: m.visible, open_new_tab: !!m.open_new_tab }); setShow(true); }} className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Pencil size={15} /></button>
            <button onClick={() => del(m)} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ HOMEPAGE BUILDER ============ */
const HomepageBuilder = ({ t, lang }) => {
  const [settings, setSettings] = useState(null);
  const [sections, setSections] = useState(DEFAULT_HOMEPAGE_SECTIONS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    pb.collection('insights_settings').getFullList({ sort: 'created' }).then((r) => {
      const s = r[0] || null;
      setSettings(s);
      if (s?.homepage_sections) setSections(s.homepage_sections);
    }).catch(() => {});
  }, []);

  const toggle = (i) => setSections((p) => p.map((s, idx) => idx === i ? { ...s, enabled: !s.enabled } : s));
  const move = (i, dir) => setSections((p) => { const n = [...p]; const j = i + dir; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const setTitle = (i, field, val) => setSections((p) => p.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  const setLimit = (i, val) => setSections((p) => p.map((s, idx) => idx === i ? { ...s, limit: Number(val) } : s));

  const save = async () => {
    setSaving(true);
    try {
      if (settings?.id) await pb.collection('insights_settings').update(settings.id, { homepage_sections: sections }, { requestKey: `hp-${settings.id}` });
      else await pb.collection('insights_settings').create({ homepage_sections: sections }, { requestKey: `hp-new-${Date.now()}` });
      logAudit('homepage_builder_save', 'insights_settings', settings?.id || '');
      alert(t('cms_saved'));
    } catch (err) { alert(String(err?.message || err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t('cms_homepage_builder')}</h2>
        <Button onClick={save} disabled={saving} className="min-h-[44px]">{t('editor_save')}</Button>
      </div>
      <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'تحكم في أقسام الصفحة الرئيسية: تشغيل/إيقاف، إعادة ترتيب، عناوين، عدد العناصر.' : 'Control homepage sections: toggle, reorder, titles, item count.'}</p>
      <div className="space-y-2">
        {sections.map((s, i) => (
          <div key={s.key} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
            <div className="flex flex-col gap-1">
              <button onClick={() => move(i, -1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"><ArrowUp size={14} /></button>
              <button onClick={() => move(i, 1)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent"><ArrowDown size={14} /></button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{HOMEPAGE_SECTION_LABELS[s.key]?.[lang] || s.key}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Input value={lang === 'ar' ? (s.title_ar || '') : (s.title_en || '')} onChange={(e) => setTitle(i, lang === 'ar' ? 'title_ar' : 'title_en', e.target.value)} placeholder={t('cms_edit_title')} className="h-8 w-40 text-xs" />
                <Input type="number" value={s.limit || 0} onChange={(e) => setLimit(i, e.target.value)} placeholder={t('cms_num_items')} className="h-8 w-24 text-xs" />
              </div>
            </div>
            <button onClick={() => toggle(i)} className={cn('flex h-8 w-8 items-center justify-center rounded-md', s.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-muted-foreground hover:bg-accent')}><Power size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============ SITE SETTINGS ============ */
const SiteSettings = ({ t, lang }) => {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    pb.collection('insights_settings').getFullList({ sort: 'created' }).then((r) => setSettings(r[0] || null)).catch(() => {});
  }, []);
  const set = (k, v) => setSettings((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        site_name_ar: settings.site_name_ar, site_name_en: settings.site_name_en,
        logo_url: settings.logo_url, default_language: settings.default_language,
        contact_email: settings.contact_email, default_seo_image: settings.default_seo_image,
        comments_enabled: settings.comments_enabled, ads_enabled: settings.ads_enabled,
        spam_protection: settings.spam_protection,
        blocked_words: JSON.stringify(Array.isArray(settings.blocked_words) ? settings.blocked_words : []),
        footer_text_ar: settings.footer_text_ar, footer_text_en: settings.footer_text_en,
        copyright_text: settings.copyright_text,
        editor_login_logo: settings.editor_login_logo, editor_portal_name: settings.editor_portal_name,
        editor_login_subtitle_ar: settings.editor_login_subtitle_ar, editor_login_subtitle_en: settings.editor_login_subtitle_en,
        editor_login_bg: settings.editor_login_bg, editor_help_text_ar: settings.editor_help_text_ar, editor_help_text_en: settings.editor_help_text_en,
      };
      if (settings?.id) await pb.collection('insights_settings').update(settings.id, payload, { requestKey: `set-${settings.id}` });
      else await pb.collection('insights_settings').create(payload, { requestKey: `set-new-${Date.now()}` });
      logAudit('site_settings_save', 'insights_settings', settings?.id || '');
      alert(t('cms_saved'));
    } catch (err) { alert(String(err?.message || err)); }
    finally { setSaving(false); }
  };
  if (!settings) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{t('cms_site_settings')}</h2>
        <Button onClick={save} disabled={saving} className="min-h-[44px]">{t('editor_save')}</Button>
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-bold text-sm">{lang === 'ar' ? 'معلومات الموقع' : 'Site Info'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t('cms_site_name')} (AR)</Label><Input value={settings.site_name_ar || ''} onChange={(e) => set('site_name_ar', e.target.value)} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('cms_site_name')} (EN)</Label><Input value={settings.site_name_en || ''} onChange={(e) => set('site_name_en', e.target.value)} dir="ltr" /></div>
          <div className="space-y-1"><Label>{t('cms_logo')}</Label><Input value={settings.logo_url || ''} onChange={(e) => set('logo_url', e.target.value)} dir="ltr" /></div>
          <div className="space-y-1"><Label>{t('cms_default_language')}</Label>
            <Select value={settings.default_language || 'ar'} onValueChange={(v) => set('default_language', v)}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ar">العربية</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>{t('cms_contact_email')}</Label><Input type="email" value={settings.contact_email || ''} onChange={(e) => set('contact_email', e.target.value)} dir="ltr" /></div>
          <div className="space-y-1"><Label>{t('cms_default_seo_image')}</Label><Input value={settings.default_seo_image || ''} onChange={(e) => set('default_seo_image', e.target.value)} dir="ltr" /></div>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-bold text-sm">{lang === 'ar' ? 'الفوتر' : 'Footer'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>{lang === 'ar' ? 'نص الفوتر (عربي)' : 'Footer Text (AR)'}</Label><Textarea value={settings.footer_text_ar || ''} onChange={(e) => set('footer_text_ar', e.target.value)} rows={2} dir="rtl" /></div>
          <div className="space-y-1"><Label>{lang === 'ar' ? 'نص الفوتر (إنجليزي)' : 'Footer Text (EN)'}</Label><Textarea value={settings.footer_text_en || ''} onChange={(e) => set('footer_text_en', e.target.value)} rows={2} dir="ltr" /></div>
          <div className="space-y-1 sm:col-span-2"><Label>{lang === 'ar' ? 'حقوق النشر' : 'Copyright'}</Label><Input value={settings.copyright_text || ''} onChange={(e) => set('copyright_text', e.target.value)} /></div>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-bold text-sm">{lang === 'ar' ? 'الميزات' : 'Features'}</h3>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!settings.comments_enabled} onCheckedChange={(v) => set('comments_enabled', !!v)} /> {settings.comments_enabled ? t('cms_comments_on') : t('cms_comments_off')}</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!settings.ads_enabled} onCheckedChange={(v) => set('ads_enabled', !!v)} /> {settings.ads_enabled ? t('cms_ads_on') : t('cms_ads_off')}</label>
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-bold text-sm">{lang === 'ar' ? 'حماية التعليقات (Spam)' : 'Comment Spam Protection'}</h3>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!settings.spam_protection} onCheckedChange={(v) => set('spam_protection', !!v)} /> {settings.spam_protection ? (lang === 'ar' ? 'الحماية مفعّلة' : 'Protection enabled') : (lang === 'ar' ? 'الحماية معطّلة' : 'Protection disabled')}</label>
        <div className="space-y-1"><Label>{lang === 'ar' ? 'كلمات محظورة (واحدة في كل سطر)' : 'Blocked words (one per line)'}</Label>
          <Textarea
            value={Array.isArray(settings.blocked_words) ? settings.blocked_words.join('\n') : (typeof settings.blocked_words === 'string' ? (() => { try { return JSON.parse(settings.blocked_words).join('\n'); } catch { return settings.blocked_words; } })() : '')}
            onChange={(e) => set('blocked_words', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
            rows={4} dir="ltr"
          />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-bold text-sm">{t('cms_editor_login_settings')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t('cms_portal_name')}</Label><Input value={settings.editor_portal_name || ''} onChange={(e) => set('editor_portal_name', e.target.value)} /></div>
          <div className="space-y-1"><Label>{t('cms_logo')}</Label><Input value={settings.editor_login_logo || ''} onChange={(e) => set('editor_login_logo', e.target.value)} dir="ltr" /></div>
          <div className="space-y-1"><Label>{t('cms_subtitle')} (AR)</Label><Input value={settings.editor_login_subtitle_ar || ''} onChange={(e) => set('editor_login_subtitle_ar', e.target.value)} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('cms_subtitle')} (EN)</Label><Input value={settings.editor_login_subtitle_en || ''} onChange={(e) => set('editor_login_subtitle_en', e.target.value)} dir="ltr" /></div>
          <div className="space-y-1"><Label>{t('cms_background')}</Label><Input value={settings.editor_login_bg || ''} onChange={(e) => set('editor_login_bg', e.target.value)} dir="ltr" placeholder="gradient or url" /></div>
          <div className="space-y-1"><Label>{t('cms_help_text')} (AR)</Label><Input value={settings.editor_help_text_ar || ''} onChange={(e) => set('editor_help_text_ar', e.target.value)} dir="rtl" /></div>
          <div className="space-y-1"><Label>{t('cms_help_text')} (EN)</Label><Input value={settings.editor_help_text_en || ''} onChange={(e) => set('editor_help_text_en', e.target.value)} dir="ltr" /></div>
        </div>
      </div>
    </div>
  );
};

/* ============ AUDIT LOG ============ */
const AuditLog = ({ t, lang }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    pb.collection('insights_audit_log').getList(1, 100, { sort: '-created' }).then((r) => setItems(r.items || [])).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{t('cms_audit_log')}</h2>
      {loading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : items.length === 0 ? <p className="text-sm text-muted-foreground">{t('cms_no_data')}</p> : (
        <div className="space-y-1 rounded-xl border bg-card p-3">
          {items.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 border-b py-2 text-sm last:border-0">
              <span className="font-mono text-xs text-primary w-32 shrink-0">{a.action}</span>
              <span className="text-muted-foreground w-28 shrink-0">{a.entity || '—'}</span>
              <span className="flex-1 min-w-0 line-clamp-1">{a.actor} {a.actor_email ? `(${a.actor_email})` : ''}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatDateLong(a.created, lang)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContentManagementPanel;
