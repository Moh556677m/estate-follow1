import React, { useMemo, useState } from 'react';
import {
  Banknote,
  ChevronRight,
  CreditCard,
  Home,
  KeyRound,
  Search,
  Store,
  TreePine,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { countryName } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/shared';

// "My Properties" (عقاراتي) — the unified property list requested to replace
// the fragmented cash/installments/rentals/residential/commercial/land
// sections as the PRIMARY way to browse properties (those older sections
// stay reachable too — nothing is removed, this is additive).
//
// Top tabs: Cash | Installments | Rent — mutually exclusive VIEWS. A
// property's underlying `type` (cash/installment) never changes when it
// gets rented; it simply also shows up under "Rent" while it has an active
// tenancy. Sub tabs: Residential | Commercial | Land, filtering by
// usage_type within the selected top tab. Rows are single-line,
// WhatsApp-style: building name · unit/apartment number · country. Search
// matches building name or unit number. Tapping a row opens the Property
// Profile page.
const TOP_TABS = [
  { key: 'cash', icon: Banknote, ar: 'كاش', en: 'Cash' },
  { key: 'installment', icon: CreditCard, ar: 'أقساط', en: 'Installments' },
  { key: 'rent', icon: KeyRound, ar: 'إيجار', en: 'Rent' },
];
const USAGE_TABS = [
  { key: 'all', icon: null, ar: 'الكل', en: 'All' },
  { key: 'residential', icon: Home, ar: 'سكني', en: 'Residential' },
  { key: 'commercial', icon: Store, ar: 'تجاري', en: 'Commercial' },
  { key: 'land', icon: TreePine, ar: 'أرض', en: 'Land' },
];

export default function MyProperties({
  properties = [],
  activeTenancyByProperty = {},
  onOpen,
}) {
  const { t, lang } = useLanguage();
  const ar = lang === 'ar';
  const [topTab, setTopTab] = useState('cash');
  const [usageTab, setUsageTab] = useState('all');
  const [search, setSearch] = useState('');

  const bucketOf = (p) => {
    if (activeTenancyByProperty[p.id] || p.type === 'rented') return 'rent';
    return p.type === 'installment' ? 'installment' : 'cash';
  };

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties
      .filter((p) => bucketOf(p) === topTab)
      .filter((p) => usageTab === 'all' || p.usage_type === usageTab)
      .filter((p) => {
        if (!q) return true;
        return (
          String(p.building || '').toLowerCase().includes(q) ||
          String(p.unit_number || '').toLowerCase().includes(q)
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, activeTenancyByProperty, topTab, usageTab, search]);

  return (
    <div className="space-y-4" dir={ar ? 'rtl' : 'ltr'}>
      {/* Top tabs: Cash | Installments | Rent */}
      <div className="flex flex-wrap gap-2">
        {TOP_TABS.map((tab) => {
          const Icon = tab.icon;
          const on = topTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTopTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors min-h-[40px]',
                on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent',
              )}
            >
              <Icon size={15} />
              {ar ? tab.ar : tab.en}
            </button>
          );
        })}
      </div>

      {/* Sub tabs: Residential | Commercial | Land */}
      <div className="flex flex-wrap gap-2">
        {USAGE_TABS.map((tab) => {
          const Icon = tab.icon;
          const on = usageTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setUsageTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors min-h-[34px]',
                on ? 'bg-primary/10 text-primary border-primary/40' : 'bg-background hover:bg-accent',
              )}
            >
              {Icon && <Icon size={13} />}
              {ar ? tab.ar : tab.en}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={ar ? 'ابحث باسم البناية أو رقم الوحدة' : 'Search by building or unit number'}
          className="ps-9 h-10"
        />
      </div>

      {/* WhatsApp-style single-line rows */}
      {list.length === 0 ? (
        <EmptyState
          message={
            ar ? 'لا توجد عقارات في هذا القسم بعد.' : 'No properties in this section yet.'
          }
          icon={topTab === 'rent' ? KeyRound : topTab === 'installment' ? CreditCard : Banknote}
        />
      ) : (
        <div className="divide-y rounded-xl border bg-card overflow-hidden">
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen?.(p)}
              className="group flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset min-h-[60px]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                {(p.building || '?').trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">
                  {p.building || (ar ? 'بدون اسم' : 'Untitled')}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {p.unit_number ? `${t('docs_unit') || (ar ? 'وحدة' : 'Unit')} ${p.unit_number}` : '—'}
                  {p.country ? ` · ${countryName(p.country, lang)}` : ''}
                </p>
              </div>
              <ChevronRight
                size={18}
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                style={{ transform: ar ? 'scaleX(-1)' : undefined }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
