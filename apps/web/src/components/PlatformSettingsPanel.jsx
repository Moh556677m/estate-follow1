import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Trash2,
  Undo2,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { isSuperAdmin as checkSuperAdmin } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/api';
import { loadSettingsAudit, writeSettingsAudit } from '@/lib/settingsAudit';
import {
  CMS_SECTIONS,
  buildDefaultCms,
  mergeCms,
  uid,
} from '@/lib/cmsDefaults';
import { EmptyState } from '@/components/shared';
import { applySiteIcon, DEFAULT_SITE_ICON_URL } from '@/lib/siteIcon';

const SWATCHES = ['#22C55E', '#16A34A', '#15803D', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#111827'];

const SENSITIVE_SECTIONS = new Set([
  'plans',
  'accounts',
  'approval',
  'features',
  'maintenance',
  'security',
]);

function deepClone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

function ColorRow({ label, value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#22C55E'}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-11 w-14 cursor-pointer rounded-lg border bg-card p-1 disabled:opacity-50"
          aria-label={label}
        />
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className="min-h-[44px] flex-1"
          placeholder="#22C55E"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            onClick={() => onChange(c)}
            className={cn(
              'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-40',
              (value || '').toLowerCase() === c.toLowerCase()
                ? 'border-foreground'
                : 'border-transparent',
            )}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, actions }) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-base sm:text-lg">{title}</h3>
          {subtitle ? (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint ? (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
      />
    </label>
  );
}

function FileUploadField({
  label,
  hint,
  record,
  field,
  previewUrl,
  file,
  onFile,
  onClearUrl,
  disabled,
  accept = 'image/*',
}) {
  const { t, lang } = useLanguage();
  const inputRef = useRef(null);
  const localPreview = file ? URL.createObjectURL(file) : null;
  const existing =
    localPreview ||
    previewUrl ||
    (record && record[field]
      ? pb.files.getURL(record, record[field])
      : '');

  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        {existing ? (
          <img
            src={existing}
            alt=""
            className="h-14 w-14 rounded-lg border object-contain bg-card p-1"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-xs">
            —
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="min-h-[40px]"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={14} className="me-1" />
            {lang === 'ar' ? 'رفع ملف' : 'Upload'}
          </Button>
          {(file || existing) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="min-h-[40px] text-destructive"
              onClick={() => {
                onFile(null);
                if (onClearUrl) onClearUrl();
              }}
            >
              <Trash2 size={14} className="me-1" />
              {t('delete')}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            onFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

function ReorderButtons({ index, total, onMove, disabled }) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || index <= 0}
        className="min-h-[36px] min-w-[36px] px-2"
        onClick={() => onMove(index, index - 1)}
      >
        <ArrowUp size={14} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || index >= total - 1}
        className="min-h-[36px] min-w-[36px] px-2"
        onClick={() => onMove(index, index + 1)}
      >
        <ArrowDown size={14} />
      </Button>
    </div>
  );
}

function SaveBar({ saving, onSave, onUndo, canUndo, disabled, label }) {
  const { t, lang } = useLanguage();
  return (
    <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card md:bg-card/95 md:backdrop-blur px-3 py-2 shadow-md">
      {canUndo ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled || saving}
          onClick={onUndo}
          className="min-h-[44px]"
        >
          <Undo2 size={16} className="me-1" />
          {lang === 'ar' ? 'تراجع' : 'Undo'}
        </Button>
      ) : null}
      <Button
        type="button"
        disabled={disabled || saving}
        onClick={onSave}
        className="min-h-[44px]"
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin me-1" />
        ) : (
          <Save size={16} className="me-1" />
        )}
        {label || t('save_settings')}
      </Button>
    </div>
  );
}

const PlatformSettingsPanel = () => {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const isSuperAdmin = checkSuperAdmin(user);

  const [record, setRecord] = useState(null);
  const [brand, setBrand] = useState({
    brand_name: 'Estate Follow',
    brand_name_ar: 'إستيت فولو',
    tagline: 'Your Properties. Always Followed.',
    tagline_ar: 'عقاراتك تحت المتابعة، دائماً.',
    description: '',
    description_ar: '',
    primary_color: '#22C55E',
    accent_color: '#22C55E',
    email_header_color: '#22C55E',
    logo_url: '',
    site_icon_url: '',
    font_family: '',
    font_arabic: '',
    default_language: 'ar',
    free_plan_enabled: true,
    paid_plan_enabled: false,
    max_devices: 5,
    contact_email: '',
    contact_phone: '',
    social_links: { instagram: '', facebook: '', tiktok: '', twitter: '', linkedin: '', website: '' },
  });
  const [cms, setCms] = useState(() => buildDefaultCms());
  const [files, setFiles] = useState({
    logo_file: null,
    favicon_file: null,
    app_icon_file: null,
    og_image_file: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [active, setActive] = useState('branding');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(false);
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const undoStack = useRef([]);
  const [undoTick, setUndoTick] = useState(0);

  // ---- Marketing sender emails management (Control Center > Marketing) ----
  const [senderEmails, setSenderEmails] = useState([]);
  const [senderLoading, setSenderLoading] = useState(false);
  const [senderSaving, setSenderSaving] = useState(false);
  const [senderEditing, setSenderEditing] = useState(null);
  const [senderForm, setSenderForm] = useState({ email: '', name: '', active: true, is_default: false });

  const loadSenderEmails = useCallback(async () => {
    setSenderLoading(true);
    try {
      const rows = await pb.collection('marketing_sender_emails').getFullList({ sort: 'created', requestKey: 'mkt-senders' });
      setSenderEmails(rows);
    } catch (err) { setSenderEmails([]); }
    finally { setSenderLoading(false); }
  }, []);

  useEffect(() => {
    if (active === 'marketing' && isSuperAdmin) loadSenderEmails();
  }, [active, isSuperAdmin, loadSenderEmails]);

  const L = useCallback(
    (ar, en) => (lang === 'ar' ? ar : en),
    [lang],
  );

  const pushUndo = useCallback(() => {
    undoStack.current.push({
      brand: deepClone(brand),
      cms: deepClone(cms),
    });
    if (undoStack.current.length > 20) undoStack.current.shift();
    setUndoTick((x) => x + 1);
  }, [brand, cms]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setBrand(prev.brand);
    setCms(prev.cms);
    setUndoTick((x) => x + 1);
    setNotice(L('تم التراجع عن آخر تعديل محلي', 'Last local change undone'));
    setTimeout(() => setNotice(''), 2500);
  }, [L]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await pb.collection('platform_settings').getFullList({ sort: 'created' });
      const rec = rows[0] || null;
      setRecord(rec);
      if (rec) {
        const social =
          rec.social_links && typeof rec.social_links === 'object'
            ? rec.social_links
            : {};
        setBrand({
          brand_name: rec.brand_name || 'Estate Follow',
          brand_name_ar: rec.brand_name_ar || 'إستيت فولو',
          tagline: rec.tagline || '',
          tagline_ar: rec.tagline_ar || '',
          description: rec.description || '',
          description_ar: rec.description_ar || '',
          primary_color: rec.primary_color || '#22C55E',
          accent_color: rec.accent_color || '#22C55E',
          email_header_color: rec.email_header_color || '#22C55E',
          logo_url: rec.logo_url || '',
          site_icon_url: rec.site_icon_url || '',
          font_family: rec.font_family || '',
          font_arabic: rec.font_arabic || '',
          default_language: rec.default_language || 'ar',
          free_plan_enabled: rec.free_plan_enabled,
          paid_plan_enabled: rec.paid_plan_enabled,
          max_devices: rec.max_devices || 5,
          contact_email: rec.contact_email || '',
          contact_phone: rec.contact_phone || '',
          social_links: {
            instagram: social.instagram || '',
            facebook: social.facebook || '',
            tiktok: social.tiktok || '',
            twitter: social.twitter || '',
            linkedin: social.linkedin || '',
            website: social.website || '',
          },
        });
        setCms(mergeCms(rec.cms));
      } else {
        setCms(buildDefaultCms());
      }
      setFiles({
        logo_file: null,
        favicon_file: null,
        app_icon_file: null,
        og_image_file: null,
      });
      undoStack.current = [];
      setUndoTick((x) => x + 1);
    } catch {
      setError(t('something_wrong'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const rows = await loadSettingsAudit();
      setAudit(rows || []);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live: platform settings, audit log, and sender emails update in real time.
  // Each collection is subscribed exactly once — the broad `load` only cares
  // about platform_settings, so sender-email / audit changes go to their
  // dedicated loaders instead of triggering a full settings reload too.
  useRealtimeRefresh(load, ['platform_settings']);
  useRealtimeRefresh(loadSenderEmails, ['marketing_sender_emails']);
  useRealtimeRefresh(loadAudit, ['settings_audit_logs']);

  useEffect(() => {
    if (active === 'audit') loadAudit();
  }, [active, loadAudit]);

  const flash = (msg) => {
    setNotice(msg);
    setError('');
    setTimeout(() => setNotice(''), 4000);
  };

  const writeAudit = async (section, action, summary, oldValue, newValue) => {
    await writeSettingsAudit({
      user,
      section,
      action,
      summary,
      oldValue,
      newValue,
      requestKeyPrefix: 'cms-audit',
    });
  };

  const applyLiveBrand = (nextBrand, nextCms, rec) => {
    const root = document.documentElement;
    const hex = nextBrand.primary_color;
    if (hex && /^#?[0-9a-f]{3,8}$/i.test(hex)) {
      // BrandLoader will re-apply HSL; set favicon immediately.
    }
    const fav =
      (rec && rec.favicon_file && pb.files.getURL(rec, rec.favicon_file)) ||
      nextBrand.site_icon_url ||
      DEFAULT_SITE_ICON_URL;
    applySiteIcon({
      url: fav,
      version: rec?.site_icon_version || rec?.updated || Date.now(),
    });
    if (nextBrand.brand_name) {
      document.title = `${nextBrand.brand_name} — Estate Follow`;
    }
    if (nextCms?.seo?.meta_title_en || nextCms?.seo?.meta_title_ar) {
      /* SEO applied via Helmet consumers when wired */
    }
    try {
      window.dispatchEvent(
        new CustomEvent('estatefollow-cms-updated', {
          detail: { brand: nextBrand, cms: nextCms },
        }),
      );
    } catch {
      /* ignore */
    }
  };

  const saveSection = async (sectionId, extraPayload = {}) => {
    if (!isSuperAdmin) return;
    if (SENSITIVE_SECTIONS.has(sectionId)) {
      const ok = window.confirm(
        L(
          'هذا إعداد حسّاس. هل تريد حفظ التغييرات؟',
          'This is a sensitive setting. Save changes?',
        ),
      );
      if (!ok) return;
    }
    setSaving(true);
    setError('');
    try {
      const oldSnap = record
        ? { brand: deepClone(brand), cms: deepClone(record.cms || {}) }
        : null;

      const fd = new FormData();
      // Always persist brand scalars + full cms blob so sections stay consistent.
      Object.entries({
        brand_name: brand.brand_name,
        brand_name_ar: brand.brand_name_ar,
        tagline: brand.tagline,
        tagline_ar: brand.tagline_ar,
        description: brand.description,
        description_ar: brand.description_ar,
        primary_color: brand.primary_color,
        accent_color: brand.accent_color,
        email_header_color: brand.email_header_color,
        logo_url: brand.logo_url,
        site_icon_url: brand.site_icon_url,
        font_family: brand.font_family,
        font_arabic: brand.font_arabic,
        default_language: brand.default_language,
        free_plan_enabled: !!brand.free_plan_enabled,
        paid_plan_enabled: !!brand.paid_plan_enabled,
        max_devices: Number(brand.max_devices) || 5,
        contact_email: brand.contact_email || '',
        contact_phone: brand.contact_phone || '',
      }).forEach(([k, v]) => fd.append(k, v === null || v === undefined ? '' : String(v)));

      fd.append('social_links', JSON.stringify(brand.social_links || {}));
      fd.append('cms', JSON.stringify(cms));

      Object.entries(extraPayload).forEach(([k, v]) => {
        if (v === undefined) return;
        fd.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      });

      if (files.logo_file) fd.append('logo_file', files.logo_file);
      if (files.favicon_file) {
        fd.append('favicon_file', files.favicon_file);
        fd.append('site_icon_version', String(Date.now()));
      }
      if (files.app_icon_file) fd.append('app_icon_file', files.app_icon_file);
      if (files.og_image_file) fd.append('og_image_file', files.og_image_file);

      let saved;
      if (record) {
        saved = await pb.collection('platform_settings').update(record.id, fd, {
          requestKey: `cms-save-${sectionId}-${Date.now()}`,
        });
      } else {
        saved = await pb.collection('platform_settings').create(fd, {
          requestKey: `cms-create-${Date.now()}`,
        });
      }
      setRecord(saved);
      // Keep site_icon_url in sync with the uploaded favicon so every page
      // (and BrandLoader) resolves the same official browser icon.
      let nextBrand = brand;
      if (saved?.favicon_file) {
        const iconUrl = pb.files.getURL(saved, saved.favicon_file);
        nextBrand = { ...brand, site_icon_url: iconUrl };
        setBrand(nextBrand);
        try {
          await pb.collection('platform_settings').update(
            saved.id,
            {
              site_icon_url: iconUrl,
              site_icon_version: saved.site_icon_version || String(Date.now()),
            },
            { requestKey: `cms-icon-url-${Date.now()}` },
          );
        } catch {
          /* non-fatal — file URL still applied live below */
        }
      }
      setFiles({
        logo_file: null,
        favicon_file: null,
        app_icon_file: null,
        og_image_file: null,
      });
      await writeAudit(
        sectionId,
        'save',
        L(`حفظ قسم: ${sectionId}`, `Saved section: ${sectionId}`),
        oldSnap,
        { brand: nextBrand, cms },
      );
      applyLiveBrand(nextBrand, cms, saved);
      flash(t('settings_saved'));
      undoStack.current = [];
      setUndoTick((x) => x + 1);
    } catch (err) {
      setError(err?.message || t('something_wrong'));
    } finally {
      setSaving(false);
    }
  };

  const restoreSectionDefaults = (sectionId) => {
    if (
      !window.confirm(
        L('استعادة القيم الافتراضية لهذا القسم؟', 'Restore defaults for this section?'),
      )
    ) {
      return;
    }
    pushUndo();
    const d = buildDefaultCms();
    if (sectionId === 'slogans') setCms((c) => ({ ...c, slogans: d.slogans }));
    else if (sectionId === 'pages') setCms((c) => ({ ...c, pages: d.pages }));
    else if (sectionId === 'cards') setCms((c) => ({ ...c, cards: d.cards }));
    else if (sectionId === 'sidebar') setCms((c) => ({ ...c, sidebar: d.sidebar }));
    else if (sectionId === 'plans')
      setCms((c) => ({
        ...c,
        plans: d.plans,
        subscription_system_enabled: d.subscription_system_enabled,
      }));
    else if (sectionId === 'accounts')
      setCms((c) => ({ ...c, account_types: d.account_types }));
    else if (sectionId === 'forms') setCms((c) => ({ ...c, forms: d.forms }));
    else if (sectionId === 'geo') setCms((c) => ({ ...c, geo: d.geo }));
    else if (sectionId === 'specs')
      setCms((c) => ({ ...c, specializations: d.specializations }));
    else if (sectionId === 'notifications')
      setCms((c) => ({ ...c, notifications: d.notifications }));
    else if (sectionId === 'approval') setCms((c) => ({ ...c, approval: d.approval }));
    else if (sectionId === 'features') setCms((c) => ({ ...c, features: d.features }));
    else if (sectionId === 'maintenance')
      setCms((c) => ({ ...c, maintenance: d.maintenance }));
    else if (sectionId === 'seo') setCms((c) => ({ ...c, seo: d.seo }));
    else if (sectionId === 'support')
      setCms((c) => ({ ...c, support_settings: d.support_settings }));
    else if (sectionId === 'marketing')
      setCms((c) => ({ ...c, marketing_settings: d.marketing_settings }));
    flash(t('labels_restored'));
  };

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CMS_SECTIONS;
    return CMS_SECTIONS.filter(
      (s) =>
        s.id.includes(q) ||
        s.ar.includes(search.trim()) ||
        s.en.toLowerCase().includes(q),
    );
  }, [search]);

  const moveInList = (list, from, to) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next.map((x, i) => ({ ...x, order: i }));
  };

  const setBrandField = (key, val) => {
    pushUndo();
    setBrand((b) => ({ ...b, [key]: val }));
  };

  // ---------- section renderers ----------
  const renderBranding = () => (
    <div className="space-y-4">
      <SectionCard
        title={L('هوية المنصة', 'Platform Branding')}
        subtitle={L(
          'الاسم، الشعار، الأيقونات، الوصف وبيانات التواصل',
          'Name, logo, icons, description and contact',
        )}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[36px]"
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? <EyeOff size={14} className="me-1" /> : <Eye size={14} className="me-1" />}
            {L('معاينة', 'Preview')}
          </Button>
        }
      >
        {preview && (
          <div
            className="rounded-xl border p-4 space-y-2"
            style={{ borderColor: brand.primary_color }}
          >
            <div className="flex items-center gap-3">
              {(files.logo_file ||
                brand.logo_url ||
                (record?.logo_file && pb.files.getURL(record, record.logo_file))) && (
                <img
                  src={
                    files.logo_file
                      ? URL.createObjectURL(files.logo_file)
                      : brand.logo_url ||
                        pb.files.getURL(record, record.logo_file)
                  }
                  alt=""
                  className="h-10 w-auto"
                />
              )}
              <div>
                <p className="font-bold text-lg" style={{ color: brand.primary_color }}>
                  {lang === 'ar' ? brand.brand_name_ar : brand.brand_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {lang === 'ar' ? brand.tagline_ar : brand.tagline}
                </p>
              </div>
            </div>
            <p className="text-sm">
              {lang === 'ar' ? brand.description_ar : brand.description}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('brand_name')}</Label>
            <Input
              value={brand.brand_name}
              onChange={(e) => setBrandField('brand_name', e.target.value)}
              dir="ltr"
              className="min-h-[44px]"
              disabled={!isSuperAdmin}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('brand_name_ar')}</Label>
            <Input
              value={brand.brand_name_ar}
              onChange={(e) => setBrandField('brand_name_ar', e.target.value)}
              className="min-h-[44px]"
              disabled={!isSuperAdmin}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('tagline_label')}</Label>
            <Input
              value={brand.tagline}
              onChange={(e) => setBrandField('tagline', e.target.value)}
              dir="ltr"
              className="min-h-[44px]"
              disabled={!isSuperAdmin}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('tagline_ar_label')}</Label>
            <Input
              value={brand.tagline_ar}
              onChange={(e) => setBrandField('tagline_ar', e.target.value)}
              className="min-h-[44px]"
              disabled={!isSuperAdmin}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{L('وصف المنصة (إنجليزي)', 'Platform description (EN)')}</Label>
            <Textarea
              value={brand.description}
              onChange={(e) => setBrandField('description', e.target.value)}
              rows={2}
              dir="ltr"
              disabled={!isSuperAdmin}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{L('وصف المنصة (عربي)', 'Platform description (AR)')}</Label>
            <Textarea
              value={brand.description_ar}
              onChange={(e) => setBrandField('description_ar', e.target.value)}
              rows={2}
              disabled={!isSuperAdmin}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FileUploadField
            label={L('شعار المنصة', 'Platform logo')}
            record={record}
            field="logo_file"
            previewUrl={brand.logo_url}
            file={files.logo_file}
            onFile={(f) => setFiles((x) => ({ ...x, logo_file: f }))}
            onClearUrl={() => setBrandField('logo_url', '')}
            disabled={!isSuperAdmin}
          />
          <FileUploadField
            label={L('أيقونة الموقع الرسمية', 'Official site icon')}
            record={record}
            field="favicon_file"
            previewUrl={brand.site_icon_url || DEFAULT_SITE_ICON_URL}
            file={files.favicon_file}
            onFile={(f) => setFiles((x) => ({ ...x, favicon_file: f }))}
            onClearUrl={() => setBrandField('site_icon_url', DEFAULT_SITE_ICON_URL)}
            disabled={!isSuperAdmin}
          />
          <FileUploadField
            label={L('أيقونة التطبيق', 'App icon')}
            record={record}
            field="app_icon_file"
            file={files.app_icon_file}
            onFile={(f) => setFiles((x) => ({ ...x, app_icon_file: f }))}
            disabled={!isSuperAdmin}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{L('بريد التواصل', 'Contact email')}</Label>
            <Input
              value={brand.contact_email}
              onChange={(e) => setBrandField('contact_email', e.target.value)}
              dir="ltr"
              className="min-h-[44px]"
              disabled={!isSuperAdmin}
            />
          </div>
          <div className="space-y-2">
            <Label>{L('هاتف التواصل', 'Contact phone')}</Label>
            <Input
              value={brand.contact_phone}
              onChange={(e) => setBrandField('contact_phone', e.target.value)}
              dir="ltr"
              className="min-h-[44px]"
              disabled={!isSuperAdmin}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {['instagram', 'facebook', 'tiktok', 'twitter', 'linkedin', 'website'].map(
            (k) => (
              <div key={k} className="space-y-1">
                <Label className="capitalize">{k}</Label>
                <Input
                  value={brand.social_links?.[k] || ''}
                  onChange={(e) => {
                    pushUndo();
                    setBrand((b) => ({
                      ...b,
                      social_links: { ...b.social_links, [k]: e.target.value },
                    }));
                  }}
                  dir="ltr"
                  className="min-h-[40px]"
                  disabled={!isSuperAdmin}
                  placeholder="https://…"
                />
              </div>
            ),
          )}
        </div>
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('branding')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderSlogans = () => (
    <div className="space-y-4">
      {['owner', 'broker', 'company'].map((type) => {
        const s = cms.slogans?.[type] || {};
        const title =
          type === 'owner'
            ? L('مالك', 'Owner')
            : type === 'broker'
              ? L('وسيط', 'Broker')
              : L('شركة وساطة', 'Company');
        const fields = [
          ['slogan_en', 'Slogan EN'],
          ['slogan_ar', 'Slogan AR'],
          ['desc_en', 'Description EN'],
          ['desc_ar', 'Description AR'],
          ['subline_en', 'Subline EN'],
          ['subline_ar', 'Subline AR'],
          ['login_title_en', 'Login title EN'],
          ['login_title_ar', 'Login title AR'],
          ['signup_title_en', 'Signup title EN'],
          ['signup_title_ar', 'Signup title AR'],
        ];
        return (
          <SectionCard key={type} title={title}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    value={s[key] || ''}
                    dir={key.endsWith('_ar') ? 'rtl' : 'ltr'}
                    className="min-h-[40px]"
                    disabled={!isSuperAdmin}
                    onChange={(e) => {
                      pushUndo();
                      setCms((c) => ({
                        ...c,
                        slogans: {
                          ...c.slogans,
                          [type]: { ...c.slogans[type], [key]: e.target.value },
                        },
                      }));
                    }}
                  />
                </div>
              ))}
            </div>
          </SectionCard>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => restoreSectionDefaults('slogans')}
          disabled={!isSuperAdmin}
          className="min-h-[44px]"
        >
          <RotateCcw size={14} className="me-1" />
          {t('restore_defaults')}
        </Button>
      </div>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('slogans')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderListEditor = (items, setItems, opts = {}) => {
    const { allowAdd = true, allowDelete = true, fields = [] } = opts;
    return (
      <div className="space-y-3">
        {(items || []).map((item, idx) => (
          <div
            key={item.id || idx}
            className="rounded-lg border p-3 space-y-2 bg-background/50"
          >
            <div className="flex flex-wrap items-center gap-2">
              <ReorderButtons
                index={idx}
                total={items.length}
                disabled={!isSuperAdmin}
                onMove={(from, to) => {
                  pushUndo();
                  setItems(moveInList(items, from, to));
                }}
              />
              {'visible' in item && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-[36px]"
                  disabled={!isSuperAdmin}
                  onClick={() => {
                    pushUndo();
                    setItems(
                      items.map((x, i) =>
                        i === idx ? { ...x, visible: !x.visible } : x,
                      ),
                    );
                  }}
                >
                  {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </Button>
              )}
              {allowDelete && !item.locked && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-[36px] text-destructive ms-auto"
                  disabled={!isSuperAdmin}
                  onClick={() => {
                    if (
                      !window.confirm(
                        L('حذف هذا العنصر؟', 'Delete this item?'),
                      )
                    )
                      return;
                    pushUndo();
                    setItems(items.filter((_, i) => i !== idx));
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              )}
              {item.locked && (
                <span className="text-[10px] text-muted-foreground ms-auto">
                  {L('أساسي', 'Core')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {fields.map((f) => (
                <div key={f.key} className={cn('space-y-1', f.span && 'sm:col-span-2')}>
                  <Label className="text-xs">{f.label}</Label>
                  {f.type === 'textarea' ? (
                    <Textarea
                      value={item[f.key] || ''}
                      disabled={!isSuperAdmin || (item.locked && f.lockCore)}
                      rows={2}
                      dir={f.dir || 'auto'}
                      onChange={(e) => {
                        pushUndo();
                        setItems(
                          items.map((x, i) =>
                            i === idx ? { ...x, [f.key]: e.target.value } : x,
                          ),
                        );
                      }}
                    />
                  ) : (
                    <Input
                      value={item[f.key] ?? ''}
                      disabled={!isSuperAdmin || (item.locked && f.lockCore)}
                      className="min-h-[40px]"
                      dir={f.dir || 'auto'}
                      type={f.type || 'text'}
                      onChange={(e) => {
                        pushUndo();
                        const val =
                          f.type === 'number'
                            ? Number(e.target.value)
                            : e.target.value;
                        setItems(
                          items.map((x, i) =>
                            i === idx ? { ...x, [f.key]: val } : x,
                          ),
                        );
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {allowAdd && isSuperAdmin && (
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => {
              pushUndo();
              setItems([
                ...items,
                opts.newItem
                  ? opts.newItem(items.length)
                  : {
                      id: uid('item'),
                      name_en: 'New',
                      name_ar: 'جديد',
                      visible: true,
                      order: items.length,
                    },
              ]);
            }}
          >
            <Plus size={14} className="me-1" />
            {opts.addLabel || L('إضافة', 'Add')}
          </Button>
        )}
      </div>
    );
  };

  const renderPages = () => (
    <div className="space-y-4">
      <SectionCard
        title={L('إدارة الصفحات', 'Page Management')}
        subtitle={L(
          'تعديل الأسماء والأيقونات والإظهار والترتيب. إضافة صفحة يسجّل Route في الإعدادات.',
          'Edit names, icons, visibility and order. Adding a page registers a route in settings.',
        )}
      >
        {renderListEditor(cms.pages || [], (pages) => setCms((c) => ({ ...c, pages })), {
          addLabel: L('إضافة صفحة جديدة', 'Add new page'),
          newItem: (order) => ({
            id: uid('page'),
            key: `custom_${order}`,
            name_en: 'New page',
            name_ar: 'صفحة جديدة',
            icon: 'FileText',
            visible: true,
            order,
            surface: 'admin',
            route: `/dashboard/custom_${order}`,
            permission: '',
            description_en: '',
            description_ar: '',
            custom: true,
          }),
          fields: [
            { key: 'name_en', label: 'Name EN', dir: 'ltr' },
            { key: 'name_ar', label: 'Name AR', dir: 'rtl' },
            { key: 'icon', label: 'Icon', dir: 'ltr' },
            { key: 'route', label: 'Route', dir: 'ltr' },
            { key: 'surface', label: 'Surface (admin/owner/broker/company)', dir: 'ltr' },
            { key: 'permission', label: 'Permission', dir: 'ltr' },
            { key: 'description_en', label: 'Description EN', dir: 'ltr', type: 'textarea', span: true },
            { key: 'description_ar', label: 'Description AR', dir: 'rtl', type: 'textarea', span: true },
          ],
        })}
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('pages')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderCards = () => (
    <div className="space-y-4">
      <SectionCard title={L('كروت الإحصائيات', 'Dashboard Cards')}>
        {renderListEditor(cms.cards || [], (cards) => setCms((c) => ({ ...c, cards })), {
          addLabel: L('إضافة كرت إحصائيات', 'Add stats card'),
          newItem: (order) => ({
            id: uid('card'),
            key: `custom_card_${order}`,
            name_en: 'New card',
            name_ar: 'كرت جديد',
            icon: 'BarChart3',
            visible: true,
            order,
            link: '/dashboard/overview',
            surface: 'admin',
          }),
          fields: [
            { key: 'name_en', label: 'Name EN', dir: 'ltr' },
            { key: 'name_ar', label: 'Name AR', dir: 'rtl' },
            { key: 'icon', label: 'Icon', dir: 'ltr' },
            { key: 'link', label: 'Link page', dir: 'ltr' },
            { key: 'surface', label: 'Surface', dir: 'ltr' },
            { key: 'key', label: 'Key', dir: 'ltr', lockCore: true },
          ],
        })}
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('cards')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderSidebar = () => {
    const surfaces = ['admin', 'owner', 'broker', 'company'];
    return (
      <div className="space-y-4">
        {surfaces.map((surface) => (
          <SectionCard
            key={surface}
            title={`${L('القائمة الجانبية', 'Sidebar')} — ${surface}`}
          >
            {renderListEditor(
              cms.sidebar?.[surface] || [],
              (list) =>
                setCms((c) => ({
                  ...c,
                  sidebar: { ...c.sidebar, [surface]: list },
                })),
              {
                addLabel: L('إضافة عنصر', 'Add item'),
                newItem: (order) => ({
                  id: uid('nav'),
                  key: `custom_${order}`,
                  name_en: 'New item',
                  name_ar: 'عنصر جديد',
                  icon: 'Circle',
                  visible: true,
                  order,
                }),
                fields: [
                  { key: 'name_en', label: 'Name EN', dir: 'ltr' },
                  { key: 'name_ar', label: 'Name AR', dir: 'rtl' },
                  { key: 'icon', label: 'Icon', dir: 'ltr' },
                  { key: 'key', label: 'Key / route', dir: 'ltr' },
                ],
              },
            )}
          </SectionCard>
        ))}
        <SaveBar
          saving={saving}
          onSave={() => saveSection('sidebar')}
          onUndo={undo}
          canUndo={undoStack.current.length > 0}
          disabled={!isSuperAdmin}
        />
      </div>
    );
  };

  const renderPlans = () => (
    <div className="space-y-4">
      <SectionCard title={L('الاشتراكات والباقات', 'Subscriptions & Plans')}>
        <ToggleRow
          label={L('تشغيل نظام الاشتراك', 'Enable subscription system')}
          checked={cms.subscription_system_enabled}
          disabled={!isSuperAdmin}
          onChange={(v) => {
            pushUndo();
            setCms((c) => ({ ...c, subscription_system_enabled: v }));
          }}
        />
        <ToggleRow
          label={t('free_plan_enabled')}
          hint={t('free_plan_hint')}
          checked={brand.free_plan_enabled}
          disabled={!isSuperAdmin}
          onChange={(v) => setBrandField('free_plan_enabled', v)}
        />
        <ToggleRow
          label={t('paid_plan_enabled')}
          hint={t('paid_plan_hint')}
          checked={brand.paid_plan_enabled}
          disabled={!isSuperAdmin}
          onChange={(v) => setBrandField('paid_plan_enabled', v)}
        />
        {renderListEditor(cms.plans || [], (plans) => setCms((c) => ({ ...c, plans })), {
          addLabel: L('إضافة باقة جديدة', 'Add new plan'),
          allowDelete: true,
          newItem: (order) => ({
            id: uid('plan'),
            name_en: 'New plan',
            name_ar: 'باقة جديدة',
            price: 0,
            currency: 'USD',
            interval: 'month',
            features_en: [],
            features_ar: [],
            enabled: true,
            locked: false,
            order,
          }),
          fields: [
            { key: 'name_en', label: 'Name EN', dir: 'ltr' },
            { key: 'name_ar', label: 'Name AR', dir: 'rtl' },
            { key: 'price', label: L('السعر', 'Price'), type: 'number', dir: 'ltr' },
            { key: 'currency', label: L('العملة', 'Currency'), dir: 'ltr' },
            { key: 'interval', label: L('الفترة', 'Interval'), dir: 'ltr' },
          ],
        })}
        <div className="space-y-2">
          {(cms.plans || []).map((p, idx) => (
            <ToggleRow
              key={p.id}
              label={`${lang === 'ar' ? p.name_ar : p.name_en} — ${L('مفعّلة', 'Enabled')}`}
              checked={p.enabled}
              disabled={!isSuperAdmin}
              onChange={(v) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  plans: c.plans.map((x, i) =>
                    i === idx ? { ...x, enabled: v } : x,
                  ),
                }));
              }}
            />
          ))}
        </div>
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('plans')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderAccounts = () => (
    <div className="space-y-4">
      <SectionCard
        title={L('أنواع الحسابات', 'Account Types')}
        subtitle={L(
          'لا يمكن حذف الأنواع الأساسية. تحكم بالتسجيل والموافقة.',
          'Core types cannot be deleted. Control signup and approval.',
        )}
      >
        {Object.values(cms.account_types || {}).map((at) => (
          <div key={at.id} className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">
                {lang === 'ar' ? at.name_ar : at.name_en}
              </p>
              {at.locked && (
                <span className="text-[10px] text-muted-foreground">
                  {L('أساسي — محمي', 'Core — protected')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Name EN</Label>
                <Input
                  value={at.name_en || ''}
                  dir="ltr"
                  className="min-h-[40px]"
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    pushUndo();
                    setCms((c) => ({
                      ...c,
                      account_types: {
                        ...c.account_types,
                        [at.id]: { ...at, name_en: e.target.value },
                      },
                    }));
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Name AR</Label>
                <Input
                  value={at.name_ar || ''}
                  className="min-h-[40px]"
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    pushUndo();
                    setCms((c) => ({
                      ...c,
                      account_types: {
                        ...c.account_types,
                        [at.id]: { ...at, name_ar: e.target.value },
                      },
                    }));
                  }}
                />
              </div>
            </div>
            <ToggleRow
              label={L('السماح بالتسجيل', 'Allow signup')}
              checked={at.signup_enabled}
              disabled={!isSuperAdmin}
              onChange={(v) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  account_types: {
                    ...c.account_types,
                    [at.id]: { ...at, signup_enabled: v },
                  },
                }));
              }}
            />
            <ToggleRow
              label={L('يتطلب موافقة الإدارة', 'Requires admin approval')}
              checked={at.approval_required}
              disabled={!isSuperAdmin}
              onChange={(v) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  account_types: {
                    ...c.account_types,
                    [at.id]: { ...at, approval_required: v },
                  },
                }));
              }}
            />
          </div>
        ))}
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('accounts')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderForms = () => (
    <div className="space-y-4">
      {Object.entries(cms.forms || {}).map(([formKey, fields]) => (
        <SectionCard
          key={formKey}
          title={`${L('نموذج', 'Form')}: ${formKey}`}
          subtitle={L(
            'الحقول الأساسية محمية من الحذف',
            'Core fields are protected from deletion',
          )}
        >
          {renderListEditor(
            fields || [],
            (list) =>
              setCms((c) => ({
                ...c,
                forms: { ...c.forms, [formKey]: list },
              })),
            {
              addLabel: L('إضافة حقل', 'Add field'),
              newItem: (order) => ({
                id: uid('field'),
                key: `custom_${order}`,
                label_en: 'New field',
                label_ar: 'حقل جديد',
                placeholder_en: '',
                placeholder_ar: '',
                required: false,
                visible: true,
                order,
                locked: false,
              }),
              fields: [
                { key: 'label_en', label: 'Label EN', dir: 'ltr' },
                { key: 'label_ar', label: 'Label AR', dir: 'rtl' },
                { key: 'placeholder_en', label: 'Placeholder EN', dir: 'ltr' },
                { key: 'placeholder_ar', label: 'Placeholder AR', dir: 'rtl' },
                { key: 'key', label: 'Key', dir: 'ltr', lockCore: true },
              ],
            },
          )}
          <div className="space-y-2 mt-2">
            {(fields || []).map((f, idx) => (
              <div key={f.id} className="flex flex-wrap gap-2">
                <ToggleRow
                  label={`${f.key} — ${L('إلزامي', 'Required')}`}
                  checked={f.required}
                  disabled={!isSuperAdmin || f.locked}
                  onChange={(v) => {
                    pushUndo();
                    setCms((c) => ({
                      ...c,
                      forms: {
                        ...c.forms,
                        [formKey]: c.forms[formKey].map((x, i) =>
                          i === idx ? { ...x, required: v } : x,
                        ),
                      },
                    }));
                  }}
                />
              </div>
            ))}
          </div>
        </SectionCard>
      ))}
      <SaveBar
        saving={saving}
        onSave={() => saveSection('forms')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  // NOTE (unified country/phone/language cleanup): this tab used to contain
  // its OWN "Languages" list editor, "Countries (disable)" checkbox list and
  // "Custom cities" textarea — all three wrote to `cms.geo.*` fields that
  // NO other code in the entire site ever reads. They looked functional but
  // had zero real effect (a classic disconnected-Admin-control bug). The
  // real, live systems are: `platform_countries`/`platform_cities`
  // (PocketBase collections, edited in Control Center → "Countries &
  // Cities", consumed everywhere via useGeoData()/CountryField/PhoneField),
  // and the full 80-language UI catalog in `lib/i18n/languages.js`
  // (not meant to be admin-edited — it's a fixed list). Rather than keep a
  // dead duplicate control here, this tab now only keeps the ONE field that
  // is genuinely read elsewhere (`brand.default_language`, consumed by
  // public-seo.pb.js) and points to the real place to manage countries/cities.
  const renderGeo = () => (
    <div className="space-y-4">
      <SectionCard title={L('اللغة الافتراضية', 'Default Language')}>
        <div className="space-y-2">
          <Label>{t('default_language')}</Label>
          <Select
            value={brand.default_language}
            onValueChange={(v) => setBrandField('default_language', v)}
            disabled={!isSuperAdmin}
          >
            <SelectTrigger className="min-h-[44px] max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {L(
              'يُستخدم كلغة افتراضية لمحتوى الـSEO العام للموقع.',
              'Used as the default language for the site’s public SEO content.',
            )}
          </p>
        </div>
      </SectionCard>
      <SectionCard
        title={L('الدول والمدن وأكواد الهاتف', 'Countries, Cities & Phone Codes')}
        subtitle={L(
          'مصدر موحّد واحد لكل الموقع — لا يوجد قسم منفصل هنا بعد الآن.',
          'One unified source for the whole site — there is no separate editor here anymore.',
        )}
      >
        <div className="rounded-lg border border-dashed p-4 space-y-2 text-sm">
          <p>
            {L(
              'إدارة الدول والمدن وأكواد الاتصال أصبحت في مكان واحد فقط: قسم "الدول والمدن" في القائمة الرئيسية للوحة التحكم. أي تعديل هناك (إضافة/تعطيل/تعديل اسم دولة، إضافة مدينة) ينعكس فورًا في كل مكان بالموقع (نموذج العقار، الهاتف، المسوقين، إلخ) لأن كل هذه الأماكن تقرأ من نفس المصدر مباشرة.',
              'Managing countries, cities and calling codes now lives in exactly one place: the "Countries & Cities" section in the main admin menu. Any change made there (add/disable/rename a country, add a city) reflects immediately everywhere on the site (property form, phone fields, marketing tools, etc.) because all of them read from that same live source.',
            )}
          </p>
          <p className="text-muted-foreground">
            {L(
              'تم إزالة قوائم اللغات وتعطيل الدول والمدن المخصصة التي كانت هنا سابقًا لأنها كانت غير مرتبطة بأي وظيفة حقيقية في الموقع (لم تكن تُقرأ من أي مكان).',
              'The language list, country-disable checkboxes and custom-cities editor that used to live here were removed because they were not wired to any real function on the site (nothing ever read them).',
            )}
          </p>
        </div>
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('geo')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderSpecs = () => (
    <div className="space-y-4">
      <SectionCard title={L('التخصصات', 'Specializations')}>
        {renderListEditor(
          cms.specializations || [],
          (list) => setCms((c) => ({ ...c, specializations: list })),
          {
            addLabel: L('إضافة تخصص', 'Add specialization'),
            newItem: () => ({
              id: uid('spec'),
              en: '',
              ar: '',
              locked: false,
            }),
            fields: [
              { key: 'en', label: 'EN', dir: 'ltr' },
              { key: 'ar', label: 'AR', dir: 'rtl' },
              { key: 'id', label: 'ID', dir: 'ltr', lockCore: true },
            ],
          },
        )}
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('specs')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-4">
      <SectionCard title={L('الإشعارات', 'Notifications')}>
        {Object.entries(cms.notifications || {}).map(([key, n]) => (
          <div key={key} className="rounded-lg border p-3 space-y-2">
            <ToggleRow
              label={key}
              checked={n.enabled}
              disabled={!isSuperAdmin}
              onChange={(v) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  notifications: {
                    ...c.notifications,
                    [key]: { ...n, enabled: v },
                  },
                }));
              }}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {['title_en', 'title_ar', 'body_en', 'body_ar'].map((f) => (
                <div key={f} className="space-y-1">
                  <Label className="text-xs">{f}</Label>
                  <Input
                    value={n[f] || ''}
                    dir={f.endsWith('_ar') ? 'rtl' : 'ltr'}
                    className="min-h-[40px]"
                    disabled={!isSuperAdmin}
                    onChange={(e) => {
                      pushUndo();
                      setCms((c) => ({
                        ...c,
                        notifications: {
                          ...c.notifications,
                          [key]: { ...n, [f]: e.target.value },
                        },
                      }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('notifications')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderApproval = () => (
    <div className="space-y-4">
      <SectionCard
        title={L('نظام المراجعة', 'Approval System')}
        subtitle={L('تشغيل/إيقاف مسارات الموافقة', 'Toggle approval workflows')}
      >
        {[
          ['brokers', L('مراجعة الوسطاء', 'Broker review')],
          ['companies', L('مراجعة الشركات', 'Company review')],
          ['properties', L('مراجعة العقارات', 'Property review')],
          ['pending_updates', L('مراجعة التحديثات الحساسة', 'Sensitive updates review')],
        ].map(([k, label]) => (
          <ToggleRow
            key={k}
            label={label}
            checked={cms.approval?.[k]}
            disabled={!isSuperAdmin}
            onChange={(v) => {
              pushUndo();
              setCms((c) => ({
                ...c,
                approval: { ...c.approval, [k]: v },
              }));
            }}
          />
        ))}
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('approval')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderFeatures = () => (
    <div className="space-y-4">
      <SectionCard title={L('إدارة المميزات', 'Feature Management')}>
        {Object.entries(cms.features || {}).map(([key, f]) => (
          <ToggleRow
            key={key}
            label={lang === 'ar' ? f.name_ar : f.name_en}
            hint={key}
            checked={f.enabled}
            disabled={!isSuperAdmin}
            onChange={(v) => {
              pushUndo();
              setCms((c) => ({
                ...c,
                features: {
                  ...c.features,
                  [key]: { ...f, enabled: v },
                },
              }));
            }}
          />
        ))}
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('features')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderMaintenance = () => (
    <div className="space-y-4">
      <SectionCard title={L('الصيانة', 'Maintenance')}>
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {L(
            'تفعيل وضع الصيانة يمنع المستخدمين غير المدير من استخدام المنصة.',
            'Enabling maintenance blocks non-admin users from using the platform.',
          )}
        </div>
        <ToggleRow
          label={L('وضع الصيانة', 'Maintenance mode')}
          checked={cms.maintenance?.enabled}
          disabled={!isSuperAdmin}
          onChange={(v) => {
            pushUndo();
            setCms((c) => ({
              ...c,
              maintenance: { ...c.maintenance, enabled: v },
            }));
          }}
        />
        <div className="space-y-2">
          <Label>Message EN</Label>
          <Textarea
            value={cms.maintenance?.message_en || ''}
            dir="ltr"
            disabled={!isSuperAdmin}
            onChange={(e) => {
              pushUndo();
              setCms((c) => ({
                ...c,
                maintenance: { ...c.maintenance, message_en: e.target.value },
              }));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Message AR</Label>
          <Textarea
            value={cms.maintenance?.message_ar || ''}
            disabled={!isSuperAdmin}
            onChange={(e) => {
              pushUndo();
              setCms((c) => ({
                ...c,
                maintenance: { ...c.maintenance, message_ar: e.target.value },
              }));
            }}
          />
        </div>
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('maintenance')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderColors = () => (
    <div className="space-y-4">
      <SectionCard title={t('settings_colors')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ColorRow
            label={t('primary_color')}
            value={brand.primary_color}
            onChange={(v) => setBrandField('primary_color', v)}
            disabled={!isSuperAdmin}
          />
          <ColorRow
            label={t('accent_color')}
            value={brand.accent_color}
            onChange={(v) => setBrandField('accent_color', v)}
            disabled={!isSuperAdmin}
          />
          <ColorRow
            label={t('email_header_color')}
            value={brand.email_header_color}
            onChange={(v) => setBrandField('email_header_color', v)}
            disabled={!isSuperAdmin}
          />
        </div>
      </SectionCard>
      <SectionCard title={t('fonts_section')} subtitle={t('font_hint')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('font_family')}</Label>
            <Input
              value={brand.font_family}
              onChange={(e) => setBrandField('font_family', e.target.value)}
              dir="ltr"
              className="min-h-[44px]"
              disabled={!isSuperAdmin}
              placeholder="Inter"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('font_arabic')}</Label>
            <Input
              value={brand.font_arabic}
              onChange={(e) => setBrandField('font_arabic', e.target.value)}
              dir="ltr"
              className="min-h-[44px]"
              disabled={!isSuperAdmin}
              placeholder="Cairo"
            />
          </div>
        </div>
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('colors')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-4">
      <SectionCard title={t('settings_security')}>
        <div className="space-y-2 max-w-xs">
          <Label>{t('max_devices')}</Label>
          <Input
            type="number"
            min="1"
            max="20"
            value={brand.max_devices}
            onChange={(e) => setBrandField('max_devices', e.target.value)}
            dir="ltr"
            className="min-h-[44px]"
            disabled={!isSuperAdmin}
          />
        </div>
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('security')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const restoreAuditEntry = async (entry) => {
    if (!entry?.old_value || !isSuperAdmin) return;
    if (
      !window.confirm(
        L(
          'استعادة القيم القديمة من هذا السجل؟',
          'Restore previous values from this audit entry?',
        ),
      )
    ) {
      return;
    }
    try {
      const old = entry.old_value;
      if (old.brand) setBrand(old.brand);
      if (old.cms) setCms(mergeCms(old.cms));
      flash(L('تم تحميل القيم القديمة — احفظ القسم لتطبيقها', 'Old values loaded — save a section to apply'));
    } catch {
      setError(t('something_wrong'));
    }
  };

  const renderAudit = () => (
    <div className="space-y-4">
      <SectionCard
        title={L('سجل التعديلات', 'Audit Log')}
        subtitle={L(
          'ما تغيّر، القيم القديمة والجديدة، التاريخ، والأدمن',
          'What changed, old/new values, date, and admin',
        )}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[36px]"
            onClick={loadAudit}
          >
            {t('retry')}
          </Button>
        }
      >
        {auditLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{t('loading')}</p>
        ) : audit.length === 0 ? (
          <EmptyState
            message={L('لا توجد تعديلات مسجّلة بعد', 'No audit entries yet')}
            icon={Activity}
          />
        ) : (
          <div className="space-y-2">
            {audit.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border p-3 text-sm space-y-1"
              >
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <p className="font-semibold">
                    {a.section} · {a.action}
                  </p>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {formatDate(a.created, lang)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.admin_email || a.expand?.admin?.email || '—'}
                  {a.summary ? ` · ${a.summary}` : ''}
                </p>
                {a.old_value && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-[36px] mt-1"
                    onClick={() => restoreAuditEntry(a)}
                    disabled={!isSuperAdmin}
                  >
                    <Undo2 size={14} className="me-1" />
                    {L('تحميل القيم القديمة', 'Load old values')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );

  const renderSupport = () => (
    <div className="space-y-4">
      <SectionCard
        title={L('إعدادات الدعم', 'Support Settings')}
        subtitle={L(
          'تحكم باسم الدعم وعنوان النموذج ورسالة النجاح وبريد الاستقبال في الواجهات الخارجية. بريد الاستقبال لا يظهر للمستخدمين أبدًا.',
          'Control the support name, form title, success message and receiving email for external pages. The receiving email is never shown to users.',
        )}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{L('اسم الدعم (إنجليزي)', 'Support name (EN)')}</Label>
            <Input
              value={cms.support_settings?.support_name_en || ''}
              dir="ltr"
              className="min-h-[40px]"
              disabled={!isSuperAdmin}
              onChange={(e) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  support_settings: {
                    ...c.support_settings,
                    support_name_en: e.target.value,
                  },
                }));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{L('اسم الدعم (عربي)', 'Support name (AR)')}</Label>
            <Input
              value={cms.support_settings?.support_name_ar || ''}
              dir="rtl"
              className="min-h-[40px]"
              disabled={!isSuperAdmin}
              onChange={(e) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  support_settings: {
                    ...c.support_settings,
                    support_name_ar: e.target.value,
                  },
                }));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{L('عنوان النموذج (إنجليزي)', 'Form title (EN)')}</Label>
            <Input
              value={cms.support_settings?.form_title_en || ''}
              dir="ltr"
              className="min-h-[40px]"
              disabled={!isSuperAdmin}
              onChange={(e) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  support_settings: {
                    ...c.support_settings,
                    form_title_en: e.target.value,
                  },
                }));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{L('عنوان النموذج (عربي)', 'Form title (AR)')}</Label>
            <Input
              value={cms.support_settings?.form_title_ar || ''}
              dir="rtl"
              className="min-h-[40px]"
              disabled={!isSuperAdmin}
              onChange={(e) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  support_settings: {
                    ...c.support_settings,
                    form_title_ar: e.target.value,
                  },
                }));
              }}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">{L('رسالة النجاح (إنجليزي)', 'Success message (EN)')}</Label>
            <Textarea
              value={cms.support_settings?.success_message_en || ''}
              dir="ltr"
              rows={2}
              disabled={!isSuperAdmin}
              onChange={(e) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  support_settings: {
                    ...c.support_settings,
                    success_message_en: e.target.value,
                  },
                }));
              }}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">{L('رسالة النجاح (عربي)', 'Success message (AR)')}</Label>
            <Textarea
              value={cms.support_settings?.success_message_ar || ''}
              dir="rtl"
              rows={2}
              disabled={!isSuperAdmin}
              onChange={(e) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  support_settings: {
                    ...c.support_settings,
                    success_message_ar: e.target.value,
                  },
                }));
              }}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">{L('بريد استقبال الدعم', 'Support receiving email')}</Label>
            <p className="text-[11px] text-muted-foreground">
              {L('داخلي — لا يظهر للمستخدمين أبدًا.', 'Internal — never shown to users.')}
            </p>
            <Input
              value={cms.support_settings?.receiving_email || ''}
              dir="ltr"
              type="email"
              className="min-h-[40px]"
              disabled={!isSuperAdmin}
              placeholder="support@estatefollow.com"
              onChange={(e) => {
                pushUndo();
                setCms((c) => ({
                  ...c,
                  support_settings: {
                    ...c.support_settings,
                    receiving_email: e.target.value,
                  },
                }));
              }}
            />
          </div>
        </div>
      </SectionCard>
      <SaveBar
        saving={saving}
        onSave={() => saveSection('support')}
        onUndo={undo}
        canUndo={undoStack.current.length > 0}
        disabled={!isSuperAdmin}
      />
    </div>
  );

  const renderMarketing = () => {
    const mk = cms.marketing_settings || {};
    const setMk = (patch) => {
      pushUndo();
      setCms((c) => ({ ...c, marketing_settings: { ...c.marketing_settings, ...patch } }));
    };

    const resetSenderForm = () => {
      setSenderForm({ email: '', name: '', active: true, is_default: false });
      setSenderEditing(null);
    };

    const saveSender = async () => {
      const email = String(senderForm.email || '').trim();
      if (!email) { setError(L('البريد مطلوب.', 'Email is required.')); return; }
      setSenderSaving(true);
      setError('');
      try {
        const payload = {
          email,
          name: String(senderForm.name || '').trim(),
          active: !!senderForm.active,
          is_default: !!senderForm.is_default,
          owner: user.id,
        };
        if (senderEditing) {
          await pb.collection('marketing_sender_emails').update(senderEditing, payload, { requestKey: `mkt-snd-up-${senderEditing}` });
          flash(L('تم تحديث البريد.', 'Sender email updated.'));
        } else {
          await pb.collection('marketing_sender_emails').create(payload, { requestKey: `mkt-snd-new-${Date.now()}` });
          flash(L('تمت إضافة البريد.', 'Sender email added.'));
        }
        resetSenderForm();
        loadSenderEmails();
      } catch (err) {
        setError(String(err?.message || L('تعذر الحفظ.', 'Failed to save.')));
      } finally { setSenderSaving(false); }
    };

    const deleteSender = async (s) => {
      if (!window.confirm(L('حذف هذا البريد؟', 'Delete this sender email?'))) return;
      try {
        await pb.collection('marketing_sender_emails').delete(s.id, { requestKey: `mkt-snd-del-${s.id}` });
        flash(L('تم الحذف.', 'Deleted.'));
        loadSenderEmails();
      } catch (err) { setError(String(err?.message || L('تعذر الحذف.', 'Failed.'))); }
    };

    const toggleSender = async (s) => {
      try {
        await pb.collection('marketing_sender_emails').update(s.id, { active: !s.active }, { requestKey: `mkt-snd-tg-${s.id}` });
        loadSenderEmails();
      } catch (err) { setError(String(err?.message || L('تعذر التحديث.', 'Failed.'))); }
    };

    const setDefaultSender = async (s) => {
      try {
        // unset other defaults then set this one
        await Promise.all(senderEmails.filter((x) => x.is_default && x.id !== s.id).map((x) =>
          pb.collection('marketing_sender_emails').update(x.id, { is_default: false }, { requestKey: `mkt-snd-ud-${x.id}` })
        ));
        await pb.collection('marketing_sender_emails').update(s.id, { is_default: true }, { requestKey: `mkt-snd-sd-${s.id}` });
        flash(L('تم تعيين البريد الافتراضي.', 'Default sender set.'));
        loadSenderEmails();
      } catch (err) { setError(String(err?.message || L('تعذر التحديث.', 'Failed.'))); }
    };

    return (
      <div className="space-y-4">
        <SectionCard
          title={L('إعدادات التسويق', 'Marketing Settings')}
          subtitle={L(
            'تحكم بتفعيل التسويق وحجم الدفعة ومزود البريد والتوقيع الافتراضي. تُدار بريد المرسل من القسم أدناه.',
            'Control marketing feature, batch size, email provider and default signature. Sender emails are managed below.',
          )}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <ToggleRow
                label={L('تفعيل التسويق', 'Marketing Enabled')}
                hint={L('إيقاف قسم التسويق بالكامل عن المديرين.', 'Turn the marketing section off for admins.')}
                checked={!!mk.feature_enabled}
                disabled={!isSuperAdmin}
                onChange={(v) => setMk({ feature_enabled: v })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('حجم الدفعة', 'Batch Size')}</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={String(mk.batch_size ?? 50)}
                disabled={!isSuperAdmin}
                className="min-h-[40px]"
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setMk({ batch_size: isNaN(n) ? 50 : Math.min(500, Math.max(1, n)) });
                }}
              />
              <p className="text-[11px] text-muted-foreground">{L('عدد الرسائل لكل دفعة في الإرسال الخلفي.', 'Emails per batch in background sending.')}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('مزود البريد', 'Email Provider')}</Label>
              <Input
                value={L('منصة إستيت فولو (افتراضي)', 'Estate Follow platform (default)')}
                disabled
                className="min-h-[40px]"
              />
              <p className="text-[11px] text-muted-foreground">{L('يُرسل عبر مزود البريد الافتراضي للمنصة.', 'Sent via the platform default mail provider.')}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('التوقيع الافتراضي (إنجليزي)', 'Default Signature (EN)')}</Label>
              <Textarea
                value={mk.signature_default_en || ''}
                dir="ltr"
                rows={2}
                disabled={!isSuperAdmin}
                onChange={(e) => setMk({ signature_default_en: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('التوقيع الافتراضي (عربي)', 'Default Signature (AR)')}</Label>
              <Textarea
                value={mk.signature_default_ar || ''}
                dir="rtl"
                rows={2}
                disabled={!isSuperAdmin}
                onChange={(e) => setMk({ signature_default_ar: e.target.value })}
              />
            </div>
          </div>
        </SectionCard>
        <SaveBar
          saving={saving}
          onSave={() => saveSection('marketing')}
          onUndo={undo}
          canUndo={undoStack.current.length > 0}
          disabled={!isSuperAdmin}
        />

        <SectionCard
          title={L('إعداد مزود البريد', 'Email Provider Configuration')}
          subtitle={L(
            'حالة المزود والاتصال وWebhook وتوثيق المرسل وتتبع الفتح والنقر. لا تُعرض مفاتيح API هنا.',
            'Provider status, connection, webhook, sender verification, and open/click tracking. API keys are never shown here.',
          )}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{L('حالة المزود', 'Provider Status')}</Label>
              <Select
                value={mk.provider_status || 'platform'}
                disabled={!isSuperAdmin}
                onValueChange={(v) => setMk({ provider_status: v, email_provider: v })}
              >
                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">{L('منصة إستيت فولو (افتراضي)', 'Estate Follow platform (default)')}</SelectItem>
                  <SelectItem value="custom">{L('مزود مخصص (Webhook)', 'Custom provider (Webhook)')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('حالة الاتصال', 'Connection Status')}</Label>
              <Select
                value={mk.connection_status || 'connected'}
                disabled={!isSuperAdmin}
                onValueChange={(v) => setMk({ connection_status: v })}
              >
                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="connected">{L('متصل', 'Connected')}</SelectItem>
                  <SelectItem value="disconnected">{L('غير متصل', 'Disconnected')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('حالة Webhook', 'Webhook Status')}</Label>
              <Select
                value={mk.webhook_status || 'not_configured'}
                disabled={!isSuperAdmin}
                onValueChange={(v) => setMk({ webhook_status: v })}
              >
                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_configured">{L('غير مُعد', 'Not configured')}</SelectItem>
                  <SelectItem value="configured">{L('مُعد', 'Configured')}</SelectItem>
                  <SelectItem value="active">{L('فعّال', 'Active')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('توثيق المرسل', 'Sender Verification')}</Label>
              <Select
                value={mk.sender_verification || 'verified'}
                disabled={!isSuperAdmin}
                onValueChange={(v) => setMk({ sender_verification: v })}
              >
                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="verified">{L('موثّق', 'Verified')}</SelectItem>
                  <SelectItem value="pending">{L('قيد التوثيق', 'Pending')}</SelectItem>
                  <SelectItem value="unverified">{L('غير موثّق', 'Unverified')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            <ToggleRow
              label={L('تتبع الفتح (Open Tracking)', 'Open Tracking')}
              checked={!!mk.tracking_opens}
              disabled={!isSuperAdmin}
              onChange={(v) => setMk({ tracking_opens: v })}
            />
            <ToggleRow
              label={L('تتبع النقر (Click Tracking)', 'Click Tracking')}
              checked={!!mk.tracking_clicks}
              disabled={!isSuperAdmin}
              onChange={(v) => setMk({ tracking_clicks: v })}
            />
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 mt-2">
            {L(
              'مزود المنصة الافتراضي يدعم تسجيل الفتح والنقر عبر بكسل التتبع وإعادة التوجيه. أما الارتداد والأجهزة وبرامج البريد والدول من التتبع فتتطلب مزوداً مخصصاً مع Webhook.',
              'The default platform provider supports open & click tracking via tracking pixel and redirect. Bounces, devices, email clients, and countries from tracking require a custom provider with Webhook.',
            )}
          </div>
        </SectionCard>
        <SaveBar
          saving={saving}
          onSave={() => saveSection('marketing')}
          onUndo={undo}
          canUndo={undoStack.current.length > 0}
          disabled={!isSuperAdmin}
        />

        <SectionCard
          title={L('إدارة بريد المرسل', 'Sender Emails Management')}
          subtitle={L(
            'البريدات التي يُرسل منها. اختر بريداً افتراضياً ليظهر مختاراً في نموذج الحملة.',
            'Emails campaigns are sent from. Set a default to pre-select it in the campaign form.',
          )}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border bg-accent/20 p-3">
            <div className="space-y-1">
              <Label className="text-xs">{L('البريد', 'Email')} *</Label>
              <Input
                type="email"
                dir="ltr"
                value={senderForm.email}
                disabled={!isSuperAdmin || senderSaving}
                className="min-h-[40px]"
                onChange={(e) => setSenderForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{L('الاسم المعروض', 'Display Name')}</Label>
              <Input
                value={senderForm.name}
                disabled={!isSuperAdmin || senderSaving}
                className="min-h-[40px]"
                onChange={(e) => setSenderForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!senderForm.active}
                  disabled={!isSuperAdmin || senderSaving}
                  onChange={(e) => setSenderForm((f) => ({ ...f, active: e.target.checked }))}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                {L('مفعّل', 'Active')}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!senderForm.is_default}
                  disabled={!isSuperAdmin || senderSaving}
                  onChange={(e) => setSenderForm((f) => ({ ...f, is_default: e.target.checked }))}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                {L('افتراضي', 'Default')}
              </label>
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <Button type="button" size="sm" onClick={saveSender} disabled={!isSuperAdmin || senderSaving} className="min-h-[40px]">
                <Save size={14} className="me-1" />
                {senderSaving ? L('جارٍ الحفظ…', 'Saving…') : senderEditing ? L('تحديث', 'Update') : L('إضافة', 'Add')}
              </Button>
              {senderEditing && (
                <Button type="button" size="sm" variant="outline" onClick={resetSenderForm} className="min-h-[40px]">{L('إلغاء', 'Cancel')}</Button>
              )}
            </div>
          </div>

          {senderLoading ? (
            <p className="text-sm text-muted-foreground">{L('جارٍ التحميل…', 'Loading…')}</p>
          ) : senderEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground">{L('لا توجد بريدات مرسل بعد.', 'No sender emails yet.')}</p>
          ) : (
            <div className="space-y-2">
              {senderEmails.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-medium truncate" dir="ltr">{s.email}</p>
                    {s.name && <p className="text-xs text-muted-foreground truncate">{s.name}</p>}
                  </div>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', s.active ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200')}>
                    {s.active ? L('مفعّل', 'Active') : L('معطّل', 'Inactive')}
                  </span>
                  {s.is_default && <span className="rounded-full border bg-primary text-primary-foreground px-2 py-0.5 text-[11px] font-semibold">{L('افتراضي', 'Default')}</span>}
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => { setSenderEditing(s.id); setSenderForm({ email: s.email, name: s.name || '', active: !!s.active, is_default: !!s.is_default }); }} className="min-h-[34px]">{L('تعديل', 'Edit')}</Button>
                    <Button size="sm" variant="outline" onClick={() => toggleSender(s)} className="min-h-[34px]">{s.active ? L('تعطيل', 'Disable') : L('تفعيل', 'Enable')}</Button>
                    {!s.is_default && <Button size="sm" variant="outline" onClick={() => setDefaultSender(s)} className="min-h-[34px]">{L('افتراضي', 'Set Default')}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => deleteSender(s)} className="min-h-[34px] text-destructive"><Trash2 size={13} /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    );
  };

  const sectionBody = {
    branding: renderBranding,
    slogans: renderSlogans,
    pages: renderPages,
    cards: renderCards,
    sidebar: renderSidebar,
    plans: renderPlans,
    accounts: renderAccounts,
    forms: renderForms,
    geo: renderGeo,
    specs: renderSpecs,
    notifications: renderNotifications,
    approval: renderApproval,
    features: renderFeatures,
    maintenance: renderMaintenance,
    colors: renderColors,
    security: renderSecurity,
    support: renderSupport,
    marketing: renderMarketing,
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
            <Settings2 size={18} />
          </span>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {L('مركز تحكم المنصة', 'CMS Control Center')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {L(
                'تحكم كامل بهوية المنصة والصفحات والقوائم والمميزات',
                'Full control over branding, pages, menus and features',
              )}
            </p>
          </div>
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {t('settings_readonly')}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      <div className="relative">
        <Search
          size={16}
          className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={L('ابحث في أقسام الإعدادات…', 'Search settings sections…')}
          className="ps-9 min-h-[44px]"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <nav className="lg:w-56 shrink-0 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          {filteredSections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-sm font-medium text-start whitespace-nowrap transition-colors min-h-[40px]',
                active === s.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {lang === 'ar' ? s.ar : s.en}
            </button>
          ))}
          {filteredSections.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">
              {L('لا نتائج', 'No results')}
            </p>
          )}
        </nav>
        <div className="flex-1 min-w-0">
          {(sectionBody[active] || sectionBody.branding)()}
        </div>
      </div>
    </div>
  );
};

export default PlatformSettingsPanel;
