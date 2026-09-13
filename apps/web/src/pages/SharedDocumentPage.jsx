import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import { Loader2, FileWarning, Download, Link2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveShareToken } from '@/lib/featureToolsClient';

const ERROR_MESSAGES = {
  not_found: { ar: 'رابط المشاركة غير موجود.', en: 'This share link does not exist.' },
  revoked: { ar: 'تم إلغاء رابط المشاركة هذا.', en: 'This share link has been revoked.' },
  expired: { ar: 'انتهت صلاحية رابط المشاركة هذا.', en: 'This share link has expired.' },
  broken_link: { ar: 'الملف المرتبط بهذا الرابط لم يعد متاحًا.', en: 'The file behind this link is no longer available.' },
  file_token_unavailable: { ar: 'تعذر فتح الملف حاليًا. حاول لاحقًا.', en: 'Could not open the file right now. Please try again later.' },
};

// Task #17 — Secure Sharing. Public page (no login) that resolves a
// document_shares token via the Express endpoint and shows/downloads the
// file — never the raw permanent PocketBase file URL.
export default function SharedDocumentPage() {
  const { token } = useParams();
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await resolveShareToken(token);
        if (!cancelled) setState({ loading: false, error: '', data: res });
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err?.body?.error || 'not_found', data: null });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const isImage = state.data?.fileName && /\.(jpe?g|png|webp|gif)$/i.test(state.data.fileName);
  const isPdf = state.data?.fileName && /\.pdf$/i.test(state.data.fileName);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Helmet><title>{isAr ? 'مستند مشارك' : 'Shared document'} — Estate Follow</title></Helmet>
      <div className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Link2 size={16} />{isAr ? 'مستند مشارك بأمان' : 'Securely shared document'}
        </div>

        {state.loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={22} /></div>
        ) : state.error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <FileWarning size={32} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {ERROR_MESSAGES[state.error] ? (isAr ? ERROR_MESSAGES[state.error].ar : ERROR_MESSAGES[state.error].en) : (isAr ? 'تعذر فتح هذا الرابط.' : 'Could not open this link.')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-bold">{state.data.label || state.data.fileName}</p>
            {isImage ? (
              <img src={state.data.url} alt={state.data.label || 'document'} className="w-full rounded-lg border" />
            ) : isPdf ? (
              <iframe src={state.data.url} title="document" className="w-full h-[70vh] rounded-lg border" />
            ) : null}
            <a
              href={state.data.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 min-h-[40px]"
            >
              <Download size={16} />{isAr ? 'تنزيل / فتح الملف' : 'Download / open file'}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
