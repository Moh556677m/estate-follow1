import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { citiesForCountry } from '@/lib/brokerageConstants';
import { cn } from '@/lib/utils';

/**
 * Working cities multi-select for broker/company profiles.
 * After a work country is chosen, "+" reveals popular cities as toggles,
 * plus a free-text field to add a city not in the list.
 */
export default function WorkingCitiesField({
  country,
  value = [],
  onChange,
  required = false,
}) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const selected = Array.isArray(value) ? value : [];

  const popular = useMemo(() => citiesForCountry(country, lang), [country, lang]);

  const toggle = (city) => {
    if (selected.includes(city)) onChange(selected.filter((c) => c !== city));
    else onChange([...selected, city]);
  };

  const addManual = () => {
    const c = String(draft || '').trim();
    if (!c) return;
    if (!selected.includes(c)) onChange([...selected, c]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <Label>
        {t('broker_working_cities')}
        {required && <span className="text-destructive"> *</span>}
      </Label>

      {!country ? (
        <p className="text-xs text-muted-foreground">{t('broker_select_country_first')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setOpen((o) => !o)}
            >
              <Plus size={16} className="me-1" />
              {t('broker_add_cities')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {selected.length
                ? lang === 'ar'
                  ? `${selected.length} مدينة مختارة`
                  : `${selected.length} selected`
                : t('broker_city_placeholder')}
            </span>
          </div>

          {open && (
            <div className="rounded-xl border bg-card p-3 space-y-3">
              {popular.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {popular.map((city) => {
                    const on = selected.includes(city);
                    return (
                      <button
                        key={city}
                        type="button"
                        onClick={() => toggle(city)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-semibold min-h-[36px] transition-colors',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        {city}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('broker_city_manual')}
                  className="min-h-[44px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addManual();
                    }
                  }}
                />
                <Button type="button" variant="outline" className="min-h-[44px]" onClick={addManual}>
                  <Plus size={16} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium"
            >
              {c}
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x !== c))}
                className="hover:text-destructive"
                aria-label={t('delete')}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
