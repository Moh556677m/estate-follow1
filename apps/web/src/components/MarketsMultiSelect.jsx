import React, { useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGeoData } from '@/hooks/useGeoData';
import { cn } from '@/lib/utils';

/**
 * Searchable multi-select for countries ("Markets I Work In").
 * Selected countries render as removable chips; the search input filters the
 * full country list with a dropdown of matches.
 *
 * Reads from the unified useGeoData() source (PocketBase platform_countries,
 * with the static list as fallback) — NOT a private copy of the country
 * list — so a country the Super Admin disables/renames/adds is reflected
 * here immediately, exactly as everywhere else in the site.
 */
const MarketsMultiSelect = ({ value = [], onChange, label, hint }) => {
  const { t, lang } = useLanguage();
  const { countries, countryName } = useGeoData();
  const selected = Array.isArray(value) ? value : [];
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.en.toLowerCase().includes(q) ||
        c.ar.includes(query.trim()) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query, countries]);

  const toggle = (code) => {
    if (selected.includes(code)) {
      onChange(selected.filter((x) => x !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  const remove = (code) => onChange(selected.filter((x) => x !== code));

  React.useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div className="space-y-2" ref={wrapRef}>
      {label && <Label>{label}</Label>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary min-h-[32px]"
            >
              {countryName(code, lang)}
              <button
                type="button"
                onClick={() => remove(code)}
                className="inline-flex items-center justify-center rounded-full hover:bg-primary/20 p-0.5"
                aria-label={t('delete')}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            lang === 'ar' ? 'ابحث عن دولة لإضافتها…' : 'Search a country to add…'
          }
          className="min-h-[44px]"
          autoComplete="off"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border bg-popover shadow-lg">
            {filtered.slice(0, 60).map((c) => {
              const on = selected.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    toggle(c.code);
                    setQuery('');
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-accent min-h-[40px]',
                    on && 'bg-accent/60',
                  )}
                >
                  <span className="min-w-0 truncate">{lang === 'ar' ? c.ar : c.en}</span>
                  {on && <Check size={14} className="shrink-0 text-primary" />}
                </button>
              );
            })}
            {filtered.length > 60 && (
              <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
                {lang === 'ar' ? 'نتائج إضافية — refine البحث' : 'More results — refine your search'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketsMultiSelect;
