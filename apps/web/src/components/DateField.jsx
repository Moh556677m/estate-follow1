import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { ar as arLocale, enUS } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import {
  toIsoDate,
  formatDisplayDate,
  parseDisplayDate,
  isoToLocalDate,
  localDateToIso,
} from '@/lib/dateFormat';

/**
 * Reusable date picker.
 * Display: DD/MM/YYYY · Storage: YYYY-MM-DD (ISO).
 */
const DateField = ({
  value,
  onChange,
  label,
  required,
  optionalLabel,
  heightClass = 'min-h-[44px]',
  id,
  dir = 'ltr',
  placeholder,
  clearable = true,
}) => {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef(null);

  const isoValue = useMemo(() => toIsoDate(value) || '', [value]);
  const selected = useMemo(() => isoToLocalDate(isoValue), [isoValue]);
  const display = formatDisplayDate(isoValue);
  const locale = lang === 'ar' ? arLocale : enUS;
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    setText(display);
    setInvalid(false);
  }, [display]);

  const handleTextChange = (e) => {
    const v = e.target.value;
    setText(v);
    if (v.trim() === '') {
      setInvalid(false);
      return;
    }
    // Accept partial typing without error until blur
    if (v.replace(/\D/g, '').length < 8) {
      setInvalid(false);
      return;
    }
    setInvalid(!parseDisplayDate(v));
  };

  const commitText = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      onChange('');
      setInvalid(false);
      return;
    }
    const iso = parseDisplayDate(trimmed);
    if (iso) {
      onChange(iso);
      setText(formatDisplayDate(iso));
      setInvalid(false);
    } else {
      setText(display);
      setInvalid(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitText();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-destructive"> *</span>}
          {optionalLabel && (
            <span className="text-xs text-muted-foreground"> ({t('optional_label')})</span>
          )}
        </Label>
      )}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={handleTextChange}
          onBlur={commitText}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'DD/MM/YYYY'}
          dir={dir || 'ltr'}
          className={cn(
            'flex w-full items-center rounded-md border bg-card px-3 pr-16 text-start text-sm shadow-sm outline-none transition-colors hover:bg-accent focus:ring-2 focus:ring-ring disabled:opacity-50',
            invalid ? 'border-destructive focus:ring-destructive' : 'border-input',
            heightClass,
          )}
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          {clearable && display && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setText('');
                setInvalid(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t('clear_date') || 'Clear'}
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10 transition-colors"
                aria-label={t('date_placeholder') || 'Pick date'}
                tabIndex={-1}
              >
                <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end" sideOffset={4}>
              <Calendar
                mode="single"
                selected={selected}
                onSelect={(date) => {
                  onChange(date ? localDateToIso(date) : '');
                  setOpen(false);
                }}
                captionLayout="dropdown"
                fromYear={1900}
                toYear={currentYear + 5}
                locale={locale}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {invalid && (
        <p className="text-[11px] text-destructive">
          {lang === 'ar' ? 'صيغة التاريخ: يوم/شهر/سنة' : 'Use DD/MM/YYYY'}
        </p>
      )}
    </div>
  );
};

export default DateField;
