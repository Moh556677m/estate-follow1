import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Globe2,
  MapPin,
  Plus,
  Search,
  Trash2,
  Pencil,
  Loader2,
} from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGeoData } from '@/hooks/useGeoData';
import pb from '@/lib/pocketbaseClient';
import { cn } from '@/lib/utils';

// Super Admin Control Center → Countries & Cities.
// Manages the centralized geo data source (platform_countries /
// platform_cities). Every edit here reflects across the whole site because
// all Country/City/Phone components read from useGeoData, which subscribes to
// these collections live.
export default function CountriesCitiesPanel() {
  const { t, lang } = useLanguage();
  const { reload } = useGeoData();
  const [tab, setTab] = useState('countries');
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cityCountry, setCityCountry] = useState('all');
  const [editCountry, setEditCountry] = useState(null);
  const [editCity, setEditCity] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, ci] = await Promise.all([
        pb.collection('platform_countries').getFullList({ sort: 'name_en', requestKey: 'geo-admin-c' }),
        pb.collection('platform_cities').getFullList({ sort: 'name_en', expand: 'country', requestKey: 'geo-admin-ci' }),
      ]);
      setCountries(c);
      setCities(ci);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const handler = () => { load(); reload(); };
    ['platform_countries', 'platform_cities'].forEach((col) => {
      void pb.collection(col).subscribe('*', handler).catch(() => {});
    });
    return () => {
      ['platform_countries', 'platform_cities'].forEach((col) => {
        void pb.collection(col).unsubscribe('*').catch(() => {});
      });
    };
  }, [load, reload]);

  const countryIsoToId = useMemo(() => {
    const m = {};
    countries.forEach((c) => { m[c.id] = c.iso; });
    return m;
  }, [countries]);

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) =>
      [c.iso, c.name_en, c.name_ar, c.dial_code].some((v) =>
        String(v || '').toLowerCase().includes(q),
      ),
    );
  }, [countries, search]);

  const filteredCities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cities.filter((c) => {
      const iso = countryIsoToId[c.country] || '';
      if (cityCountry !== 'all' && iso !== cityCountry) return false;
      if (!q) return true;
      return [c.name_en, c.name_ar].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [cities, search, cityCountry, countryIsoToId]);

  const toggleCountry = async (c) => {
    try {
      await pb.collection('platform_countries').update(c.id, { enabled: !c.enabled }, { requestKey: `geo-c-tog-${c.id}` });
    } catch { /* ignore */ }
  };
  const toggleCity = async (c) => {
    try {
      await pb.collection('platform_cities').update(c.id, { enabled: !c.enabled }, { requestKey: `geo-ci-tog-${c.id}` });
    } catch { /* ignore */ }
  };
  const deleteCountry = async (c) => {
    if (!window.confirm(lang === 'ar' ? `حذف ${c.name_en}؟ سيُحذف كل مدنها.` : `Delete ${c.name_en}? Its cities will be removed.`)) return;
    try { await pb.collection('platform_countries').delete(c.id, { requestKey: `geo-c-del-${c.id}` }); } catch { /* ignore */ }
  };
  const deleteCity = async (c) => {
    if (!window.confirm(lang === 'ar' ? `حذف ${c.name_en}؟` : `Delete ${c.name_en}?`)) return;
    try { await pb.collection('platform_cities').delete(c.id, { requestKey: `geo-ci-del-${c.id}` }); } catch { /* ignore */ }
  };

  const tr = (ar, en) => (lang === 'ar' ? ar : en);

  return (
    <div className="space-y-4">
      <Helmet>
        <title>{tr('الدول والمدن', 'Countries & Cities')} — Estate Follow</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">{tr('الدول والمدن', 'Countries & Cities')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr(
            'مصدر البيانات المركزي للدول والمدن وأكواد الاتصال. أي تعديل هنا ينعكس على كل الموقع.',
            'Centralized source for countries, cities and calling codes. Every edit reflects across the whole site.',
          )}
        </p>
      </div>

      <div className="flex gap-1.5 flex-wrap border-b pb-2">
        <button onClick={() => { setTab('countries'); setSearch(''); }}
          className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium min-h-[40px] transition-colors',
            tab === 'countries' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
          <Globe2 size={15} /> {tr('الدول', 'Countries')} <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-bold tabular-nums">{countries.length}</span>
        </button>
        <button onClick={() => { setTab('cities'); setSearch(''); }}
          className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium min-h-[40px] transition-colors',
            tab === 'cities' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
          <MapPin size={15} /> {tr('المدن', 'Cities')} <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-bold tabular-nums">{cities.length}</span>
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('بحث…', 'Search…')} className="min-h-[44px] ps-8" />
        </div>
        {tab === 'cities' && (
          <Select value={cityCountry} onValueChange={setCityCountry}>
            <SelectTrigger className="w-48 min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">{tr('كل الدول', 'All countries')}</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.id} value={c.iso}>{lang === 'ar' ? c.name_ar : c.name_en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button onClick={() => (tab === 'countries' ? setEditCountry({ _new: true }) : setEditCity({ _new: true }))} className="min-h-[44px]">
          <Plus size={16} className="me-1" /> {tab === 'countries' ? tr('إضافة دولة', 'Add Country') : tr('إضافة مدينة', 'Add City')}
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin inline me-1" /> {t('loading')}</p>
      ) : tab === 'countries' ? (
        <div className="space-y-1.5">
          {filteredCountries.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm">
              <span className="font-mono text-[11px] text-muted-foreground w-8">{c.iso}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{lang === 'ar' ? c.name_ar : c.name_en} <span className="text-muted-foreground text-xs">/ {lang === 'ar' ? c.name_en : c.name_ar}</span></p>
                <p className="text-xs text-muted-foreground" dir="ltr">{c.dial_code || '—'}</p>
              </div>
              <button onClick={() => toggleCountry(c)} className={cn('relative h-6 w-11 rounded-full transition-colors shrink-0', c.enabled !== false ? 'bg-primary' : 'bg-muted')} title={c.enabled !== false ? tr('معطّلة', 'Enabled') : tr('موقوفة', 'Disabled')}>
                <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', c.enabled !== false ? 'start-[22px]' : 'start-0.5')} />
              </button>
              <Button size="sm" variant="outline" onClick={() => setEditCountry(c)} className="min-h-[34px]"><Pencil size={13} /></Button>
              <button onClick={() => deleteCountry(c)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={15} /></button>
            </div>
          ))}
          {filteredCountries.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">—</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredCities.map((c) => {
            const iso = countryIsoToId[c.country] || '';
            const country = countries.find((x) => x.id === c.country);
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm">
                <MapPin size={14} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{lang === 'ar' ? c.name_ar : c.name_en} <span className="text-muted-foreground text-xs">/ {lang === 'ar' ? c.name_en : c.name_ar}</span></p>
                  <p className="text-xs text-muted-foreground">{country ? (lang === 'ar' ? country.name_ar : country.name_en) : iso} {c.is_custom && <span className="text-primary">· {tr('مخصصة', 'Custom')}</span>}</p>
                </div>
                <button onClick={() => toggleCity(c)} className={cn('relative h-6 w-11 rounded-full transition-colors shrink-0', c.enabled !== false ? 'bg-primary' : 'bg-muted')}>
                  <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', c.enabled !== false ? 'start-[22px]' : 'start-0.5')} />
                </button>
                <Button size="sm" variant="outline" onClick={() => setEditCity(c)} className="min-h-[34px]"><Pencil size={13} /></Button>
                <button onClick={() => deleteCity(c)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={15} /></button>
              </div>
            );
          })}
          {filteredCities.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">—</p>}
        </div>
      )}

      {editCountry && (
        <CountryEditor
          country={editCountry}
          onClose={() => setEditCountry(null)}
          onSaved={() => { setEditCountry(null); load(); }}
          lang={lang}
        />
      )}
      {editCity && (
        <CityEditor
          city={editCity}
          countries={countries}
          onClose={() => setEditCity(null)}
          onSaved={() => { setEditCity(null); load(); }}
          lang={lang}
        />
      )}
    </div>
  );
}

function CountryEditor({ country, onClose, onSaved, lang }) {
  const tr = (ar, en) => (lang === 'ar' ? ar : en);
  const [iso, setIso] = useState(country.iso || '');
  const [nameEn, setNameEn] = useState(country.name_en || '');
  const [nameAr, setNameAr] = useState(country.name_ar || '');
  const [dial, setDial] = useState(country.dial_code || '');
  const [enabled, setEnabled] = useState(country.enabled !== false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    if (!iso.trim() || !nameEn.trim() || !nameAr.trim()) {
      setErr(tr('الرمز والاسمان إلزاميان', 'ISO and both names are required'));
      return;
    }
    setSaving(true);
    try {
      const data = {
        iso: iso.trim().toUpperCase(),
        name_en: nameEn.trim(),
        name_ar: nameAr.trim(),
        dial_code: dial.trim(),
        enabled,
      };
      if (country.id) {
        await pb.collection('platform_countries').update(country.id, data, { requestKey: `geo-c-save-${country.id}` });
      } else {
        await pb.collection('platform_countries').create(data, { requestKey: 'geo-c-new' });
      }
      onSaved();
    } catch (e) {
      setErr(String(e?.response?.message || e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{country.id ? tr('تعديل دولة', 'Edit Country') : tr('إضافة دولة', 'Add Country')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{tr('رمز الدولة (ISO)', 'ISO Code')} *</Label><Input value={iso} onChange={(e) => setIso(e.target.value.toUpperCase().slice(0, 2))} className="min-h-[44px] uppercase" disabled={!!country.id} /></div>
          <div><Label>{tr('الاسم بالإنجليزي', 'English Name')} *</Label><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="min-h-[44px]" /></div>
          <div><Label>{tr('الاسم بالعربي', 'Arabic Name')} *</Label><Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="min-h-[44px]" dir="rtl" /></div>
          <div><Label>{tr('كود الاتصال الدولي', 'Calling Code')}</Label><Input value={dial} onChange={(e) => setDial(e.target.value)} placeholder="+971" className="min-h-[44px]" dir="ltr" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {tr('مفعّلة', 'Enabled')}</label>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">{tr('إلغاء', 'Cancel')}</Button>
          <Button onClick={save} disabled={saving} className="min-h-[44px]">{saving ? <Loader2 size={16} className="animate-spin" /> : tr('حفظ', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CityEditor({ city, countries, onClose, onSaved, lang }) {
  const tr = (ar, en) => (lang === 'ar' ? ar : en);
  const [countryId, setCountryId] = useState(city.country || '');
  const [nameEn, setNameEn] = useState(city.name_en || '');
  const [nameAr, setNameAr] = useState(city.name_ar || '');
  const [enabled, setEnabled] = useState(city.enabled !== false);
  const [isCustom, setIsCustom] = useState(!!city.is_custom);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    if (!countryId || !nameEn.trim() || !nameAr.trim()) {
      setErr(tr('الدولة والاسمان إلزاميان', 'Country and both names are required'));
      return;
    }
    setSaving(true);
    try {
      const data = { country: countryId, name_en: nameEn.trim(), name_ar: nameAr.trim(), enabled, is_custom: isCustom };
      if (city.id) {
        await pb.collection('platform_cities').update(city.id, data, { requestKey: `geo-ci-save-${city.id}` });
      } else {
        await pb.collection('platform_cities').create(data, { requestKey: 'geo-ci-new' });
      }
      onSaved();
    } catch (e) {
      setErr(String(e?.response?.message || e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{city.id ? tr('تعديل مدينة', 'Edit City') : tr('إضافة مدينة', 'Add City')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{tr('الدولة', 'Country')} *</Label>
            <Select value={countryId} onValueChange={setCountryId}>
              <SelectTrigger className="min-h-[44px]"><SelectValue placeholder={tr('اختر الدولة', 'Select country')} /></SelectTrigger>
              <SelectContent className="max-h-72">
                {countries.map((c) => <SelectItem key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>{tr('الاسم بالإنجليزي', 'English Name')} *</Label><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="min-h-[44px]" /></div>
          <div><Label>{tr('الاسم بالعربي', 'Arabic Name')} *</Label><Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="min-h-[44px]" dir="rtl" /></div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {tr('مفعّلة', 'Enabled')}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isCustom} onChange={(e) => setIsCustom(e.target.checked)} /> {tr('مخصصة', 'Custom')}</label>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">{tr('إلغاء', 'Cancel')}</Button>
          <Button onClick={save} disabled={saving} className="min-h-[44px]">{saving ? <Loader2 size={16} className="animate-spin" /> : tr('حفظ', 'Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
