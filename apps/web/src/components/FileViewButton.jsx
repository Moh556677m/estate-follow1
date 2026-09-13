import React, { useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFileUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

// Opens an uploaded file for viewing in a new tab. Works on mobile + desktop.
//
// Two sources:
//  - `file`: a staged File object (not yet saved) -> object URL
//  - `record` + `filename`: a saved protected file -> short-lived token URL
//
// The file is never deleted; pair it with a separate "Replace" control.
export function FileViewButton({
  file,
  record,
  filename,
  label,
  className,
  disabled,
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  const savedName =
    typeof filename === 'string'
      ? filename
      : record && filename
        ? String(filename)
        : '';
  const hasFile = !!(file || (record && savedName));

  const open = async () => {
    if (!hasFile || busy || disabled) return;
    setBusy(true);
    try {
      let url = null;
      if (file) {
        url = URL.createObjectURL(file);
      } else if (record && savedName) {
        // Token is cached in getFileUrl — open without blocking the page shell.
        url = await getFileUrl(record, savedName);
      }
      if (url) {
        // Prefer same-tab-friendly open; fall back if popup blocked.
        const win = window.open(url, '_blank', 'noopener');
        if (!win && url.startsWith('blob:')) {
          // Mobile sometimes blocks window.open for blobs — navigate via anchor.
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.click();
        }
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  if (!hasFile) return null;

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy || disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 min-h-[36px] disabled:opacity-60',
        className,
      )}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
      {label || t('view_file')}
    </button>
  );
}

export default FileViewButton;
