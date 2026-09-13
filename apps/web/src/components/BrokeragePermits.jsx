import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, Upload, FileCheck2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { FileViewButton } from '@/components/FileViewButton';

// Additional permits / licenses — optional. Optimistic list updates only.
export default function BrokeragePermits({ targetType, targetId, owner }) {
  const { t } = useLanguage();
  const [permits, setPermits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [replacingId, setReplacingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const replaceInputRef = useRef(null);
  const replaceTargetId = useRef(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!targetId) {
      setPermits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    pb.collection('brokerage_permits')
      .getFullList({
        filter: `target_type = "${targetType}" && target_id = "${targetId}"`,
        sort: 'created',
        requestKey: `permits-load-${targetType}-${targetId}`,
      })
      .then((rows) => {
        if (!cancelled) setPermits(rows);
      })
      .catch(() => {
        if (!cancelled) setPermits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetType, targetId]);

  const resetForm = () => {
    setName('');
    setFile(null);
    setError('');
  };

  const validatePdf = (f) => {
    if (!f) return false;
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
    if (!isPdf || !f.size) {
      setError(t('permit_file_invalid') || t('file_invalid_type'));
      return false;
    }
    return true;
  };

  const pickPdf = (e) => {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = '';
    setError('');
    if (!f) return;
    if (!validatePdf(f)) return;
    setFile(f);
  };

  const add = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inFlightRef.current || saving) return;
    setError('');
    setNotice('');
    if (!targetId) {
      setError(t('broker_complete_profile_first'));
      return;
    }
    if (!name.trim() && !file) {
      return;
    }
    if (!name.trim()) {
      setError(t('permit_name_required'));
      return;
    }
    if (!file) {
      setError(t('permit_pdf_required'));
      return;
    }
    const keepName = name;
    const keepFile = file;
    inFlightRef.current = true;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('target_type', targetType);
      fd.append('target_id', targetId);
      fd.append('owner', owner);
      fd.append('name', name.trim());
      fd.append('pdf', file);
      const created = await pb.collection('brokerage_permits').create(fd, {
        requestKey: `permit-create-${targetId}-${Date.now()}`,
      });
      setPermits((prev) => [...prev, created]);
      resetForm();
      setShowForm(true);
      setNotice(t('permit_saved'));
    } catch (err) {
      setName(keepName);
      setFile(keepFile);
      setError(err?.message || t('something_wrong'));
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (deletingId || inFlightRef.current) return;
    setError('');
    setNotice('');
    setDeletingId(id);
    const prev = permits;
    setPermits((list) => list.filter((p) => p.id !== id));
    try {
      await pb.collection('brokerage_permits').delete(id, {
        requestKey: `permit-del-${id}`,
      });
      setNotice(t('permit_deleted'));
    } catch (err) {
      setPermits(prev);
      setError(err?.message || t('something_wrong'));
    } finally {
      setDeletingId(null);
    }
  };

  const startReplace = (id) => {
    if (replacingId || saving) return;
    replaceTargetId.current = id;
    setError('');
    setNotice('');
    if (replaceInputRef.current) {
      replaceInputRef.current.value = '';
      replaceInputRef.current.click();
    }
  };

  const onReplaceFile = async (e) => {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = '';
    const id = replaceTargetId.current;
    replaceTargetId.current = null;
    if (!f || !id) return;
    if (!validatePdf(f)) return;
    setReplacingId(id);
    setError('');
    try {
      const fd = new FormData();
      fd.append('pdf', f);
      const updated = await pb.collection('brokerage_permits').update(id, fd, {
        requestKey: `permit-replace-${id}`,
      });
      setPermits((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setNotice(t('permit_saved'));
    } catch (err) {
      setError(err?.message || t('something_wrong'));
    } finally {
      setReplacingId(null);
    }
  };

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-bold">{t('permits_section_title')}</p>
        <p className="text-xs text-muted-foreground">{t('additional_permit_hint')}</p>
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onReplaceFile}
      />

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="animate-spin text-primary" size={20} />
        </div>
      ) : permits.length === 0 && !showForm ? (
        <p className="text-xs text-muted-foreground">{t('permit_empty')}</p>
      ) : permits.length > 0 ? (
        <div className="space-y-2">
          {permits.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <FileCheck2 size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold break-words">{p.name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <FileViewButton record={p} filename={p.pdf} />
                <button
                  type="button"
                  onClick={() => startReplace(p.id)}
                  disabled={replacingId === p.id || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-accent min-h-[36px] disabled:opacity-60"
                  title={t('replace_file')}
                >
                  {replacingId === p.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  {t('replace_file')}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  disabled={deletingId === p.id || saving}
                  className="inline-flex items-center justify-center rounded-lg border px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 min-h-[36px] disabled:opacity-60"
                  title={t('delete')}
                >
                  {deletingId === p.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              </div>
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
          onClick={() => {
            setShowForm(true);
            setNotice('');
            setError('');
          }}
        >
          <Plus size={14} className="me-1" />
          {permits.length > 0 ? t('add_another_permit') : t('add_permit_license')}
        </Button>
      )}

      {showForm && (
        <form onSubmit={add} className="space-y-3 rounded-lg border bg-accent/30 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('permit_name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-[40px]"
              placeholder={t('permit_name')}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('permit_pdf')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium cursor-pointer hover:bg-accent min-h-[40px]">
                <Upload size={15} />
                {file?.name || t('permit_pdf_upload')}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={pickPdf}
                  disabled={saving}
                />
              </label>
              <FileViewButton file={file} />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {notice && !error && <p className="text-xs text-emerald-700">{notice}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={saving} className="min-h-[40px]">
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} className="me-1" />
              )}
              {permits.length > 0 ? t('add_another_permit') : t('add_permit')}
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

      {!showForm && permits.length > 0 && notice && (
        <p className="text-xs text-emerald-700">{notice}</p>
      )}
      {!loading && error && !showForm && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
