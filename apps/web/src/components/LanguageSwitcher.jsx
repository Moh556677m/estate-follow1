import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Globe, Search, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { filterLanguages, getLanguageMeta } from '@/lib/i18n/languages';
import { cn } from '@/lib/utils';

/**
 * Single-button language control + searchable full-screen / modal picker.
 * Replaces the old "العربية | English" toggle. Does not reload the page.
 */
export function LanguageSwitcher({ className }) {
  const { lang, setLang, t, isRtl } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const meta = getLanguageMeta(lang);
  const filtered = useMemo(() => filterLanguages(query), [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }
    const tId = window.setTimeout(() => searchRef.current?.focus(), 50);
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while picker is open (restore carefully)
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(tId);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const pick = (code) => {
    if (code && code !== lang) setLang(code, { manual: true });
    setOpen(false);
  };

  const triggerLabel = t('lang_change') || (isRtl ? 'تغيير اللغة' : 'Change language');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-border/80 bg-card/80 px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground min-h-[36px] sm:min-h-[40px] max-w-full',
          className,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerLabel}
      >
        <span className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Globe size={16} strokeWidth={1.85} aria-hidden className="sm:hidden" />
          <Globe size={18} strokeWidth={1.85} aria-hidden className="hidden sm:block" />
        </span>
        <span className="truncate">{triggerLabel}</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ef-lang-picker-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            aria-label={t('cancel') || 'Close'}
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              'relative z-[301] flex w-full max-w-lg flex-col bg-background shadow-2xl',
              'max-h-[92dvh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl border border-border',
              'mx-0 sm:mx-4',
            )}
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Globe size={20} strokeWidth={1.85} />
                </span>
                <div className="min-w-0">
                  <h2 id="ef-lang-picker-title" className="text-base font-bold truncate">
                    {triggerLabel}
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">
                    {meta.nativeName}
                    {meta.englishName && meta.englishName !== meta.nativeName
                      ? ` · ${meta.englishName}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent text-muted-foreground"
                aria-label={t('cancel') || 'Close'}
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('lang_search_placeholder') || 'Search language…'}
                  className="w-full min-h-[48px] rounded-xl border border-input bg-card pe-3 ps-10 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                />
              </div>
            </div>

            <div
              ref={listRef}
              className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-1"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t('lang_no_results') || 'No languages found'}
                </p>
              ) : (
                <ul className="space-y-0.5" role="listbox" aria-label={triggerLabel}>
                  {filtered.map((l) => {
                    const active = l.code === lang || l.code.toLowerCase() === String(lang).toLowerCase();
                    return (
                      <li key={l.code}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => pick(l.code)}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-start transition-colors min-h-[48px]',
                            active
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'hover:bg-accent text-foreground',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] leading-tight" dir="auto">
                              {l.nativeName}
                            </span>
                            {l.englishName !== l.nativeName ? (
                              <span className="block truncate text-xs text-muted-foreground mt-0.5">
                                {l.englishName}
                              </span>
                            ) : null}
                          </span>
                          {active ? <Check size={18} className="shrink-0 text-primary" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default LanguageSwitcher;
