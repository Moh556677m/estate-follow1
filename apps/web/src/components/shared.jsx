import React, { useState } from 'react';
import { Download, Inbox } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFileUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  changes_requested: 'bg-orange-100 text-orange-800 border-orange-200',
  suspended: 'bg-slate-200 text-slate-700 border-slate-300',
  upcoming: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  overdue: 'bg-red-100 text-red-800 border-red-200',
};

export function StatusBadge({ status }) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        STATUS_STYLES[status] || 'bg-secondary text-secondary-foreground',
      )}
    >
      {t(`status_${status}`)}
    </span>
  );
}

const DOT_COLORS = {
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  gray: 'bg-slate-400',
};

// Coloured circular indicator + label used on the dashboard.
export function StatusDot({ color, label, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        className,
      )}
    >
      <span className={cn('h-3 w-3 rounded-full shrink-0', DOT_COLORS[color] || DOT_COLORS.gray)} />
      {label}
    </span>
  );
}

export function StatCard({ icon: Icon, label, value, sub, onClick }) {
  const interactive = typeof onClick === 'function';
  const Comp = interactive ? 'button' : 'div';
  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      className={cn(
        'rounded-xl border bg-card p-5 shadow-sm text-start w-full',
        interactive &&
          'cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors">
          <Icon size={18} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Comp>
  );
}

export function EmptyState({ message, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function DocButton({ record, field, label }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const filename = record?.[field];
  if (!filename) return null;

  const open = async () => {
    setBusy(true);
    try {
      const url = await getFileUrl(record, filename);
      if (url) window.open(url, '_blank', 'noopener');
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 min-h-[36px]"
    >
      <Download size={13} />
      {label || t('download')}
    </button>
  );
}

// --- Property status helpers (shared by owner + admin dashboards) ---

const normKey = (v) => String(v || '').trim().toLowerCase();

// Active rental match — REAL relation now, not string matching.
//
// Renting a property never mutates its `type` and never creates a second
// property row for the same unit: it links a `tenancies` record via
// property_id. So "is this property currently rented" means "does it have a
// tenancy with status === 'active'", found either by passing the tenancies
// list directly (preferred — pass `tenancies` as the second-position-named
// option) or, for legacy code that still calls this with just
// `allProperties`, by falling back to the old type==="rented" signal so nothing
// that already worked stops working while data is being migrated.
export function isPropertyRented(prop, allPropertiesOrOpts, maybeTenancies) {
  if (!prop) return false;
  let allProperties = allPropertiesOrOpts;
  let tenancies = maybeTenancies;
  if (allPropertiesOrOpts && !Array.isArray(allPropertiesOrOpts)) {
    // Called as isPropertyRented(prop, { tenancies })
    tenancies = allPropertiesOrOpts.tenancies;
    allProperties = allPropertiesOrOpts.allProperties;
  }
  if (Array.isArray(tenancies)) {
    return tenancies.some((tc) => tc.property === prop.id && tc.status === 'active');
  }
  // Legacy fallback (no tenancies data available): same behaviour as before
  // the rebuild, kept only so old call sites don't regress mid-migration.
  const list = allProperties || [];
  const ownerId = typeof prop.owner === 'string' ? prop.owner : prop.owner?.id || '';
  const b = normKey(prop.building);
  const u = normKey(prop.unit_number);
  return list.some((p) => {
    if (!p || p.id === prop.id) {
      return p && p.id === prop.id && p.type === 'rented';
    }
    if (p.type !== 'rented') return false;
    const pOwner = typeof p.owner === 'string' ? p.owner : p.owner?.id || '';
    if (ownerId && pOwner && ownerId !== pOwner) return false;
    return normKey(p.building) === b && normKey(p.unit_number) === u;
  });
}

// Back-compat alias
export function cashMatch(prop, allProperties, tenancies) {
  return isPropertyRented(prop, allProperties, tenancies);
}

// Installment state derived from the property's installment payment rows.
export function installmentState(prop, payments) {
  const rows = (payments || []).filter(
    (p) => p.property === prop.id && p.kind === 'installment',
  );
  if (rows.length === 0) return { kind: 'none', rows };
  const allPaid = rows.every((p) => p.status === 'paid');
  if (allPaid || prop.installment_plan_completed)
    return { kind: 'completed', rows };
  if (prop.handover_status === 'handover_completed')
    return { kind: 'orange', rows };
  return { kind: 'pending', rows };
}

// Main status for cash & installment cards: rental occupancy (not review status).
// Returns { color, labelKey } or null. Pass `tenancies` when available so this
// reflects the real property_id-linked tenancy instead of the legacy
// building/unit string-matching fallback.
export function propertyIndicator(prop, allProperties, tenancies) {
  if (prop.type === 'cash' || prop.type === 'installment') {
    const rented = isPropertyRented(prop, allProperties, tenancies);
    return {
      color: rented ? 'green' : 'orange',
      labelKey: rented ? 'status_rented_green' : 'status_not_rented',
    };
  }
  return null;
}
