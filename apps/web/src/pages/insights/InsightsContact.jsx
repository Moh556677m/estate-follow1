import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Send } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import Seo from '@/components/Seo';
import { submitContact } from '@/lib/insights';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const InsightsContact = () => {
  const { t, lang } = useLanguage();
  const isAr = lang === 'ar';
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError(isAr ? 'يرجى تعبئة الحقول المطلوبة.' : 'Please fill in the required fields.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await submitContact(form);
      setDone(true);
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setError(isAr ? 'تعذر إرسال الرسالة. حاول مرة أخرى.' : 'Could not send the message. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t('insights_contact')} — {t('brand')} Insights</title>
        <meta name="description" content={t('brand_desc')} />
      </Helmet>
      <Seo title={t('insights_contact')} description={t('brand_desc')} />

      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <nav className="text-xs text-muted-foreground mb-2">
          <Link to="/insights" className="hover:text-primary">{t('insights_home')}</Link>
          <span className="mx-1">/</span>
          <span>{t('insights_contact')}</span>
        </nav>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('insights_contact_title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{isAr ? 'نحن هنا لمساعدتك. أرسل لنا رسالتك وسنعود إليك قريبًا.' : 'We are here to help. Send us your message and we will get back to you soon.'}</p>

        {done ? (
          <div className="mt-8 rounded-xl border bg-primary/5 p-8 text-center">
            <p className="font-semibold text-primary">{t('insights_contact_sent')}</p>
            <Button onClick={() => setDone(false)} variant="outline" className="mt-4">{isAr ? 'إرسال رسالة أخرى' : 'Send another message'}</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4 rounded-xl border bg-card p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="c-name">{t('insights_your_name')}</Label>
                <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="min-h-[44px]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-email">{t('email')}</Label>
                <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="min-h-[44px]" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-subject">{t('insights_contact_subject')}</Label>
              <Input id="c-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="min-h-[44px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-message">{t('insights_contact_message')}</Label>
              <Textarea id="c-message" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required className="min-h-[120px]" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full min-h-[48px]">
              {loading ? t('loading') : (<><Send size={16} className="me-2" /> {t('insights_contact_send')}</>)}
            </Button>
          </form>
        )}
      </div>
    </>
  );
};

export default InsightsContact;
