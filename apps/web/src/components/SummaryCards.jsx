import React, { useMemo } from 'react';
import {
  Banknote,
  Building2,
  CalendarClock,
  HardHat,
  Home,
  KeyRound,
  Receipt,
  ScrollText,
  Store,
  TrendingUp,
  TreePine,
  Wallet,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMoney } from '@/lib/api';
import { cn } from '@/lib/utils';

function SummaryCard({ icon: Icon, title, value, sub, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex h-full min-h-[148px] w-full flex-col rounded-2xl border border-border/80 bg-white p-4 text-start shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
        'transition-all duration-200',
        onClick
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_6px_16px_rgba(15,23,42,0.10)] focus:outline-none focus:ring-2 focus:ring-ring'
          : 'hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 pt-0.5 text-[13px] font-semibold leading-snug text-foreground">
          {title}
        </p>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Icon size={18} strokeWidth={1.75} />
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-1 text-center">
        <p
          className="text-[28px] font-bold leading-none tracking-tight text-foreground tabular-nums"
          dir="ltr"
        >
          {value}
        </p>
        {sub ? (
          <p className="mt-2 text-xs font-medium text-muted-foreground">{sub}</p>
        ) : null}
      </div>
    </Tag>
  );
}

const inMonth = (dateStr, year, month) => {
  if (!dateStr) return false;
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  return d.getFullYear() === year && d.getMonth() === month;
};

// Days from today until a date string (YYYY-MM-DD). Negative = past.
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
};

const SummaryCards = ({
  properties = [],
  payments = [],
  tenancies = [],
  activeTenancyByProperty = {},
  contractExpiryDays = 30,
  onPropertiesClick,
  onVacantClick,
  onExpiringClick,
  onResidentialClick,
  onCommercialClick,
  onLandClick,
  onReadyClick,
  onUnderConstructionClick,
  onUpcomingClick,
  onDueClick,
  onRentedClick,
  onYearlyChargesClick,
  onMonthlyIncomeClick,
  onMonthlyInstallmentsClick,
}) => {
  const { t, lang } = useLanguage();

  const stats = useMemo(() => {
    const approved = properties.filter((p) => p.status === 'approved');
    const approvedIds = new Set(approved.map((p) => p.id));
    const approvedPayments = payments.filter((p) => approvedIds.has(p.property));
    // Same "does this tenancy's property still exist" guard OwnerDashboard's
    // renderRentals/renderExpiringContracts use (propById over ALL
    // properties, not just approved) — kept identical so the card count
    // always matches what those sections actually render.
    const propByAllId = Object.fromEntries(properties.map((p) => [p.id, p]));

    const ready = approved.filter((p) => p.handover_status === 'handover_completed').length;
    const underConstruction = approved.filter(
      (p) => p.handover_status === 'under_construction',
    ).length;

    // Rented / Vacant / Expiring: reconciled to use the SAME tenancy-based
    // source of truth as OwnerDashboard's renderRentals / renderVacant /
    // renderExpiringContracts, so these cards never disagree with their own
    // drill-down page again (previously this used flat property.type +
    // building/unit string-matching, which could diverge from the
    // tenancies collection).
    const activeTenancies = tenancies.filter((tc) => tc.status === 'active');

    // Rented count = properties.currently rented, exactly mirroring
    // renderRentals: one entry per active tenancy (whose property still
    // resolves) + legacy fallback for un-migrated flat type="rented" rows
    // that have no active tenancy of their own.
    const rentedFromTenancies = activeTenancies.filter((tc) => propByAllId[tc.property]);
    const legacyRented = approved.filter(
      (p) => p.type === 'rented' && !activeTenancyByProperty[p.id],
    );
    const rented = rentedFromTenancies.length + legacyRented.length;

    // Vacant properties: owned (cash/installment) approved properties with
    // no active tenancy linked to them — identical to renderVacant.
    const rentable = approved.filter(
      (p) => p.type === 'cash' || p.type === 'installment',
    );
    const vacantProps = rentable.filter((p) => !activeTenancyByProperty[p.id]);
    const vacant = vacantProps.length;

    // Expiring lease contracts — identical to renderExpiringContracts:
    // active tenancies with end_date within the window, plus a legacy
    // fallback for un-migrated flat type="rented" rows with no active
    // tenancy of their own.
    const window = Number(contractExpiryDays) > 0 ? Number(contractExpiryDays) : 30;
    const tenancyExpiring = activeTenancies
      .filter((tc) => tc.end_date)
      .map((tc) => ({ p: propByAllId[tc.property], diff: daysUntil(tc.end_date) }))
      .filter((x) => x.p && x.diff != null && x.diff >= 0 && x.diff <= window);
    const legacyExpiring = approved
      .filter((p) => p.type === 'rented' && p.contract_end_date && !activeTenancyByProperty[p.id])
      .map((p) => ({ p, diff: daysUntil(p.contract_end_date) }))
      .filter((x) => x.diff != null && x.diff >= 0 && x.diff <= window);
    const expiringProps = [...tenancyExpiring, ...legacyExpiring]
      .sort((a, b) => a.diff - b.diff)
      .map((x) => x.p);
    const expiring = expiringProps.length;

    const yearlyCharges = approved
      .filter((p) => p.service_charge_frequency === 'yearly')
      .reduce((s, p) => s + Number(p.service_charge_amount || 0), 0);

    const monthlyIncome = approved
      .filter((p) => p.type === 'rented')
      .reduce((s, p) => s + Number(p.rent_amount || 0) / 12, 0);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthlyInstallments = approvedPayments
      .filter(
        (p) =>
          p.kind === 'installment' &&
          p.status !== 'paid' &&
          inMonth(p.due_date, year, month),
      )
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const upcomingPayments = approvedPayments.filter((p) => p.status === 'upcoming').length;
    const duePayments = approvedPayments.filter((p) => p.status === 'overdue').length;

    return {
      approved: approved.length,
      upcomingPayments,
      duePayments,
      ready,
      underConstruction,
      rented: rented.length,
      residential: approved.filter((p) => p.usage_type === 'residential').length,
      commercial: approved.filter((p) => p.usage_type === 'commercial').length,
      land: approved.filter((p) => p.usage_type === 'land').length,
      vacant,
      vacantProps,
      expiring,
      expiringProps,
      yearlyCharges,
      monthlyIncome,
      monthlyInstallments,
    };
  }, [properties, payments, contractExpiryDays]);

  const money = (v) => formatMoney(v, lang);

  // `t` has no interpolation; fill {days} manually for the expiring sub-label.
  const expiringSub = t('stat_expiring_contracts_sub').replace('{days}', String(contractExpiryDays));

  // Portfolio summary — upcoming / due payments first (swapped with overview)
  const portfolioCards = [
    {
      icon: Wallet,
      title: t('stat_upcoming'),
      value: stats.upcomingPayments,
      onClick: onUpcomingClick,
    },
    {
      icon: Receipt,
      title: t('summary_due_payments_full'),
      value: stats.duePayments,
      onClick: onDueClick,
    },
    {
      icon: KeyRound,
      title: t('summary_rented_full'),
      value: stats.rented,
      sub: t('summary_rented'),
      onClick: onRentedClick,
    },
    {
      icon: Receipt,
      title: t('summary_yearly_charges_full'),
      value: money(stats.yearlyCharges),
      sub: t('summary_yearly'),
      onClick: onYearlyChargesClick,
    },
    {
      icon: TrendingUp,
      title: t('summary_monthly_income_full'),
      value: money(stats.monthlyIncome),
      sub: t('summary_monthly'),
      onClick: onMonthlyIncomeClick,
    },
    {
      icon: Banknote,
      title: t('summary_monthly_installments_full'),
      value: money(stats.monthlyInstallments),
      sub: t('summary_monthly'),
      onClick: onMonthlyInstallmentsClick,
    },
  ];

  // Property management overview — ready / under construction + the two new
  // live cards (vacant properties, expiring lease contracts). The old
  // "Properties Pending Review" card has been removed.
  const overviewCards = [
    {
      icon: Building2,
      title: t('stat_properties'),
      value: stats.approved,
      onClick: onPropertiesClick,
    },
    {
      icon: Home,
      title: t('stat_residential'),
      value: stats.residential,
      onClick: onResidentialClick,
    },
    {
      icon: Store,
      title: t('stat_commercial'),
      value: stats.commercial,
      onClick: onCommercialClick,
    },
    {
      icon: TreePine,
      title: t('stat_land'),
      value: stats.land,
      onClick: onLandClick,
    },
    {
      icon: Home,
      title: t('summary_ready_full'),
      value: stats.ready,
      sub: t('summary_ready'),
      onClick: onReadyClick,
    },
    {
      icon: HardHat,
      title: t('summary_under_construction_full'),
      value: stats.underConstruction,
      sub: t('summary_under_construction'),
      onClick: onUnderConstructionClick,
    },
    {
      icon: KeyRound,
      title: t('stat_vacant'),
      value: stats.vacant,
      sub: t('stat_vacant_sub'),
      onClick: onVacantClick,
    },
    {
      icon: ScrollText,
      title: t('stat_expiring_contracts'),
      value: stats.expiring,
      sub: expiringSub,
      onClick: onExpiringClick,
    },
  ];

  return (
    <section className="mb-8 space-y-6">
      {/* Portfolio summary */}
      <div className="space-y-3.5">
        <div className="px-0.5">
          <h3 className="text-lg font-bold tracking-tight text-foreground">
            {t('summary_title')}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('summary_subtitle')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-6">
          {portfolioCards.map((c) => (
            <SummaryCard key={c.title} {...c} />
          ))}
        </div>
      </div>

      {/* Soft divider */}
      <div className="flex items-center justify-center gap-2 py-0.5" aria-hidden>
        <div className="h-px flex-1 max-w-[40%] bg-border/80" />
        <div className="h-1.5 w-1.5 rounded-full bg-primary/70" />
        <div className="h-px flex-1 max-w-[40%] bg-border/80" />
      </div>

      {/* Property management overview — same card style, no outer box */}
      <div className="space-y-3.5">
        <div className="px-0.5">
          <h3 className="text-lg font-bold tracking-tight text-foreground">
            {t('overview_title')}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('overview_subtitle')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4 xl:grid-cols-8">
          {overviewCards.map((c) => (
            <SummaryCard key={c.title} {...c} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default SummaryCards;
