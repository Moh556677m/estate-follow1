import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PhoneField from '@/components/PhoneField';
import CountryField from '@/components/CountryField';
import CityField from '@/components/CityField';
import { useGeoData } from '@/hooks/useGeoData';
import { getLeadPage, submitLead } from '@/lib/crmClient';

export default function CrmLeadPage() {
  const { slug } = useParams();
  const { countryName } = useGeoData();
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('ar');

  // form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [waSame, setWaSame] = useState(false);
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [message, setMessage] = useState('');
  const [requestType, setRequestType] = useState('');
  const [cfValues, setCfValues] = useState({});

  // detect language from query/dir
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const l = params.get('lang');
    if (l === 'en' || l === 'ar') setLang(l);
    else setLang(document.documentElement.lang === 'en' ? 'en' : 'ar');
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await getLeadPage(slug);
        if (cancelled) return;
        setCfg(r);
      } catch (err) {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const tr = (ar, en) => (lang === 'ar' ? ar : en);

  const fieldCfg = cfg?.field_config || {};
  const field = (key) => {
    const defaults = {
      name: { show: true, required: true },
      phone: { show: true, required: true },
      whatsapp: { show: true, required: false },
      email: { show: true, required: true },
      country: { show: true, required: false },
      city: { show: true, required: false },
      preferred_time: { show: true, required: false },
      message: { show: true, required: false },
      request_type: { show: true, required: false },
    };
    return { ...(defaults[key] || { show: false, required: false }), ...(fieldCfg[key] || {}) };
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!name.trim()) { setError(tr('الاسم مطلوب', 'Name is required')); return; }
    if (!phone.trim()) { setError(tr('رقم الهاتف مطلوب', 'Phone number is required')); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError(tr('بريد إلكتروني صحيح مطلوب', 'A valid email is required')); return; }
    setSubmitting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const src = params.get('src') || 'direct';
      const token = params.get('t') || '';
      await submitLead({
        slug, name: name.trim(), phone: phone.trim(),
        whatsapp: waSame ? phone.trim() : whatsapp.trim(),
        email: email.trim().toLowerCase(), country: countryName(country, lang) || country, city,
        preferred_time: preferredTime, message, request_type: requestType,
        source: src, tracking_id: token, custom_fields: cfValues,
      });
      setDone(true);
    } catch (err) {
      setError(tr('تعذر إرسال البيانات حالياً. حاول مرة أخرى.', 'Could not submit right now. Please try again.'));
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (notFound || !cfg) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold">{tr('الصفحة غير متاحة', 'Page not available')}</h1>
          <p className="text-sm text-muted-foreground">{tr('رابط صفحة التواصل غير صحيح أو غير مفعل.', 'This contact page link is invalid or not active.')}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-gradient-to-b from-primary/5 to-background p-6">
        <Helmet><title>{tr('تم الإرسال', 'Submitted')} — Estate Follow</title></Helmet>
        <div className="max-w-md w-full text-center space-y-4 rounded-2xl border bg-card p-8 shadow-sm">
          <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
          <h1 className="text-xl font-bold">{tr('تم إرسال بياناتك بنجاح', 'Your details were sent successfully')}</h1>
          <p className="text-sm text-muted-foreground">{tr('سيتم التواصل معك قريبًا.', 'We will contact you soon.')}</p>
        </div>
      </div>
    );
  }

  const photo = cfg.photo_url;
  const waEnabled = cfg.whatsapp_enabled !== false;

  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-primary/5 to-background">
      <Helmet>
        <title>{cfg.display_name} — Estate Follow</title>
        <meta name="description" content={cfg.bio || (tr('تواصل مع', 'Connect with') + ' ' + cfg.display_name)} />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
        {/* language toggle */}
        <div className="flex justify-end mb-4">
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="text-xs font-semibold text-primary border border-primary/30 rounded-lg px-3 py-1.5 min-h-[36px]">
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>

        {/* header */}
        <div className="flex flex-col items-center text-center space-y-3 mb-6">
          {photo ? (
            <img src={photo} alt={cfg.display_name} className="h-24 w-24 rounded-full object-cover border-2 border-primary/30 shadow-sm" />
          ) : (
            <div className="h-24 w-24 rounded-full bg-primary/15 flex items-center justify-center text-primary text-3xl font-bold">
              {(cfg.display_name || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{cfg.display_name}</h1>
            {cfg.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 text-xs font-semibold">
                <ShieldCheck size={12} /> {tr('موثّق', 'Verified')}
              </span>
            )}
          </div>
          {cfg.company_name && <p className="text-sm text-muted-foreground">{cfg.company_name}</p>}
          {cfg.bio && <p className="text-sm text-muted-foreground leading-6 max-w-sm">{cfg.bio}</p>}
        </div>

        {/* form */}
        <form onSubmit={submit} className="space-y-3.5 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-bold">{tr('تواصل معنا', 'Get in touch')}</h2>

          {field('name').show && (
            <div>
              <Label>{tr('الاسم', 'Name')}{field('name').required ? ' *' : ''}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="min-h-[48px] text-base" autoComplete="name" />
            </div>
          )}

          {field('phone').show && (
            <div>
              <Label>{tr('رقم الهاتف', 'Phone number')}{field('phone').required ? ' *' : ''}</Label>
              <PhoneField value={phone} onChange={setPhone} required={field('phone').required} />
            </div>
          )}

          {field('whatsapp').show && waEnabled && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={waSame} onChange={(e) => setWaSame(e.target.checked)} />
                {tr('رقم واتساب هو نفس رقم الهاتف', 'WhatsApp number is the same as phone')}
              </label>
              {!waSame && (
                <div>
                  <Label>{tr('رقم واتساب', 'WhatsApp number')}</Label>
                  <PhoneField value={whatsapp} onChange={setWhatsapp} />
                </div>
              )}
            </div>
          )}

          {field('email').show && (
            <div>
              <Label>{tr('البريد الإلكتروني', 'Email')}{field('email').required ? ' *' : ''}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-[48px] text-base" autoComplete="email" dir="ltr" />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {field('country').show && (
              <div>
                <Label>{tr('الدولة', 'Country')}{field('country').required ? ' *' : ''}</Label>
                <CountryField value={country} onChange={setCountry} required={field('country').required} heightClass="min-h-[48px]" />
              </div>
            )}
            {field('city').show && (
              <div>
                <Label>{tr('المدينة', 'City')}</Label>
                <CityField country={country} value={city} onChange={(en) => setCity(en)} heightClass="min-h-[48px]" />
              </div>
            )}
          </div>

          {field('preferred_time').show && (
            <div>
              <Label>{tr('أفضل وقت للاتصال', 'Best time to call')}</Label>
              <Input value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className="min-h-[48px] text-base" />
            </div>
          )}

          {field('request_type').show && (
            <div>
              <Label>{tr('نوع الطلب', 'Request type')}</Label>
              <Input value={requestType} onChange={(e) => setRequestType(e.target.value)} className="min-h-[48px] text-base" />
            </div>
          )}

          {field('message').show && (
            <div>
              <Label>{tr('رسالة / ملاحظة', 'Message / note')}</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[90px] text-base" />
            </div>
          )}

          {/* custom fields */}
          {(cfg.custom_fields || []).map((f) => (
            <div key={f.id}>
              <Label>{lang === 'ar' ? f.label_ar : f.label_en}{f.required ? ' *' : ''}</Label>
              {f.field_type === 'select' ? (
                <Select value={cfValues[f.id] || ''} onValueChange={(v) => setCfValues((p) => ({ ...p, [f.id]: v }))}>
                  <SelectTrigger className="min-h-[48px] text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>{(f.options || []).map((o, i) => <SelectItem key={i} value={String(o)}>{String(o)}</SelectItem>)}</SelectContent>
                </Select>
              ) : f.field_type === 'bool' ? (
                <label className="flex items-center gap-2 text-sm py-2"><input type="checkbox" checked={!!cfValues[f.id]} onChange={(e) => setCfValues((p) => ({ ...p, [f.id]: e.target.checked }))} /> {tr('نعم', 'Yes')}</label>
              ) : (
                <Input type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'} value={cfValues[f.id] || ''} onChange={(e) => setCfValues((p) => ({ ...p, [f.id]: e.target.value }))} className="min-h-[48px] text-base" />
              )}
            </div>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full min-h-[52px] text-base">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : tr('إرسال', 'Submit')}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {tr('بياناتك خاصة ولن تُشارك مع أحد.', 'Your information is private and will not be shared.')}
          </p>
        </form>
      </div>
    </div>
  );
}
