import React, { useEffect, useRef, useState } from 'react';
import { Building2, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import NationalityField from '@/components/NationalityField';
import { FileViewButton } from '@/components/FileViewButton';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { countryName } from '@/lib/countries';

const emptyForm = () => ({
  name: '',
  country: '',
  licenseNumber: '',
  file: null,
});

/**
 * Optional company branches — each row is an independent brokerage_branches
 * record linked to the same company. Never blocks profile save/review.
 * Optimistic local list updates (no full-section reload after add/edit/delete).
 */
export default function BrokerageBranches({ companyId, owner }) {
  const { t, lang } = useLanguage();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!companyId) {
      setBranches([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    pb.collection('brokerage_branches')
      .getFullList({
        filter: `company = "${companyId}"`,
        sort: 'country,name',
        requestKey: `branches-load-${companyId}`,
      })
      .then((rows) => {
        if (!cancelled) setBranches(rows);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditId(null);
    setError('');
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
    setNotice('');
  };

  const openEdit = (b) => {
    setEditId(b.id);
    setForm({
      name: b.name || '',
      country: b.country || '',
      licenseNumber: b.license_number || '',
      file: null,
    });
    setError('');
    setNotice('');
    setShowForm(true);
  };

  const pickPdf = (e) => {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = '';
    setError('');
    if (!f) return;
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
    if (!isPdf) {
      setError(
        lang === 'ar'
          ? 'ملف الرخصة يجب أن يكون PDF.'
          : 'Branch license must be a PDF.',
      );
      return;
    }
    if (!f.size) {
      setError(lang === 'ar' ? 'الملف فارغ.' : 'File is empty.');
      return;
    }
    setForm((prev) => ({ ...prev, file: f }));
  };

  const addOrUpdate = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inFlightRef.current || saving) return;
    setError('');
    setNotice('');
    if (!companyId) {
      setError(t('broker_complete_profile_first'));
      return;
    }
    if (!form.name.trim()) {
      setError(t('branch_name_required'));
      return;
    }
    if (!form.country) {
      setError(t('branch_country_required'));
      return;
    }
    inFlightRef.current = true;
    setSaving(true);
    const snapshot = { ...form };
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('country', form.country);
      fd.append('license_number', form.licenseNumber.trim());
      if (form.file) fd.append('license_pdf', form.file);

      if (editId) {
        const updated = await pb.collection('brokerage_branches').update(editId, fd, {
          requestKey: `branch-upd-${editId}`,
        });
        setBranches((prev) =>
          prev
            .map((b) => (b.id === editId ? updated : b))
            .slice()
            .sort((a, b) =>
              `${a.country || ''}${a.name || ''}`.localeCompare(
                `${b.country || ''}${b.name || ''}`,
              ),
            ),
        );
        setNotice(t('branch_updated'));
        resetForm();
        setShowForm(true);
      } else {
        fd.append('company', companyId);
        fd.append('owner', owner);
        fd.append('city', '');
        const created = await pb.collection('brokerage_branches').create(fd, {
          requestKey: `branch-create-${companyId}-${Date.now()}`,
        });
        setBranches((prev) => {
          const next = [...prev, created];
          next.sort((a, b) =>
            `${a.country || ''}${a.name || ''}`.localeCompare(
              `${b.country || ''}${b.name || ''}`,
            ),
          );
          return next;
        });
        setNotice(t('branch_saved'));
        // Clear form for next add but keep typed values only on failure.
        resetForm();
        setShowForm(true);
      }
    } catch (err) {
      // Keep form data on failure.
      setForm(snapshot);
      setError(err?.message || t('something_wrong'));
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (inFlightRef.current || deletingId) return;
    setError('');
    setDeletingId(id);
    const prev = branches;
    // Optimistic remove
    setBranches((list) => list.filter((b) => b.id !== id));
    try {
      await pb.collection('brokerage_branches').delete(id, {
        requestKey: `branch-del-${id}`,
      });
      setNotice(t('branch_deleted'));
      if (editId === id) {
        resetForm();
        setShowForm(true);
      }
    } catch (err) {
      setBranches(prev);
      setError(err?.message || t('something_wrong'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-bold">{t('branches_section_title')}</p>
        <p className="text-xs text-muted-foreground">{t('branches_section_hint')}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      ) : branches.length === 0 && !showForm ? (
        <p className="text-xs text-muted-foreground">{t('branch_empty')}</p>
      ) : branches.length > 0 ? (
        <div className="space-y-2">
          {branches.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{b.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[countryName(b.country, lang), b.license_number]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <FileViewButton record={b} filename={b.license_pdf} />
              <button
                type="button"
                onClick={() => openEdit(b)}
                disabled={!!deletingId || saving}
                className="inline-flex items-center justify-center rounded-lg border px-2 py-1.5 text-xs hover:bg-accent min-h-[36px] disabled:opacity-60"
                title={t('edit')}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => remove(b.id)}
                disabled={deletingId === b.id || saving}
                className="inline-flex items-center justify-center rounded-lg border px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 min-h-[36px] disabled:opacity-60"
                title={t('delete')}
              >
                {deletingId === b.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {!showForm && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[44px] w-full sm:w-auto font-semibold"
          onClick={openAdd}
        >
          <Plus size={14} className="me-1" />
          {t('add_branch')}
        </Button>
      )}

      {showForm && (
        <form onSubmit={addOrUpdate} className="space-y-3 rounded-lg border bg-accent/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            {editId ? t('edit_branch') : t('add_branch')}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('branch_name')}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="min-h-[40px]"
              placeholder={t('branch_name')}
              disabled={saving}
            />
          </div>
          <NationalityField
            label={t('country')}
            value={form.country}
            onChange={(v) => setForm((f) => ({ ...f, country: v }))}
            heightClass="min-h-[40px]"
          />
          <div className="space-y-1.5">
            <Label className="text-xs">{t('branch_license_number')}</Label>
            <Input
              value={form.licenseNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, licenseNumber: e.target.value }))
              }
              className="min-h-[40px]"
              placeholder={t('branch_license_number')}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('branch_license_pdf')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium cursor-pointer hover:bg-accent min-h-[40px]">
                <Upload size={15} />
                {form.file?.name ||
                  (editId ? t('replace_file') : t('branch_license_pdf'))}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={pickPdf}
                  disabled={saving}
                />
              </label>
              <FileViewButton file={form.file} />
              {editId && !form.file && (
                <FileViewButton
                  record={branches.find((x) => x.id === editId)}
                  filename={branches.find((x) => x.id === editId)?.license_pdf}
                />
              )}
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {notice && <p className="text-xs text-emerald-700">{notice}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={saving} className="min-h-[40px]">
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} className="me-1" />
              )}
              {editId
                ? t('save')
                : branches.length > 0
                  ? t('add_another_branch')
                  : t('add_branch')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-[40px]"
              disabled={saving}
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}

      {showForm && branches.length > 0 && !editId && (
        <p className="text-[11px] text-muted-foreground">{t('branches_add_more_hint')}</p>
      )}
    </div>
  );
}

/** Read-only branches list for public company profile (name + country). */
export function CompanyBranchesPublic({ companyId }) {
  const { t, lang } = useLanguage();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(!!companyId);

  useEffect(() => {
    if (!companyId) {
      setBranches([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    pb.collection('brokerage_branches')
      .getFullList({
        filter: `company = "${companyId}"`,
        sort: 'country,name',
        requestKey: `branches-public-${companyId}`,
      })
      .then((rows) => {
        if (!cancelled) setBranches(rows || []);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (loading || !branches.length) return null;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <p className="text-sm font-bold flex items-center gap-1.5">
        <Building2 size={15} className="text-primary" />
        {t('branches_section_title')}
      </p>
      <ul className="space-y-2">
        {branches.map((b) => {
          const loc = countryName(b.country, lang);
          return (
            <li
              key={b.id}
              className="flex items-start gap-2 text-sm text-foreground"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span className="min-w-0 break-words">
                <span className="font-semibold">{b.name}</span>
                {loc ? (
                  <span className="text-muted-foreground">
                    {' '}
                    — {loc}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
