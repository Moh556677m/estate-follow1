import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Globe,
  Image as ImageIcon,
  Layout,
  ListChecks,
  Loader2,
  MessageSquareQuote,
  Plus,
  Save,
  Trash2,
  Type,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { notify } from '@/lib/notify';
import {
  createPage,
  deletePage,
  listAllPages,
  updatePage,
} from '@/lib/sitePagesClient';

// Task #22 — Site Editor ("محرر الموقع"), Super Admin only.
//
// Scope confirmed with the user: a public-pages content editor, a lightweight
// visual/section builder (ordered, toggleable content blocks — not a full
// pixel-level drag-and-drop designer, which would be a separate multi-week
// project), and per-page SEO/meta. Deliberately separate from the Insights
// blog CMS (Task #19 — editorial articles/news, its own `editors` login) and
// from the sitewide brand colors/fonts/logo already in "هوية المنصة" inside
// Platform Settings, which this does not duplicate.
//
// The two existing hand-authored public pages (About, What-is-Estate-Follow)
// keep their JSX exactly as-is — only their social-preview SEO fields
// (og:title/description/image) are editable here, never their visible body
// content or their literal <title>/<meta name="description"> tags (those
// stay literal in each page's own source — see Seo.jsx's comment on why:
// the llms.txt build step reads them straight from the page file).

const BLOCK_TYPES = [
  { value: 'hero', label_en: 'Hero', label_ar: 'قسم رئيسي', icon: Layout },
  { value: 'text', label_en: 'Text', label_ar: 'نص', icon: Type },
  { value: 'image', label_en: 'Image', label_ar: 'صورة', icon: ImageIcon },
  { value: 'cta', label_en: 'Call to action', label_ar: 'دعوة لإجراء', icon: ListChecks },
  { value: 'faq', label_en: 'FAQ', label_ar: 'أسئلة شائعة', icon: MessageSquareQuote },
];

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newBlock(type, order) {
  const base = { id: uid('blk'), type, visible: true, order };
  if (type === 'hero') return { ...base, heading_en: '', heading_ar: '', body_en: '', body_ar: '', image_url: '' };
  if (type === 'text') return { ...base, heading_en: '', heading_ar: '', body_en: '', body_ar: '' };
  if (type === 'image') return { ...base, image_url: '', body_en: '', body_ar: '' };
  if (type === 'cta') return { ...base, heading_en: '', heading_ar: '', cta_label_en: '', cta_label_ar: '', cta_url: '' };
  if (type === 'faq') return { ...base, heading_en: '', heading_ar: '', faq_items: [] };
  return base;
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-bold text-base sm:text-lg">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function BlockEditor({ block, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast, lang }) {
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const set = (k, v) => onChange({ ...block, [k]: v });
  const typeInfo = BLOCK_TYPES.find((b) => b.value === block.type) || BLOCK_TYPES[1];
  const Icon = typeInfo.icon;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Icon size={16} />
          {L(typeInfo.label_ar, typeInfo.label_en)}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isFirst} onClick={onMoveUp}>
            <ArrowUp size={14} />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isLast} onClick={onMoveDown}>
            <ArrowDown size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => set('visible', !block.visible)}
            title={L('إظهار/إخفاء', 'Show/hide')}
          >
            {block.visible ? <Eye size={14} /> : <EyeOff size={14} className="text-muted-foreground" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={onRemove}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {(block.type === 'hero' || block.type === 'text' || block.type === 'cta' || block.type === 'faq') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input placeholder={L('العنوان (عربي)', 'Heading (AR)')} dir="rtl" value={block.heading_ar || ''} onChange={(e) => set('heading_ar', e.target.value)} />
          <Input placeholder={L('العنوان (إنجليزي)', 'Heading (EN)')} dir="ltr" value={block.heading_en || ''} onChange={(e) => set('heading_en', e.target.value)} />
        </div>
      )}

      {(block.type === 'hero' || block.type === 'text' || block.type === 'image') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Textarea placeholder={L('النص (عربي)', 'Body (AR)')} dir="rtl" value={block.body_ar || ''} onChange={(e) => set('body_ar', e.target.value)} rows={3} />
          <Textarea placeholder={L('النص (إنجليزي)', 'Body (EN)')} dir="ltr" value={block.body_en || ''} onChange={(e) => set('body_en', e.target.value)} rows={3} />
        </div>
      )}

      {(block.type === 'hero' || block.type === 'image') && (
        <Input placeholder={L('رابط الصورة', 'Image URL')} dir="ltr" value={block.image_url || ''} onChange={(e) => set('image_url', e.target.value)} />
      )}

      {block.type === 'cta' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input placeholder={L('نص الزر (عربي)', 'Button label (AR)')} dir="rtl" value={block.cta_label_ar || ''} onChange={(e) => set('cta_label_ar', e.target.value)} />
          <Input placeholder={L('نص الزر (إنجليزي)', 'Button label (EN)')} dir="ltr" value={block.cta_label_en || ''} onChange={(e) => set('cta_label_en', e.target.value)} />
          <Input placeholder={L('رابط الزر', 'Button URL')} dir="ltr" value={block.cta_url || ''} onChange={(e) => set('cta_url', e.target.value)} />
        </div>
      )}

      {block.type === 'faq' && (
        <div className="space-y-2">
          {(block.faq_items || []).map((item, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded border p-2 relative">
              <Input placeholder={L('سؤال (عربي)', 'Question (AR)')} dir="rtl" value={item.q_ar || ''} onChange={(e) => {
                const items = [...(block.faq_items || [])];
                items[idx] = { ...items[idx], q_ar: e.target.value };
                set('faq_items', items);
              }} />
              <Input placeholder={L('سؤال (إنجليزي)', 'Question (EN)')} dir="ltr" value={item.q_en || ''} onChange={(e) => {
                const items = [...(block.faq_items || [])];
                items[idx] = { ...items[idx], q_en: e.target.value };
                set('faq_items', items);
              }} />
              <Textarea placeholder={L('إجابة (عربي)', 'Answer (AR)')} dir="rtl" rows={2} value={item.a_ar || ''} onChange={(e) => {
                const items = [...(block.faq_items || [])];
                items[idx] = { ...items[idx], a_ar: e.target.value };
                set('faq_items', items);
              }} />
              <Textarea placeholder={L('إجابة (إنجليزي)', 'Answer (EN)')} dir="ltr" rows={2} value={item.a_en || ''} onChange={(e) => {
                const items = [...(block.faq_items || [])];
                items[idx] = { ...items[idx], a_en: e.target.value };
                set('faq_items', items);
              }} />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 absolute -top-2 -end-2 bg-background border text-red-600"
                onClick={() => set('faq_items', (block.faq_items || []).filter((_, i) => i !== idx))}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => set('faq_items', [...(block.faq_items || []), { q_en: '', q_ar: '', a_en: '', a_ar: '' }])}>
            <Plus size={14} className="me-1" />
            {L('إضافة سؤال', 'Add question')}
          </Button>
        </div>
      )}
    </div>
  );
}

function PageEditor({ page, onSaved, onDeleted, lang }) {
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const [draft, setDraft] = useState(page);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const blocks = draft.blocks || [];

  useEffect(() => setDraft(page), [page.id]);

  const setBlocks = (next) => setDraft((d) => ({ ...d, blocks: next }));

  const addBlock = (type) => setBlocks([...blocks, newBlock(type, blocks.length)]);
  const updateBlock = (idx, next) => {
    const copy = [...blocks];
    copy[idx] = next;
    setBlocks(copy);
  };
  const removeBlock = (idx) => setBlocks(blocks.filter((_, i) => i !== idx));
  const moveBlock = (idx, dir) => {
    const to = idx + dir;
    if (to < 0 || to >= blocks.length) return;
    const copy = [...blocks];
    [copy[idx], copy[to]] = [copy[to], copy[idx]];
    setBlocks(copy.map((b, i) => ({ ...b, order: i })));
  };

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        title_en: draft.title_en,
        title_ar: draft.title_ar,
        status: draft.status,
        meta_title_en: draft.meta_title_en,
        meta_title_ar: draft.meta_title_ar,
        meta_description_en: draft.meta_description_en,
        meta_description_ar: draft.meta_description_ar,
        og_image_url: draft.og_image_url,
        blocks: blocks.map((b, i) => ({ ...b, order: i })),
      };
      if (!draft.is_core) patch.slug = draft.slug;
      const saved = draft.id ? await updatePage(draft.id, patch) : await createPage({ ...patch, slug: draft.slug, is_core: false });
      onSaved(saved);
      notify.success(L('تم الحفظ', 'Saved'));
    } catch (err) {
      notify.error(err?.message || L('فشل الحفظ', 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    if (!window.confirm(L('حذف هذه الصفحة نهائيًا؟', 'Delete this page permanently?'))) return;
    setDeleting(true);
    try {
      await deletePage(draft.id);
      onDeleted(draft.id);
      notify.success(L('تم الحذف', 'Deleted'));
    } catch (err) {
      notify.error(err?.message || L('فشل الحذف', 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label>{L('الرابط (slug)', 'Slug')}</Label>
          <Input dir="ltr" value={draft.slug || ''} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} placeholder="pricing" />
          <p className="text-xs text-muted-foreground mt-1">/page/{draft.slug || '...'}</p>
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2 mt-6 sm:mt-0">
          <span className="text-sm">{L('منشورة', 'Published')}</span>
          <Switch checked={draft.status === 'published'} onCheckedChange={(v) => setDraft((d) => ({ ...d, status: v ? 'published' : 'draft' }))} />
        </div>
        <Input placeholder={L('عنوان الصفحة (عربي)', 'Page title (AR)')} dir="rtl" value={draft.title_ar || ''} onChange={(e) => setDraft((d) => ({ ...d, title_ar: e.target.value }))} />
        <Input placeholder={L('عنوان الصفحة (إنجليزي)', 'Page title (EN)')} dir="ltr" value={draft.title_en || ''} onChange={(e) => setDraft((d) => ({ ...d, title_en: e.target.value }))} />
      </div>

      <SectionCard title={L('محتوى الصفحة (الأقسام)', 'Page content (blocks)')} subtitle={L('رتّب/أظهر/أخفِ كل قسم — بناء بصري بسيط بالأقسام', 'Reorder / show / hide each section — a lightweight block-based visual builder')}>
        <div className="space-y-3">
          {blocks.map((b, idx) => (
            <BlockEditor
              key={b.id}
              block={b}
              lang={lang}
              onChange={(next) => updateBlock(idx, next)}
              onRemove={() => removeBlock(idx)}
              onMoveUp={() => moveBlock(idx, -1)}
              onMoveDown={() => moveBlock(idx, 1)}
              isFirst={idx === 0}
              isLast={idx === blocks.length - 1}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {BLOCK_TYPES.map((bt) => (
            <Button key={bt.value} size="sm" variant="outline" onClick={() => addBlock(bt.value)}>
              <Plus size={14} className="me-1" />
              {lang === 'ar' ? bt.label_ar : bt.label_en}
            </Button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={L('SEO / بيانات المشاركة', 'SEO / share metadata')} subtitle={L('عنوان ووصف هذه الصفحة في نتائج البحث ومعاينة المشاركة', "This page's search-result title/description and share-preview")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input placeholder={L('عنوان SEO (عربي)', 'SEO title (AR)')} dir="rtl" value={draft.meta_title_ar || ''} onChange={(e) => setDraft((d) => ({ ...d, meta_title_ar: e.target.value }))} />
          <Input placeholder={L('عنوان SEO (إنجليزي)', 'SEO title (EN)')} dir="ltr" value={draft.meta_title_en || ''} onChange={(e) => setDraft((d) => ({ ...d, meta_title_en: e.target.value }))} />
          <Textarea placeholder={L('وصف SEO (عربي)', 'SEO description (AR)')} dir="rtl" rows={2} value={draft.meta_description_ar || ''} onChange={(e) => setDraft((d) => ({ ...d, meta_description_ar: e.target.value }))} />
          <Textarea placeholder={L('وصف SEO (إنجليزي)', 'SEO description (EN)')} dir="ltr" rows={2} value={draft.meta_description_en || ''} onChange={(e) => setDraft((d) => ({ ...d, meta_description_en: e.target.value }))} />
          <Input placeholder={L('رابط صورة المشاركة (og:image)', 'Share image URL (og:image)')} dir="ltr" value={draft.og_image_url || ''} onChange={(e) => setDraft((d) => ({ ...d, og_image_url: e.target.value }))} className="sm:col-span-2" />
        </div>
      </SectionCard>

      <div className="flex items-center justify-between">
        {draft.id && !draft.is_core ? (
          <Button variant="outline" className="text-red-600 border-red-300" onClick={remove} disabled={deleting}>
            {deleting ? <Loader2 size={14} className="animate-spin me-1" /> : <Trash2 size={14} className="me-1" />}
            {L('حذف الصفحة', 'Delete page')}
          </Button>
        ) : <span />}
        <Button onClick={save} disabled={saving || !draft.slug}>
          {saving ? <Loader2 size={14} className="animate-spin me-1" /> : <Save size={14} className="me-1" />}
          {L('حفظ', 'Save')}
        </Button>
      </div>
    </div>
  );
}

function CorePageSeoCard({ page, onSaved, lang }) {
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const [draft, setDraft] = useState(page);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(page), [page.id]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await updatePage(page.id, {
        meta_title_en: draft.meta_title_en,
        meta_title_ar: draft.meta_title_ar,
        meta_description_en: draft.meta_description_en,
        meta_description_ar: draft.meta_description_ar,
        og_image_url: draft.og_image_url,
      });
      onSaved(saved);
      notify.success(L('تم الحفظ', 'Saved'));
    } catch (err) {
      notify.error(err?.message || L('فشل الحفظ', 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title={lang === 'ar' ? page.title_ar : page.title_en}
      subtitle={`${page.route_override} — ${L('تعديل معاينة المشاركة فقط (لا يغيّر محتوى أو عنوان الصفحة الفعلي)', 'Edits the share preview only — never the page\'s actual visible content or its real title tag')}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input placeholder={L('عنوان المشاركة (عربي)', 'Share title (AR)')} dir="rtl" value={draft.meta_title_ar || ''} onChange={(e) => setDraft((d) => ({ ...d, meta_title_ar: e.target.value }))} />
        <Input placeholder={L('عنوان المشاركة (إنجليزي)', 'Share title (EN)')} dir="ltr" value={draft.meta_title_en || ''} onChange={(e) => setDraft((d) => ({ ...d, meta_title_en: e.target.value }))} />
        <Textarea placeholder={L('وصف المشاركة (عربي)', 'Share description (AR)')} dir="rtl" rows={2} value={draft.meta_description_ar || ''} onChange={(e) => setDraft((d) => ({ ...d, meta_description_ar: e.target.value }))} />
        <Textarea placeholder={L('وصف المشاركة (إنجليزي)', 'Share description (EN)')} dir="ltr" rows={2} value={draft.meta_description_en || ''} onChange={(e) => setDraft((d) => ({ ...d, meta_description_en: e.target.value }))} />
        <Input placeholder={L('رابط صورة المشاركة', 'Share image URL')} dir="ltr" value={draft.og_image_url || ''} onChange={(e) => setDraft((d) => ({ ...d, og_image_url: e.target.value }))} className="sm:col-span-2" />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin me-1" /> : <Save size={14} className="me-1" />}
          {L('حفظ', 'Save')}
        </Button>
      </div>
    </SectionCard>
  );
}

export default function SiteEditorPanel() {
  const { lang } = useLanguage();
  const L = (ar, en) => (lang === 'ar' ? ar : en);
  const [pages, setPages] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listAllPages()
      .then((items) => setPages(items || []))
      .catch(() => setPages([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading || pages === null) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="animate-spin me-2" size={20} />
        {L('جارٍ التحميل...', 'Loading...')}
      </div>
    );
  }

  const corePages = pages.filter((p) => p.is_core);
  const customPages = pages.filter((p) => !p.is_core);
  const selected = customPages.find((p) => p.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Globe size={22} />
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{L('محرر الموقع', 'Site Editor')}</h2>
          <p className="text-sm text-muted-foreground">
            {L(
              'تحرير صفحات الموقع العامة، بناء بصري بالأقسام لأي صفحة جديدة، وإدارة SEO لكل صفحة على حدة.',
              'Edit the public site pages, build any new page visually from ordered sections, and manage SEO per page.',
            )}
          </p>
        </div>
      </div>

      <SectionCard title={L('الصفحات الأساسية', 'Core pages')} subtitle={L('صفحتا "من نحن" و"ما هو Estate Follow" الحاليتان — محتواهما الفعلي ثابت بالكود، وهنا فقط بيانات المشاركة/SEO', 'The existing About / What-is-Estate-Follow pages — their real content stays fixed in code; only share/SEO data is editable here')}>
        <div className="grid grid-cols-1 gap-4">
          {corePages.map((p) => (
            <CorePageSeoCard key={p.id} page={p} lang={lang} onSaved={(saved) => setPages((all) => all.map((x) => (x.id === saved.id ? saved : x)))} />
          ))}
          {corePages.length === 0 && (
            <p className="text-sm text-muted-foreground">{L('لا توجد صفحات أساسية بعد — نفّذ ترحيل قاعدة البيانات.', 'No core pages yet — run the database migration.')}</p>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title={L('الصفحات المخصصة', 'Custom pages')}
        subtitle={L('أنشئ صفحة عامة جديدة (مثل الأسعار، الشروط، اتصل بنا) تُعرض على /page/الرابط', 'Create a new public page (e.g. pricing, terms, contact) served at /page/slug')}
      >
        <div className="flex flex-wrap gap-2">
          {customPages.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={selectedId === p.id ? 'default' : 'outline'}
              onClick={() => setSelectedId(p.id)}
            >
              {p.status === 'published' ? <Eye size={13} className="me-1" /> : <EyeOff size={13} className="me-1 text-muted-foreground" />}
              {lang === 'ar' ? (p.title_ar || p.slug) : (p.title_en || p.slug)}
            </Button>
          ))}
          <Button
            size="sm"
            onClick={() => {
              const draftPage = { id: null, slug: '', title_en: '', title_ar: '', status: 'draft', blocks: [], is_core: false };
              setPages((all) => [...all, draftPage]);
              setSelectedId(null);
              setTimeout(() => setSelectedId(draftPage.id), 0);
            }}
          >
            <Plus size={14} className="me-1" />
            {L('صفحة جديدة', 'New page')}
          </Button>
        </div>

        {selectedId === null && pages.some((p) => p.id === null) && (
          <div className="pt-4 border-t mt-4">
            <PageEditor
              page={pages.find((p) => p.id === null)}
              lang={lang}
              onSaved={(saved) => setPages((all) => [...all.filter((p) => p.id !== null), saved])}
              onDeleted={() => {}}
            />
          </div>
        )}

        {selected && (
          <div className="pt-4 border-t mt-4">
            <PageEditor
              page={selected}
              lang={lang}
              onSaved={(saved) => {
                setPages((all) => all.map((x) => (x.id === saved.id ? saved : x)));
                setSelectedId(saved.id);
              }}
              onDeleted={(id) => {
                setPages((all) => all.filter((x) => x.id !== id));
                setSelectedId(null);
              }}
            />
          </div>
        )}
      </SectionCard>
    </div>
  );
}
