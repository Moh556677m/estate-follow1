import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGeoData } from '@/hooks/useGeoData';
import { buildPhone, parsePhone, normalizeDial } from '@/lib/dialCodes';
import { getLengthRange, validateLocalNumber } from '@/lib/phoneLengths';
import { detectCountry } from '@/hooks/useGeoIp';
import { cn } from '@/lib/utils';

// Unified split phone input used everywhere in Estate Follow.
//
// Layout:  [+971 ▼]  [local number]   — one row, code selector is small and
// fixed-width so it never eats the form. After selecting a country code the
// trigger shows ONLY the international calling code (e.g. "+971"), never the
// country name. The dropdown lists "Country — +code" to help the user pick,
// and is searchable by dial code (971 / +971) or country name (AR/EN).
//
// The country-code selector uses a Popover-based combobox (NOT Radix Select)
// so the search input keeps focus and the mobile keyboard stays open while
// typing — Radix Select's roving-tabindex steals focus on every re-render.
//
// The local number is validated against the selected country's digit count,
// capped at the max, and cleaned of any accidentally re-typed country code.
// The combined value is emitted as "+[cc]-[number]" via onChange and the
// backend stores a unified "+ccnumber" form. Existing stored values are
// never wiped.
const PhoneField = ({
  value,
  onChange,
  label,
  required,
  heightClass = 'min-h-[44px]',
  showLabels = true,
  id,
}) => {
  const { t } = useLanguage();
  const { countries } = useGeoData();
  const [cc, setCc] = useState('');
  const [num, setNum] = useState('');
  const [mode, setMode] = useState('select');
  const [ccQuery, setCcQuery] = useState('');
  const [ccOpen, setCcOpen] = useState(false);
  const [manualError, setManualError] = useState('');
  const ccSearchRef = useRef(null);
  // Tracks whether the user has typed a number or changed the code themselves.
  // GeoIP auto-detection must NOT override an explicit user choice.
  const userTouchedRef = useRef(false);

  // Resolve the ISO code for the currently selected dial code (for length
  // validation). Returns '' when no known country matches.
  const isoCode = useMemo(() => {
    if (!cc) return '';
    const match = countries.find((c) => c.dial === cc);
    return match ? match.code : '';
  }, [cc, countries]);

  // Sync internal parts whenever the external value changes (e.g. when a
  // property is loaded into the editor). Never strips or alters the stored
  // digits here — only on user input.
  useEffect(() => {
    const parsed = parsePhone(value || '');
    const known = countries.find((c) => c.dial === parsed.cc)?.code;
    setCc(parsed.cc);
    setNum(parsed.num);
    setMode(known ? 'select' : parsed.cc ? 'manual' : 'select');
  }, [value, countries]);

  // GeoIP default: when the field opens empty, try to detect the visitor's
  // country from IP and pre-select its calling code. DEFAULT only — runs once,
  // never blocks, skipped the moment the user interacts.
  useEffect(() => {
    if (value) return; // only for empty fields
    let cancelled = false;
    detectCountry()
      .then((iso) => {
        if (cancelled || !iso) return;
        if (userTouchedRef.current) return;
        const dial = countries.find((c) => c.code === iso)?.dial || '';
        if (!dial) return;
        setCc(dial);
        setMode('select');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the search input when the code popover opens.
  useEffect(() => {
    if (ccOpen) {
      const t = setTimeout(() => ccSearchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setCcQuery('');
  }, [ccOpen]);

  const emit = (nextCc, nextNum) => {
    onChange(buildPhone(nextCc, nextNum));
  };

  // Codes-only list: one entry per distinct dial code (several countries can
  // share the same calling code, e.g. +1, +7 — the picker shows a code only
  // once, never a country name, so a duplicate-by-name entry would just be a
  // confusing repeat of the same code). Nothing is dropped from what's
  // selectable — every country's dial code from `countries` is still
  // represented by exactly one row here.
  const dialOnlyList = useMemo(() => {
    const seen = new Set();
    const out = [];
    countries.forEach((c) => {
      const dial = (c.dial || '').trim();
      if (!dial || seen.has(dial)) return;
      seen.add(dial);
      out.push({ dial, code: c.code });
    });
    // Sort numerically by the digits of the code so the list is scannable
    // (e.g. +1, +7, +20, +212, +966, +971 …) rather than in whatever order
    // the underlying country records happened to load in.
    out.sort((a, b) => {
      const na = parseInt(a.dial.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.dial.replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });
    return out;
  }, [countries]);

  // Search matches by CODE ONLY (digits, with or without a leading '+') —
  // no country name/search-by-name anymore, per the codes-only design above.
  const filteredCountries = useMemo(() => {
    const qDigits = ccQuery.trim().replace(/^\+/, '').replace(/\D/g, '');
    if (!qDigits) return dialOnlyList;
    return dialOnlyList.filter((c) => {
      const dial = (c.dial || '').replace(/^\+/, '');
      return dial.startsWith(qDigits);
    });
  }, [ccQuery, dialOnlyList]);

  // Validation state for the local number against the selected country.
  const validationState = validateLocalNumber(isoCode, num);
  const showError =
    validationState === 'incomplete' || validationState === 'too_long';
  const errorMessage =
    validationState === 'incomplete'
      ? t('phone_incomplete')
      : validationState === 'too_long'
        ? t('phone_invalid_length')
        : '';

  const maxDigits = useMemo(() => {
    const range = getLengthRange(isoCode);
    return range ? range[1] : null;
  }, [isoCode]);

  const expectedHint = useMemo(() => {
    const range = getLengthRange(isoCode);
    if (!range) return '';
    const [min, max] = range;
    if (min === max) return `${min} ${t('phone_digits')}`;
    return `${min}–${max} ${t('phone_digits')}`;
  }, [isoCode, t]);

  // Sanitize user input: keep only digits, strip a single leading trunk 0,
  // strip a re-typed country code (prevent duplication), and cap at the
  // country's maximum digit count when known.
  const sanitizeNum = (raw) => {
    let digits = String(raw || '').replace(/\D/g, '');
    const dialDigits = (cc || '').replace(/^\+/, '').replace(/\D/g, '');
    if (dialDigits && digits.startsWith(dialDigits)) {
      digits = digits.slice(dialDigits.length);
    }
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (maxDigits && digits.length > maxDigits) {
      digits = digits.slice(0, maxDigits);
    }
    return digits;
  };

  const onNumChange = (e) => {
    userTouchedRef.current = true;
    const cleaned = sanitizeNum(e.target.value);
    setNum(cleaned);
    emit(cc, cleaned);
  };

  const chooseCode = (dial, chosenIso) => {
    userTouchedRef.current = true;
    setCc(dial);
    let nextNum = num;
    const range = getLengthRange(chosenIso);
    if (range) {
      let digits = String(num || '').replace(/\D/g, '');
      const dialDigits = dial.replace(/^\+/, '').replace(/\D/g, '');
      if (dialDigits && digits.startsWith(dialDigits)) digits = digits.slice(dialDigits.length);
      if (digits.startsWith('0')) digits = digits.slice(1);
      if (digits.length > range[1]) digits = digits.slice(0, range[1]);
      nextNum = digits;
    }
    setNum(nextNum);
    setMode('select');
    setCcOpen(false);
    emit(dial, nextNum);
  };

  return (
    <div className="space-y-2">
      {label && showLabels && (
        <Label>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      <div className="flex items-stretch gap-2">
        {mode === 'select' ? (
          <Popover open={ccOpen} onOpenChange={setCcOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex shrink-0 items-center justify-between gap-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background transition-colors',
                  'focus:outline-none focus:ring-1 focus:ring-ring',
                  heightClass,
                  'w-[92px]',
                )}
              >
                {cc ? (
                  <span dir="ltr" className="font-semibold tabular-nums">{cc}</span>
                ) : (
                  <span className="text-muted-foreground text-xs">+…</span>
                )}
                <ChevronDown size={14} className="shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[min(var(--radix-popover-trigger-width),18rem)] p-0"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div className="sticky top-0 z-10 bg-popover p-2 border-b">
                <div className="relative">
                  <Search className="absolute top-1/2 -translate-y-1/2 start-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    ref={ccSearchRef}
                    value={ccQuery}
                    onChange={(e) => setCcQuery(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (filteredCountries.length > 0) {
                          chooseCode(filteredCountries[0].dial || '', filteredCountries[0].code);
                        }
                      }
                    }}
                    placeholder={t('phone_search_country')}
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
                {filteredCountries.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    {t('phone_no_match')}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    {filteredCountries.map((c) => (
                      <button
                        key={c.dial}
                        type="button"
                        onClick={() => chooseCode(c.dial || '', c.code)}
                        className={cn(
                          'rounded-md px-2 py-2 text-sm font-semibold tabular-nums text-center hover:bg-accent',
                          cc === c.dial && 'bg-primary/8',
                        )}
                        dir="ltr"
                      >
                        {c.dial}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMode('manual');
                    setCc((p) => p || '+');
                    setCcOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-start hover:bg-accent border-t mt-1 pt-2 italic text-primary font-medium"
                >
                  {t('phone_type_manual')}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex gap-1.5 shrink-0">
            <Input
              value={cc}
              onChange={(e) => {
                userTouchedRef.current = true;
                const v = normalizeDial(e.target.value);
                setCc(v);
                setManualError('');
                emit(v, num);
              }}
              onBlur={() => {
                const digits = (cc || '').replace(/^\+/, '').replace(/\D/g, '');
                if (!digits) { setManualError(''); return; }
                const match = countries.find(
                  (c) => (c.dial || '').replace(/^\+/, '') === digits,
                );
                if (match) {
                  setCc(match.dial);
                  setMode('select');
                  setManualError('');
                  emit(match.dial, num);
                } else {
                  setManualError(t('phone_unknown_code'));
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              placeholder="+966"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel-country-code"
              className={`${heightClass} w-[92px] font-semibold tabular-nums ${manualError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
            />
            <button
              type="button"
              onClick={() => setMode('select')}
              className="inline-flex items-center gap-1 rounded-md border bg-card px-2 text-xs font-medium hover:bg-accent"
              title={t('phone_select_code')}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
        <Input
          id={id}
          value={num}
          onChange={onNumChange}
          placeholder={t('phone_local_placeholder')}
          dir="ltr"
          inputMode="numeric"
          autoComplete="tel-national"
          className={`${heightClass} flex-1 tabular-nums ${showError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        />
      </div>
      {isoCode && expectedHint && !showError && (
        <p className="text-xs text-muted-foreground">{t('phone_local_hint')} · {expectedHint}</p>
      )}
      {showError && (
        <p className="text-xs font-medium text-destructive">{errorMessage}</p>
      )}
      {manualError && mode === 'manual' && !showError && (
        <p className="text-xs font-medium text-destructive">{manualError}</p>
      )}
    </div>
  );
};

export default PhoneField;
