import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { notify } from '@/lib/notify';
import {
  LayoutDashboard, FileText, Plus, Tag, Users, MessageSquare, BarChart3,
  Megaphone, LogOut, Pencil, Eye, Trash2, Check, X, Search,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEditorAuth } from '@/contexts/EditorAuthContext';
import ArticleForm from '@/components/insights/ArticleForm';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ARTICLE_STATUSES, contentTypeLabel, formatDateLong, articleTitle } from '@/lib/insights';
import { cn } from '@/lib/utils';

const STATUS_BADGE = {
  draft: 'bg-slate-100 text-slate-600',
  in_review: 'bg-amber-100 text-amber-700',
  scheduled: 'bg-blue-100 text-blue-700',
  published: 'bg-emerald-100 text-emerald-700',
  unpublished: 'bg-orange-100 text-orange-700',
  archived: 'bg-zinc-200 text-zinc-600',
};

const EditorDashboard = () => {
  const { t, lang } = useLanguage();
  const { section } = useParams();
  const { editor, editorClient, logout } = useEditorAuth();
  const navigate = useNavigate();
  const active = section || 'overview';

  const nav = [
    { key: 'overview', icon: LayoutDashboard, label: t('editor_overview') },
    { key: 'articles', icon: FileText, label: t('editor_articles') },
    { key: 'categories', icon: Tag, label: t('editor_categories') },
    { key: 'authors', icon: Users, label: t('editor_authors') },
    { key: 'comments', icon: MessageSquare, label: t('editor_comments') },
    { key: 'analytics', icon: BarChart3, label: t('editor_analytics') },
    { key: 'ads', icon: Megaphone, label: t('editor_ads') },
  ];

  const go = (s) => navigate(`/editor/dashboard/${s === 'overview' ? '' : s}`, { replace: false });

  return (
    <div className="flex min-h-[100svh] bg-background">
      <Helmet>
        <title>{t('editor_dashboard')} — {t('brand')} Insights</title>
        <meta name="description" content={t('editor_login_subtitle')} />
      </Helmet>
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-e bg-card">
        <div className="flex items-center gap-2.5 p-4 border-b">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">EF</span>
          <div className="leading-tight">
            <p className="font-bold text-sm">{t('brand')}</p>
            <p className="text-[10px] text-muted-foreground">{t('editor_portal')}</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => go(n.key)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active === n.key ? 'bg-primary/10 text-primary' : 'text-foreground/70 hover:bg-accent',
              )}
            >
              <n.icon size={17} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 px-2 text-xs text-muted-foreground">{editor?.name || editor?.email}</div>
          <button onClick={() => { logout(); navigate('/editor/login'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
            <LogOut size={16} /> {t('logout')}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Mobile nav */}
        <div className="md:hidden border-b bg-card px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {nav.map((n) => (
            <button key={n.key} onClick={() => go(n.key)} className={cn('shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium', active === n.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>
              {n.label}
            </button>
          ))}
          <button onClick={() => { logout(); navigate('/editor/login'); }} className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-destructive">
            {t('logout')}
          </button>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {active === 'overview' && <OverviewSection editorClient={editorClient} t={t} lang={lang} go={go} />}
          {active === 'articles' && <ArticlesSection editorClient={editorClient} t={t} lang={lang} />}
          {active === 'categories' && <CategoriesSection editorClient={editorClient} t={t} lang={lang} />}
          {active === 'authors' && <AuthorsSection editorClient={editorClient} t={t} lang={lang} />}
          {active === 'comments' && <CommentsSection editorClient={editorClient} t={t} lang={lang} />}
          {active === 'analytics' && <AnalyticsSection editorClient={editorClient} t={t} lang={lang} />}
          {active === 'ads' && <AdsSection editorClient={editorClient} t={t} lang={lang} />}
        </div>
      </div>
    </div>
  );
};

const OverviewSection = ({ editorClient, t, lang, go }) => {
  const [stats, setStats] = useState({ total: 0, published: 0, draft: 0, in_review: 0, comments: 0 });
  useEffect(() => {
    (async () => {
      try {
        const [all, published, draft, inReview, comments] = await Promise.all([
          editorClient.collection('insights_articles').getList(1, 1, { filter: "1=1" }),
          editorClient.collection('insights_articles').getList(1, 1, { filter: "status='published'" }),
          editorClient.collection('insights_articles').getList(1, 1, { filter: "status='draft'" }),
          editorClient.collection('insights_articles').getList(1, 1, { filter: "status='in_review'" }),
          editorClient.collection('insights_comments').getList(1, 1, { filter: "status='pending'" }),
        ]);
        setStats({ total: all.totalItems, published: published.totalItems, draft: draft.totalItems, in_review: inReview.totalItems, comments: comments.totalItems });
      } catch { /* ignore */ }
    })();
  }, [editorClient]);

  const cards = [
    { label: t('editor_articles'), value: stats.total, color: 'text-primary' },
    { label: t('editor_published'), value: stats.published, color: 'text-emerald-600' },
    { label: t('editor_drafts'), value: stats.draft, color: 'text-slate-600' },
    { label: t('editor_in_review'), value: stats.in_review, color: 'text-amber-600' },
    { label: t('editor_comments'), value: stats.comments, color: 'text-blue-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('editor_overview')}</h1>
        <Button onClick={() => go('articles')} className="min-h-[44px]"><Plus size={16} className="me-2" /> {t('editor_new_article')}</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5 shadow-sm">
            <p className={cn('text-3xl font-extrabold', c.color)}>{c.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const ArticlesSection = ({ editorClient, t, lang }) => {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    const parts = [];
    if (statusFilter !== 'all') parts.push(`status='${statusFilter}'`);
    if (search) parts.push(`(title_ar ~ "${search.replace(/"/g, '')}" || title_en ~ "${search.replace(/"/g, '')}" || slug ~ "${search.replace(/"/g, '')}")`);
    editorClient.collection('insights_articles').getList(1, 50, {
      filter: parts.length ? parts.join(' && ') : "1=1",
      sort: '-created',
      expand: 'category,author',
    }).then((res) => setItems(res.items || [])).catch(() => setItems([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter, search]);

  useEffect(() => {
    if (articleId === 'new') setEditing({});
    else if (articleId) {
      editorClient.collection('insights_articles').getOne(articleId, { expand: 'category,author,related_articles' }).then(setEditing).catch(() => setEditing(null));
    } else {
      setEditing(null);
    }
  }, [articleId]);

  if (articleId) {
    const editorRec = editorClient.authStore.record;
    const perms = editorRec?.permissions || {};
    const isPrimary = !!editorRec?.is_primary || editorRec?.role === 'content_manager' || editorRec?.role === 'senior_editor';
    return (
      <div>
        <Link to="/editor/dashboard/articles" className="text-sm text-primary hover:underline mb-4 inline-block">← {t('editor_articles')}</Link>
        <h1 className="text-2xl font-bold mb-6">{articleId === 'new' ? t('editor_new_article') : t('editor_edit_article')}</h1>
        <ArticleForm
          article={editing}
          client={editorClient}
          permissions={{ publish: isPrimary || !!perms.publish }}
          onSaved={() => { navigate('/editor/dashboard/articles'); }}
        />
      </div>
    );
  }

  const quickAction = async (article, status) => {
    try {
      await editorClient.collection('insights_articles').update(article.id, { status, ...(status === 'published' && !article.published_at ? { published_at: new Date().toISOString() } : {}) }, { requestKey: `qa-${article.id}-${Date.now()}` });
      load();
    } catch { /* ignore */ }
  };

  const del = async (article) => {
    if (!window.confirm(t('editor_delete') + '?')) return;
    try { await editorClient.collection('insights_articles').delete(article.id, { requestKey: `del-${article.id}` }); load(); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('editor_articles')}</h1>
        <Button onClick={() => navigate('/editor/dashboard/articles/new')} className="min-h-[44px]"><Plus size={16} className="me-2" /> {t('editor_new_article')}</Button>
      </div>
      <div className="flex flex-wrap gap-3">
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

      {loading ? (
        <div className="space-y-2">{[0,1,2,3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">{t('insights_no_results')}</div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm line-clamp-1">{articleTitle(a, lang) || a.slug}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {contentTypeLabel(a.content_type, t)} {a.published_at ? `• ${formatDateLong(a.published_at, lang)}` : ''}
                </p>
              </div>
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_BADGE[a.status])}>{t(`editor_${a.status}`)}</span>
              <div className="flex items-center gap-1">
                {a.status !== 'published' && <button onClick={() => quickAction(a, 'published')} title={t('editor_publish')} className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"><Check size={16} /></button>}
                {a.status === 'published' && <button onClick={() => quickAction(a, 'unpublished')} title={t('editor_unpublish')} className="flex h-8 w-8 items-center justify-center rounded-md text-orange-600 hover:bg-orange-50"><X size={16} /></button>}
                <Link to={`/insights/article/${a.slug}`} target="_blank" title={t('insights_read_article')} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"><Eye size={16} /></Link>
                <button onClick={() => navigate(`/editor/dashboard/articles/${a.id}`)} title={t('editor_edit_article')} className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Pencil size={16} /></button>
                <button onClick={() => del(a)} title={t('editor_delete')} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CategoriesSection = ({ editorClient, t, lang }) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name_ar: '', name_en: '', slug: '', description_ar: '', description_en: '' });
  const [editingId, setEditingId] = useState(null);

  const load = () => editorClient.collection('insights_categories').getFullList({ sort: 'name_en' }).then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, slug: form.slug || form.name_en.toLowerCase().replace(/\s+/g, '-') };
    try {
      if (editingId) await editorClient.collection('insights_categories').update(editingId, payload, { requestKey: `cat-${editingId}` });
      else await editorClient.collection('insights_categories').create(payload, { requestKey: `cat-new-${Date.now()}` });
      setForm({ name_ar: '', name_en: '', slug: '', description_ar: '', description_en: '' });
      setEditingId(null);
      load();
    } catch (err) { notify.error(lang === "ar" ? "حدث خطأ" : "Error", String(err?.message || err)); }
  };

  const edit = (c) => { setEditingId(c.id); setForm({ name_ar: c.name_ar, name_en: c.name_en, slug: c.slug, description_ar: c.description_ar || '', description_en: c.description_en || '' }); };
  const del = async (c) => { if (window.confirm(t('editor_delete') + '?')) { try { await editorClient.collection('insights_categories').delete(c.id, { requestKey: `cat-del-${c.id}` }); load(); } catch {} } };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('editor_categories')}</h1>
      <form onSubmit={save} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1"><Label>{t('af_title_ar')}</Label><Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} dir="rtl" required /></div>
        <div className="space-y-1"><Label>{t('af_title_en')}</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/\s+/g, '-') })} dir="ltr" required /></div>
        <div className="space-y-1"><Label>{t('af_slug')}</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} dir="ltr" /></div>
        <div className="space-y-1"><Label>{t('af_description_ar')}</Label><Input value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} dir="rtl" /></div>
        <div className="sm:col-span-2"><Button type="submit" className="min-h-[44px]">{editingId ? t('editor_save') : '+'} {t('editor_save')}</Button></div>
      </form>
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex-1"><p className="font-semibold text-sm">{lang === 'ar' ? c.name_ar : c.name_en}</p><p className="text-xs text-muted-foreground">{c.slug}</p></div>
            <button onClick={() => edit(c)} className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10"><Pencil size={15} /></button>
            <button onClick={() => del(c)} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

const AuthorsSection = ({ editorClient, t, lang }) => {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', bio_ar: '', bio_en: '' });
  const [photo, setPhoto] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const load = () => editorClient.collection('insights_authors').getFullList({ sort: 'name' }).then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('bio_ar', form.bio_ar);
    fd.append('bio_en', form.bio_en);
    if (photo) fd.append('photo', photo);
    try {
      if (editingId) await editorClient.collection('insights_authors').update(editingId, fd, { requestKey: `auth-${editingId}` });
      else await editorClient.collection('insights_authors').create(fd, { requestKey: `auth-new-${Date.now()}` });
      setForm({ name: '', bio_ar: '', bio_en: '' }); setPhoto(null); setEditingId(null); load();
    } catch (err) { notify.error(lang === "ar" ? "حدث خطأ" : "Error", String(err?.message || err)); }
  };

  const del = async (a) => { if (window.confirm(t('editor_delete') + '?')) { try { await editorClient.collection('insights_authors').delete(a.id, { requestKey: `auth-del-${a.id}` }); load(); } catch {} } };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('editor_authors')}</h1>
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

const CommentsSection = ({ editorClient, t, lang }) => {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('pending');
  const load = () => editorClient.collection('insights_comments').getList(1, 50, { filter: `status='${filter}'`, sort: '-created', expand: 'article' }).then((r) => setItems(r.items || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, [filter]);

  const setStatus = async (c, status) => { try { await editorClient.collection('insights_comments').update(c.id, { status }, { requestKey: `com-${c.id}-${status}` }); load(); } catch {} };
  const del = async (c) => { if (window.confirm(t('editor_delete') + '?')) { try { await editorClient.collection('insights_comments').delete(c.id, { requestKey: `com-del-${c.id}` }); load(); } catch {} } };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('editor_comments')}</h1>
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-44 h-10"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">{lang === 'ar' ? 'بانتظار الموافقة' : 'Pending'}</SelectItem>
          <SelectItem value="approved">{t('status_approved')}</SelectItem>
          <SelectItem value="rejected">{t('status_rejected')}</SelectItem>
          <SelectItem value="spam">Spam</SelectItem>
        </SelectContent>
      </Select>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : items.map((c) => (
          <div key={c.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-sm">{c.name} <span className="text-xs text-muted-foreground">({c.email})</span></p>
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

const AnalyticsSection = ({ editorClient, t, lang }) => {
  const [top, setTop] = useState([]);
  const [totalViews, setTotalViews] = useState(0);
  useEffect(() => {
    editorClient.collection('insights_articles').getList(1, 10, { filter: "status='published'", sort: '-views', fields: 'id,title_ar,title_en,slug,views,created' }).then((r) => { setTop(r.items || []); setTotalViews((r.items || []).reduce((s, a) => s + (a.views || 0), 0)); }).catch(() => {});
  }, []);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('editor_analytics')}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5"><p className="text-3xl font-extrabold text-primary">{totalViews}</p><p className="text-sm text-muted-foreground mt-1">{lang === 'ar' ? 'إجمالي المشاهدات' : 'Total Views'}</p></div>
        <div className="rounded-xl border bg-card p-5"><p className="text-3xl font-extrabold text-emerald-600">{top.length}</p><p className="text-sm text-muted-foreground mt-1">{lang === 'ar' ? 'مقالات منشورة' : 'Published'}</p></div>
        <div className="rounded-xl border bg-card p-5"><p className="text-3xl font-extrabold text-blue-600">{top[0]?.views || 0}</p><p className="text-sm text-muted-foreground mt-1">{lang === 'ar' ? 'أعلى مقال' : 'Top article'}</p></div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="font-semibold mb-3">{lang === 'ar' ? 'الأكثر قراءة' : 'Top Articles'}</p>
        <div className="space-y-2">
          {top.map((a, i) => (
            <div key={a.id} className="flex items-center gap-3 text-sm">
              <span className="w-6 text-muted-foreground">{i + 1}</span>
              <Link to={`/insights/article/${a.slug}`} target="_blank" className="flex-1 line-clamp-1 hover:text-primary">{articleTitle(a, lang)}</Link>
              <span className="text-muted-foreground">{a.views || 0} {lang === 'ar' ? 'مشاهدة' : 'views'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const AdsSection = ({ editorClient, t, lang }) => {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);

  useEffect(() => {
    editorClient.collection('insights_ad_settings').getFullList({ sort: 'created' }).then((r) => { setSettings(r[0] || null); setForm(r[0] ? { ...r[0] } : { enabled: false, publisher_id: '', above_article: true, middle_article: false, below_article: true, between_cards: false, sidebar: true }); }).catch(() => {});
  }, []);

  const save = async () => {
    try {
      const payload = { enabled: form.enabled, publisher_id: form.publisher_id, above_article: form.above_article, middle_article: form.middle_article, below_article: form.below_article, between_cards: form.between_cards, sidebar: form.sidebar };
      if (settings?.id) await editorClient.collection('insights_ad_settings').update(settings.id, payload, { requestKey: `ads-${settings.id}` });
      else await editorClient.collection('insights_ad_settings').create(payload, { requestKey: `ads-new-${Date.now()}` });
      notify.success(lang === 'ar' ? 'تم الحفظ' : 'Saved');
    } catch (err) { notify.error(lang === "ar" ? "حدث خطأ" : "Error", String(err?.message || err)); }
  };

  if (!form) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const toggles = [
    { key: 'enabled', label: lang === 'ar' ? 'تفعيل الإعلانات' : 'Enable Ads' },
    { key: 'above_article', label: lang === 'ar' ? 'فوق المقال' : 'Above Article' },
    { key: 'middle_article', label: lang === 'ar' ? 'وسط المقال' : 'Middle Article' },
    { key: 'below_article', label: lang === 'ar' ? 'أسفل المقال' : 'Below Article' },
    { key: 'between_cards', label: lang === 'ar' ? 'بين البطاقات' : 'Between Cards' },
    { key: 'sidebar', label: lang === 'ar' ? 'الشريط الجانبي' : 'Sidebar' },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-2xl font-bold">{t('editor_ads')}</h1>
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="space-y-1"><Label>AdSense Publisher ID</Label><Input value={form.publisher_id || ''} onChange={(e) => setForm({ ...form, publisher_id: e.target.value })} dir="ltr" placeholder="ca-pub-XXXXXXXXXXXXXXXX" /></div>
        <div className="space-y-2">
          {toggles.map((tg) => (
            <label key={tg.key} className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!form[tg.key]} onCheckedChange={(v) => setForm({ ...form, [tg.key]: !!v })} />
              {tg.label}
            </label>
          ))}
        </div>
        <Button onClick={save} className="min-h-[44px]">{t('editor_save')}</Button>
      </div>
    </div>
  );
};

export default EditorDashboard;
