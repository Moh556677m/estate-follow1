import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Save, Send, Trash2, Eye, Rocket, CalendarClock, Archive, FileText, Monitor, Smartphone, X,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import RichTextEditor from '@/components/insights/RichTextEditor';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CONTENT_TYPES, ARTICLE_STATUSES, contentTypeLabel, estimateReadTime, articleTitle, articleDescription, articleContent, coverUrl } from '@/lib/insights';
import pb from '@/lib/pocketbaseClient';

const slugify = (s) =>
  String(s || '').trim().toLowerCase().replace(/[^\w\u0600-\u06FF\s-]/g, '').replace(/\s+/g, '-').slice(0, 200);

const ArticleForm = ({ article, onSaved, client, permissions, template }) => {
  const { t, lang } = useLanguage();
  const editorClient = client || pb;
  const canPublish = permissions?.publish !== false; // default true for Super Admin
  const [categories, setCategories] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [allArticles, setAllArticles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [autosaveStatus, setAutosaveStatus] = useState(''); // '' | 'saving' | 'saved'
  const [showPreview, setShowPreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');

  const [form, setForm] = useState({
    title_ar: '',
    title_en: '',
    slug: '',
    description_ar: '',
    description_en: '',
    content_ar: '',
    content_en: '',
    content_type: 'article',
    video_url: '',
    embed_video: '',
    category: '',
    tags: '',
    author: '',
    sources: '',
    related_articles: [],
    status: 'draft',
    seo_title_ar: '',
    seo_title_en: '',
    meta_description_ar: '',
    meta_description_en: '',
    canonical: '',
    indexable: true,
    published_at: '',
    scheduled_at: '',
  });
  const [coverFile, setCoverFile] = useState(null);
  const [imageFiles, setImageFiles] = useState([]);
  const [ogFile, setOgFile] = useState(null);
  const [savedId, setSavedId] = useState(article?.id || null);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    editorClient.collection('insights_categories').getFullList({ sort: 'name_en' }).then(setCategories).catch(() => {});
    editorClient.collection('insights_authors').getFullList({ sort: 'name' }).then(setAuthors).catch(() => {});
    editorClient.collection('insights_articles').getFullList({ sort: '-created', fields: 'id,title_ar,title_en,slug,status' }).then(setAllArticles).catch(() => {});
  }, [editorClient]);

  useEffect(() => {
    if (!article) {
      // New article — optionally prefill from a template.
      if (template) {
        setForm((p) => ({
          ...p,
          content_type: template.content_type || 'article',
          content_ar: template.content_ar || '',
          content_en: template.content_en || '',
        }));
      }
      return;
    }
    setForm({
      title_ar: article.title_ar || '',
      title_en: article.title_en || '',
      slug: article.slug || '',
      description_ar: article.description_ar || '',
      description_en: article.description_en || '',
      content_ar: article.content_ar || '',
      content_en: article.content_en || '',
      content_type: article.content_type || 'article',
      video_url: article.video_url || '',
      embed_video: article.embed_video || '',
      category: article.category || '',
      tags: Array.isArray(article.tags) ? article.tags.join(', ') : '',
      author: article.author || '',
      sources: Array.isArray(article.sources) ? article.sources.join('\n') : '',
      related_articles: Array.isArray(article.related_articles) ? article.related_articles : [],
      status: article.status || 'draft',
      seo_title_ar: article.seo_title_ar || '',
      seo_title_en: article.seo_title_en || '',
      meta_description_ar: article.meta_description_ar || '',
      meta_description_en: article.meta_description_en || '',
      canonical: article.canonical || '',
      indexable: article.indexable !== false,
      published_at: article.published_at ? article.published_at.slice(0, 10) : '',
      scheduled_at: article.scheduled_at ? article.scheduled_at.slice(0, 16) : '',
    });
    setSavedId(article.id || null);
  }, [article, template]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const buildPayload = (statusOverride) => {
    const fd = new FormData();
    const status = statusOverride || form.status;
    const readTime = estimateReadTime(lang === 'ar' ? form.content_ar : form.content_en);
    const fields = {
      title_ar: form.title_ar,
      title_en: form.title_en,
      slug: form.slug || slugify(form.title_en || form.title_ar),
      description_ar: form.description_ar,
      description_en: form.description_en,
      content_ar: form.content_ar,
      content_en: form.content_en,
      content_type: form.content_type,
      video_url: form.video_url,
      embed_video: form.embed_video,
      category: form.category || '',
      tags: JSON.stringify(form.tags.split(',').map((s) => s.trim()).filter(Boolean)),
      author: form.author || '',
      sources: JSON.stringify(form.sources.split('\n').map((s) => s.trim()).filter(Boolean)),
      'related_articles': form.related_articles.length ? form.related_articles.join(',') : '',
      status,
      seo_title_ar: form.seo_title_ar,
      seo_title_en: form.seo_title_en,
      meta_description_ar: form.meta_description_ar,
      meta_description_en: form.meta_description_en,
      canonical: form.canonical,
      indexable: form.indexable ? 'true' : 'false',
      read_time: String(readTime),
      published_at: status === 'published' ? (form.published_at || new Date().toISOString().slice(0, 10)) : form.published_at,
      scheduled_at: form.scheduled_at,
    };
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
      else fd.append(k, '');
    });
    if (coverFile) fd.append('cover_image', coverFile);
    if (ogFile) fd.append('og_image', ogFile);
    Array.from(imageFiles).forEach((f) => fd.append('images', f));
    return fd;
  };

  const save = async (statusOverride) => {
    setSaving(true);
    setError('');
    try {
      const fd = buildPayload(statusOverride);
      let rec;
      if (savedId) {
        rec = await editorClient.collection('insights_articles').update(savedId, fd, { requestKey: `art-save-${savedId}` });
      } else {
        rec = await editorClient.collection('insights_articles').create(fd, { requestKey: `art-create-${Date.now()}` });
        setSavedId(rec.id);
      }
      onSaved?.(rec);
      return rec;
    } catch (err) {
      setError(String(err?.response?.message || err?.message || err));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveDraftSilent = useCallback(async () => {
    // Autosave: only if there's a saved record and a title to identify it.
    const f = formRef.current;
    if (!savedId) return;
    if (!f.title_ar && !f.title_en) return;
    setAutosaveStatus('saving');
    try {
      const fd = new FormData();
      const readTime = estimateReadTime(lang === 'ar' ? f.content_ar : f.content_en);
      const fields = {
        title_ar: f.title_ar, title_en: f.title_en,
        slug: f.slug || slugify(f.title_en || f.title_ar),
        description_ar: f.description_ar, description_en: f.description_en,
        content_ar: f.content_ar, content_en: f.content_en,
        content_type: f.content_type, video_url: f.video_url, embed_video: f.embed_video,
        category: f.category || '',
        tags: JSON.stringify(f.tags.split(',').map((s) => s.trim()).filter(Boolean)),
        author: f.author || '',
        sources: JSON.stringify(f.sources.split('\n').map((s) => s.trim()).filter(Boolean)),
        'related_articles': f.related_articles.length ? f.related_articles.join(',') : '',
        status: f.status === 'published' ? 'published' : 'draft',
        seo_title_ar: f.seo_title_ar, seo_title_en: f.seo_title_en,
        meta_description_ar: f.meta_description_ar, meta_description_en: f.meta_description_en,
        canonical: f.canonical, indexable: f.indexable ? 'true' : 'false',
        read_time: String(readTime),
        published_at: f.published_at, scheduled_at: f.scheduled_at,
      };
      Object.entries(fields).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) fd.append(k, v); else fd.append(k, ''); });
      await editorClient.collection('insights_articles').update(savedId, fd, { requestKey: `art-auto-${savedId}-${Date.now()}` });
      setAutosaveStatus('saved');
      setTimeout(() => setAutosaveStatus(''), 2500);
    } catch {
      setAutosaveStatus('');
    }
  }, [savedId, editorClient, lang]);

  // Autosave: debounce 30s after last edit (only for existing drafts).
  const autosaveTimer = useRef(null);
  useEffect(() => {
    if (!savedId) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { saveDraftSilent(); }, 30000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [form, savedId, saveDraftSilent]);

  const remove = async () => {
    if (!savedId) return;
    if (!window.confirm(t('editor_delete') + '?')) return;
    try {
      await editorClient.collection('insights_articles').delete(savedId, { requestKey: `art-del-${savedId}` });
      onSaved?.(null, true);
    } catch (err) {
      setError(String(err?.message || err));
    }
  };

  const toggleRelated = (id) => {
    setForm((p) => {
      const has = p.related_articles.includes(id);
      const next = has ? p.related_articles.filter((x) => x !== id) : [...p.related_articles, id].slice(0, 5);
      return { ...p, related_articles: next };
    });
  };

  const doSchedule = async () => {
    if (!scheduleAt) { setError(lang === 'ar' ? 'اختر التاريخ والوقت' : 'Pick date and time'); return; }
    setForm((p) => ({ ...p, scheduled_at: scheduleAt, status: 'scheduled' }));
    const rec = await save('scheduled');
    if (rec) setShowSchedule(false);
  };

  const fieldCls = 'min-h-[44px]';

  // Preview content (uses current form state, not saved record).
  const previewArticle = { ...form, ...(article || {}) };
  const previewContent = articleContent(previewArticle, lang) || articleContent(previewArticle, lang === 'ar' ? 'en' : 'ar');

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('af_title_ar')}</Label>
              <Input value={form.title_ar} onChange={(e) => set('title_ar', e.target.value)} className={fieldCls} dir="rtl" />
            </div>
            <div className="space-y-2">
              <Label>{t('af_title_en')}</Label>
              <Input value={form.title_en} onChange={(e) => { set('title_en', e.target.value); if (!form.slug) set('slug', slugify(e.target.value)); }} className={fieldCls} dir="ltr" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('af_slug')}</Label>
            <Input value={form.slug} onChange={(e) => set('slug', slugify(e.target.value))} className={fieldCls} dir="ltr" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('af_description_ar')}</Label>
              <Textarea value={form.description_ar} onChange={(e) => set('description_ar', e.target.value)} rows={3} dir="rtl" />
            </div>
            <div className="space-y-2">
              <Label>{t('af_description_en')}</Label>
              <Textarea value={form.description_en} onChange={(e) => set('description_en', e.target.value)} rows={3} dir="ltr" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('af_content_ar')}</Label>
            <RichTextEditor value={form.content_ar} onChange={(v) => set('content_ar', v)} placeholder="اكتب المحتوى بالعربية..." />
          </div>
          <div className="space-y-2">
            <Label>{t('af_content_en')}</Label>
            <RichTextEditor value={form.content_en} onChange={(v) => set('content_en', v)} placeholder="Write content in English..." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('af_video_url')}</Label>
              <Input value={form.video_url} onChange={(e) => set('video_url', e.target.value)} className={fieldCls} dir="ltr" placeholder="https://youtube.com/..." />
            </div>
            <div className="space-y-2">
              <Label>{t('af_embed_video')}</Label>
              <Input value={form.embed_video} onChange={(e) => set('embed_video', e.target.value)} className={fieldCls} dir="ltr" placeholder="<iframe ...>" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('af_sources')}</Label>
            <Textarea value={form.sources} onChange={(e) => set('sources', e.target.value)} rows={4} dir="ltr" />
          </div>
        </div>

        {/* Sidebar column */}
        <div className="space-y-5">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="space-y-2">
              <Label>{t('af_status')}</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger className={fieldCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ARTICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`editor_${s}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('af_content_type')}</Label>
              <Select value={form.content_type} onValueChange={(v) => set('content_type', v)}>
                <SelectTrigger className={fieldCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((ct) => <SelectItem key={ct} value={ct}>{contentTypeLabel(ct, t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('af_category')}</Label>
              <Select value={form.category || 'none'} onValueChange={(v) => set('category', v === 'none' ? '' : v)}>
                <SelectTrigger className={fieldCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('insights_all')}</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('af_author')}</Label>
              <Select value={form.author || 'none'} onValueChange={(v) => set('author', v === 'none' ? '' : v)}>
                <SelectTrigger className={fieldCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('insights_all')}</SelectItem>
                  {authors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('af_tags')}</Label>
              <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} className={fieldCls} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{t('af_published_at')}</Label>
              <Input type="date" value={form.published_at} onChange={(e) => set('published_at', e.target.value)} className={fieldCls} dir="ltr" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.indexable} onCheckedChange={(v) => set('indexable', !!v)} />
              {t('af_indexable')}
            </label>
          </div>

          {/* Media */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="font-semibold text-sm">{t('editor_media')}</p>
            <div className="space-y-2">
              <Label>{t('af_cover_image')}</Label>
              <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
            </div>
            <div className="space-y-2">
              <Label>{t('af_images')}</Label>
              <input type="file" accept="image/*" multiple onChange={(e) => setImageFiles(e.target.files || [])} className="block w-full text-sm" />
            </div>
            <div className="space-y-2">
              <Label>{t('af_og_image')}</Label>
              <input type="file" accept="image/*" onChange={(e) => setOgFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
            </div>
          </div>

          {/* SEO */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="font-semibold text-sm">SEO</p>
            <div className="space-y-2">
              <Label>{t('af_seo_title_ar')}</Label>
              <Input value={form.seo_title_ar} onChange={(e) => set('seo_title_ar', e.target.value)} className={fieldCls} dir="rtl" />
            </div>
            <div className="space-y-2">
              <Label>{t('af_seo_title_en')}</Label>
              <Input value={form.seo_title_en} onChange={(e) => set('seo_title_en', e.target.value)} className={fieldCls} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{t('af_meta_ar')}</Label>
              <Textarea value={form.meta_description_ar} onChange={(e) => set('meta_description_ar', e.target.value)} rows={2} dir="rtl" />
            </div>
            <div className="space-y-2">
              <Label>{t('af_meta_en')}</Label>
              <Textarea value={form.meta_description_en} onChange={(e) => set('meta_description_en', e.target.value)} rows={2} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{t('af_canonical')}</Label>
              <Input value={form.canonical} onChange={(e) => set('canonical', e.target.value)} className={fieldCls} dir="ltr" />
            </div>
          </div>

          {/* Related */}
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <p className="font-semibold text-sm">{t('af_related')}</p>
            <div className="max-h-60 space-y-1.5 overflow-y-auto">
              {allArticles.filter((a) => a.id !== savedId).map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.related_articles.includes(a.id)} onCheckedChange={() => toggleRelated(a.id)} />
                  <span className="line-clamp-1">{a.title_ar || a.title_en || a.slug}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Fixed action bar — Edit → Preview → Publish workflow in one place */}
      <div className="sticky bottom-0 z-30 flex flex-wrap items-center gap-2 border-t bg-background/95 backdrop-blur py-3 px-2">
        {autosaveStatus === 'saving' && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> {lang === 'ar' ? 'جارٍ الحفظ التلقائي…' : 'Autosaving…'}
          </span>
        )}
        {autosaveStatus === 'saved' && (
          <span className="text-xs text-emerald-600 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t('cms_autosave_saved') || (lang === 'ar' ? 'تم الحفظ تلقائيًا' : 'Saved automatically')}
          </span>
        )}
        <Button onClick={() => save()} disabled={saving} variant="outline" className="min-h-[44px]"><Save size={16} className="me-2" /> {t('editor_save')}</Button>
        <Button onClick={() => setShowPreview(true)} variant="outline" className="min-h-[44px]"><Eye size={16} className="me-2" /> {t('cms_preview') || (lang === 'ar' ? 'معاينة' : 'Preview')}</Button>
        {canPublish ? (
          <Button onClick={() => save('published')} disabled={saving} className="min-h-[44px] bg-primary"><Rocket size={16} className="me-2" /> {t('cms_publish_now') || (lang === 'ar' ? 'نشر الآن' : 'Publish Now')}</Button>
        ) : (
          <Button onClick={() => save('in_review')} disabled={saving} variant="outline" className="min-h-[44px]"><Send size={16} className="me-2" /> {t('editor_submit_review')}</Button>
        )}
        <Button onClick={() => { setScheduleAt(form.scheduled_at || ''); setShowSchedule(true); }} variant="outline" className="min-h-[44px]"><CalendarClock size={16} className="me-2" /> {t('editor_schedule')}</Button>
        {form.status === 'published' && (
          <Button onClick={() => save('unpublished')} disabled={saving} variant="outline" className="min-h-[44px]">{t('editor_unpublish')}</Button>
        )}
        <Button onClick={() => save('archived')} disabled={saving} variant="outline" className="min-h-[44px]"><Archive size={16} className="me-2" /> {t('editor_archive')}</Button>
        {savedId && <Button onClick={remove} disabled={saving} variant="destructive" className="min-h-[44px] ms-auto"><Trash2 size={16} className="me-2" /> {t('editor_delete')}</Button>}
      </div>

      {/* Schedule dialog */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSchedule(false)}>
          <div className="w-full max-w-sm rounded-2xl border bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{t('editor_schedule')}</h3>
              <button onClick={() => setShowSchedule(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'اختر تاريخ ووقت النشر التلقائي.' : 'Pick the automatic publish date and time.'}</p>
            <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} dir="ltr" />
            <p className="text-xs text-muted-foreground">{lang === 'ar' ? 'المنطقة الزمنية: توقيت المتصفح المحلي.' : 'Timezone: your local browser time.'}</p>
            <Button onClick={doSchedule} disabled={saving} className="min-h-[44px] w-full"><CalendarClock size={16} className="me-2" /> {t('editor_schedule')}</Button>
          </div>
        </div>
      )}

      {/* Preview dialog — desktop / mobile */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80" onClick={() => setShowPreview(false)}>
          <div className="flex items-center justify-between border-b bg-card px-4 py-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <button onClick={() => setPreviewDevice('desktop')} className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm', previewDevice === 'desktop' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent')}><Monitor size={16} /> Desktop</button>
              <button onClick={() => setPreviewDevice('mobile')} className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm', previewDevice === 'mobile' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent')}><Smartphone size={16} /> Mobile</button>
            </div>
            <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto bg-muted/30 p-4" onClick={(e) => e.stopPropagation()}>
            <div className={cn('mx-auto bg-background rounded-xl shadow-lg overflow-hidden', previewDevice === 'mobile' ? 'max-w-[390px]' : 'max-w-3xl')}>
              <div className="border-b bg-muted/20 px-4 py-3 text-xs text-muted-foreground">{t('brand')} Insights — {t('cms_preview') || 'Preview'}</div>
              <article className="px-4 py-6 sm:px-6">
                <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">{articleTitle(previewArticle, lang) || (lang === 'ar' ? 'عنوان المقال' : 'Article title')}</h1>
                {articleDescription(previewArticle, lang) && <p className="mt-3 text-base text-muted-foreground">{articleDescription(previewArticle, lang)}</p>}
                {coverFile ? (
                  <img src={URL.createObjectURL(coverFile)} alt="" className="mt-5 w-full aspect-[16/9] rounded-xl object-cover" />
                ) : coverUrl(previewArticle) ? (
                  <img src={coverUrl(previewArticle)} alt="" className="mt-5 w-full aspect-[16/9] rounded-xl object-cover" />
                ) : null}
                <div
                  className="ef-article-content prose prose-sm sm:prose-base max-w-none mt-6 prose-headings:scroll-mt-20 prose-a:text-primary prose-img:rounded-xl"
                  dangerouslySetInnerHTML={{ __html: previewContent || (lang === 'ar' ? '<p>المحتوى…</p>' : '<p>Content…</p>') }}
                />
              </article>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Local cn to avoid an extra import cycle in this file.
function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default ArticleForm;
