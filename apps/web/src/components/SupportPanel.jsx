import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Mail, Send, Loader2, CheckCircle2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { cn } from '@/lib/utils';

const SupportPanel = () => {
  const { user } = useAuth();
  const { t, lang } = useLanguage();

  const [form, setForm] = useState({
    contact_email: user?.email || '',
    subject: '',
    message: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user?.email) {
      setForm((f) =>
        f.contact_email ? f : { ...f, contact_email: user.email },
      );
    }
  }, [user?.email]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSuccess(false);
  };

  const validate = () => {
    const errors = {};
    const email = form.contact_email.trim();
    if (!email) {
      errors.contact_email = t('support_err_email_required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.contact_email = t('support_err_email_invalid');
    }
    if (!form.subject.trim()) {
      errors.subject = t('support_err_subject_required');
    }
    if (!form.message.trim()) {
      errors.message = t('support_err_message_required');
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setSuccess(false);
      return;
    }
    setSending(true);
    setFieldErrors({});
    try {
      const payload = {
        contact_email: form.contact_email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      };
      if (pb.authStore.record?.id) {
        payload.user = pb.authStore.record.id;
      }
      await pb.collection('support_messages').create(payload, {
        requestKey: `support-${Date.now()}`,
      });
      setSuccess(true);
      setForm((f) => ({ ...f, subject: '', message: '' }));
    } catch {
      setFieldErrors({ form: t('support_send_error') });
    } finally {
      setSending(false);
    }
  };

  const scrollToForm = () => {
    const el = document.getElementById('support-request-form');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <Helmet>
        <title>
          {lang === 'ar'
            ? 'الدعم والمساعدة — إستيت فولو'
            : 'Support & Help — Estate Follow'}
        </title>
        <meta
          name="description"
          content={
            lang === 'ar'
              ? 'تواصل مع فريق دعم إستيت فولو'
              : 'Contact the Estate Follow support team'
          }
        />
      </Helmet>

      {/* Top contact strip — matches reference: green CTA + titled card, no email */}
      <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <Button
            type="button"
            onClick={scrollToForm}
            className="min-h-[44px] rounded-full px-5 gap-2 self-start sm:self-auto"
          >
            <MessageSquare size={16} />
            {t('support_contact_btn')}
          </Button>

          <div className="flex items-center gap-3 sm:flex-row-reverse">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Mail size={20} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 text-start sm:text-end">
              <p className="text-sm font-bold leading-tight">{t('support_contact')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('support_contact_sub')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Support request form */}
      <form
        id="support-request-form"
        onSubmit={handleSubmit}
        noValidate
        className="rounded-2xl border bg-card p-4 sm:p-6 shadow-sm space-y-5"
      >
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-end sm:text-start [dir=rtl]:text-start">
          {t('support_form_title')}
        </h2>

        <div className="space-y-2">
          <Label htmlFor="support_email" className="text-sm font-medium">
            {t('support_email_label')}
          </Label>
          <Input
            id="support_email"
            type="email"
            autoComplete="email"
            dir="ltr"
            value={form.contact_email}
            onChange={set('contact_email')}
            className={cn(
              'min-h-[48px] rounded-xl',
              fieldErrors.contact_email && 'border-destructive focus-visible:ring-destructive',
            )}
            aria-invalid={!!fieldErrors.contact_email}
          />
          {fieldErrors.contact_email && (
            <p className="text-xs text-destructive">{fieldErrors.contact_email}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="support_subject" className="text-sm font-medium">
            {t('support_subject')}
          </Label>
          <Input
            id="support_subject"
            value={form.subject}
            onChange={set('subject')}
            className={cn(
              'min-h-[48px] rounded-xl',
              fieldErrors.subject && 'border-destructive focus-visible:ring-destructive',
            )}
            placeholder={t('support_subject_placeholder')}
            aria-invalid={!!fieldErrors.subject}
          />
          {fieldErrors.subject && (
            <p className="text-xs text-destructive">{fieldErrors.subject}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="support_message" className="text-sm font-medium">
            {t('support_message')}
          </Label>
          <Textarea
            id="support_message"
            value={form.message}
            onChange={set('message')}
            className={cn(
              'min-h-[160px] rounded-xl resize-y',
              fieldErrors.message && 'border-destructive focus-visible:ring-destructive',
            )}
            placeholder={t('support_message_placeholder')}
            aria-invalid={!!fieldErrors.message}
          />
          {fieldErrors.message && (
            <p className="text-xs text-destructive">{fieldErrors.message}</p>
          )}
        </div>

        {fieldErrors.form && (
          <p className="text-sm text-destructive">{fieldErrors.form}</p>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            <CheckCircle2 size={18} className="shrink-0" />
            {t('support_sent')}
          </div>
        )}

        <Button
          type="submit"
          className="w-full min-h-[52px] rounded-xl text-base font-semibold gap-2"
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
    </div>
  );
};

export default SupportPanel;
