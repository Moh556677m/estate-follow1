import React, { useEffect, useState } from 'react';
import { LifeBuoy, Loader2, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { cn } from '@/lib/utils';

/**
 * Unified public Support & Help element for the external (pre-login) pages
 * of the three account types: Owner, Broker, Brokerage Company.
 *
 * - Renders a clear "Support & Help" link at the bottom of the page.
 * - Opens a clean modal (no login required) with Name / Email / Subject /
 *   Message fields.
 * - Sends account_type + page automatically (the user never types them).
 * - Posts to the backend route /ef/public-support which emails the support
 *   team internally. The support receiving email is never exposed to the
 *   user (no mailto:, no Outlook/Gmail).
 * - Public-facing texts (support name, form title, success message) are
 *   loaded from the Control Center → Support Settings and update live.
 * - Bilingual (AR RTL / EN LTR) and responsive (full-width send button on
 *   mobile, fields stay visible above the keyboard).
 */
const DEFAULTS = {
  support_name_en: 'Support & Help',
  support_name_ar: 'الدعم والمساعدة',
  form_title_en: 'Send Support Request',
  form_title_ar: 'إرسال طلب دعم',
  success_message_en:
    'Your support request has been sent successfully. Our support team will get back to you as soon as possible.',
  success_message_ar:
    'تم إرسال طلبك بنجاح. سيتواصل معك فريق الدعم في أقرب وقت.',
};

export function PublicSupportLink({ accountType = 'owner', pageLabel = '' }) {
  const { t, lang, isRtl } = useLanguage();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULTS);
  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState(false);

  // Load public-facing texts from the Control Center when the modal opens.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    pb
      .send('/ef/public-support-settings', { method: 'GET' })
      .then((res) => {
        if (!cancelled && res) setSettings({ ...DEFAULTS, ...res });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const reset = () => {
    setForm({ name: '', email: '', subject: '', message: '' });
    setErrors({});
    setSuccess(false);
    setFormError(false);
  };

  const handleOpenChange = (o) => {
    setOpen(o);
    if (!o && success) reset();
  };

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormError(false);
    setSuccess(false);
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = t('support_name_required');
    if (!form.email.trim()) errs.email = t('support_err_email_required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errs.email = t('support_err_email_invalid');
    if (!form.subject.trim()) errs.subject = t('support_err_subject_required');
    if (!form.message.trim()) errs.message = t('support_err_message_required');
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending) return; // prevent duplicate submission
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSending(true);
    setFormError(false);
    setSuccess(false);
    try {
      const res = await pb.send('/ef/public-support', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject.trim(),
          message: form.message.trim(),
          account_type: accountType,
          page: pageLabel,
          language: lang,
        },
      });
      if (res && res.status === 'ok') {
        setSuccess(true);
        setForm({ name: '', email: '', subject: '', message: '' });
        setErrors({});
      } else {
        // Generic error — keep the user's typed text.
        setFormError(true);
      }
    } catch {
      setFormError(true);
    } finally {
      setSending(false);
    }
  };

  const linkLabel =
    lang === 'ar' ? settings.support_name_ar : settings.support_name_en;
  const titleText = lang === 'ar' ? settings.form_title_ar : settings.form_title_en;
  const successText =
    lang === 'ar' ? settings.success_message_ar : settings.success_message_en;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline min-h-[40px]"
      >
        <LifeBuoy size={15} strokeWidth={1.8} />
        {linkLabel}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-md max-h-[90dvh] overflow-y-auto"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <DialogHeader>
            <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <LifeBuoy size={20} strokeWidth={1.8} />
            </div>
            <DialogTitle className="text-center text-lg">{titleText}</DialogTitle>
            <DialogDescription className="text-center">
              {lang === 'ar'
                ? 'أرسل لنا رسالتك وسيتواصل معك فريق الدعم في أقرب وقت.'
                : 'Send us your message and our support team will get back to you shortly.'}
            </DialogDescription>
          </DialogHeader>

          {success ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 size={34} strokeWidth={1.8} className="text-emerald-600" />
              <p className="text-sm font-medium text-foreground max-w-xs">
                {successText}
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                {t('ok_btn')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ps_name" className="text-sm font-medium">
                  {t('support_name_label')}
                </Label>
                <Input
                  id="ps_name"
                  value={form.name}
                  onChange={set('name')}
                  className={cn(
                    'min-h-[44px]',
                    errors.name && 'border-destructive focus-visible:ring-destructive',
                  )}
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ps_email" className="text-sm font-medium">
                  {t('support_email_label')}
                </Label>
                <Input
                  id="ps_email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={form.email}
                  onChange={set('email')}
                  className={cn(
                    'min-h-[44px]',
                    errors.email && 'border-destructive focus-visible:ring-destructive',
                  )}
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ps_subject" className="text-sm font-medium">
                  {t('support_subject')}
                </Label>
                <Input
                  id="ps_subject"
                  value={form.subject}
                  onChange={set('subject')}
                  className={cn(
                    'min-h-[44px]',
                    errors.subject && 'border-destructive focus-visible:ring-destructive',
                  )}
                  placeholder={t('support_subject_placeholder')}
                  aria-invalid={!!errors.subject}
                />
                {errors.subject && (
                  <p className="text-xs text-destructive">{errors.subject}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ps_message" className="text-sm font-medium">
                  {t('support_message')}
                </Label>
                <Textarea
                  id="ps_message"
                  value={form.message}
                  onChange={set('message')}
                  className={cn(
                    'min-h-[120px] resize-y',
                    errors.message && 'border-destructive focus-visible:ring-destructive',
                  )}
                  placeholder={t('support_message_placeholder')}
                  aria-invalid={!!errors.message}
                />
                {errors.message && (
                  <p className="text-xs text-destructive">{errors.message}</p>
                )}
              </div>

              {formError && (
                <p className="text-sm text-destructive">{t('support_error_public')}</p>
              )}

              <Button
                type="submit"
                className="w-full min-h-[48px] text-base font-semibold gap-2"
                disabled={sending}
              >
                {sending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {t('loading')}
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    {t('support_send')}
                  </>
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PublicSupportLink;
