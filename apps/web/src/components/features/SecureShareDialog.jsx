import React, { useState } from 'react';
import { Loader2, Copy, Check, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { createShare } from '@/lib/ownerFeaturesClient';
import { notify } from '@/lib/notify';

const EXPIRY_OPTIONS = [
  { value: '', ar: 'بدون انتهاء', en: 'Never expires' },
  { value: '1', ar: 'يوم واحد', en: '1 day' },
  { value: '7', ar: '7 أيام', en: '7 days' },
  { value: '30', ar: '30 يومًا', en: '30 days' },
];

// Task #17 — Secure Sharing. Creates a REAL revocable/expiring share link
// (document_shares collection) — replacing DocumentsCenter's old
// navigator.share(rawFileUrl), which had no revocation and no owner-set
// expiry. The link points at /share/:token (SharedDocumentPage), which
// resolves it through the Express public endpoint — never the raw
// permanent file URL.
export default function SecureShareDialog({ doc, open, onClose }) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const isAr = lang === 'ar';

  const [expiryDays, setExpiryDays] = useState('7');
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const create = async () => {
    if (!doc || !user) return;
    setCreating(true);
    try {
      const expiresAt = expiryDays
        ? new Date(Date.now() + Number(expiryDays) * 86400000).toISOString()
        : null;
      const share = await createShare({
        ownerId: user.id,
        docSource: doc.source,
        docRefId: doc.record?.id || doc.id,
        docField: doc.filename,
        label: doc.name || '',
        expiresAt,
      });
      const url = `${window.location.origin}/share/${share.token}`;
      setLink(url);
    } catch (err) {
      notify.error(isAr ? 'تعذر إنشاء رابط المشاركة' : 'Could not create share link', String(err?.message || ''));
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link is still selectable text */
    }
  };

  const close = () => {
    setLink('');
    setExpiryDays('7');
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 size={18} />{isAr ? 'مشاركة آمنة' : 'Secure Sharing'}</DialogTitle>
          <DialogDescription>
            {doc?.name}
            {' — '}
            {isAr ? 'أنشئ رابطًا قابلًا للإلغاء ومحدود المدة بدلًا من مشاركة الملف مباشرة.' : 'Create a revocable, expiring link instead of sharing the raw file.'}
          </DialogDescription>
        </DialogHeader>

        {!link ? (
          <div className="space-y-3">
            <label className="text-sm font-medium">{isAr ? 'مدة الصلاحية' : 'Expires after'}</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="min-h-[40px] w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{isAr ? o.ar : o.en}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{isAr ? 'الرابط جاهز:' : 'Your link is ready:'}</p>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs" dir="ltr">{link}</span>
              <button type="button" onClick={copy} className="shrink-0 text-primary">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr ? 'يمكنك إلغاء هذا الرابط في أي وقت من إدارة المشاركات.' : 'You can revoke this link at any time from your shares list.'}
            </p>
          </div>
        )}

        <DialogFooter>
          {!link ? (
            <Button onClick={create} disabled={creating} className="min-h-[40px] gap-2">
              {creating && <Loader2 className="animate-spin" size={16} />}
              {isAr ? 'إنشاء الرابط' : 'Create link'}
            </Button>
          ) : (
            <Button onClick={close} className="min-h-[40px]">{isAr ? 'تم' : 'Done'}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
