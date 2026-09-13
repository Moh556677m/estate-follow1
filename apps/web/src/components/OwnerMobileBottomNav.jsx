import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, FileText, Home, Sparkles, UserRound } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

/**
 * Fixed bottom navigation for Owner account on mobile only.
 * Desktop is unchanged — parent should render this inside `lg:hidden`.
 *
 * 5 items: Home · My Docs · My Properties (prominent) · Add Property (AI) ·
 * Account.
 *
 * The manual "Add Property" action button has been REMOVED from here — its
 * center slot is now "My Properties" (عقاراتي). The AI system itself is not
 * deleted: the item that used to just say "AI" is relabeled "Add Property"
 * (keeping the same Sparkles icon/identity) because Estate AI is now THE way
 * to add a property (smart contract/document reading → preview → approve).
 * Sizing is responsive/compact so nothing overlaps on small screens, while
 * the My Properties center button stays visually prominent.
 */
const OwnerMobileBottomNav = ({
  active,
  actionActive = false,
  onNavigate,
  onOpenMenu,
  basePath = '/dashboard',
}) => {
  const { lang } = useLanguage();
  const ar = lang === 'ar';

  const items = [
    {
      key: 'home',
      label: ar ? 'الرئيسية' : 'Home',
      icon: Home,
      to: `${basePath}/home`,
    },
    {
      key: 'documents',
      label: ar ? 'مستنداتي' : 'My Docs',
      icon: FileText,
      to: `${basePath}/documents`,
    },
    {
      key: 'my-properties',
      label: ar ? 'عقاراتي' : 'My Properties',
      icon: Building2,
      to: `${basePath}/my-properties`,
      prominent: true,
    },
    {
      key: 'ai',
      label: ar ? 'إضافة عقار' : 'Add Property',
      icon: Sparkles,
      to: `${basePath}/ai`,
    },
    {
      key: 'profile',
      label: ar ? 'حسابي' : 'Account',
      icon: UserRound,
      // Opens the existing mobile sidebar (same Sheet as before) — not a route.
      openMenu: true,
    },
  ];

  const isActive = (item) => {
    if (item.action) return !!actionActive;
    return active === item.key;
  };

  return (
    <nav
      aria-label={ar ? 'التنقل السفلي' : 'Bottom navigation'}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-card shadow-[0_-4px_16px_rgba(15,23,42,0.06)] lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto grid h-[3.5rem] max-w-lg grid-cols-5 items-stretch px-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const on = isActive(item);

          if (item.action) {
            return (
              <li key={item.key} className="flex min-w-0">
                <button
                  type="button"
                  onClick={(e) => onNavigate?.(item.key, e)}
                  className="group flex w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 touch-manipulation active:scale-[0.98]"
                  aria-label={item.label}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition-transform',
                      on && 'ring-2 ring-primary/30 ring-offset-1 ring-offset-card',
                    )}
                  >
                    <Icon size={20} strokeWidth={2.25} />
                  </span>
                  <span
                    className={cn(
                      'max-w-full truncate text-[10px] font-semibold leading-tight',
                      on ? 'text-primary' : 'text-primary/90',
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          }

          if (item.openMenu) {
            return (
              <li key={item.key} className="flex min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenMenu?.()}
                  className={cn(
                    'relative flex w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 touch-manipulation transition-colors active:scale-[0.98]',
                    on ? 'text-primary' : 'text-muted-foreground',
                  )}
                  aria-label={item.label}
                >
                  {on && (
                    <span
                      className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-xl transition-colors',
                      on && 'bg-primary/10',
                    )}
                  >
                    <Icon size={18} strokeWidth={on ? 2.1 : 1.75} />
                  </span>
                  <span
                    className={cn(
                      'max-w-full truncate text-[10px] leading-tight',
                      on ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          }

          if (item.prominent) {
            return (
              <li key={item.key} className="flex min-w-0">
                <Link
                  to={item.to}
                  onClick={(e) => onNavigate?.(item.key, e)}
                  className="group flex w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 touch-manipulation active:scale-[0.98]"
                  aria-label={item.label}
                  aria-current={on ? 'page' : undefined}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition-transform',
                      on && 'ring-2 ring-primary/30 ring-offset-1 ring-offset-card',
                    )}
                  >
                    <Icon size={20} strokeWidth={2.25} />
                  </span>
                  <span
                    className={cn(
                      'max-w-full truncate text-[10px] font-semibold leading-tight',
                      on ? 'text-primary' : 'text-primary/90',
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.key} className="flex min-w-0">
              <Link
                to={item.to}
                onClick={(e) => onNavigate?.(item.key, e)}
                className={cn(
                  'relative flex w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 touch-manipulation transition-colors active:scale-[0.98]',
                  on ? 'text-primary' : 'text-muted-foreground',
                )}
                aria-current={on ? 'page' : undefined}
              >
                {on && (
                  <span
                    className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary"
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-xl transition-colors',
                    on && 'bg-primary/10',
                  )}
                >
                  <Icon size={18} strokeWidth={on ? 2.1 : 1.75} />
                </span>
                <span
                  className={cn(
                    'max-w-full truncate text-[10px] leading-tight',
                    on ? 'font-semibold' : 'font-medium',
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default OwnerMobileBottomNav;
