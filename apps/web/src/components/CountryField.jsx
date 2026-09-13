import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check, ChevronDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGeoData } from '@/hooks/useGeoData';
import { cn } from '@/lib/utils';

// Unified, centralized Country Selector for the whole site.
// UI shows the country NAME only — never ISO codes or calling codes.
// Search matches Arabic + English names (ISO still works silently for power users).
// Stores the ISO code (e.g. "AE") and emits it via onChange.
//
// IMPORTANT (focus stability): this uses a Popover-based combobox, NOT a Radix
// Select. Radix Select has roving-tabindex + typeahead that steals focus from
// the search input on every list re-render (the keyboard disappears after each
// character on mobile). A Popover leaves the input mounted and focused for the
// whole typing session, so the on-screen keyboard stays open until the user
// picks an item or closes the dropdown.
const CountryField = ({
  value,
  onChange,
  label,
  required,
  placeholder,
  heightClass = 'min-h-[44px]',
  id,
  // Optional top option for filters, e.g. { value: 'all', label: 'All' }
  allOption = null,
  disabled = false,
}) => {
  const { t, lang } = useLanguage();
  const { countries, countryName } = useGeoData();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const raw = query.trim();
    if (!raw) return countries;
    const q = raw.toLowerCase();
    return countries.filter((c) => {
      const ar = c.ar.toLowerCase();
      const en = c.en.toLowerCase();
      if (ar.includes(q) || en.includes(q)) return true;
      if (c.code.toLowerCase() === q) return true;
      return false;
    });
  }, [countries, query]);

  const isAll = allOption && value === allOption.value;
  const display = isAll
    ? allOption.label
    : value
      ? countryName(value, lang)
      : '';

  // Focus the search input when the popover opens (after it mounts).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    // Reset query when closed so the next open starts fresh.
    setQuery('');
  }, [open]);

  const choose = (code) => {
    onChange(code === '__none__' ? '' : code);
    setOpen(false);
  };

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
              !display && 'text-muted-foreground',
            )}
          >
            <span className="truncate text-start">{display || placeholder || t('nationality_select')}</span>
            <ChevronDown size={16} className="shrink-0 opacity-50 ms-2" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(var(--radix-popover-trigger-width),20rem)] p-0"
          align="start"
          // Keep focus inside the input — do not auto-focus the content.
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
                    if (filtered.length > 0) choose(filtered[0].code);
                  }
                }}
                placeholder={t('search_nationality')}
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
            {allOption && !query.trim() && (
              <button
                type="button"
                onClick={() => choose(allOption.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-start hover:bg-accent',
                  value === allOption.value && 'bg-primary/8',
                )}
              >
                <span className="w-4" />
                <span className="flex-1">{allOption.label}</span>
                {value === allOption.value && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {t('phone_no_match')}
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => choose(c.code)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-start hover:bg-accent',
                    value === c.code && 'bg-primary/8',
                  )}
                >
                  <span className="flex-1 truncate">{lang === 'ar' ? c.ar : c.en}</span>
                  {value === c.code && <Check className="ms-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default CountryField;
