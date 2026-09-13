import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';

const DEFAULT_PORTAL = {
  name_en: 'Admin & Staff Portal',
  name_ar: 'بوابة الإدارة والموظفين',
  slogan_en:
    'Administration & staff portal — secure access for authorized personnel only.',
  slogan_ar: 'بوابة الإدارة والموظفين — وصول آمن للمخوّلين فقط.',
  logo_url: '',
  background_url: '',
  session_timeout: 30,
  show_remember: true,
  show_forgot: true,
};

const AdminPortalSettings = () => {
  const { t, lang } = useLanguage();
  const [record, setRecord] = useState(null);
  const [portal, setPortal] = useState(DEFAULT_PORTAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let rec;
      try {
        rec = await pb.collection('platform_settings').getFirstListItem('');
      } catch (_) {
        rec = await pb.collection('platform_settings').create({ cms: {} });
      }
      setRecord(rec);
      const cms = rec.cms || {};
      setPortal({ ...DEFAULT_PORTAL, ...(cms.admin_portal || {}) });
    } catch {
      setError(t('something_wrong'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!record) return;
    setSaving(true);
    setError('');
    try {
      const cms = { ...(record.cms || {}), admin_portal: portal };
      const saved = await pb.collection('platform_settings').update(
        record.id,
        { cms },
        { requestKey: `cms-admin-portal-${Date.now()}` },
      );
      setRecord(saved);
      window.dispatchEvent(
        new CustomEvent('estatefollow-cms-updated', {
          detail: { brand: saved, cms },
        }),
      );
      flash(t('admin_portal_settings_saved'));
    } catch {
      setError(t('something_wrong'));
    } finally {
      setSaving(false);
    }
  };

  const set = (key, value) => setPortal((p) => ({ ...p, [key]: value }));

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2">
        <Loader2 size={16} className="animate-spin" />
        {t('loading')}
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck size={16} />
          </span>
          <h2 className="text-2xl font-bold tracking-tight">
            {t('admin_portal_settings_title')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('admin_portal_settings_subtitle')}
        </p>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <form onSubmit={save} className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="portal-name-en">{t('admin_portal_name_en')}</Label>
            <Input
              id="portal-name-en"
              dir="ltr"
              value={portal.name_en}
              onChange={(e) => set('name_en', e.target.value)}
              className="min-h-[44px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-name-ar">{t('admin_portal_name_ar')}</Label>
            <Input
              id="portal-name-ar"
              dir="rtl"
              value={portal.name_ar}
              onChange={(e) => set('name_ar', e.target.value)}
              className="min-h-[44px]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="portal-slogan-en">{t('admin_portal_slogan_en')}</Label>
          <Textarea
            id="portal-slogan-en"
            dir="ltr"
            rows={2}
            value={portal.slogan_en}
            onChange={(e) => set('slogan_en', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="portal-slogan-ar">{t('admin_portal_slogan_ar')}</Label>
          <Textarea
            id="portal-slogan-ar"
            dir="rtl"
            rows={2}
            value={portal.slogan_ar}
            onChange={(e) => set('slogan_ar', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="portal-logo">{t('admin_portal_logo_url')}</Label>
          <Input
            id="portal-logo"
            dir="ltr"
            value={portal.logo_url}
            onChange={(e) => set('logo_url', e.target.value)}
            placeholder="https://… (PNG/SVG)"
            className="min-h-[44px]"
          />
          <p className="text-xs text-muted-foreground">{t('admin_portal_logo_hint')}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="portal-bg">{t('admin_portal_bg_url')}</Label>
          <Input
            id="portal-bg"
            dir="ltr"
            value={portal.background_url}
            onChange={(e) => set('background_url', e.target.value)}
            placeholder="https://… (optional background image)"
            className="min-h-[44px]"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="portal-timeout">{t('admin_portal_session_timeout')}</Label>
            <Input
              id="portal-timeout"
              type="number"
              min={5}
              max={1440}
              value={portal.session_timeout}
              onChange={(e) => set('session_timeout', Number(e.target.value) || 30)}
              className="min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">
              {t('admin_portal_session_timeout_hint')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!portal.show_remember}
              onChange={(e) => set('show_remember', e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {t('admin_portal_show_remember')}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!portal.show_forgot}
              onChange={(e) => set('show_forgot', e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {t('admin_portal_show_forgot')}
          </label>
        </div>

        <Button type="submit" className="min-h-[44px]" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {t('loading')}
            </>
          ) : (
            t('save_settings')
          )}
        </Button>
      </form>
    </div>
  );
};

export default AdminPortalSettings;
