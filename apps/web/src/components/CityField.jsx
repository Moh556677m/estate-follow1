import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check, Pencil, ArrowLeft, ChevronDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGeoData } from '@/hooks/useGeoData';
import { cn } from '@/lib/utils';

// Unified, centralized City Selector for the whole site.
// Depends on the selected country (ISO code). Shows the popular/master cities
// for that country from the centralized useGeoData source, is searchable, and
// lets the user type a custom city when theirs isn't listed ("Enter another
// city"). Custom cities are stored as the typed name. When the country
// changes, an unsuitable city selection is cleared automatically.
//
// Emits onChange(en, ar). Stores the English name as the stable key.
//
// IMPORTANT (focus stability): Popover-based combobox (not Radix Select) so the
// search input keeps focus and the mobile keyboard stays open while typing.
const CityField = ({
  country,
  value = '',
  onChange,
  onArChange,
  label,
  required = false,
  placeholder,
  heightClass = 'min-h-[44px]',
  id,
  disabled = false,
}) => {
  const { t, lang } = useLanguage();
  const { citiesForCountry } = useGeoData();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState('');
  const inputRef = useRef(null);

  const options = useMemo(
    () => citiesForCountry(country),
    [citiesForCountry, country],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (c) =>
        c.en.toLowerCase().includes(q) ||
        c.ar.includes(query.trim()) ||
        c.ar.toLowerCase().includes(q),
    );
  }, [options, query]);

  const display = useMemo(() => {
    if (!value) return '';
    const found = options.find(
      (c) =>
        c.en === value ||
        c.ar === value ||
        c.en.toLowerCase() === String(value).toLowerCase(),
    );
    if (found) return lang === 'ar' ? found.ar : found.en;
    return value; // custom city — show as typed
  }, [value, options, lang]);

  // When the country changes, clear an incompatible city selection and reset
  // manual mode.
  useEffect(() => {
    if (!value) {
      setManual(false);
      setManualText('');
      return;
    }
    const stillValid = options.some(
      (c) =>
        c.en === value ||
        c.ar === value ||
        c.en.toLowerCase() === String(value).toLowerCase(),
    );
    if (!stillValid) {
      onChange?.('', '');
      setManual(false);
      setManualText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setQuery('');
  }, [open]);

  const handleSelect = (v) => {
    if (v === '__manual__') {
      setOpen(false);
      setManual(true);
      setManualText(value && !options.some((c) => c.en === value) ? value : '');
      onChange?.('', '');
      return;
    }
    const found = options.find((c) => c.en === v);
    if (found) {
      onChange?.(found.en, found.ar);
      onArChange?.(found.ar);
    } else {
      onChange?.(v, '');
      onArChange?.('');
    }
    setOpen(false);
  };

  const commitManual = () => {
    const txt = manualText.trim();
    if (!txt) return;
    const match = options.find(
      (c) => c.en.toLowerCase() === txt.toLowerCase() || c.ar === txt,
    );
    if (match) {
      onChange?.(match.en, match.ar);
      onArChange?.(match.ar);
      setManual(false);
    } else {
      onChange?.(txt, '');
      onArChange?.('');
    }
  };

  if (!country) {
    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor={id}>
            {label}
            {required && <span className="text-destructive"> *</span>}
          </Label>
        )}
        <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2.5">
          {t('broker_select_country_first')}
        </p>
      </div>
    );
  }

  if (manual) {
    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor={id}>
            {label}
            {required && <span className="text-destructive"> *</span>}
          </Label>
        )}
        <div className="flex items-stretch gap-2">
          <Input
            id={id}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            onBlur={commitManual}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitManual();
              }
            }}
            placeholder={t('broker_city_placeholder')}
            className={cn(heightClass, 'flex-1')}
            disabled={disabled}
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              setManual(false);
              setManualText('');
              onChange?.('', '');
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-card px-2.5 text-xs font-medium hover:bg-accent"
            title={t('crm_field_city')}
          >
            <ArrowLeft size={14} className="rtl:rotate-180" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            className={cn(
              'flex w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background transition-colors',
              'focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              heightClass,
              !value && 'text-muted-foreground',
            )}
          >
            <span className="truncate text-start">{display || placeholder || t('company_registration_city_select')}</span>
            <ChevronDown size={16} className="shrink-0 opacity-50 ms-2" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(var(--radix-popover-trigger-width),20rem)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="sticky top-0 z-10 bg-popover p-2 border-b">
            <div className="relative">
              <Search className="absolute top-1/2 -translate-y-1/2 start-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filtered.length > 0) handleSelect(filtered[0].en);
                  }
                }}
                placeholder={t('search')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent ps-7 pe-2 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="search"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {t('phone_no_match')}
              </div>
            ) : (
              filtered.map((c) => {
                const selected =
                  value === c.en || value === c.ar ||
                  c.en.toLowerCase() === String(value).toLowerCase();
                return (
                  <button
                    key={c.en}
                    type="button"
                    onClick={() => handleSelect(c.en)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-start hover:bg-accent',
                      selected && 'bg-primary/8',
                    )}
                  >
                    {selected ? (
                      <Check size={14} className="text-primary shrink-0" />
                    ) : (
                      <span className="w-3.5" />
                    )}
                    <span className="flex-1">{lang === 'ar' ? c.ar : c.en}</span>
                  </button>
                );
              })
            )}
            <button
              type="button"
              onClick={() => handleSelect('__manual__')}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-start hover:bg-accent border-t mt-1 pt-2 text-primary font-medium"
            >
              <Pencil size={13} />
              {t('broker_city_manual')}
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default CityField;
