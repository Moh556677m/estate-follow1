import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Banknote,
  Bell,
  Building2,
  CalendarClock,
  ClipboardEdit,
  Clock,
  CreditCard,
  ChevronRight,
  Columns3,
  CheckSquare,
  FileBarChart,
  FileDown,
  FileSpreadsheet,
  FileText,
  FolderTree,
  History,
  Home,
  HardHat,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  LineChart,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Wallet,
  Wrench,
  Handshake,
  Gift,
  Heart,
  Settings2,
  Store,
  TreePine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import AppLayout from '@/components/AppLayout';
import PropertyForm from '@/components/PropertyForm';
import SecurityPanel from '@/components/SecurityPanel';
import SupportPanel from '@/components/SupportPanel';
import SummaryCards from '@/components/SummaryCards';
import RentPropertyModal from '@/components/RentPropertyModal';
import MyProperties from '@/components/MyProperties';
import PropertyProfile from '@/components/PropertyProfile';
import NotificationCenter from '@/components/NotificationCenter';
import useNotificationEngine from '@/hooks/useNotificationEngine';
import useFeatureEntitlements from '@/hooks/useFeatureEntitlements';
import FeatureLockedNotice from '@/components/features/FeatureLockedNotice';
import VerifiedBadge from '@/components/VerifiedBadge';
// Task #26 (Performance + UX audit) — these panels are each rendered from
// exactly one call site (the sections[section]() dispatch below, verified
// via `grep -c "<ComponentName"`), so they are safe to code-split with
// React.lazy: none of them are needed for the initial paint of the owner
// dashboard, only after the owner picks a specific section.
const OwnerProfileEditor = lazy(() => import('@/components/OwnerProfileEditor'));
const DocumentsCenter = lazy(() => import('@/components/DocumentsCenter'));
const ReferralPanel = lazy(() => import('@/components/ReferralPanel'));
const SubscriptionPanel = lazy(() => import('@/components/SubscriptionPanel'));
const MonthlyReportsPanel = lazy(() => import('@/components/MonthlyReportsPanel'));
const AlertsPanel = lazy(() => import('@/components/AlertsPanel'));
const AiPropertyChat = lazy(() => import('@/components/AiPropertyChat'));
const PropertyCalendar = lazy(() => import('@/components/PropertyCalendar'));
const NotificationSettingsPage = lazy(() => import('@/components/NotificationSettingsPage'));
const NetProfitPanel = lazy(() => import('@/components/features/NetProfitPanel'));
const CashFlowForecastPanel = lazy(() => import('@/components/features/CashFlowForecastPanel'));
const TaskCenterPanel = lazy(() => import('@/components/features/TaskCenterPanel'));
const ExpenseCenterPanel = lazy(() => import('@/components/features/ExpenseCenterPanel'));
const PropertyComparisonPanel = lazy(() => import('@/components/features/PropertyComparisonPanel'));
const AiPortfolioAdvisorPanel = lazy(() => import('@/components/features/AiPortfolioAdvisorPanel'));
const OccupancyRatePanel = lazy(() => import('@/components/features/OccupancyRatePanel'));
const CustomReportsPanel = lazy(() => import('@/components/features/CustomReportsPanel'));
const WhatIfSimulatorPanel = lazy(() => import('@/components/features/WhatIfSimulatorPanel'));
const TaxExportPanel = lazy(() => import('@/components/features/TaxExportPanel'));
const PortfolioGoalsPanel = lazy(() => import('@/components/features/PortfolioGoalsPanel'));
const CommandCenterPanel = lazy(() => import('@/components/features/CommandCenterPanel'));
const PropertyHealthScorePanel = lazy(() => import('@/components/features/PropertyHealthScorePanel'));
const TenantScorePanel = lazy(() => import('@/components/features/TenantScorePanel'));
const SecurityDepositPanel = lazy(() => import('@/components/features/SecurityDepositPanel'));
const ClaimsCenterPanel = lazy(() => import('@/components/features/ClaimsCenterPanel'));
const MarketRentComparisonPanel = lazy(() => import('@/components/features/MarketRentComparisonPanel'));
const PortfolioNetWorthPanel = lazy(() => import('@/components/features/PortfolioNetWorthPanel'));
const LtvPanel = lazy(() => import('@/components/features/LtvPanel'));
const PropertyStatementsPanel = lazy(() => import('@/components/features/PropertyStatementsPanel'));
const PortfolioDistributionPanel = lazy(() => import('@/components/features/PortfolioDistributionPanel'));
const LifetimeReturnPanel = lazy(() => import('@/components/features/LifetimeReturnPanel'));
const OwnerMarketplacePanel = lazy(() => import('@/components/features/OwnerMarketplacePanel'));
const SmartSuggestionsPanel = lazy(() => import('@/components/features/SmartSuggestionsPanel'));
import {
  DocButton,
  EmptyState,
  StatusBadge,
  StatusDot,
  installmentState,
  propertyIndicator,
} from '@/components/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { notify } from '@/lib/notify';
import {
  loadSubscriptionSettings,
  countOwnedProperties,
  DEFAULT_SETTINGS,
  loadSpecialAccess,
  resolvePropertyAccess,
} from '@/lib/subscriptionUtils';
import { loadConfig } from '@/lib/notifications';
import { daysUntil, formatDate, formatMoney, propertyLabel, waLink } from '@/lib/api';
import { countryName } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { needsProfileCompletion } from '@/lib/profileCompletion';

const OWNER_SECTIONS = [
  'home',
  'ai',
  'my-properties',
  'properties',
  'pending',
  'changes',
  'cash',
  'installments',
  'rentals',
  'vacant',
  'expiring-contracts',
  'upcoming-payments',
  'due-payments',
  'yearly-charges',
  'monthly-income',
  'monthly-installments',
  'residential',
  'commercial',
  'land',
  'ready',
  'under-construction',
  'alerts',
  'calendar',
  'payments',
  'documents',
  'referrals',
  'subscription',
  'notifications',
  'notification-settings',
  'profile',
  'verify',
  'security',
  'support',
  // Task #17 — Central Features system (feature-driven, entitlement-gated)
  'net-profit',
  'cash-flow-forecast',
  'tasks',
  'expenses',
  'maintenance',
  'compare',
  'ai-advisor',
  'occupancy',
  // Task #18
  'custom-reports',
  'whatif',
  'tax-export',
  'goals',
  'command-center',
];

// Task #17 — maps the `icon` string stored on each feature_entitlements row
// (see 1789800000_task17_feature_system.js) to the actual lucide-react
// component, so navigation can stay data-driven instead of a hardcoded
// switch per feature.
// digital_vault/secure_sharing are intentionally absent — both route to the
// existing /dashboard/documents nav entry, so they never get a SEPARATE nav
// item (that would be a duplicate link to the same page).
const FEATURE_ICON_MAP = {
  TrendingUp,
  LineChart,
  CheckSquare,
  History,
  Receipt,
  Columns3,
  Sparkles,
  KeyRound,
  Wrench,
  // Task #18
  FileSpreadsheet,
  SlidersHorizontal,
  FileDown,
  Target,
  LayoutDashboard,
  // Feature Management batch
  Heart,
  UserRound,
  Wallet,
  ShieldCheck,
  Banknote,
  CreditCard,
  FolderTree,
  FileText,
  Store,
  Lightbulb,
};

// Section keys reachable purely through feature-driven nav (built from
// GET /ef/my-entitlements at render time — see `featureSectionComponents`
// below), rather than the hardcoded `sections` map.
const FEATURE_PANEL_ROUTES = {
  net_property_profit: 'net-profit',
  cash_flow_forecast: 'cash-flow-forecast',
  task_center: 'tasks',
  expense_center: 'expenses',
  maintenance_center: 'maintenance',
  property_comparison: 'compare',
  ai_portfolio_advisor: 'ai-advisor',
  occupancy_rate: 'occupancy',
  // Task #18
  custom_reports: 'custom-reports',
  whatif_simulator: 'whatif',
  tax_accounting_export: 'tax-export',
  portfolio_goals: 'goals',
  command_center: 'command-center',
  // Feature Management batch
  property_health_score: 'property-health',
  tenant_score: 'tenant-score',
  security_deposit_management: 'security-deposits',
  claims_center: 'claims',
  market_rent_comparison: 'market-rent',
  portfolio_net_worth: 'net-worth',
  ltv_ratio: 'ltv',
  property_statements: 'property-statements',
  portfolio_distribution: 'portfolio-distribution',
  lifetime_return: 'lifetime-return',
  owner_marketplace: 'marketplace',
  smart_monthly_suggestions: 'smart-suggestions',
};

const OwnerDashboard = () => {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { section: sectionParam, propertyId } = useParams();
  const section = sectionParam || 'home';

  const [properties, setProperties] = useState([]);
  const [payments, setPayments] = useState([]);
  // Tenancies (+ their checks) — the additive, non-destructive rental model.
  // Renting a cash/installment property never touches its own row; it links
  // one of these via property_id/owner_id instead.
  const [tenancies, setTenancies] = useState([]);
  const [rentPayments, setRentPayments] = useState([]);
  const [rentModalProperty, setRentModalProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [convertTarget, setConvertTarget] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [payFilter, setPayFilter] = useState('all');
  const [usageFilter, setUsageFilter] = useState('all');
  const [alertsPropertyFilter, setAlertsPropertyFilter] = useState(null);
  // Never start as null — a null settings object used to collapse every
  // package limit to 0 and block "Add property" before settings finished loading.
  const [subSettings, setSubSettings] = useState(DEFAULT_SETTINGS);
  // Special Access (admin-granted allowance) — COMPLETELY SEPARATE from the
  // paid subscription. null = no active Special Access. While it has remaining
  // slots it takes PRIORITY in the add-property pre-check; once exhausted the
  // owner falls through to the normal paid subscription / trial check.
  const [specialAccess, setSpecialAccess] = useState(null);
  const [contractExpiryDays, setContractExpiryDays] = useState(30);

  // Notification engine — computes notifications from real data, fires push + sound.
  const dataReady = !loading && properties.length >= 0;
  useNotificationEngine({ properties, payments, ready: dataReady });

  // Task #17 — Central Features system: the single source of truth for
  // which of the 11 new features this owner currently sees in navigation.
  // Nav is built from this at render time (below) instead of being
  // hardcoded — an Admin toggling `visible`/`enabled`/plan on a feature row
  // takes effect on next load, with zero frontend nav code changes needed.
  const { navFeatures, isAvailable: isFeatureAvailable, features: featureMap } = useFeatureEntitlements();

  // Keep the latest translator without re-creating the data loader (which would
  // refetch every property/payment/notification on each language toggle).
  const tRef = useRef(t);
  tRef.current = t;

  const openEdit = (p) => {
    setEditing(p);
    setConvertTarget(null);
    setFormOpen(true);
  };

  const openConvert = (p, target) => {
    setEditing(p);
    setConvertTarget(target);
    setFormOpen(true);
  };

  // Renting a property opens RentPropertyModal — it never mutates the
  // property's own type/fields, only links a new tenancy via property_id.
  const openRent = (p) => setRentModalProperty(p);

  const load = useCallback(async (opts = {}) => {
    if (!user) return;
    const soft = !!opts.soft || properties.length > 0 || payments.length > 0;
    if (!soft) setLoading(true);
    setError('');
    try {
      const [props, pays, subS, tencs, rentPays] = await Promise.all([
        pb.collection('properties').getFullList({
          sort: '-created',
          requestKey: `owner-props-${user.id}`,
        }),
        pb.collection('payments').getFullList({
          sort: 'due_date',
          requestKey: `owner-pays-${user.id}`,
        }),
        loadSubscriptionSettings(),
        pb.collection('tenancies').getFullList({
          sort: '-created',
          requestKey: `owner-tenancies-${user.id}`,
        }).catch(() => []),
        pb.collection('rent_payments').getFullList({
          sort: 'due_date',
          requestKey: `owner-rentpays-${user.id}`,
        }).catch(() => []),
      ]);
      setProperties(props);
      setPayments(pays);
      setSubSettings(subS);
      setTenancies(tencs || []);
      setRentPayments(rentPays || []);
      // Load the owner's Special Access (admin-granted allowance). Independent
      // of the paid subscription; takes priority while slots remain, then
      // falls through to the subscription check once exhausted.
      const sa = await loadSpecialAccess(user.id).catch(() => null);
      setSpecialAccess(sa);
      // Load the Super-Admin-tunable contract expiry window (default 30).
      const cfg = await loadConfig().catch(() => null);
      if (cfg && cfg.contract_expiry_days != null) {
        setContractExpiryDays(Number(cfg.contract_expiry_days) || 30);
      }
    } catch {
      if (!soft) setError(tRef.current('something_wrong'));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime auto-sync: properties, payments and notifications update live
  // (admin approval, payment status, new notifications) without a manual reload.
  // Debounced so a burst of changes triggers one refetch, not many.
  useEffect(() => {
    if (!user) return undefined;
    let debounce = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        load({ soft: true });
      }, 350);
    };
    const cols = [
      'properties',
      'payments',
      'subscription_settings',
      'notification_config',
      'tenancies',
      'rent_payments',
    ];
    cols.forEach((c) => {
      void pb
        .collection(c)
        .subscribe('*', schedule)
        .catch(() => {});
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      cols.forEach((c) => {
        void pb.collection(c).unsubscribe('*').catch(() => {});
      });
    };
  }, [user, load]);

  const navItems = useMemo(
    () => [
      { key: 'home', icon: Home, label: t('nav_home') },
      {
        key: 'my-properties',
        icon: Building2,
        label: t('nav_my_properties') || (lang === 'ar' ? 'عقاراتي' : 'My Properties'),
        path: '/dashboard/my-properties',
      },
      {
        key: 'ai',
        icon: Sparkles,
        label: t('nav_estate_ai') || (lang === 'ar' ? 'Estate AI' : 'Estate AI'),
        path: '/dashboard/ai',
      },
      { key: 'alerts', icon: Bell, label: t('nav_alerts') || (lang === 'ar' ? 'التنبيهات والمتابعة' : 'Alerts & Follow-up'), path: '/dashboard/alerts' },
      { key: 'calendar', icon: CalendarClock, label: t('nav_calendar') || (lang === 'ar' ? 'تقويم العقارات' : 'Property Calendar'), path: '/dashboard/calendar' },
      { key: 'add-property', icon: Plus, label: t('add_property'), action: 'add-property' },
      // Properties are organized under 3 fixed usage sections (residential /
      // commercial / land). This replaces the old generic "view all" list —
      // every property lives under exactly one of these based on usage_type.
      { key: 'residential', icon: Home, label: t('residential_title'), path: '/dashboard/residential' },
      { key: 'commercial', icon: Store, label: t('commercial_title'), path: '/dashboard/commercial' },
      { key: 'land', icon: TreePine, label: t('land_title'), path: '/dashboard/land' },
      {
        key: 'management',
        icon: FolderTree,
        label: t('nav_management') || (lang === 'ar' ? 'الإدارة' : 'Management'),
        children: [
          { key: 'cash', icon: Banknote, label: t('nav_cash') },
          { key: 'installments', icon: CreditCard, label: t('nav_installments') },
          { key: 'rentals', icon: KeyRound, label: t('nav_rentals') },
          { key: 'ready', icon: Home, label: t('nav_ready') || (lang === 'ar' ? 'العقارات الجاهزة' : 'Ready Properties') },
          { key: 'under-construction', icon: HardHat, label: t('nav_under_construction') || (lang === 'ar' ? 'تحت الإنشاء' : 'Under Construction') },
          { key: 'vacant', icon: KeyRound, label: t('vacant_title') },
          { key: 'expiring-contracts', icon: ScrollText, label: t('expiring_title') },
          { key: 'pending', icon: Clock, label: t('nav_pending') || (lang === 'ar' ? 'قيد المراجعة' : 'Pending Review') },
          { key: 'changes', icon: ClipboardEdit, label: t('nav_changes') || (lang === 'ar' ? 'تعديلات مطلوبة' : 'Changes Requested') },
        ],
      },
      { key: 'payments', icon: Wallet, label: t('nav_payments') },
      { key: 'documents', icon: FileText, label: t('nav_documents') },
      // Task #17 — feature-driven group: built from GET /ef/my-entitlements
      // (navFeatures), not hardcoded. digital_vault/secure_sharing are
      // excluded here (see FEATURE_ICON_MAP comment) since they point at
      // the 'documents' entry just above — never a second link to the same
      // page. A feature still appears (locked) here even when not
      // currently entitled, per `visible` being a separate switch from
      // `available` — its panel shows the upgrade notice on open.
      ...(navFeatures
        .filter((f) => FEATURE_PANEL_ROUTES[f.key])
        .map((f) => ({
          key: FEATURE_PANEL_ROUTES[f.key],
          icon: FEATURE_ICON_MAP[f.icon] || Sparkles,
          label: lang === 'ar' ? (f.name_ar || f.name) : f.name,
          path: `/dashboard/${FEATURE_PANEL_ROUTES[f.key]}`,
        }))),
      { key: 'referrals', icon: Gift, label: t('nav_referrals') || (lang === 'ar' ? 'الإحالات' : 'Referrals') },
      { key: 'subscription', icon: Package, label: t('nav_subscription') || (lang === 'ar' ? 'الاشتراك' : 'Subscription') },
      { key: 'monthly-reports', icon: FileBarChart, label: t('nav_monthly_reports') || (lang === 'ar' ? 'التقارير الشهرية' : 'Monthly Reports'), path: '/dashboard/monthly-reports' },
      { key: 'notifications', icon: Bell, label: t('nav_notifications') || (lang === 'ar' ? 'مركز الإشعارات' : 'Notification Center') },
      { key: 'notification-settings', icon: Settings2, label: t('nav_notification_settings') || (lang === 'ar' ? 'إعدادات الإشعارات' : 'Notification Settings') },
      { key: 'profile', icon: UserRound, label: t('nav_profile') },
      { key: 'security', icon: ShieldCheck, label: t('nav_security') },
      { key: 'support', icon: LifeBuoy, label: t('nav_support') },
    ],
    [t, lang, navFeatures],
  );

  const markPaid = async (payment) => {
    await pb
      .collection('payments')
      .update(payment.id, { status: 'paid', paid_at: new Date().toISOString() });
    notify.success(
      lang === 'ar' ? 'تم تسجيل الدفع' : 'Payment marked paid',
      `${payment.label} · ${formatMoney(payment.amount, lang)}`,
    );
    load();
  };

  const propById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );

  // property_id -> its current active tenancy (or undefined). A property can
  // have many tenancies over time (one per lease); only the active one
  // matters for "is this currently rented".
  const activeTenancyByProperty = useMemo(() => {
    const map = {};
    tenancies.forEach((tc) => {
      if (tc.status === 'active') map[tc.property] = tc;
    });
    return map;
  }, [tenancies]);

  const approvedProperties = useMemo(
    () => properties.filter((p) => p.status === 'approved'),
    [properties],
  );
  const pendingProperties = useMemo(
    () => properties.filter((p) => p.status === 'pending'),
    [properties],
  );
  const changesProperties = useMemo(
    () => properties.filter((p) => p.status === 'changes_requested'),
    [properties],
  );

  const filteredPayments =
    payFilter === 'all' ? payments : payments.filter((p) => p.status === payFilter);

  // Same "approved only" scoping SummaryCards.jsx uses for its portfolio
  // stats (upcomingPayments/duePayments/monthlyInstallments) — kept as a
  // separate scope from the general "payments" page (which intentionally
  // shows ALL properties' payments) so the new upcoming/due/installments
  // drill-down pages always match their triggering card's exact count.
  const approvedPropertyIds = useMemo(
    () => new Set(approvedProperties.map((p) => p.id)),
    [approvedProperties],
  );
  const approvedPayments = useMemo(
    () => payments.filter((p) => approvedPropertyIds.has(p.property)),
    [payments, approvedPropertyIds],
  );
  const inMonth = (dateStr, year, month) => {
    if (!dateStr) return false;
    const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  };

  // Shared search/sort UI state for the drill-down list sections (rentals,
  // vacant, expiring-contracts, and the new yearly-charges/monthly-income/
  // monthly-installments/upcoming-payments/due-payments pages). Only one
  // section is visible at a time, so a single shared state is enough — it
  // resets whenever the section changes so a stale query never leaks into
  // an unrelated list.
  const [listQuery, setListQuery] = useState('');
  const [listSort, setListSort] = useState('default');
  useEffect(() => {
    setListQuery('');
    setListSort('default');
  }, [section]);

  const matchesListQuery = (p, extra = '') => {
    if (!listQuery.trim()) return true;
    const n = listQuery.trim().toLowerCase();
    return [p?.building, p?.unit_number, p?.area, p?.city, p?.tenant_name, extra]
      .some((v) => String(v || '').toLowerCase().includes(n));
  };

  const ListToolbar = ({ placeholder, sortOptions }) => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={listQuery}
          onChange={(e) => setListQuery(e.target.value)}
          placeholder={placeholder || (lang === 'ar' ? 'ابحث...' : 'Search...')}
          className="min-h-[40px] w-full rounded-lg border bg-card ps-9 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {sortOptions && sortOptions.length > 0 && (
        <select
          value={listSort}
          onChange={(e) => setListSort(e.target.value)}
          className="min-h-[40px] rounded-lg border bg-card px-3 py-2 text-sm"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const ViewProfileButton = ({ propertyId }) => (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => navigate(`/dashboard/property/${propertyId}`)}
      className="min-h-[36px] gap-1"
    >
      {t('view_profile') || (lang === 'ar' ? 'فتح الملف' : 'View profile')}
      <ChevronRight size={14} style={{ transform: lang === 'ar' ? 'scaleX(-1)' : undefined }} />
    </Button>
  );

  const whatsappFor = (payment) => {
    const prop = propById[payment.property];
    if (!prop) return null;
    const phone = payment.kind === 'rent' ? prop.tenant_phone : prop.owner_phone;
    const text = `${payment.label} — ${propertyLabel(prop)} — ${formatMoney(payment.amount, lang)} — ${t('due_date')}: ${formatDate(payment.due_date, lang)}`;
    return waLink(phone, text);
  };

  const paymentRow = (p) => {
    const prop = propById[p.property];
    const days = daysUntil(p.due_date);
    const wa = whatsappFor(p);
    return (
      <div
        key={p.id}
        className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
      >
        <div className="min-w-[180px] flex-1">
          <p className="text-sm font-semibold">{p.label}</p>
          <p className="text-xs text-muted-foreground">{propertyLabel(prop)}</p>
        </div>
        <div className="text-sm">
          <p className="font-semibold tabular-nums" dir="ltr">
            {formatMoney(p.amount, lang)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(p.due_date, lang)}
            {p.status !== 'paid' && days !== null && (
              <span className={cn('ms-1', days < 0 ? 'text-red-600' : 'text-[hsl(var(--gold))]')}>
                · {days <= 0 ? t('due_today') : `${days} ${t('days_left')}`}
              </span>
            )}
          </p>
        </div>
        <StatusBadge status={p.status} />
        <div className="flex items-center gap-2">
          {wa && p.status !== 'paid' && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors min-h-[36px]"
            >
              <MessageCircle size={13} className="text-emerald-600" />
              WhatsApp
            </a>
          )}
          {p.status !== 'paid' && (
            <Button size="sm" variant="outline" onClick={() => markPaid(p)} className="min-h-[36px]">
              {t('mark_paid')}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const typeLabel = (p) =>
    p.type === 'cash' ? t('type_cash') : p.type === 'installment' ? t('type_installment') : t('type_rented');

  const renderProperties = () => {
    const list = usageFilter === 'all'
      ? approvedProperties
      : approvedProperties.filter((p) => p.usage_type === usageFilter);
    return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {['all', 'residential', 'commercial', 'land'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setUsageFilter(f)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[40px]',
              usageFilter === f
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card hover:bg-accent',
            )}
          >
            {f === 'all' ? t('usage_type_all') : t(`usage_type_${f}`)}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState message={t('empty_properties')} icon={Building2} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((p) => {
            const ind = propertyIndicator(p, properties);
            return (
              <div key={p.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{p.building} / {p.unit_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.area}{p.country ? ` · ${countryName(p.country, lang)}` : ''}
                    </p>
                  </div>
                  {ind ? (
                    <StatusDot color={ind.color} label={t(ind.labelKey)} />
                  ) : (
                    <StatusBadge status={p.status} />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-primary/8 text-primary px-2.5 py-0.5 font-semibold">
                    {typeLabel(p)}
                  </span>
                  <span className="text-muted-foreground" dir="ltr">{p.owner_phone}</span>
                </div>
                {p.review_note && p.status === 'rejected' && (
                  <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                    {p.review_note}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(p)}
                    className="min-h-[36px]"
                  >
                    <Pencil size={13} className="me-1" />
                    {t('edit')}
                  </Button>
                  {(p.type === 'cash' || p.type === 'installment') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        openConvert(p, p.type === 'cash' ? 'installment' : 'cash')
                      }
                      className="min-h-[36px]"
                    >
                      <Repeat size={13} className="me-1" />
                      {t('convert_property_type')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setAlertsPropertyFilter(p.id); navigate('/dashboard/alerts'); }}
                    className="min-h-[36px]"
                  >
                    <Bell size={13} className="me-1" />
                    {t('nav_alerts') || (lang === 'ar' ? 'التنبيهات' : 'Alerts')}
                  </Button>
                  <DocButton record={p} field="title_deed_pdf" label={t('title_deed_pdf')} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    );
  };

  const renderCash = () => {
    const list = approvedProperties.filter((p) => p.type === 'cash');
    if (list.length === 0) return <EmptyState message={t('empty_cash')} icon={Banknote} />;
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('rental_match_hint')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((p) => {
            const ind = propertyIndicator(p, properties);
            return (
              <div key={p.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{p.building} / {p.unit_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.area}{p.country ? ` · ${countryName(p.country, lang)}` : ''}
                    </p>
                  </div>
                  {ind && <StatusDot color={ind.color} label={t(ind.labelKey)} />}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(p)}
                    className="min-h-[36px]"
                  >
                    <Pencil size={13} className="me-1" />
                    {t('edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openConvert(p, 'installment')}
                    className="min-h-[36px]"
                  >
                    <Repeat size={13} className="me-1" />
                    {t('convert_property_type')}
                  </Button>
                  <DocButton record={p} field="title_deed_pdf" label={t('title_deed_pdf')} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderInstallments = () => {
    const list = approvedProperties.filter((p) => p.type === 'installment');
    if (list.length === 0) return <EmptyState message={t('empty_properties')} icon={CreditCard} />;
    return (
      <div className="space-y-6">
        {list.map((p) => {
          const st = installmentState(p, payments);
          const pays = payments.filter((x) => x.property === p.id && x.kind === 'installment');
          const paidTotal = (p.down_payment || 0) + pays
            .filter((x) => x.status === 'paid')
            .reduce((s, x) => s + (x.amount || 0), 0);
          const remaining = Math.max(0, (p.total_price || 0) - paidTotal);
          const progress =
            p.total_price > 0 ? Math.min(100, Math.round((paidTotal / p.total_price) * 100)) : null;
          const unpaidCount = pays.filter((x) => x.status !== 'paid').length;
          return (
            <div key={p.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{propertyLabel(p)}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('handover_status')}:{' '}
                    <b>
                      {p.handover_status === 'handover_completed'
                        ? t('handover_completed')
                        : t('under_construction')}
                    </b>
                    {p.expected_handover_date && (
                      <> · {t('expected_handover_date')}: <b>{formatDate(p.expected_handover_date, lang)}</b></>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const ind = propertyIndicator(p, properties);
                    return ind ? <StatusDot color={ind.color} label={t(ind.labelKey)} /> : null;
                  })()}
                  {st.kind === 'orange' && (
                    <StatusDot color="orange" label={t('status_handover_remaining')} />
                  )}
                  {st.kind === 'completed' && (
                    <StatusDot color="green" label={t('status_completed')} />
                  )}
                  {st.kind === 'pending' && (
                    <StatusDot color="gray" label={t('status_under_construction')} />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  [t('total_price'), p.total_price],
                  [t('down_payment'), p.down_payment],
                  [t('remaining'), remaining],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-lg bg-accent/50 px-2 py-3">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="font-bold tabular-nums" dir="ltr">{formatMoney(val, lang)}</p>
                  </div>
                ))}
              </div>
              {progress !== null && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>{t('progress_label')}</span>
                    <span className="tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-accent overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        st.kind === 'completed' ? 'bg-emerald-500' : 'bg-[hsl(var(--gold))]',
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {unpaidCount > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {unpaidCount} {t('installments_remaining')}
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">{pays.map(paymentRow)}</div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => openEdit(p)} className="min-h-[36px]">
                  <Pencil size={13} className="me-1" />
                  {t('edit')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openConvert(p, 'cash')}
                  className="min-h-[36px]"
                >
                  <Repeat size={13} className="me-1" />
                  {t('convert_property_type')}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const markCheckCollected = async (check) => {
    await pb
      .collection('rent_payments')
      .update(check.id, { status: 'collected', collected_at: new Date().toISOString() });
    notify.success(
      lang === 'ar' ? 'تم تسجيل التحصيل' : 'Check marked collected',
      formatMoney(check.amount, lang),
    );
    load();
  };

  const checkRow = (c) => {
    const days = daysUntil(c.due_date);
    return (
      <div
        key={c.id}
        className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
      >
        <div className="min-w-[160px] flex-1">
          <p className="text-sm font-semibold">
            {c.check_number ? `${lang === 'ar' ? 'شيك' : 'Check'} #${c.check_number}` : (lang === 'ar' ? 'دفعة إيجار' : 'Rent payment')}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(c.due_date, lang)}
            {c.status !== 'collected' && days !== null && (
              <span className={cn('ms-1', days < 0 ? 'text-red-600' : 'text-[hsl(var(--gold))]')}>
                · {days <= 0 ? t('due_today') : `${days} ${t('days_left')}`}
              </span>
            )}
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums" dir="ltr">{formatMoney(c.amount, lang)}</p>
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
            c.status === 'collected'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : c.status === 'bounced'
                ? 'bg-red-100 text-red-800 border-red-200'
                : 'bg-amber-50 text-amber-700 border-amber-200',
          )}
        >
          {c.status === 'collected'
            ? (lang === 'ar' ? 'تم التحصيل' : 'Collected')
            : c.status === 'bounced'
              ? (lang === 'ar' ? 'مرتجع' : 'Bounced')
              : (lang === 'ar' ? 'قيد الانتظار' : 'Pending')}
        </span>
        {c.status !== 'collected' && (
          <Button size="sm" variant="outline" onClick={() => markCheckCollected(c)} className="min-h-[36px]">
            {lang === 'ar' ? 'تحصيل' : 'Mark collected'}
          </Button>
        )}
      </div>
    );
  };

  const renderRentals = () => {
    const activeAll = tenancies.filter((tc) => tc.status === 'active');
    // Legacy fallback: properties that still hold the old flat type="rented"
    // shape (not yet migrated) keep showing up here too.
    const legacyAll = approvedProperties.filter(
      (p) => p.type === 'rented' && !activeAll.some((tc) => tc.property === p.id),
    );
    const active = activeAll.filter((tc) => matchesListQuery(propById[tc.property], tc.tenant_name));
    const legacy = legacyAll.filter((p) => matchesListQuery(p, p.tenant_name));
    const sortByEnd = (a, b) => {
      const da = a.end_date || a.contract_end_date || '';
      const db = b.end_date || b.contract_end_date || '';
      return listSort === 'end_date_desc' ? db.localeCompare(da) : da.localeCompare(db);
    };
    if (listSort === 'end_date_asc' || listSort === 'end_date_desc') {
      active.sort(sortByEnd);
      legacy.sort(sortByEnd);
    }
    if (activeAll.length === 0 && legacyAll.length === 0)
      return <EmptyState message={t('empty_properties')} icon={KeyRound} />;
    return (
      <div className="space-y-6">
        <ListToolbar
          placeholder={lang === 'ar' ? 'ابحث بالمبنى، الوحدة أو اسم المستأجر...' : 'Search by building, unit or tenant name...'}
          sortOptions={[
            { value: 'default', label: lang === 'ar' ? 'الترتيب الافتراضي' : 'Default order' },
            { value: 'end_date_asc', label: lang === 'ar' ? 'الأقرب انتهاءً' : 'Ending soonest' },
            { value: 'end_date_desc', label: lang === 'ar' ? 'الأبعد انتهاءً' : 'Ending latest' },
          ]}
        />
        {active.length === 0 && legacy.length === 0 && (
          <EmptyState message={t('no_search_results') || (lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching results')} icon={KeyRound} />
        )}
        {active.map((tc) => {
          const p = propById[tc.property];
          if (!p) return null;
          const checks = rentPayments.filter((x) => x.tenancy === tc.id);
          const totalScheduled = checks.reduce((s, x) => s + (Number(x.amount) || 0), 0);
          const totalCollected = checks
            .filter((x) => x.status === 'collected')
            .reduce((s, x) => s + (Number(x.amount) || 0), 0);
          const remaining = Math.max(0, totalScheduled - totalCollected);
          const nextDue = checks
            .filter((x) => x.status !== 'collected' && x.due_date)
            .map((x) => String(x.due_date).slice(0, 10))
            .sort()[0];
          return (
            <div key={tc.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{propertyLabel(p)}</p>
                  <p className="text-sm text-muted-foreground">
                    {tc.start_date && (
                      <> {t('contract_start_date')}: <b dir="ltr">{formatDate(tc.start_date, lang)}</b></>
                    )}
                    {tc.end_date && (
                      <> · {t('contract_end_date')}: <b dir="ltr">{formatDate(tc.end_date, lang)}</b></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  <ViewProfileButton propertyId={p.id} />
                </div>
              </div>
              <div className="rounded-lg bg-accent/50 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span>
                  {t('tenant')}: <b>{tc.tenant_name}</b>
                </span>
                <span dir="ltr" className="text-muted-foreground">{tc.tenant_phone}</span>
                <span dir="ltr" className="text-muted-foreground">{tc.tenant_email}</span>
                {tc.lease_contract && <DocButton record={tc} field="lease_contract" label={t('lease_contract')} />}
              </div>
              <div className="rounded-lg border bg-accent/40 p-3 space-y-2">
                <p className="text-sm font-bold">{t('rental_summary')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('summary_security_deposit')}</p>
                    <p className="font-semibold tabular-nums" dir="ltr">{formatMoney(tc.security_deposit || 0, lang)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('summary_total_payments')}</p>
                    <p className="font-semibold tabular-nums">{checks.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('summary_total_collected')}</p>
                    <p className="font-semibold tabular-nums text-emerald-700" dir="ltr">{formatMoney(totalCollected, lang)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('summary_remaining')}</p>
                    <p className="font-semibold tabular-nums text-red-600" dir="ltr">{formatMoney(remaining, lang)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t('summary_next_due')}</p>
                    <p className="font-semibold" dir="ltr">{nextDue ? formatDate(nextDue, lang) : t('summary_none')}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">{checks.map(checkRow)}</div>
            </div>
          );
        })}
        {legacy.map((p) => {
          const pays = payments.filter((x) => x.property === p.id && x.kind === 'rent');
          return (
            <div key={p.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold">{propertyLabel(p)}</p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  <ViewProfileButton propertyId={p.id} />
                </div>
              </div>
              <div className="rounded-lg bg-accent/50 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span>{t('tenant')}: <b>{p.tenant_name}</b></span>
                <span dir="ltr" className="text-muted-foreground">{p.tenant_phone}</span>
              </div>
              <div className="space-y-2">{pays.map(paymentRow)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderVacant = () => {
    // A cash/installment property is "vacant" when it has no active tenancy
    // linked to it (property_id match) — never string-matched by
    // building/unit against a separate "rented" row anymore. Identical to
    // SummaryCards.jsx's stat.vacant so the card count never disagrees with
    // this list again.
    const listAll = approvedProperties.filter(
      (p) => (p.type === 'cash' || p.type === 'installment') && !activeTenancyByProperty[p.id],
    );
    let list = listAll.filter((p) => matchesListQuery(p));
    if (listSort === 'name_asc') list = [...list].sort((a, b) => String(a.building || '').localeCompare(String(b.building || '')));
    if (listSort === 'name_desc') list = [...list].sort((a, b) => String(b.building || '').localeCompare(String(a.building || '')));
    if (listAll.length === 0)
      return <EmptyState message={t('vacant_empty')} icon={KeyRound} />;
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('vacant_subtitle')}</p>
        <ListToolbar
          placeholder={lang === 'ar' ? 'ابحث بالمبنى أو الوحدة...' : 'Search by building or unit...'}
          sortOptions={[
            { value: 'default', label: lang === 'ar' ? 'الترتيب الافتراضي' : 'Default order' },
            { value: 'name_asc', label: lang === 'ar' ? 'أ - ي' : 'A - Z' },
            { value: 'name_desc', label: lang === 'ar' ? 'ي - أ' : 'Z - A' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState message={t('no_search_results') || (lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching results')} icon={KeyRound} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((p) => (
              <div key={p.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{p.building} / {p.unit_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.area}{p.country ? ` · ${countryName(p.country, lang)}` : ''}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">
                    <span className="h-2 w-2 rounded-full bg-orange-500" aria-hidden />
                    {t('status_not_rented')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(p)}
                    className="min-h-[36px]"
                  >
                    <Pencil size={13} className="me-1" />
                    {t('edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openRent(p)}
                    className="min-h-[36px]"
                  >
                    <KeyRound size={13} className="me-1" />
                    {t('rent_this_property') || (lang === 'ar' ? 'تأجير هذا العقار' : 'Rent this property')}
                  </Button>
                  <ViewProfileButton propertyId={p.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // WhatsApp-style property rows for a usage section (residential / commercial
  // / land). Each row is a compact, tappable chat-style entry showing the
  // building/project, unit number and country — clicking opens the property
  // profile page (/dashboard/property/:id) which gathers every detail, fee,
  // installment, alert and document for that one property.
  const renderUsageList = (usageType) => {
    const list = approvedProperties.filter((p) => p.usage_type === usageType);
    const UsageIcon = usageType === 'land' ? TreePine : usageType === 'commercial' ? Store : Home;
    if (list.length === 0)
      return (
        <EmptyState
          message={t('usage_empty')}
          icon={UsageIcon}
        />
      );
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t('usage_section_hint') || (lang === 'ar'
            ? 'اضغط أي عقار لفتح صفحته الكاملة (البيانات، الرسوم، الأقساط، التنبيهات والمستندات).'
            : 'Tap any property to open its full profile (data, fees, installments, alerts and documents).')}
        </p>
        {list.map((p) => {
          const ind = propertyIndicator(p, properties);
          const pays = payments.filter((x) => x.property === p.id);
          const overdueCount = pays.filter(
            (x) => x.status !== 'paid' && daysUntil(x.due_date) < 0,
          ).length;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/dashboard/property/${p.id}`)}
              className="group w-full text-start flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-sm transition-colors hover:bg-accent/40 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring min-h-[64px]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <UsageIcon size={20} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">
                  {p.building || (lang === 'ar' ? 'بدون اسم' : 'Untitled')}
                  {p.unit_number ? (
                    <span className="text-muted-foreground font-semibold"> · {t('docs_unit')} {p.unit_number}</span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {p.area || p.city || '—'}
                  {p.country ? ` · ${countryName(p.country, lang)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {ind ? (
                  <StatusDot color={ind.color} label={t(ind.labelKey)} />
                ) : (
                  <span className="rounded-full bg-primary/8 text-primary px-2.5 py-0.5 text-[10px] font-semibold">
                    {typeLabel(p)}
                  </span>
                )}
                {overdueCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground" dir="ltr">
                    {overdueCount}
                  </span>
                )}
                <ChevronRight
                  size={18}
                  className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  style={{ transform: lang === 'ar' ? 'scaleX(-1)' : undefined }}
                />
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderHandoverList = (handoverStatus) => {
    const list = approvedProperties.filter((p) => p.handover_status === handoverStatus);
    const isReady = handoverStatus === 'handover_completed';
    if (list.length === 0)
      return (
        <EmptyState
          message={isReady ? t('ready_empty') : t('under_construction_empty')}
          icon={isReady ? Home : HardHat}
        />
      );
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {isReady ? t('ready_subtitle') : t('under_construction_subtitle')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((p) => {
            const ind = propertyIndicator(p, properties);
            return (
              <div key={p.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{p.building} / {p.unit_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.area}{p.country ? ` · ${countryName(p.country, lang)}` : ''}
                    </p>
                  </div>
                  {ind ? <StatusDot color={ind.color} label={t(ind.labelKey)} /> : <StatusBadge status={p.status} />}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-primary/8 text-primary px-2.5 py-0.5 font-semibold">
                    {typeLabel(p)}
                  </span>
                  <span className="rounded-full bg-accent px-2.5 py-0.5 font-semibold text-muted-foreground">
                    {isReady ? t('summary_ready') : t('summary_under_construction')}
                  </span>
                  {!isReady && p.expected_handover_date && (
                    <span className="text-muted-foreground" dir="ltr">
                      {t('expected_handover_date')}: {formatDate(p.expected_handover_date, lang)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)} className="min-h-[36px]">
                    <Pencil size={13} className="me-1" />
                    {t('edit')}
                  </Button>
                  {(p.type === 'cash' || p.type === 'installment') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openConvert(p, p.type === 'cash' ? 'installment' : 'cash')}
                      className="min-h-[36px]"
                    >
                      <Repeat size={13} className="me-1" />
                      {t('convert_property_type')}
                    </Button>
                  )}
                  <DocButton record={p} field="title_deed_pdf" label={t('title_deed_pdf')} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderExpiringContracts = () => {
    const window = Number(contractExpiryDays) > 0 ? Number(contractExpiryDays) : 30;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeTencs = tenancies.filter((tc) => tc.status === 'active' && tc.end_date);
    const list = activeTencs
      .map((tc) => {
        const p = propById[tc.property];
        const d = new Date(String(tc.end_date).slice(0, 10) + 'T00:00:00');
        const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
        return { p, tc, diff };
      })
      .filter((x) => x.p && x.diff != null && x.diff >= 0 && x.diff <= window)
      .sort((a, b) => a.diff - b.diff);
    // Legacy fallback for not-yet-migrated flat type="rented" properties.
    const legacyList = approvedProperties
      .filter((p) => p.type === 'rented' && p.contract_end_date && !activeTenancyByProperty[p.id])
      .map((p) => {
        const d = new Date(String(p.contract_end_date).slice(0, 10) + 'T00:00:00');
        const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
        return { p, tc: null, diff };
      })
      .filter((x) => x.diff != null && x.diff >= 0 && x.diff <= window);
    const mergedAll = [...list, ...legacyList].sort((a, b) => a.diff - b.diff);
    let merged = mergedAll.filter(({ p, tc }) => matchesListQuery(p, tc ? tc.tenant_name : p.tenant_name));
    if (listSort === 'diff_desc') merged = [...merged].sort((a, b) => b.diff - a.diff);
    if (mergedAll.length === 0)
      return <EmptyState message={t('expiring_empty')} icon={ScrollText} />;
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {t('expiring_subtitle').replace('{days}', String(window))}
        </p>
        <ListToolbar
          placeholder={lang === 'ar' ? 'ابحث بالمبنى، الوحدة أو اسم المستأجر...' : 'Search by building, unit or tenant name...'}
          sortOptions={[
            { value: 'default', label: lang === 'ar' ? 'الأقرب انتهاءً أولًا' : 'Soonest first' },
            { value: 'diff_desc', label: lang === 'ar' ? 'الأبعد انتهاءً أولًا' : 'Latest first' },
          ]}
        />
        {merged.length === 0 ? (
          <EmptyState message={t('no_search_results') || (lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching results')} icon={ScrollText} />
        ) : (
          <div className="space-y-2">
            {merged.map(({ p, tc, diff }) => {
              const endDate = tc ? tc.end_date : p.contract_end_date;
              const tenantName = tc ? tc.tenant_name : p.tenant_name;
              return (
              <button
                type="button"
                key={tc ? tc.id : p.id}
                onClick={() => navigate(`/dashboard/property/${p.id}`)}
                className="flex w-full flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm text-start transition-colors hover:bg-accent/40 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="min-w-[200px] flex-1">
                  <p className="text-sm font-semibold">{p.building} / {p.unit_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('tenant_name')}: <b>{tenantName || '—'}</b>
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-[11px] text-muted-foreground">{t('contract_end_date')}</p>
                  <p className="font-semibold tabular-nums" dir="ltr">
                    {formatDate(endDate, lang)}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                    diff <= 7
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700',
                  )}
                >
                  {diff <= 0
                    ? t('due_today')
                    : `${diff} ${t('days_left')}`}
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" style={{ transform: lang === 'ar' ? 'scaleX(-1)' : undefined }} />
              </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderPayments = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['all', 'upcoming', 'overdue', 'paid'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setPayFilter(f)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[40px]',
              payFilter === f
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card hover:bg-accent',
            )}
          >
            {f === 'all' ? t('all') : t(`status_${f}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('reminders_hint')}</p>
      {filteredPayments.length === 0 ? (
        <EmptyState message={t('empty_payments')} icon={Wallet} />
      ) : (
        <div className="space-y-2">{filteredPayments.map(paymentRow)}</div>
      )}
    </div>
  );

  // --- New drill-down pages (Task #13) for the 6 previously-unclickable
  // portfolio cards. Each is scoped EXACTLY like its triggering card in
  // SummaryCards.jsx (approved-only), so the number on the card and the
  // count shown here always agree — this is deliberately a narrower scope
  // than the general "payments" page (renderPayments above), which is left
  // untouched.

  const renderScopedPayments = (statusFilter, emptyMsg, emptyIcon) => {
    const listAll = approvedPayments.filter((p) => p.status === statusFilter);
    let list = listAll.filter((p) => matchesListQuery(propById[p.property], p.label));
    if (listSort === 'amount_desc') list = [...list].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    if (listSort === 'amount_asc') list = [...list].sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    if (listSort === 'due_date_asc') list = [...list].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    if (listAll.length === 0) return <EmptyState message={emptyMsg} icon={emptyIcon} />;
    return (
      <div className="space-y-4">
        <ListToolbar
          sortOptions={[
            { value: 'default', label: lang === 'ar' ? 'الترتيب الافتراضي' : 'Default order' },
            { value: 'due_date_asc', label: lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due date' },
            { value: 'amount_desc', label: lang === 'ar' ? 'الأعلى قيمة' : 'Highest amount' },
            { value: 'amount_asc', label: lang === 'ar' ? 'الأقل قيمة' : 'Lowest amount' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState message={t('no_search_results') || (lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching results')} icon={emptyIcon} />
        ) : (
          <div className="space-y-2">{list.map(paymentRow)}</div>
        )}
      </div>
    );
  };

  const renderUpcomingPayments = () =>
    renderScopedPayments(
      'upcoming',
      t('empty_payments'),
      Wallet,
    );

  const renderDuePayments = () =>
    renderScopedPayments(
      'overdue',
      t('empty_payments'),
      Receipt,
    );

  const renderYearlyCharges = () => {
    const listAll = approvedProperties.filter((p) => p.service_charge_frequency === 'yearly');
    let list = listAll.filter((p) => matchesListQuery(p));
    if (listSort === 'amount_desc') list = [...list].sort((a, b) => Number(b.service_charge_amount || 0) - Number(a.service_charge_amount || 0));
    if (listSort === 'amount_asc') list = [...list].sort((a, b) => Number(a.service_charge_amount || 0) - Number(b.service_charge_amount || 0));
    if (listAll.length === 0)
      return <EmptyState message={t('empty_properties')} icon={Receipt} />;
    return (
      <div className="space-y-4">
        <ListToolbar
          placeholder={lang === 'ar' ? 'ابحث بالمبنى أو الوحدة...' : 'Search by building or unit...'}
          sortOptions={[
            { value: 'default', label: lang === 'ar' ? 'الترتيب الافتراضي' : 'Default order' },
            { value: 'amount_desc', label: lang === 'ar' ? 'الأعلى قيمة' : 'Highest amount' },
            { value: 'amount_asc', label: lang === 'ar' ? 'الأقل قيمة' : 'Lowest amount' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState message={t('no_search_results') || (lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching results')} icon={Receipt} />
        ) : (
          <div className="space-y-2">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/dashboard/property/${p.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-sm text-start transition-colors hover:bg-accent/40 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{p.building} / {p.unit_number}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.area}{p.country ? ` · ${countryName(p.country, lang)}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-semibold tabular-nums" dir="ltr">{formatMoney(p.service_charge_amount || 0, lang)}</p>
                  <ChevronRight size={16} className="text-muted-foreground" style={{ transform: lang === 'ar' ? 'scaleX(-1)' : undefined }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMonthlyIncome = () => {
    const listAll = approvedProperties.filter((p) => p.type === 'rented');
    let list = listAll.filter((p) => matchesListQuery(p));
    if (listSort === 'amount_desc') list = [...list].sort((a, b) => Number(b.rent_amount || 0) - Number(a.rent_amount || 0));
    if (listSort === 'amount_asc') list = [...list].sort((a, b) => Number(a.rent_amount || 0) - Number(b.rent_amount || 0));
    if (listAll.length === 0)
      return <EmptyState message={t('empty_properties')} icon={TrendingUp} />;
    return (
      <div className="space-y-4">
        <ListToolbar
          placeholder={lang === 'ar' ? 'ابحث بالمبنى أو الوحدة...' : 'Search by building or unit...'}
          sortOptions={[
            { value: 'default', label: lang === 'ar' ? 'الترتيب الافتراضي' : 'Default order' },
            { value: 'amount_desc', label: lang === 'ar' ? 'الأعلى قيمة' : 'Highest amount' },
            { value: 'amount_asc', label: lang === 'ar' ? 'الأقل قيمة' : 'Lowest amount' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState message={t('no_search_results') || (lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching results')} icon={TrendingUp} />
        ) : (
          <div className="space-y-2">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/dashboard/property/${p.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3.5 shadow-sm text-start transition-colors hover:bg-accent/40 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{p.building} / {p.unit_number}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.area}{p.country ? ` · ${countryName(p.country, lang)}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-semibold tabular-nums" dir="ltr">{formatMoney(Number(p.rent_amount || 0) / 12, lang)}</p>
                  <ChevronRight size={16} className="text-muted-foreground" style={{ transform: lang === 'ar' ? 'scaleX(-1)' : undefined }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMonthlyInstallments = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const listAll = approvedPayments.filter(
      (p) => p.kind === 'installment' && p.status !== 'paid' && inMonth(p.due_date, year, month),
    );
    let list = listAll.filter((p) => matchesListQuery(propById[p.property], p.label));
    if (listSort === 'amount_desc') list = [...list].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    if (listSort === 'amount_asc') list = [...list].sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    if (listSort === 'due_date_asc') list = [...list].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    if (listAll.length === 0)
      return <EmptyState message={t('empty_payments')} icon={Banknote} />;
    return (
      <div className="space-y-4">
        <ListToolbar
          sortOptions={[
            { value: 'default', label: lang === 'ar' ? 'الترتيب الافتراضي' : 'Default order' },
            { value: 'due_date_asc', label: lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due date' },
            { value: 'amount_desc', label: lang === 'ar' ? 'الأعلى قيمة' : 'Highest amount' },
            { value: 'amount_asc', label: lang === 'ar' ? 'الأقل قيمة' : 'Lowest amount' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState message={t('no_search_results') || (lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching results')} icon={Banknote} />
        ) : (
          <div className="space-y-2">{list.map(paymentRow)}</div>
        )}
      </div>
    );
  };

  const renderNotifications = () => <NotificationCenter />;

  const renderChanges = () => {
    if (changesProperties.length === 0)
      return <EmptyState message={t('empty_changes')} icon={ClipboardEdit} />;
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-orange-50 border border-orange-100 px-4 py-3 text-sm text-orange-800">
          {t('changes_requested_hint')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {changesProperties.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{p.building} / {p.unit_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.area}{p.country ? ` · ${countryName(p.country, lang)}` : ''}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-primary/8 text-primary px-2.5 py-0.5 font-semibold">
                  {typeLabel(p)}
                </span>
              </div>
              {p.review_note && (
                <p className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-xs text-orange-700">
                  <b>{t('changes_note')}:</b> {p.review_note}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => { setEditing(p); setFormOpen(true); }}
                  className="min-h-[36px]"
                >
                  <Pencil size={13} className="me-1" />
                  {t('edit_and_resubmit')}
                </Button>
                <DocButton record={p} field="title_deed_pdf" label={t('title_deed_pdf')} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPending = () => {
    if (pendingProperties.length === 0)
      return <EmptyState message={t('empty_pending')} icon={Clock} />;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pendingProperties.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold">{p.building} / {p.unit_number}</p>
                <p className="text-sm text-muted-foreground">
                  {p.area}{p.country ? ` · ${countryName(p.country, lang)}` : ''}
                </p>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-primary/8 text-primary px-2.5 py-0.5 font-semibold">
                {typeLabel(p)}
              </span>
              <span className="text-muted-foreground" dir="ltr">{p.owner_phone}</span>
            </div>
            <p className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
              {t('property_created')}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditing(p); setFormOpen(true); }}
                className="min-h-[36px]"
              >
                <Pencil size={13} className="me-1" />
                {t('edit')}
              </Button>
              <DocButton record={p} field="title_deed_pdf" label={t('title_deed_pdf')} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const sections = {
    home: () => null,
    ai: () => <AiPropertyChat onSaved={load} />,
    'my-properties': () => (
      <MyProperties
        properties={approvedProperties}
        tenancies={tenancies}
        activeTenancyByProperty={activeTenancyByProperty}
        onOpen={(p) => navigate(`/dashboard/property/${p.id}`)}
      />
    ),
    properties: renderProperties,
    pending: renderPending,
    changes: renderChanges,
    cash: renderCash,
    installments: renderInstallments,
    rentals: renderRentals,
    vacant: renderVacant,
    'expiring-contracts': renderExpiringContracts,
    'upcoming-payments': renderUpcomingPayments,
    'due-payments': renderDuePayments,
    'yearly-charges': renderYearlyCharges,
    'monthly-income': renderMonthlyIncome,
    'monthly-installments': renderMonthlyInstallments,
    residential: () => renderUsageList('residential'),
    commercial: () => renderUsageList('commercial'),
    land: () => renderUsageList('land'),
    ready: () => renderHandoverList('handover_completed'),
    'under-construction': () => renderHandoverList('under_construction'),
    alerts: () => (
      <AlertsPanel
        properties={properties}
        payments={payments}
        propertyFilter={alertsPropertyFilter}
        onClearFilter={() => setAlertsPropertyFilter(null)}
      />
    ),
    // Property Calendar verification (Feature Management batch, task #8):
    // the calendar previously only saw the legacy `payments` collection, so
    // rent checks and lease expiries from the CURRENT rental flow
    // (tenancies/rent_payments — already loaded above) never appeared on
    // it. Passing them through closes that real gap.
    calendar: () => <PropertyCalendar properties={properties} payments={payments} tenancies={tenancies} rentPayments={rentPayments} />,
    payments: renderPayments,
    // Task #17 — Digital Vault wraps the pre-existing Documents feature.
    // Seeded enabled+unrestricted for everyone (see the migration's
    // digital_vault entry) so this gate never locks out existing users —
    // only a future Admin change can restrict it.
    documents: () => (
      isFeatureAvailable('digital_vault') ? (
        <DocumentsCenter properties={properties} />
      ) : (
        <FeatureLockedNotice
          title={lang === 'ar' ? 'الخزنة الرقمية' : 'Digital Vault'}
          reason={featureMap.digital_vault?.reason}
          isAr={lang === 'ar'}
          onUpgrade={() => navigate('/dashboard/subscription')}
        />
      )
    ),
    referrals: () => <ReferralPanel />,
    subscription: () => <SubscriptionPanel />,
    'monthly-reports': () => <MonthlyReportsPanel />,
    // Task #17 — the 8 standalone new feature panels. Each panel is
    // self-gating (calls useFeatureEntitlements itself and renders
    // FeatureLockedNotice when not entitled), so no extra wrapping is
    // needed here — this map only has to route to the right component.
    'net-profit': () => <NetProfitPanel />,
    'cash-flow-forecast': () => <CashFlowForecastPanel />,
    tasks: () => <TaskCenterPanel properties={approvedProperties} />,
    expenses: () => <ExpenseCenterPanel properties={approvedProperties} mode="all" />,
    maintenance: () => <ExpenseCenterPanel properties={approvedProperties} mode="maintenance" />,
    compare: () => <PropertyComparisonPanel properties={approvedProperties} />,
    'ai-advisor': () => <AiPortfolioAdvisorPanel />,
    occupancy: () => <OccupancyRatePanel />,
    // Task #18
    'custom-reports': () => <CustomReportsPanel properties={approvedProperties} />,
    whatif: () => <WhatIfSimulatorPanel />,
    'tax-export': () => <TaxExportPanel />,
    goals: () => <PortfolioGoalsPanel />,
    'command-center': () => <CommandCenterPanel />,
    // Feature Management batch
    'property-health': () => <PropertyHealthScorePanel propertyIds={approvedProperties.map((p) => p.id)} />,
    'tenant-score': () => <TenantScorePanel />,
    'security-deposits': () => <SecurityDepositPanel />,
    claims: () => <ClaimsCenterPanel properties={approvedProperties} />,
    'market-rent': () => <MarketRentComparisonPanel properties={approvedProperties} />,
    'net-worth': () => <PortfolioNetWorthPanel />,
    ltv: () => <LtvPanel />,
    'property-statements': () => <PropertyStatementsPanel properties={approvedProperties} />,
    'portfolio-distribution': () => <PortfolioDistributionPanel />,
    'lifetime-return': () => <LifetimeReturnPanel />,
    marketplace: () => <OwnerMarketplacePanel properties={approvedProperties} />,
    'smart-suggestions': () => <SmartSuggestionsPanel />,
    notifications: renderNotifications,
    'notification-settings': () => <NotificationSettingsPage />,
    profile: () => <OwnerProfileEditor />,
    verify: () => <Navigate to="/dashboard/profile" replace />,
    security: () => <SecurityPanel />,
    support: () => <SupportPanel />,
  };

  const flatNav = useMemo(() => {
    const out = [];
    navItems.forEach((n) => {
      out.push(n);
      if (n.children) n.children.forEach((c) => out.push(c));
    });
    return out;
  }, [navItems]);

  // Property profile route (/dashboard/property/:propertyId). When viewing a
  // single property, the active sidebar item is that property's usage section
  // (residential / commercial / land) so the user keeps their place in the
  // 3-section organization.
  const activeProperty = propertyId ? properties.find((p) => p.id === propertyId) || null : null;
  const viewingProperty = !!propertyId;
  const activeSection = viewingProperty
    ? activeProperty?.usage_type || 'residential'
    : section;

  const propertyTitle = activeProperty
    ? propertyLabel(activeProperty)
    : (lang === 'ar' ? 'ملف العقار' : 'Property Profile');
  const sectionTitle = viewingProperty
    ? propertyTitle
    : (flatNav.find((n) => n.key === section)?.label ||
      (section === 'vacant' ? t('vacant_title') : null) ||
      (section === 'expiring-contracts' ? t('expiring_title') : null) ||
      (section === 'residential' ? t('residential_title') : null) ||
      (section === 'commercial' ? t('commercial_title') : null) ||
      (section === 'land' ? t('land_title') : null) ||
      (section === 'ready' ? t('ready_title') : null) ||
      (section === 'under-construction' ? t('under_construction_title') : null) ||
      (section === 'upcoming-payments' ? t('upcoming_payments_title') : null) ||
      (section === 'due-payments' ? t('due_payments_title') : null) ||
      (section === 'yearly-charges' ? t('yearly_charges_title') : null) ||
      (section === 'monthly-income' ? t('monthly_income_title') : null) ||
      (section === 'monthly-installments' ? t('monthly_installments_title') : null) ||
      t('owner_dashboard'));
  const pageTitle = viewingProperty
    ? `${propertyTitle} — Estate Follow | ${propertyTitle} — إستيت فولو`
    : `${sectionTitle} — Estate Follow | ${sectionTitle} — إستيت فولو`;
  const showHome = section === 'home' && !viewingProperty;

  const goSection = (key) => {
    if (key === 'add-property') {
      // Pre-check: a restricted, sensitive action (adding a property) requires
      // a complete profile (date of birth, gender, one identity document).
      // The user may still browse every other section freely — only this
      // specific action is blocked, with a clear alert directing them to the
      // profile completion screen. The server-side create rule is the real
      // enforcement backstop; this is the UX-level gate.
      if (user && !user.is_super_admin && needsProfileCompletion(user)) {
        notify.error(t('owner_action_needs_profile_title'), t('owner_action_needs_profile_body'));
        navigate('/dashboard/profile');
        return;
      }
      // Pre-check: block opening the form if the user has exhausted their
      // property quota. The server-side hook is the real enforcement; this
      // is a UX convenience so the user is directed to upgrade first.
      if (
        user &&
        !user.is_super_admin &&
        !['admin', 'editor', 'support', 'custom'].includes(user.role)
      ) {
        const settings = subSettings || DEFAULT_SETTINGS;
        const used = countOwnedProperties(properties, user.id);
        // Special Access takes PRIORITY while it has remaining slots. When it
        // is exhausted (or absent), resolvePropertyAccess falls through to the
        // paid subscription / trial check — the owner is then offered a paid
        // package exactly like any other customer. The two systems are never
        // mixed: while Special Access is active, the subscription is ignored.
        const access = resolvePropertyAccess(user, settings, used, specialAccess);
        if (!access.active) {
          // Distinguish "subscription expired/inactive" from "limit reached".
          // packageActive = the trial/subscription is current but the quota is
          // full; !packageActive = no package or it has expired. A user still
          // inside their trial who simply used all their slots must see the
          // "upgrade" message, not "subscription inactive". This also covers
          // the Special-Access-exhausted case (source falls through to
          // 'subscription' / 'none'), so the owner is routed to buy a paid
          // package — never to a "contact admin" dead-end.
          if (access.packageActive) {
            notify.error(
              lang === 'ar' ? 'حد العقارات ممتلئ' : 'Property limit reached',
              lang === 'ar'
                ? 'وصلت للحد الأقصى من العقارات في باقتك. ترقَّ أو اشترِ عقارًا إضافيًا من صفحة «الاشتراك».'
                : 'You have reached your property limit. Upgrade or buy an extra property from the Subscription page.',
            );
          } else {
            notify.error(
              lang === 'ar' ? 'الاشتراك غير نشط' : 'Subscription inactive',
              lang === 'ar'
                ? 'لا يوجد اشتراك نشط على حسابك. اشترك أو جدِّد باقتك من صفحة «الاشتراك» لإضافة عقارات.'
                : 'You do not have an active subscription. Subscribe or renew from the Subscription page to add properties.',
            );
          }
          navigate('/dashboard/subscription');
          return;
        }
      }
      // Keep an already-open add form (and its draft) instead of resetting.
      if (!formOpen) {
        setEditing(null);
        setConvertTarget(null);
        setFormOpen(true);
      }
      setActiveAction('add-property');
      return;
    }
    // While the property form is open, ignore sidebar section switches so the
    // user is not yanked back to home mid-entry. They must close the form first.
    if (formOpen) {
      return;
    }
    // Navigating to another section clears the Add Property highlight.
    // The route change itself is performed by the <Link> in AppLayout — do
    // NOT navigate() here. Calling navigate() here used to race with the
    // <Link>'s own navigation (double dispatch) and made clicks inconsistent.
    setActiveAction(null);
  };

  // Profile completeness (date of birth, gender, one identity document) is
  // used to gate specific SENSITIVE actions only (adding a property,
  // uploading a document — see goSection('add-property') above and
  // DocumentsCenter.jsx). It intentionally no longer force-redirects the
  // whole dashboard away from every other section: the owner may freely
  // browse properties, payments, documents, etc. with an incomplete
  // profile. A non-blocking reminder banner is shown on the Home section
  // instead (below), with a button that takes them straight to the
  // completion screen when they're ready.
  const needsCompletion = needsProfileCompletion(user);

  return (
    <AppLayout
      navItems={navItems}
      active={activeSection}
      onNavigate={goSection}
      title={sectionTitle}
      homePath="/dashboard/home"
      actionActive={activeAction === 'add-property'}
      scope="owner"
      lockNavigation={formOpen}
      fullBleed={section === 'ai'}
    >
      <Helmet>
        <title>{pageTitle}</title>
        <meta
          name="description"
          content="Manage your properties, installments, rentals, payments and documents — إدارة العقارات والأقساط والإيجارات والمدفوعات والمستندات"
        />
      </Helmet>

      {showHome && (
        <div className="mb-8 space-y-2.5">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {t('welcome_user')}, {user?.name || user?.email}
            {String(user?.account_state || '').toLowerCase() === 'approved' && (
              <VerifiedBadge size={22} className="ms-1.5" />
            )}
          </h2>
          <p className="text-xl font-bold leading-snug text-primary md:text-2xl">
            {t('brand_slogan')}
          </p>
          <p className="text-sm font-normal leading-relaxed text-muted-foreground md:text-[15px]">
            {t('brand_subline')}
          </p>
        </div>
      )}

      {showHome && needsCompletion && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
              {t('owner_action_needs_profile_title')}
            </p>
            <p className="text-xs text-muted-foreground">{t('owner_action_needs_profile_body')}</p>
          </div>
          <Button
            size="sm"
            className="shrink-0 min-h-[36px]"
            onClick={() => navigate('/dashboard/profile')}
          >
            {t('owner_action_needs_profile_cta')}
          </Button>
        </div>
      )}

      {!showHome && section !== 'documents' && null}

      {showHome && !loading && !error && (
        <SummaryCards
          properties={properties}
          payments={payments}
          tenancies={tenancies}
          activeTenancyByProperty={activeTenancyByProperty}
          contractExpiryDays={contractExpiryDays}
          onVacantClick={() => navigate('/dashboard/vacant')}
          onExpiringClick={() => navigate('/dashboard/expiring-contracts')}
          onResidentialClick={() => navigate('/dashboard/residential')}
          onCommercialClick={() => navigate('/dashboard/commercial')}
          onLandClick={() => navigate('/dashboard/land')}
          onPropertiesClick={() => navigate('/dashboard/properties')}
          onReadyClick={() => navigate('/dashboard/ready')}
          onUnderConstructionClick={() => navigate('/dashboard/under-construction')}
          onUpcomingClick={() => navigate('/dashboard/upcoming-payments')}
          onDueClick={() => navigate('/dashboard/due-payments')}
          onRentedClick={() => navigate('/dashboard/rentals')}
          onYearlyChargesClick={() => navigate('/dashboard/yearly-charges')}
          onMonthlyIncomeClick={() => navigate('/dashboard/monthly-income')}
          onMonthlyInstallmentsClick={() => navigate('/dashboard/monthly-installments')}
        />
      )}

      {loading && properties.length === 0 && payments.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t('loading')}</p>
      ) : error && properties.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={() => load()}>{t('retry')}</Button>
        </div>
      ) : viewingProperty ? (
        <PropertyProfile
          propertyId={propertyId}
          properties={properties}
          payments={payments}
          tenancies={tenancies}
          rentPayments={rentPayments}
          onEdit={openEdit}
          onConvert={openConvert}
          onRent={openRent}
          onMarkCheckCollected={markCheckCollected}
          onSaved={load}
        />
      ) : showHome ? null : (
        <Suspense fallback={<p className="py-16 text-center text-muted-foreground">{t('loading')}</p>}>
          {(sections[section] || sections.properties)()}
        </Suspense>
      )}

      <PropertyForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setActiveAction(null);
            setEditing(null);
            setConvertTarget(null);
          }
        }}
        onSaved={load}
        property={editing}
        convertTarget={convertTarget}
      />
      <RentPropertyModal
        open={!!rentModalProperty}
        onOpenChange={(o) => { if (!o) setRentModalProperty(null); }}
        property={rentModalProperty}
        onSaved={load}
      />
    </AppLayout>
  );
};

export default OwnerDashboard;
