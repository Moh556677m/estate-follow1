import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Building2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { roleDisplay } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import useSidebarOrder from '@/hooks/useSidebarOrder';
import OwnerMobileBottomNav from '@/components/OwnerMobileBottomNav';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// Re-export for Login/Signup and other pages that import from AppLayout.
export { LanguageSwitcher };

/**
 * Sidebar header — a single organized row at the top of every sidebar:
 *   [ X close ]      [ logo + platform name ]      [ Arrange ]
 * The X sits on the physical left, the logo/brand name is restored to its
 * natural centered place, and the Arrange button sits on the right (slightly
 * clearer styling, sized just right, never dominating). The row is forced to
 * LTR so the physical left/right placement is identical on every page, every
 * account type, and every device — while the brand text keeps its own
 * language direction. The X only closes the sidebar (mobile drawer / desktop
 * collapse) — it never saves or triggers any other action.
 */
function SidebarHeader({ onClose, onArrange, arranging, t }) {
  const { lang } = useLanguage();
  const [plat, setPlat] = useState(() => window.__EF_PLATFORM__ || null);

  useEffect(() => {
    setPlat(window.__EF_PLATFORM__ || null);
    const onCms = () => setPlat(window.__EF_PLATFORM__ || null);
    window.addEventListener('estatefollow-cms-updated', onCms);
    return () => window.removeEventListener('estatefollow-cms-updated', onCms);
  }, []);

  const brandName =
    (plat && (lang === 'ar' ? plat.brand_name_ar || plat.brand_name : plat.brand_name)) ||
    t('brand');
  // Original Estate Follow logo: prefer the brand logo file / logo URL, then
  // fall back to favicon / site icon. Never substitute a generic icon
  // (ShieldCheck) for the real logo — if no logo asset is configured, show
  // the brand name text only.
  const logoUrl =
    (plat && plat.logo_file && pb.files.getURL(plat, plat.logo_file)) ||
    (plat && plat.logo_url) ||
    '';

  // Official Estate Follow logo mark: a white building icon inside a green
  // square. Used as the always-visible brand mark next to the platform name.
  // If a custom logo file/URL is configured in platform settings, prefer it.
  const LogoMark = ({ className }) =>
    logoUrl ? (
      <img
        src={logoUrl}
        alt={brandName}
        className={cn('h-8 w-auto max-w-[120px] shrink-0 object-contain', className)}
      />
    ) : (
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary',
          className,
        )}
        aria-hidden="true"
      >
        <Building2 size={18} strokeWidth={2} className="text-primary-foreground" />
      </span>
    );

  return (
    <div className="border-b px-4 py-2.5">
      {/* RTL row: first child sits on the right, last child on the left.
          Order (right → left): logo + name · ترتيب · X */}
      <div className="flex items-center justify-between gap-2" dir="rtl">
        {/* Right: official logo mark + platform name, grouped together */}
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <LogoMark />
          <span
            className="truncate text-[15px] font-bold leading-tight text-foreground"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
          >
            {brandName}
          </span>
        </div>

        {/* Center-left: bare Arrange (small icon + label, not adjacent to name) */}
        <button
          type="button"
          onClick={onArrange}
          aria-pressed={arranging}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors min-h-[40px]',
            arranging
              ? 'text-primary'
              : 'text-muted-foreground hover:text-primary',
          )}
        >
          <GripVertical size={15} strokeWidth={2} />
          {t('sidebar_arrange')}
        </button>

        {/* Far left: small, elegant X close (no box / border / background) */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('sidebar_close')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-primary min-h-[40px] min-w-[40px]"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

/** Reorder toolbar shown while in Sidebar Reorder Mode. */
function ReorderToolbar({
  t,
  onSave,
  onReset,
  onCancel,
  saving,
  feedback,
}) {
  return (
    <div className="space-y-3 border-b px-3 py-3 bg-accent/40">
      <div>
        <p className="text-sm font-bold">{t('sidebar_reorder_title')}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {t('sidebar_reorder_hint')}
        </p>
      </div>

      {feedback === 'saved' && (
        <p className="text-[11px] font-semibold text-emerald-700">{t('sidebar_order_saved')}</p>
      )}
      {feedback === 'error' && (
        <p className="text-[11px] font-semibold text-destructive">{t('sidebar_order_error')}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 min-h-[40px]"
        >
          {saving ? t('loading') : t('sidebar_save_order')}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60 min-h-[40px]"
        >
          {t('sidebar_reset_default')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60 min-h-[40px]"
        >
          {t('sidebar_cancel_reorder')}
        </button>
      </div>
    </div>
  );
}

/**
 * App chrome with path-based side nav.
 * navItems: { key, icon, label, path?, action?, perm? }[]
 * scope: 'owner' | 'broker' | 'company' | 'admin' — drives per-user sidebar
 *        order persistence.
 */
const AppLayout = ({
  navItems,
  active,
  onNavigate,
  title,
  children,
  homePath = '/dashboard/properties',
  showBack = true,
  actionActive = false,
  basePath = '/dashboard',
  scope = 'owner',
  /** When true, sidebar/header route changes are blocked (e.g. Add Property open). */
  lockNavigation = false,
  /** Full-bleed main (no padding / max-width) — e.g. Estate AI chat. */
  fullBleed = false,
}) => {
  const { user, logout } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  // Collapsible groups (e.g. owner "Management") — derived from navItems
  // that carry a `children` array. Passed to the order hook so children can be
  // reordered within their group only.
  const groups = useMemo(() => {
    const g = {};
    navItems.forEach((n) => {
      if (n.children && n.children.length) g[n.key] = n.children;
    });
    return g;
  }, [navItems]);

  const {
    orderedItems,
    orderedChildren,
    localItems,
    localChildrenItems,
    reorderMode,
    setReorderMode,
    move,
    moveToIndex,
    moveChild,
    saveOrder,
    resetOrder,
    cancelReorder,
    saving,
    feedback,
  } = useSidebarOrder({ scope, navItems, groups });

  const resolvePath = (item) => item.path || `${basePath}/${item.key}`;

  // Flat list (parents + children) for active detection + navigation.
  const flatItems = useMemo(() => {
    const out = [];
    const walk = (list) =>
      list.forEach((n) => {
        out.push(n);
        if (n.children) {
          const ch = orderedChildren[n.key] || n.children;
          ch.forEach((c) => out.push({ ...c, parent: n.key }));
        }
      });
    walk(orderedItems);
    return out;
  }, [orderedItems, orderedChildren]);

  const activeKey =
    active ||
    flatItems.find((item) => {
      const p = resolvePath(item);
      return location.pathname === p || location.pathname.startsWith(`${p}/`);
    })?.key;

  // Collapsible-group open state — persisted in sessionStorage so it survives
  // navigation within a session and a refresh in the same tab.
  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const raw = sessionStorage.getItem('ef_sidebar_open_groups');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const persistOpenGroups = (next) => {
    try {
      sessionStorage.setItem('ef_sidebar_open_groups', JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };
  const toggleGroup = (gk) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gk)) next.delete(gk);
      else next.add(gk);
      persistOpenGroups(next);
      return next;
    });
  };

  // Auto-open a group if the active page is one of its children (also restores
  // the open state after a refresh when the user lands on a child page).
  useEffect(() => {
    const activeItem = flatItems.find((i) => i.key === activeKey);
    if (activeItem && activeItem.parent) {
      setOpenGroups((prev) => {
        if (prev.has(activeItem.parent)) return prev;
        const next = new Set(prev);
        next.add(activeItem.parent);
        persistOpenGroups(next);
        return next;
      });
    }
  }, [activeKey, flatItems]);

  useEffect(() => {
    if (!user) return undefined;
    const load = () =>
      pb
        .collection('notifications')
        .getList(1, 1, { filter: `user = "${user.id}" && read = false` })
        .then((r) => setUnread(r.totalItems))
        .catch(() => {});
    load();
    void pb
      .collection('notifications')
      .subscribe('*', load)
      .catch(() => {});
    return () => {
      void pb.collection('notifications').unsubscribe('*').catch(() => {});
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate(basePath === '/admin' ? '/admin/login' : '/login');
  };

  /** Exit reorder mode without saving — used before any real navigation. */
  const exitReorderIfNeeded = () => {
    if (reorderMode) {
      setDragIndex(null);
      cancelReorder();
    }
  };

  const isActionItem = (item) =>
    !!item && (item.action === 'add-property' || item.key === 'add-property');

  /**
   * Handle a sidebar item click.
   *
   * ROOT-CAUSE FIX for inconsistent navigation: real page items are rendered
   * as react-router <Link>s, and the <Link> itself is the single source of
   * navigation. This handler ONLY runs side-effects (exit reorder mode, clear
   * the active-action highlight, close the mobile drawer). It NEVER calls
   * preventDefault() and NEVER calls navigate() for a <Link> click.
   *
   * The previous implementation called preventDefault() on every <Link> click
   * (blocking react-router's native navigation) and then manually navigate()d
   * — while the parent onNavigate (goSection) ALSO navigate()d to the same
   * path. That preventDefault-then-manually-navigate pattern, combined with
   * the double navigate() dispatch, is what made clicks silently fail to
   * change the route (especially on Admin, which has the most items).
   *
   * For non-<Link> callers (e.g. the header notifications bell, which is a
   * <button> with no <Link>), there is no native navigation, so we navigate
   * manually as a fallback.
   *
   * onNavigate is invoked for side-effects ONLY (opening Add Property,
   * clearing the active-action highlight) and is wrapped in try/catch so a
   * throwing side-effect can never block the <Link>'s own navigation.
   */
  const go = (itemOrKey, evt) => {
    exitReorderIfNeeded();
    const item =
      typeof itemOrKey === 'string'
        ? flatItems.find((n) => n.key === itemOrKey) || { key: itemOrKey }
        : itemOrKey;
    const path = resolvePath(item);
    const modifiedClick =
      !!(evt && (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey || evt.button > 0));

    if (isActionItem(item)) {
      // Action items (e.g. Add Property) are <button>s — open the form, no route.
      evt?.preventDefault?.();
      if (onNavigate) {
        try { onNavigate(item.key, path); } catch { /* ignore side-effect error */ }
      }
      setMobileOpen(false);
      return;
    }

    // Block route changes while a full-screen flow (Add Property) is open so
    // the user is never auto-sent home mid-entry.
    if (lockNavigation) {
      evt?.preventDefault?.();
      evt?.stopPropagation?.();
      return;
    }

    // Cmd/Ctrl/shift/middle-click on a <Link>: let the browser open a new tab.
    if (modifiedClick) {
      setMobileOpen(false);
      return;
    }

    // Side-effects only (clear action highlights, etc.). Wrapped so a throwing
    // side-effect can never block the <Link>'s native navigation.
    if (onNavigate) {
      try { onNavigate(item.key, path); } catch { /* ignore side-effect error */ }
    }

    // If the click came from a real <Link> (an <a>), react-router navigates
    // natively — do NOT preventDefault and do NOT navigate manually (that was
    // the old fragile double-navigate). For non-<Link> callers (the bell
    // button, which has no evt / is a <button>), navigate manually as fallback.
    const fromLink = !!(
      evt &&
      evt.currentTarget &&
      evt.currentTarget.tagName === 'A'
    );
    if (!fromLink && location.pathname !== path) {
      navigate(path);
    }
    setMobileOpen(false);
  };

  const handleSheetOpenChange = (open) => {
    setMobileOpen(open);
    if (!open) {
      // Closing the drawer must never leave reorder/drag state active.
      setDragIndex(null);
      if (reorderMode) cancelReorder();
      // Radix Dialog can leave body { pointer-events: none } after close,
      // which silently blocks every click on the page (sidebar included).
      requestAnimationFrame(() => {
        try {
          if (document.body.style.pointerEvents === 'none') {
            document.body.style.pointerEvents = '';
          }
          document.body.removeAttribute('data-scroll-locked');
        } catch {
          /* ignore */
        }
      });
    }
  };

  // Global safety net: if any dialog/sheet left the body non-interactive
  // AFTER it closed, restore clicks so the sidebar keeps working. Never
  // fight an actually-open Radix modal (body pointer-events:none is correct
  // while a dialog is open).
  useEffect(() => {
    const unlockIfStuck = () => {
      try {
        if (mobileOpen) return;
        if (document.body.style.pointerEvents !== 'none') return;
        // See the matching guard in App.jsx: a stale/orphaned dialog node can
        // keep a data-state="open" attribute after an abrupt unmount skipped
        // Radix's own close cleanup, without ever being removed from the DOM.
        // Only count a candidate as "genuinely open" if it's connected AND
        // actually has layout size — otherwise this safety net never fires
        // and the page stays permanently unclickable instead of self-healing.
        const candidates = document.querySelectorAll(
          '[role="dialog"][data-state="open"], [data-state="open"].fixed',
        );
        const genuinelyOpen = Array.from(candidates).some((el) => {
          if (!el.isConnected) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (genuinelyOpen) return;
        document.body.style.pointerEvents = '';
      } catch {
        /* ignore */
      }
    };
    unlockIfStuck();
    const id = window.setInterval(unlockIfStuck, 1500);
    return () => window.clearInterval(id);
  }, [mobileOpen]);

  const isHome =
    location.pathname === homePath ||
    location.pathname === basePath ||
    location.pathname === `${basePath}/`;

  const onDragStart = (idx) => (e) => {
    // Only allow drag inside explicit reorder mode.
    if (!reorderMode) {
      e.preventDefault();
      return;
    }
    setDragIndex(idx);
  };
  const onDragOver = (idx) => (e) => {
    if (!reorderMode) return;
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== idx) {
      moveToIndex(dragIndex, idx);
      setDragIndex(idx);
    }
  };
  const onDragEnd = () => setDragIndex(null);

  const navItemClass = (isActive, indent = false) =>
    cn(
      'relative z-[1] flex w-full items-center gap-3 rounded-lg py-2.5 text-sm transition-colors text-start min-h-[44px] pointer-events-auto touch-manipulation select-none',
      indent ? 'ps-10 pe-3' : 'px-3',
      isActive
        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    );

  const renderChild = (child, indent = true) => {
    const Icon = child.icon;
    const isActive = activeKey === child.key;
    const path = resolvePath(child);
    return (
      <Link
        key={child.key}
        to={path}
        role="link"
        onClick={(e) => go(child, e)}
        className={navItemClass(isActive, indent)}
      >
        <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.8} size={18} />
        <span className="flex-1">{child.label}</span>
      </Link>
    );
  };

  const renderNav = () => {
    // Reorder UI is opt-in only; normal mode never mounts drag handlers/overlays.
    const items = reorderMode ? localItems : orderedItems;
    return (
      <nav
        className="relative z-[1] flex flex-col gap-1 pointer-events-auto"
        aria-label="Sidebar"
      >
        {items.map((item, idx) => {
          const Icon = item.icon;
          const isAction = isActionItem(item);
          const isActive = isAction ? actionActive : activeKey === item.key;
          const hasChildren = !!(item.children && item.children.length);
          const isOpen = openGroups.has(item.key);

          if (reorderMode) {
            const childList = localChildrenItems[item.key] || item.children || [];
            return (
              <div key={item.key} className="space-y-1">
                <div
                  draggable
                  onDragStart={onDragStart(idx)}
                  onDragOver={onDragOver(idx)}
                  onDragEnd={onDragEnd}
                  className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-sm min-h-[44px] cursor-grab active:cursor-grabbing"
                >
                  <GripVertical size={15} className="text-muted-foreground shrink-0" />
                  <Icon className="shrink-0" strokeWidth={1.8} size={16} />
                  <span className="flex-1 truncate">{item.label}</span>
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(item.key, 'up')}
                      disabled={idx === 0}
                      aria-label={t('sidebar_move_up')}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(item.key, 'down')}
                      disabled={idx === items.length - 1}
                      aria-label={t('sidebar_move_down')}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                </div>
                {hasChildren && (
                  <div className="flex flex-col gap-1 ps-5">
                    {childList.map((child, cidx) => {
                      const CIcon = child.icon;
                      return (
                        <div
                          key={child.key}
                          className="flex items-center gap-2 rounded-lg border bg-accent/30 px-2.5 py-1.5 text-sm min-h-[40px]"
                        >
                          <CIcon className="shrink-0" strokeWidth={1.8} size={14} />
                          <span className="flex-1 truncate text-muted-foreground">{child.label}</span>
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveChild(item.key, child.key, 'up')}
                              disabled={cidx === 0}
                              aria-label={t('sidebar_move_up')}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                            >
                              <ChevronUp size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveChild(item.key, child.key, 'down')}
                              disabled={cidx === childList.length - 1}
                              aria-label={t('sidebar_move_down')}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                            >
                              <ChevronDown size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Normal mode — collapsible group parent (toggle only, no route).
          if (hasChildren) {
            const childList = orderedChildren[item.key] || item.children;
            return (
              <div key={item.key} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.key)}
                  aria-expanded={isOpen}
                  className={cn(
                    'relative z-[1] flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-start min-h-[44px] pointer-events-auto touch-manipulation',
                    isOpen
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.8} size={18} />
                  <span className="flex-1">{item.label}</span>
                  <span
                    className={cn(
                      'shrink-0 text-xs transition-transform',
                      isOpen ? 'text-primary' : 'text-muted-foreground',
                    )}
                    aria-hidden="true"
                  >
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-1">
                    {childList.map((child) => renderChild(child, true))}
                  </div>
                )}
              </div>
            );
          }

          // Action items (e.g. Add Property) stay buttons — no route.
          if (isAction) {
            return (
              <button
                key={item.key}
                type="button"
                onClick={(e) => go(item, e)}
                className={navItemClass(isActive, false)}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.8} size={18} />
                <span className="flex-1">{item.label}</span>
              </button>
            );
          }

          // Real pages — Link guarantees navigation even if JS handlers glitch.
          const path = resolvePath(item);
          return (
            <Link
              key={item.key}
              to={path}
              role="link"
              onClick={(e) => go(item, e)}
              className={navItemClass(isActive, false)}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={1.8} size={18} />
              <span className="flex-1">{item.label}</span>
              {item.key === 'notifications' && unread > 0 && (
                <span
                  className={cn(
                    'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                    isActive
                      ? 'bg-primary-foreground text-primary'
                      : 'bg-primary text-primary-foreground',
                  )}
                >
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  };

  const toggleArrange = () => {
    if (reorderMode) {
      setDragIndex(null);
      cancelReorder();
    } else {
      setReorderMode(true);
    }
  };

  // The header close target depends on context (mobile drawer vs desktop).
  const desktopHeader = (
    <SidebarHeader
      t={t}
      arranging={reorderMode}
      onClose={() => {
        setDragIndex(null);
        if (reorderMode) cancelReorder();
        setCollapsed(true);
      }}
      onArrange={toggleArrange}
    />
  );
  const mobileHeader = (
    <SidebarHeader
      t={t}
      arranging={reorderMode}
      onClose={() => handleSheetOpenChange(false)}
      onArrange={toggleArrange}
    />
  );

  const reorderToolbar = (
    <ReorderToolbar
      t={t}
      onSave={saveOrder}
      onReset={async () => {
        if (window.confirm(t('sidebar_reset_confirm'))) {
          await resetOrder();
        }
      }}
      onCancel={cancelReorder}
      saving={saving}
      feedback={feedback}
    />
  );

  return (
    <div className="min-h-[100svh] bg-background">
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 w-64 flex-col border-e bg-card pointer-events-auto',
          collapsed ? 'hidden' : 'hidden lg:flex',
        )}
        data-ef-sidebar="desktop"
        // Admin/staff must never lose the sidebar to any bug in another
        // overlay on this page (a stuck full-screen form, a leftover Radix
        // backdrop, etc.) — see the matching CSS in index.css, which pins
        // this element (and its mobile Sheet counterpart below) to the
        // highest possible z-index and forces pointer-events back on,
        // unconditionally, whenever this attribute is present. Scoped to
        // basePath === '/admin' only — the owner/editor dashboards keep the
        // normal stacking (a full-screen property form is meant to take over
        // there).
        {...(basePath === '/admin' ? { 'data-ef-admin': 'true' } : {})}
      >
        {desktopHeader}
        {reorderMode && reorderToolbar}
        <div className="relative z-[1] flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 pointer-events-auto">
          {renderNav()}
        </div>
        <div className="relative z-[1] border-t p-3 space-y-2 pointer-events-auto">
          <div className="flex items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck size={12} />
            </span>
            {t('secure_badge')}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors min-h-[44px] pointer-events-auto touch-manipulation"
          >
            <LogOut size={18} strokeWidth={1.8} />
            {t('logout')}
          </button>
        </div>
      </aside>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={t('sidebar_reopen')}
          className="hidden lg:flex fixed bottom-6 start-4 z-40 h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 pointer-events-auto touch-manipulation"
          {...(basePath === '/admin' ? { 'data-ef-admin': 'true' } : {})}
        >
          <Menu size={22} />
        </button>
      )}

      <div className={cn(collapsed ? '' : 'lg:ps-64')}>
        <header className="sticky top-0 z-20 border-b bg-background md:bg-background/85 md:backdrop-blur">
          <div className="flex items-center gap-3 px-4 md:px-8 h-16">
            <Sheet open={mobileOpen} onOpenChange={handleSheetOpenChange}>
              {/* Owner mobile: sidebar opens from bottom-nav «حسابي» only — no header ☰. */}
              {scope !== 'owner' && (
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="lg:hidden flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 pointer-events-auto touch-manipulation"
                    aria-label="Menu"
                  >
                    <Menu size={18} />
                  </button>
                </SheetTrigger>
              )}
              <SheetContent
                side={document.documentElement.dir === 'rtl' ? 'right' : 'left'}
                className="ef-sidebar-sheet w-72 overflow-y-auto overscroll-contain p-0 pointer-events-auto"
                onOpenAutoFocus={(e) => e.preventDefault()}
                {...(basePath === '/admin' ? { 'data-ef-admin': 'true' } : {})}
              >
                {mobileHeader}
                {reorderMode && reorderToolbar}
                <div className="relative z-[1] p-4 pointer-events-auto">{renderNav()}</div>
                <div className="relative z-[1] border-t p-4 pointer-events-auto">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent min-h-[44px] pointer-events-auto touch-manipulation"
                  >
                    <LogOut size={18} strokeWidth={1.8} />
                    {t('logout')}
                  </button>
                </div>
              </SheetContent>
            </Sheet>

            {showBack && !isHome && (
              <button
                type="button"
                onClick={() => { if (!lockNavigation) navigate(homePath); }}
                className="lg:hidden flex h-10 w-10 items-center justify-center rounded-lg border bg-card text-foreground hover:bg-accent transition-colors"
                aria-label={t('back') || 'Back'}
              >
                <ArrowRight
                  size={18}
                  className={lang === 'ar' ? '' : 'rotate-180'}
                  strokeWidth={1.8}
                />
              </button>
            )}

            {/* Home only: replace the page title with a Subscription shortcut
                in the exact same header slot — welcome/cards stay untouched. */}
            {scope === 'owner' && activeKey === 'home' ? (
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    if (lockNavigation) return;
                    navigate(`${basePath}/subscription`);
                    onNavigate?.('subscription');
                  }}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/25 bg-primary px-3.5 py-1.5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-[0.98] min-h-[36px] pointer-events-auto touch-manipulation"
                  aria-label={t('nav_subscription') || (lang === 'ar' ? 'الاشتراك' : 'Subscription')}
                >
                  <Package size={16} strokeWidth={2} className="shrink-0" />
                  <span className="truncate">
                    {t('nav_subscription') || (lang === 'ar' ? 'الاشتراك' : 'Subscription')}
                  </span>
                </button>
              </div>
            ) : (
              <h1 className="text-lg font-bold truncate flex-1">{title}</h1>
            )}

            <LanguageSwitcher />

            <button
              type="button"
              onClick={() => go('notifications')}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
              aria-label={
                unread > 0
                  ? `${t('nav_notifications') || t('notifications')} (${unread})`
                  : t('nav_notifications') || t('notifications')
              }
            >
              <Bell size={18} strokeWidth={1.8} />
              {unread > 0 && (
                <span
                  className="absolute -top-1.5 -end-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground shadow-sm border border-background"
                  dir="ltr"
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-2 ps-2 border-s">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground text-sm font-bold">
                {user?.avatar ? (
                  <img
                    src={pb.files.getURL(user, user.avatar)}
                    alt={user?.name || ''}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (user?.name || user?.email || '?').slice(0, 1).toUpperCase()
                )}
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold max-w-[140px] truncate">
                  {user?.name || user?.email}
                </p>
                <p className="text-[11px] text-muted-foreground">{roleDisplay(user, t)}</p>
              </div>
            </div>
          </div>
        </header>

        <main
          className={cn(
            fullBleed
              ? 'w-full max-w-none p-0'
              : 'mx-auto w-full max-w-7xl p-4 md:p-8',
            // Owner mobile bottom nav: keep last content clear of the fixed bar + iOS safe area.
            // Full-bleed chat manages its own bottom inset so we skip the extra padding there.
            scope === 'owner' &&
              !fullBleed &&
              'max-lg:pb-[calc(3.5rem+1rem+env(safe-area-inset-bottom,0px))]',
            fullBleed && scope === 'owner' && 'max-lg:pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]',
          )}
        >
          {children}
        </main>
      </div>

      {scope === 'owner' && (
        <OwnerMobileBottomNav
          active={activeKey}
          actionActive={actionActive}
          onNavigate={go}
          onOpenMenu={() => handleSheetOpenChange(true)}
          basePath={basePath}
        />
      )}
    </div>
  );
};

export default AppLayout;
