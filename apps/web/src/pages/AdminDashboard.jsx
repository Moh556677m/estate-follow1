import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  Ban,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  ClipboardEdit,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  LogOut,
  Megaphone,
  Package,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
  Gift,
  Globe2,
  CreditCard,
  Coins,
  KeyRound,
  Handshake,
  Plug,
  LayoutTemplate,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/components/AppLayout';
import PropertyForm from '@/components/PropertyForm';
import PropertyReviewModal from '@/components/PropertyReviewModal';
import UserProfileModal from '@/components/UserProfileModal';
import StaffProfileModal from '@/components/StaffProfileModal';
import SecurityPanel from '@/components/SecurityPanel';
import ChangePasswordCard from '@/components/ChangePasswordCard';
import AdminPortalSettings from '@/components/AdminPortalSettings';
import SupportPanel from '@/components/SupportPanel';
import CreateOwnerModal from '@/components/CreateOwnerModal';
import CreateStaffModal from '@/components/CreateStaffModal';
import SystemStatusStrip from '@/components/SystemStatusStrip';
import RecentActivityFeed from '@/components/RecentActivityFeed';
// Performance / UX audit (Task #26): every one of these is rendered from
// exactly one place in this file — the `sections[section]()` call near the
// bottom (verified: each name appears in a JSX tag exactly once in this
// file) — so lazy-loading them here is safe and covered by the single
// <Suspense> wrapped around that one render site. Several of these are
// large (MarketingPanel.jsx ~140KB, PropertyForm-adjacent panels, SeoAi
// SearchPanel.jsx ~106KB, PlatformSettingsPanel.jsx ~95KB, integrated-ai-
// backed panels, etc.) — before this change every admin visitor downloaded
// all of them just to see the Overview tab.
const PlatformSettingsPanel = lazy(() => import('@/components/PlatformSettingsPanel'));
const RevenuePanel = lazy(() => import('@/components/RevenuePanel'));
const SettingsHub = lazy(() => import('@/components/SuperAdminSettings'));
const MarketingPanel = lazy(() => import('@/components/MarketingPanel'));
const SeoAiSearchPanel = lazy(() => import('@/components/SeoAiSearchPanel'));
const SystemHealthPanel = lazy(() => import('@/components/SystemHealthPanel'));
const AiInsightsPanel = lazy(() => import('@/components/AiInsightsPanel'));
const CountriesCitiesPanel = lazy(() => import('@/components/CountriesCitiesPanel'));
const ReferralAdminPanel = lazy(() => import('@/components/ReferralAdminPanel'));
const SidebarManagementPanel = lazy(() => import('@/components/SidebarManagementPanel'));
const AlertsAdminPanel = lazy(() => import('@/components/AlertsAdminPanel'));
const NotificationManagementPanel = lazy(() => import('@/components/NotificationManagementPanel'));
const ContentManagementPanel = lazy(() => import('@/components/insights/ContentManagementPanel'));
const EstateAiManagementPanel = lazy(() => import('@/components/EstateAiManagementPanel'));
const SubscriptionManagementPanel = lazy(() => import('@/components/SubscriptionManagementPanel'));
const CrmManagementPanel = lazy(() => import('@/components/CrmManagementPanel'));
const ExternalToolsPanel = lazy(() => import('@/components/ExternalToolsPanel'));
const SiteEditorPanel = lazy(() => import('@/components/SiteEditorPanel'));
const SiteIssuesPanel = lazy(() => import('@/components/SiteIssuesPanel'));
const PaymentGatewaysPanel = lazy(() => import('@/components/PaymentGatewaysPanel'));
const CurrencySettingsPanel = lazy(() => import('@/components/CurrencySettingsPanel'));
const SpecialAccessPanel = lazy(() => import('@/components/SpecialAccessPanel'));
const UserAnalytics = lazy(() => import('@/pages/UserAnalytics'));
import {
  DocButton,
  EmptyState,
  StatCard,
  StatusBadge,
  StatusDot,
  propertyIndicator,
} from '@/components/shared';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { daysUntil, formatDate, formatMoney, propertyLabel } from '@/lib/api';
import { countryName } from '@/lib/countries';
import NationalityField from '@/components/NationalityField';
import {
  canViewRevenue,
  hasPermission,
  isSuperAdmin as checkSuperAdmin,
  roleDisplay,
  STAFF_ROLES,
} from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notify';

const ADMIN_SECTIONS = [
  'overview',
  'analytics',
  'properties',
  'users',
  'managers',
  'revenue',
  'payments',
  'activity',
  'security',
  'support',
  'settings',
  'portal-settings',
  'notifications',
  'marketing',
  'seo',
  'system-health',
  'ai-insights',
  'estate-ai',
  'referrals',
  'geo',
  'sidebar-mgmt',
  'alerts',
  'notification-mgmt',
  'content',
  'subscriptions',
  'payment-gateways',
  'currency-settings',
  'special-access',
  'crm',
  'external-tools',
  'site-editor',
  'site-issues',
]

const AdminDashboard = ({ basePath = '/dashboard' }) => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { section: sectionParam } = useParams();
  const section = sectionParam || 'overview';
  const [settingsSub, setSettingsSub] = useState('platform');
  const [users, setUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [subPayments, setSubPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Admin success messages are unified through the global Toast (notify.*).

  // filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [userTab, setUserTab] = useState('all');
  const [userCountryFilter, setUserCountryFilter] = useState('all');
  const [userActionBusy, setUserActionBusy] = useState('');

  // modals
  const [reviewTarget, setReviewTarget] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [editProperty, setEditProperty] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [createOwnerOpen, setCreateOwnerOpen] = useState(false);
  const [createStaffOpen, setCreateStaffOpen] = useState(false);
  const [staffProfile, setStaffProfile] = useState(null);
  // admin creating a property for a selected owner
  const [adminOwner, setAdminOwner] = useState('');

  const { user: currentUser } = useAuth();
  const isSuperAdmin = checkSuperAdmin(currentUser);
  const currentUserId = currentUser?.id;
  const currentCanRevenue = canViewRevenue(currentUser);

  // Apply navigation state from clickable overview cards (filters / tabs).
  useEffect(() => {
    const st = location.state;
    if (!st || typeof st !== 'object') return;
    if (st.userTab) setUserTab(st.userTab);
    if (st.statusFilter) setStatusFilter(st.statusFilter);
    // Clear one-shot state so back/forward does not re-apply forever.
    if (st.userTab || st.statusFilter) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  // Keep the latest translator without re-creating the data loader (which would
  // refetch every user/property/payment/log on each language toggle).
  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [u, props, pays, logs] = await Promise.all([
        pb.collection('users').getFullList({ sort: '-created' }),
        pb.collection('properties').getFullList({ sort: '-created', expand: 'owner' }),
        pb.collection('payments').getFullList({ sort: 'due_date' }),
        pb.collection('activity_logs').getFullList({ sort: '-created', expand: 'user' }),
      ]);
      setUsers(u);
      setProperties(props);
      setPayments(pays);
      setActivity(logs);
      if (currentCanRevenue) {
        try {
          // Revenue is derived ONLY from Stripe-confirmed (paid) orders —
          // never from a manual payments collection. Pending / failed /
          // cancelled orders are excluded because they are not real payments.
          const subs = await pb.collection('subscription_orders').getFullList({
            sort: '-processed_at,-created',
            requestKey: 'admin-revenue-orders',
          });
          setSubPayments(
            subs.filter((r) => r.status === 'paid' || r.status === 'approved'),
          );
        } catch {
          setSubPayments([]);
        }
      } else {
        setSubPayments([]);
      }
    } catch {
      setError(tRef.current('something_wrong'));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, currentCanRevenue]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime auto-sync: users, properties, payments, activity logs and
  // subscription payments update live without a manual reload. Debounced so a
  // burst of changes (e.g. bulk approvals) triggers one refetch.
  //
  // Gated to the sections that actually consume this dashboard's loaded state
  // (overview / properties / users / managers / revenue / payments / activity).
  // Other sections render independent sub-panels that have their own realtime
  // subscriptions — running this heavy 4×getFullList reload there too was pure
  // waste (a property change on the Marketing page reloaded the whole admin
  // overview for nothing).
  const dashboardSections = useMemo(
    () =>
      new Set([
        'overview',
        'properties',
        'users',
        'managers',
        'revenue',
        'payments',
        'activity',
      ]),
    [],
  );
  useEffect(() => {
    if (!currentUserId || !dashboardSections.has(section)) return undefined;
    let debounce = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        load();
      }, 350);
    };
    const cols = [
      'users',
      'properties',
      'payments',
      'activity_logs',
      'subscription_orders',
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
  }, [currentUserId, load, section, dashboardSections]);

  const showRevenue = canViewRevenue(currentUser);

  const navItems = useMemo(() => {
    const all = [
      { key: 'overview', icon: LayoutDashboard, label: t('nav_overview'), perm: null },
      { key: 'analytics', icon: BarChart3, label: t('nav_user_analytics'), perm: '__super__' },
      { key: 'properties', icon: Building2, label: t('nav_properties'), perm: 'edit_properties' },
      { key: 'users', icon: Users, label: t('nav_users'), perm: 'view_users' },
      { key: 'managers', icon: Briefcase, label: t('nav_managers'), perm: '__super__' },
      { key: 'revenue', icon: Wallet, label: t('nav_revenue'), perm: '__revenue__' },
      {
        key: 'marketing',
        icon: Megaphone,
        label: lang === 'ar' ? 'التسويق' : 'Marketing',
        perm: '__super__',
      },
      {
        key: 'seo',
        icon: Search,
        label: lang === 'ar' ? 'SEO والذكاء الاصطناعي' : 'SEO & AI Search',
        perm: '__super__',
      },
      {
        key: 'system-health',
        icon: ShieldCheck,
        label: t('nav_system_health'),
        perm: '__super__',
      },
      {
        key: 'ai-insights',
        icon: BarChart3,
        label: t('nav_ai_insights'),
        perm: '__super__',
      },
      {
        key: 'estate-ai',
        icon: Sparkles,
        label: lang === 'ar' ? 'إدارة Estate AI' : 'Estate AI Management',
        perm: '__super__',
      },
      {
        key: 'referrals',
        icon: Gift,
        label: t('nav_referrals') || (lang === 'ar' ? 'الإحالات' : 'Referrals'),
        perm: '__super__',
      },
      {
        key: 'geo',
        icon: Globe2,
        label: lang === 'ar' ? 'الدول والمدن' : 'Countries & Cities',
        perm: '__super__',
      },
      {
        key: 'sidebar-mgmt',
        icon: LayoutDashboard,
        label: lang === 'ar' ? 'إدارة القائمة الجانبية' : 'Sidebar Management',
        perm: '__super__',
      },
      {
        key: 'alerts',
        icon: Bell,
        label: t('alerts_admin_title') || (lang === 'ar' ? 'التنبيهات والمتابعة' : 'Alerts & Follow-up'),
        perm: '__super__',
      },
      {
        key: 'notification-mgmt',
        icon: Bell,
        label: t('nav_notification_management') || (lang === 'ar' ? 'إدارة الإشعارات' : 'Notification Management'),
        perm: '__super__',
      },
      {
        key: 'content',
        icon: FileText,
        label: t('editor_content_management') || (lang === 'ar' ? 'إدارة المحتوى' : 'Content Management'),
        perm: '__super__',
      },
      {
        key: 'subscriptions',
        icon: Package,
        label: t('nav_subscriptions') || (lang === 'ar' ? 'إدارة الاشتراكات' : 'Subscription Management'),
        perm: '__super__',
      },
      {
        key: 'payment-gateways',
        icon: CreditCard,
        label: t('nav_payment_gateways') || (lang === 'ar' ? 'بوابات الدفع' : 'Payment Gateways'),
        perm: '__super__',
      },
      {
        key: 'currency-settings',
        icon: Coins,
        label: lang === 'ar' ? 'العملة حسب الدولة' : 'Currency by Country',
        perm: '__super__',
      },
      {
        key: 'special-access',
        icon: KeyRound,
        label: lang === 'ar' ? 'وصول خاص' : 'Special Access',
        perm: '__super__',
      },
      {
        key: 'crm',
        icon: Handshake,
        label: lang === 'ar' ? 'إدارة CRM' : 'CRM Management',
        perm: '__super__',
      },
      {
        key: 'external-tools',
        icon: Plug,
        label: lang === 'ar' ? 'الأدوات الخارجية' : 'External Tools',
        perm: '__super__',
      },
      {
        key: 'site-editor',
        icon: LayoutTemplate,
        label: lang === 'ar' ? 'محرر الموقع' : 'Site Editor',
        perm: '__super__',
      },
      {
        key: 'site-issues',
        icon: AlertTriangle,
        label: lang === 'ar' ? 'مشاكل الموقع' : 'Site Issues',
        perm: '__super__',
      },
      { key: 'payments', icon: Wallet, label: t('nav_payments'), perm: 'manage_payments' },
      { key: 'security', icon: ShieldCheck, label: t('nav_devices'), perm: null },
      { key: 'support', icon: LifeBuoy, label: t('nav_support'), perm: null },
      {
        key: 'settings',
        icon: Settings2,
        label: t('nav_settings_hub'),
        perm: isSuperAdmin ? null : 'manage_settings',
      },
      {
        key: 'portal-settings',
        icon: ShieldCheck,
        label: t('admin_portal_settings_title'),
        perm: '__super__',
      },
    ];
    return all.filter((item) => {
      if (!item.perm) return true;
      if (item.perm === '__super__') return isSuperAdmin;
      if (item.perm === '__revenue__') return showRevenue;
      return isSuperAdmin || hasPermission(currentUser, item.perm);
    });
  }, [t, lang, isSuperAdmin, currentUser, showRevenue]);

  const ownerById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u])),
    [users],
  );
  const propById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );

  const approved = useMemo(() => properties.filter((p) => p.status === 'approved'), [properties]);

  const revenueAllTime = useMemo(
    () =>
      subPayments
        .filter((r) => r.status === 'paid' || r.status === 'approved')
        .reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [subPayments],
  );

  const flash = (msg) => {
    notify.success(msg);
  };

  const handleReviewAction = async (mode, note) => {
    const p = reviewTarget;
    if (!p) return;
    if (mode === 'approve') {
      await pb.collection('properties').update(p.id, { status: 'approved', review_note: '' });
      flash(t('approved_success'));
    } else if (mode === 'reject') {
      await pb.collection('properties').update(p.id, { status: 'rejected', review_note: note, rejected_at: new Date().toISOString() });
      flash(t('rejected_success'));
    } else if (mode === 'changes') {
      await pb.collection('properties').update(p.id, { status: 'changes_requested', review_note: note });
      flash(t('changes_success'));
    }
    setReviewTarget(null);
    load();
  };

  const setStatus = async (property, status, note = '') => {
    await pb.collection('properties').update(property.id, { status, review_note: note });
    load();
  };

  const markPaid = async (payment) => {
    await pb
      .collection('payments')
      .update(payment.id, { status: 'paid', paid_at: new Date().toISOString() });
    notify.success(t('mark_paid'), payment.label || '');
    load();
  };

  const setAccountState = async (u, state) => {
    if (state === 'suspended' && !window.confirm(t('confirm_suspend'))) return;
    if (state === 'inactive' && !window.confirm(t('confirm_deactivate'))) return;
    if (state === 'active' && u.suspended && !window.confirm(t('confirm_activate'))) return;
    const suspended = state === 'suspended' || state === 'inactive';
    await pb.collection('users').update(u.id, { account_state: state, suspended });
    flash(
      state === 'active'
        ? t('user_activated')
        : state === 'inactive'
          ? t('user_deactivated')
          : t('user_suspended'),
    );
    setProfileUser(null);
    load();
  };

  const toggleSuspend = async (u) => {
    await setAccountState(u, u.suspended ? 'active' : 'suspended');
  };

  // ---- Super Admin quick controls (Users list) ----
  const handleDeleteUser = async (u) => {
    if (!isSuperAdmin) return;
    if (!window.confirm(t('confirm_delete_user'))) return;
    setUserActionBusy(`del-${u.id}`);
    try {
      await pb.collection('users').delete(u.id, {
        requestKey: `adm-del-${u.id}-${Date.now()}`,
      });
      notify.success(t('delete_user_success'));
      setProfileUser(null);
      load();
    } catch (err) {
      notify.error(t('something_wrong'), String(err?.message || err));
    } finally {
      setUserActionBusy('');
    }
  };

  const handleSuspendUser = async (u) => {
    if (!isSuperAdmin) return;
    const isSuspended =
      !!u.suspended ||
      (u.account_state || '') === 'suspended' ||
      (u.account_state || '') === 'inactive';
    if (!isSuspended && !window.confirm(t('confirm_suspend'))) return;
    const nextState = isSuspended ? 'active' : 'suspended';
    setUserActionBusy(`sus-${u.id}`);
    try {
      await pb.collection('users').update(
        u.id,
        { account_state: nextState, suspended: nextState === 'suspended' },
        { requestKey: `adm-sus-${u.id}-${Date.now()}` },
      );
      notify.success(nextState === 'active' ? t('user_activated') : t('user_suspended'));
      load();
    } catch (err) {
      notify.error(t('something_wrong'), String(err?.message || err));
    } finally {
      setUserActionBusy('');
    }
  };

  const handleForceLogout = async (u) => {
    if (!isSuperAdmin) return;
    if (!window.confirm(t('confirm_force_logout'))) return;
    setUserActionBusy(`flo-${u.id}`);
    try {
      const sessions = await pb.collection('user_sessions').getFullList({
        filter: pb.filter('user = {:uid}', { uid: u.id }),
        requestKey: `adm-flo-list-${u.id}-${Date.now()}`,
      });
      const active = sessions.filter((s) => s.active);
      await Promise.all(
        active.map((s, i) =>
          pb.collection('user_sessions').update(
            s.id,
            { active: false },
            { requestKey: `adm-flo-${u.id}-${i}-${Date.now()}` },
          ),
        ),
      );
      notify.success(t('force_logout_success'));
      load();
    } catch (err) {
      notify.error(t('something_wrong'), String(err?.message || err));
    } finally {
      setUserActionBusy('');
    }
  };

  const typeLabel = (p) =>
    p.type === 'cash' ? t('type_cash') : p.type === 'installment' ? t('type_installment') : t('type_rented');

  const deleteProperty = async (p) => {
    if (!window.confirm(t('confirm_delete'))) return;
    try {
      await pb.collection('properties').delete(p.id);
      notify.success(t('confirm_delete'), propertyLabel(p));
      load();
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
      notify.error(t('something_wrong'), String(err?.message || err));
    }
  };

  const openAdminAddProperty = () => {
    setEditProperty(null);
    setAdminOwner('');
    setFormOpen(true);
  };

  // ---- filtered properties (Properties section) ----
  const filteredProps = useMemo(() => {
    return properties.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (countryFilter !== 'all' && p.country !== countryFilter) return false;
      if (ownerFilter !== 'all' && p.owner !== ownerFilter) return false;
      return true;
    });
  }, [properties, statusFilter, typeFilter, countryFilter, ownerFilter]);

  // Resolve the real account kind for display/filter (never mutates DB).
  // Staff / Super Admin take precedence; otherwise use account_type.
  const resolveAccountKind = useCallback((u) => {
    if (!u) return 'owner';
    if (u.is_super_admin) return 'super_admin';
    if (STAFF_ROLES.includes(u.role)) return 'staff';
    return 'owner';
  }, []);

  const accountKindLabel = useCallback(
    (u) => {
      const kind = resolveAccountKind(u);
      if (kind === 'super_admin') return t('role_super_admin');
      if (kind === 'staff') return roleDisplay(u, t);
      return t('account_type_owner');
    },
    [resolveAccountKind, t],
  );

  // Countries linked to a user (nationality + property countries).
  const userLinkedCountries = useCallback(
    (u) => {
      const codes = new Set();
      const add = (c) => {
        if (!c) return;
        const s = String(c).trim();
        if (!s) return;
        codes.add(s.toUpperCase());
      };
      add(u.nationality);
      properties.forEach((p) => {
        if (p.owner === u.id) add(p.country);
      });
      return codes;
    },
    [properties],
  );

  // ---- filtered users ----
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const countryCode =
      userCountryFilter && userCountryFilter !== 'all'
        ? String(userCountryFilter).toUpperCase()
        : '';
    return users.filter((u) => {
      const state = u.account_state || (u.suspended ? 'suspended' : 'active');
      const kind = resolveAccountKind(u);

      if (userTab === 'inactive') {
        if (state === 'active') return false;
      } else if (userTab === 'admins') {
        if (kind !== 'super_admin' && kind !== 'staff') return false;
      } else if (userTab === 'owners') {
        if (kind !== 'owner') return false;
      }

      if (countryCode) {
        const linked = userLinkedCountries(u);
        if (!linked.has(countryCode)) return false;
      }

      if (!q) return true;
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
      );
    });
  }, [
    users,
    userSearch,
    userTab,
    userCountryFilter,
    resolveAccountKind,
    userLinkedCountries,
  ]);

  const ownerOptions = useMemo(
    () => users.filter((u) => u.role === 'owner'),
    [users],
  );

  // Platform end-user accounts (owners) — exclude staff.
  const overviewUserStats = useMemo(() => {
    const isStaff = (u) =>
      !!u.is_super_admin || STAFF_ROLES.includes(u.role);
    const isCounted = (u) => {
      if (isStaff(u)) return false;
      if (u.suspended) return false;
      const state = u.account_state || 'active';
      if (state === 'suspended' || state === 'inactive') return false;
      return true;
    };
    let owners = 0;
    users.forEach((u) => {
      if (isCounted(u)) owners += 1;
    });
    return {
      owners,
      total: owners,
    };
  }, [users]);

  // Country distribution for the User Analytics overview card.
  const analyticsSummary = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      const kind = resolveAccountKind(u);
      if (kind === 'staff' || kind === 'super_admin') return;
      const c = u.nationality || null;
      if (!c) return;
      const code = String(c).toUpperCase();
      if (!map[code]) map[code] = 0;
      map[code] += 1;
    });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return {
      distinctCountries: entries.length,
      topCountryName: entries[0]?.[0] ? countryName(entries[0][0], lang) : null,
    };
  }, [users, resolveAccountKind, lang]);

  // ----------------------------------------------------------------- sections
  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-3">
        <StatCard
          icon={Users}
          label={t('stat_total_users')}
          value={overviewUserStats.total}
          onClick={() => navigate('/dashboard/users', { state: { userTab: 'all' } })}
        />
        <StatCard
          icon={Building2}
          label={t('stat_approved')}
          value={approved.length}
          onClick={() =>
            navigate('/dashboard/properties', { state: { statusFilter: 'approved' } })
          }
        />
        <StatCard
          icon={Wallet}
          label={t('stat_subscription_revenue')}
          value={showRevenue ? formatMoney(revenueAllTime, lang) : '—'}
          onClick={
            showRevenue ? () => navigate('/dashboard/revenue') : undefined
          }
        />
      </div>

      {/* Live status + recent activity — auto-refreshing, no reload needed.
          SystemStatusStrip polls the real health endpoints on a timer;
          RecentActivityFeed reuses the `activity` state this dashboard
          already keeps live via its realtime subscription below. */}
      <div className="space-y-3">
        {isSuperAdmin && <SystemStatusStrip basePath={basePath} />}
        <RecentActivityFeed activity={activity} basePath={basePath} />
      </div>

      <button
        type="button"
        onClick={() => navigate('/dashboard/analytics')}
        className="group w-full rounded-xl border bg-card p-5 shadow-sm text-start transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BarChart3 size={22} strokeWidth={1.8} />
            </span>
            <div>
              <p className="font-bold">{t('nav_user_analytics')}</p>
              <p className="text-xs text-muted-foreground">{t('analytics_card_subtitle')}</p>
            </div>
          </div>
          <ChevronRight className="text-muted-foreground group-hover:text-primary" size={20} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-bold tabular-nums">{analyticsSummary.distinctCountries}</p>
            <p className="text-[11px] text-muted-foreground">{t('analytics_distinct_countries')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold truncate" dir="auto">{analyticsSummary.topCountryName || '—'}</p>
            <p className="text-[11px] text-muted-foreground">{t('analytics_top_country')}</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{overviewUserStats.total}</p>
            <p className="text-[11px] text-muted-foreground">{t('analytics_total_users')}</p>
          </div>
        </div>
      </button>

      {isSuperAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <button
            type="button"
            onClick={() => navigate('/dashboard/system-health')}
            className="group rounded-xl border bg-card p-5 shadow-sm text-start transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <ShieldCheck size={22} strokeWidth={1.8} />
                </span>
                <div>
                  <p className="font-bold">{t('nav_system_health')}</p>
                  <p className="text-xs text-muted-foreground">
                    {lang === 'ar' ? 'حالة الخدمات والمصادر الحقيقية' : 'Real status of services & sources'}
                  </p>
                </div>
              </div>
              <ChevronRight className="text-muted-foreground group-hover:text-primary" size={20} />
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard/ai-insights')}
            className="group rounded-xl border bg-card p-5 shadow-sm text-start transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <BarChart3 size={22} strokeWidth={1.8} />
                </span>
                <div>
                  <p className="font-bold">{t('nav_ai_insights')}</p>
                  <p className="text-xs text-muted-foreground">
                    {lang === 'ar' ? 'تحليل بيانات حقيقية بالذكاء الاصطناعي' : 'AI analysis of real platform data'}
                  </p>
                </div>
              </div>
              <ChevronRight className="text-muted-foreground group-hover:text-primary" size={20} />
            </div>
          </button>
        </div>
      )}

      {isSuperAdmin && (
        <button
          type="button"
          onClick={() => navigate('/dashboard/referrals')}
          className="group w-full rounded-xl border bg-card p-5 shadow-sm text-start transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Gift size={22} strokeWidth={1.8} />
              </span>
              <div>
                <p className="font-bold">{t('nav_referrals') || (lang === 'ar' ? 'الإحالات' : 'Referrals')}</p>
                <p className="text-xs text-muted-foreground">
                  {lang === 'ar' ? 'إجمالي الإحالات المعتمدة — اضغط لفتح لوحة الإحالات' : 'Total approved referrals — click to open the Referral Dashboard'}
                </p>
              </div>
            </div>
            <ChevronRight className="text-muted-foreground group-hover:text-primary" size={20} />
          </div>
        </button>
      )}

      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-bold mb-4">{t('recent_activity')}</h3>
          <div className="space-y-2">
            {activity.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t(a.action) || a.action}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.expand?.user?.name || a.expand?.user?.email || '—'}
                    {a.admin ? ` · ${t('admin_who')}: ${a.admin}` : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(a.created, lang)}
                </span>
              </div>
            ))}
            {activity.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('empty_activity')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderProperties = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={openAdminAddProperty} className="min-h-[44px]">
          <Plus size={16} className="me-1" />
          {t('add_property_for_owner')}
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-h-[44px]">
            <SelectValue placeholder={t('filter_status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            <SelectItem value="pending">{t('status_pending')}</SelectItem>
            <SelectItem value="approved">{t('status_approved')}</SelectItem>
            <SelectItem value="changes_requested">{t('status_changes_requested')}</SelectItem>
            <SelectItem value="rejected">{t('status_rejected')}</SelectItem>
            <SelectItem value="suspended">{t('status_suspended')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="min-h-[44px]">
            <SelectValue placeholder={t('filter_type')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            <SelectItem value="cash">{t('type_cash')}</SelectItem>
            <SelectItem value="installment">{t('type_installment')}</SelectItem>
            <SelectItem value="rented">{t('type_rented')}</SelectItem>
          </SelectContent>
        </Select>

        <NationalityField
          value={countryFilter}
          onChange={setCountryFilter}
          placeholder={t('filter_country')}
          heightClass="min-h-[44px]"
          allOption={{ value: 'all', label: t('all') }}
        />

        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="min-h-[44px]">
            <SelectValue placeholder={t('filter_owner')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {ownerOptions.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredProps.length === 0 ? (
        <EmptyState message={t('empty_properties')} icon={Building2} />
      ) : (
        <div className="space-y-3">
          {filteredProps.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-bold">{propertyLabel(p)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.expand?.owner?.name || p.expand?.owner?.email} · {typeLabel(p)}
                    {p.country ? ` · ${countryName(p.country, lang)}` : ''} ·{' '}
                    <span dir="ltr">{p.owner_phone}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const ind = propertyIndicator(p, properties, payments);
                    return ind ? <StatusDot color={ind.color} label={t(ind.labelKey)} /> : null;
                  })()}
                  <StatusBadge status={p.status} />
                </div>
              </div>

              {p.review_note && (p.status === 'rejected' || p.status === 'changes_requested') && (
                <p
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs',
                    p.status === 'rejected'
                      ? 'bg-red-50 border-red-100 text-red-700'
                      : 'bg-orange-50 border-orange-100 text-orange-700',
                  )}
                >
                  {p.review_note}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => setReviewTarget(p)} className="min-h-[36px]">
                  <ClipboardEdit size={13} className="me-1" />
                  {t('review_property')}
                </Button>
                {p.status !== 'approved' && (
                  <Button size="sm" onClick={() => setStatus(p, 'approved')} className="min-h-[36px]">
                    <Check size={14} className="me-1" />
                    {t('approve')}
                  </Button>
                )}
                {p.status !== 'suspended' ? (
                  <Button size="sm" variant="outline" onClick={() => setStatus(p, 'suspended')} className="min-h-[36px]">
                    {t('suspend')}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setStatus(p, 'approved')} className="min-h-[36px]">
                    {t('activate')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditProperty(p); setFormOpen(true); }}
                  className="min-h-[36px]"
                >
                  <Pencil size={13} className="me-1" />
                  {t('edit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteProperty(p)}
                  className="min-h-[36px] text-destructive hover:text-destructive"
                >
                  <Trash2 size={13} className="me-1" />
                  {t('delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder={t('search_users')}
              className="ps-9 min-h-[44px]"
            />
          </div>
          <div className="w-full sm:w-[240px]">
            <NationalityField
              id="admin-users-country-filter"
              value={userCountryFilter === 'all' ? 'all' : userCountryFilter}
              onChange={(v) => setUserCountryFilter(v || 'all')}
              label={null}
              placeholder={t('filter_country')}
              heightClass="min-h-[44px]"
              allOption={{ value: 'all', label: t('all') }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { k: 'all', label: t('all_users') },
            { k: 'owners', label: t('owner_users') },
            { k: 'admins', label: t('admin_users') },
            { k: 'inactive', label: t('inactive_users') },
          ].map((tab) => (
            <button
              key={tab.k}
              type="button"
              onClick={() => setUserTab(tab.k)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[40px]',
                userTab === tab.k
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {tab.label}
            </button>
          ))}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setCreateOwnerOpen(true)}
              className="rounded-full border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors min-h-[40px] inline-flex items-center gap-1.5"
            >
              <UserPlus size={15} />
              {t('create_owner')}
            </button>
          )}
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <EmptyState message={t('empty_users')} icon={Users} />
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((u) => {
            const userPropCount = properties.filter((p) => p.owner === u.id).length;
            const kind = resolveAccountKind(u);
            const displayName = u.name || '—';
            const secondaryContact = u.phone || u.email;
            return (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                  {(displayName || u.email || '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-semibold">{displayName}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {u.email}
                    {secondaryContact && secondaryContact !== u.email
                      ? ` · ${secondaryContact}`
                      : u.phone
                        ? ` · ${u.phone}`
                        : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {userPropCount} {t('user_properties')}
                </span>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    kind === 'super_admin'
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : kind === 'staff'
                        ? 'bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30'
                        : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {accountKindLabel(u)}
                </span>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    (u.account_state || (u.suspended ? 'suspended' : 'active')) === 'active'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : (u.account_state || '') === 'inactive'
                        ? 'bg-slate-100 text-slate-700 border-slate-200'
                        : 'bg-red-100 text-red-800 border-red-200',
                  )}
                >
                  {(u.account_state || (u.suspended ? 'suspended' : 'active')) === 'active'
                    ? t('active_flag')
                    : (u.account_state || '') === 'inactive'
                      ? t('inactive_flag')
                      : t('suspended_flag')}
                </span>
                <Button size="sm" variant="outline" onClick={() => setProfileUser(u)} className="min-h-[36px]">
                  {t('view_profile')}
                </Button>
                {isSuperAdmin && kind === 'owner' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title={t('force_logout')}
                      aria-label={t('force_logout')}
                      onClick={() => handleForceLogout(u)}
                      disabled={userActionBusy === `flo-${u.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                    >
                      {userActionBusy === `flo-${u.id}` ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <LogOut size={15} />
                      )}
                    </button>
                    <button
                      type="button"
                      title={
                        u.suspended ||
                        (u.account_state || '') === 'suspended' ||
                        (u.account_state || '') === 'inactive'
                          ? t('activate')
                          : t('suspend')
                      }
                      aria-label={t('suspend')}
                      onClick={() => handleSuspendUser(u)}
                      disabled={userActionBusy === `sus-${u.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                    >
                      {userActionBusy === `sus-${u.id}` ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Ban size={15} />
                      )}
                    </button>
                    <button
                      type="button"
                      title={t('delete_user')}
                      aria-label={t('delete_user')}
                      onClick={() => handleDeleteUser(u)}
                      disabled={userActionBusy === `del-${u.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                    >
                      {userActionBusy === `del-${u.id}` ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderPayments = () => (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('reminders_hint')}</p>
      {payments.length === 0 ? (
        <EmptyState message={t('empty_payments')} icon={Wallet} />
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const days = daysUntil(p.due_date);
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
              >
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-semibold">{p.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {propertyLabel(propById[p.property])} ·{' '}
                    {p.kind === 'rent' ? t('kind_rent') : t('kind_installment')}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold tabular-nums" dir="ltr">
                    {formatMoney(p.amount, lang)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.due_date, lang)}
                    {p.status !== 'paid' && days !== null && days >= 0 && (
                      <span className="ms-1 text-[hsl(var(--gold))]">· {days} {t('days_left')}</span>
                    )}
                  </p>
                </div>
                <StatusBadge status={p.status} />
                <span className="text-xs text-muted-foreground">
                  {p.reminder_sent ? t('reminder_sent') : t('reminder_pending')}
                </span>
                {p.status !== 'paid' && (
                  <Button size="sm" variant="outline" onClick={() => markPaid(p)} className="min-h-[36px]">
                    {t('mark_paid')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderActivity = () => (
    <div className="space-y-2">
      {activity.length === 0 ? (
        <EmptyState message={t('empty_activity')} icon={Activity} />
      ) : (
        activity.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity size={15} />
            </span>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-semibold">{t(a.action) || a.action}</p>
              <p className="text-xs text-muted-foreground">
                {a.expand?.user?.name || a.expand?.user?.email || '—'}
                {a.admin ? ` · ${t('admin_who')}: ${a.admin}` : ''}
                {a.details && ` · ${a.details}`}
              </p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(a.created, lang)}
            </span>
          </div>
        ))
      )}
    </div>
  );

  const staffAccounts = useMemo(
    () => users.filter((u) => STAFF_ROLES.includes(u.role) || u.is_super_admin),
    [users],
  );

  const renderManagers = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t('managers_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('managers_subtitle')}</p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setCreateStaffOpen(true)} className="min-h-[44px]">
            <UserPlus size={16} className="me-1" />
            {t('create_staff')}
          </Button>
        )}
      </div>

      {staffAccounts.length === 0 ? (
        <EmptyState message={t('no_staff')} icon={Briefcase} />
      ) : (
        <div className="space-y-2">
          {staffAccounts.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                {(u.name || u.email || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-semibold">{u.name || '—'}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {u.email}
                </p>
              </div>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                  u.is_super_admin
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30',
                )}
              >
                {roleDisplay(u, t)}
              </span>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                  u.suspended
                    ? 'bg-red-100 text-red-800 border-red-200'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200',
                )}
              >
                {u.suspended ? t('suspended_flag') : t('active_flag')}
              </span>
              {!u.is_super_admin && (
                <Button size="sm" variant="outline" onClick={() => setStaffProfile(u)} className="min-h-[36px]">
                  {t('edit_staff')}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const sections = {
    overview: renderOverview,
    properties: renderProperties,
    users: renderUsers,
    managers: renderManagers,
    revenue: () => (showRevenue ? <RevenuePanel users={users} /> : null),
    marketing: () => (isSuperAdmin ? <MarketingPanel /> : null),
    seo: () => (isSuperAdmin ? <SeoAiSearchPanel /> : null),
    'system-health': () => (isSuperAdmin ? <SystemHealthPanel /> : null),
    'ai-insights': () => (isSuperAdmin ? <AiInsightsPanel /> : null),
    'estate-ai': () => (isSuperAdmin ? <EstateAiManagementPanel /> : null),
    referrals: () => (isSuperAdmin ? <ReferralAdminPanel /> : null),
    geo: () => (isSuperAdmin ? <CountriesCitiesPanel /> : null),
    'sidebar-mgmt': () => (isSuperAdmin ? <SidebarManagementPanel /> : null),
    alerts: () => (isSuperAdmin ? <AlertsAdminPanel /> : null),
    'notification-mgmt': () => (isSuperAdmin ? <NotificationManagementPanel /> : null),
    content: () => (isSuperAdmin ? <ContentManagementPanel /> : null),
    subscriptions: () => (isSuperAdmin ? <SubscriptionManagementPanel /> : null),
    crm: () => (isSuperAdmin ? <CrmManagementPanel /> : null),
    'external-tools': () => (isSuperAdmin ? <ExternalToolsPanel /> : null),
    'site-editor': () => (isSuperAdmin ? <SiteEditorPanel /> : null),
    'site-issues': () => (isSuperAdmin ? <SiteIssuesPanel /> : null),
    'payment-gateways': () => (isSuperAdmin ? <PaymentGatewaysPanel /> : null),
    'currency-settings': () => (isSuperAdmin ? <CurrencySettingsPanel /> : null),
    'special-access': () => (isSuperAdmin ? <SpecialAccessPanel /> : null),
    analytics: () => (isSuperAdmin ? <UserAnalytics /> : null),
    payments: renderPayments,
    activity: renderActivity,
    security: () => (
        <div className="max-w-2xl space-y-5">
          <ChangePasswordCard basePath={basePath} />
          <SecurityPanel />
        </div>
      ),
    'portal-settings': () => (isSuperAdmin ? <AdminPortalSettings /> : null),
    support: () => <SupportPanel />,
    settings: () => (
      <SettingsHub
        sub={settingsSub}
        onSubChange={setSettingsSub}
        platformPanel={<PlatformSettingsPanel />}
      />
    ),
  };

  const sectionTitle =
    navItems.find((n) => n.key === section)?.label || t('admin_dashboard');
  const pageTitle = `${sectionTitle} — Estate Follow | ${sectionTitle} — إستيت فولو`;

  const goSection = () => {
    // The route change is performed by the <Link> in AppLayout. Admin has no
    // click side-effects (no action items / active-action highlight), so this
    // is intentionally a no-op — kept only to keep the onNavigate contract
    // uniform across dashboards. Never navigate() here: that double-dispatched
    // with the <Link> and made sidebar clicks inconsistently fail to route.
  };

  if (sectionParam && !ADMIN_SECTIONS.includes(sectionParam)) {
    return <Navigate to={`${basePath}/overview`} replace />;
  }

  return (
    <AppLayout
      navItems={navItems}
      active={section}
      onNavigate={goSection}
      title={sectionTitle}
      homePath={`${basePath}/overview`}
      basePath={basePath}
      scope="admin"
    >
      <Helmet>
        <title>{pageTitle}</title>
        <meta
          name="description"
          content="Review properties, manage users, payments and reminders — مراجعة العقارات وإدارة المستخدمين والمدفوعات والتذكيرات"
        />
      </Helmet>

      {section !== 'overview' && null}

      {loading ? (
        <p className="py-16 text-center text-muted-foreground">{t('loading')}</p>
      ) : error ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={load}>{t('retry')}</Button>
        </div>
      ) : (
        <Suspense fallback={<p className="py-16 text-center text-muted-foreground">{t('loading')}</p>}>
          {(sections[section] || sections.overview)()}
        </Suspense>
      )}

      <PropertyReviewModal
        property={reviewTarget}
        owner={reviewTarget?.expand?.owner || ownerById[reviewTarget?.owner]}
        payments={payments}
        onClose={() => setReviewTarget(null)}
        onAction={handleReviewAction}
      />

      <UserProfileModal
        user={profileUser}
        properties={properties}
        payments={payments}
        onClose={() => setProfileUser(null)}
        onToggleSuspend={toggleSuspend}
        onSetAccountState={setAccountState}
        onRefresh={load}
        onReviewDone={(msg) => {
          flash(msg);
          setProfileUser(null);
          load();
        }}
        onEditProperty={(p) => { setEditProperty(p); setFormOpen(true); }}
      />

      <PropertyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={load}
        property={editProperty}
        adminMode={!editProperty && isSuperAdmin}
        owners={ownerOptions}
        adminOwner={adminOwner}
        onAdminOwnerChange={setAdminOwner}
      />

      <CreateOwnerModal
        open={createOwnerOpen}
        onOpenChange={setCreateOwnerOpen}
        onCreated={load}
      />

      <CreateStaffModal
        open={createStaffOpen}
        onOpenChange={setCreateStaffOpen}
        onCreated={load}
      />

      <StaffProfileModal
        user={staffProfile}
        onClose={() => setStaffProfile(null)}
        onRefresh={load}
      />
    </AppLayout>
  );
};

export default AdminDashboard;
