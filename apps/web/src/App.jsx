import React, { useEffect, Suspense, lazy } from 'react';
import { Route, Routes, BrowserRouter as Router, Navigate } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import AnalyticsTracker from './components/AnalyticsTracker';
import { StaffRoute } from './components/StaffRoute';
import pb from './lib/pocketbaseClient';
import { applySiteIcon, DEFAULT_SITE_ICON_URL, DEFAULT_SITE_ICON_VERSION } from './lib/siteIcon';
import { fetchPublicBranding } from './lib/publicBranding';
import { fetchPublicSeoBundle } from './lib/brandEntity';
import { Helmet } from 'react-helmet';

// Performance / UX audit (Task #26): every route below used to be a plain
// eager `import`, so AdminDashboard.jsx alone (which itself eagerly pulled
// in ~20+ admin panel components — MarketingPanel.jsx 139KB, PropertyForm.jsx
// 230KB, SeoAiSearchPanel.jsx 105KB, PlatformSettingsPanel.jsx 95KB, etc.)
// shipped in EVERY visitor's initial JS bundle — including an anonymous
// visitor who only ever sees the public /about page or the login screen and
// will never open the admin console. Converting these to React.lazy() moves
// each dashboard/portal's code into its own chunk, downloaded only when that
// route is actually visited. Kept eager: LoginPage/SignupPage/
// ForgotPasswordPage (small, and the first screen almost every unauthenticated
// visitor hits) and every layout/guard/context component below (small, and
// must be available immediately for routing itself to work).
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const AdminForgotPasswordPage = lazy(() => import('./pages/AdminForgotPasswordPage'));
const AdminPortalLanding = lazy(() => import('./pages/AdminPortalLanding'));
const CrmLeadPage = lazy(() => import('./pages/CrmLeadPage'));
const SharedDocumentPage = lazy(() => import('./pages/SharedDocumentPage'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// Estate Follow Insights — public content portal
import InsightsLayout from './components/insights/InsightsLayout';
const InsightsHome = lazy(() => import('./pages/insights/InsightsHome'));
const InsightsArticles = lazy(() => import('./pages/insights/InsightsArticles'));
const InsightsArticle = lazy(() => import('./pages/insights/InsightsArticle'));
const InsightsNews = lazy(() => import('./pages/insights/InsightsNews'));
const InsightsVideos = lazy(() => import('./pages/insights/InsightsVideos'));
const InsightsGuides = lazy(() => import('./pages/insights/InsightsGuides'));
const InsightsAbout = lazy(() => import('./pages/insights/InsightsAbout'));
const InsightsContact = lazy(() => import('./pages/insights/InsightsContact'));
import { EditorAuthProvider } from './contexts/EditorAuthContext';
const EditorLoginPage = lazy(() => import('./pages/insights/EditorLoginPage'));
import EditorRoute from './components/insights/EditorRoute';
const EditorDashboard = lazy(() => import('./pages/insights/EditorDashboard'));

// Central Brand Identity — public pages + global structured data
import PublicBrandLayout from './components/PublicBrandLayout';
const AboutPage = lazy(() => import('./pages/AboutPage'));
const WhatIsEstateFollowPage = lazy(() => import('./pages/WhatIsEstateFollowPage'));
import BrandStructuredData from './components/BrandStructuredData';

// Task #22 — Site Editor: public renderer for Super-Admin-authored custom pages.
const SitePageView = lazy(() => import('./pages/SitePageView'));

// Minimal, unobtrusive full-page fallback shown only for the brief moment a
// lazy route's own JS chunk is downloading (typically well under a second;
// the page's own internal loading state takes over immediately after it
// mounts). Deliberately plain — this must never depend on CSS/fonts that
// might themselves still be loading.
function RouteLoadingFallback() {
    return (
        <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
                style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: '3px solid rgba(0,0,0,0.12)',
                    borderTopColor: 'rgba(0,0,0,0.45)',
                    animation: 'ef-route-spin 0.7s linear infinite',
                }}
            />
            <style>{'@keyframes ef-route-spin{to{transform:rotate(360deg)}}'}</style>
        </div>
    );
}

// Shared visual-branding application (colors, favicon, fonts, tab title) used
// by both the authenticated path (applyPlatformSettings, below — richer, also
// exposes the full CMS blob for admin/dashboard consumers) and the public/
// guest path (GuestBrandLoader, below — safe subset only, works with no
// login). Kept in one place so the two paths can never visually drift apart.
function applyBrandVisuals({ primary_color, brand_name, iconUrl, iconVersion, font_family, font_arabic }) {
    const root = document.documentElement;
    const primary = hexToHsl(primary_color);
    if (primary) {
        root.style.setProperty('--primary', primary);
        root.style.setProperty('--ring', primary);
        root.style.setProperty('--gold', primary);
        root.style.setProperty('--sidebar-primary', primary);
        root.style.setProperty('--sidebar-ring', primary);
    }
    if (brand_name) {
        document.title = `${brand_name} — Estate Follow`;
    }
    applySiteIcon({
        url: iconUrl || DEFAULT_SITE_ICON_URL,
        version: iconVersion || DEFAULT_SITE_ICON_VERSION,
    });
    const latin = (font_family || '').trim();
    const arabic = (font_arabic || '').trim();
    if (latin || arabic) {
        const families = [];
        if (latin) families.push(`${latin.replace(/ /g, '+')}:wght@400;500;600;700;800`);
        if (arabic) families.push(`${arabic.replace(/ /g, '+')}:wght@400;500;600;700`);
        const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
        let fontLink = document.getElementById('platform-font-link');
        if (!fontLink) {
            fontLink = document.createElement('link');
            fontLink.id = 'platform-font-link';
            fontLink.rel = 'stylesheet';
            document.head.appendChild(fontLink);
        }
        fontLink.href = href;
        root.style.setProperty('--font-latin', latin ? `"${latin}", "Inter", sans-serif` : '');
        root.style.setProperty('--font-arabic', arabic ? `"${arabic}", "IBM Plex Sans Arabic", sans-serif` : '');
        const bodyFont = latin ? `"${latin}", "IBM Plex Sans Arabic", sans-serif` : '';
        if (bodyFont) root.style.setProperty('--font-body', bodyFont);
    }
}

// Runs for EVERY visitor, signed in or not — including guests, who never hit
// the authenticated `platform_settings` read below (that collection's
// listRule/viewRule require a session). Before this fix, anonymous traffic
// (the public marketing pages, pre-login visitors, search-engine crawlers)
// only ever saw the static default favicon/logo/colors baked into
// index.html, never the Super Admin's real uploaded brand — this closes
// that gap via the no-auth /public/branding API route.
function GuestBrandLoader() {
    useEffect(() => {
        let cancelled = false;
        fetchPublicBranding()
            .then((data) => {
                if (cancelled) return;
                if (!data) {
                    applySiteIcon();
                    return;
                }
                applyBrandVisuals({
                    primary_color: data.primary_color,
                    brand_name: data.brand_name,
                    iconUrl: data.site_icon_url,
                    iconVersion: data.site_icon_version,
                    font_family: data.font_family,
                    font_arabic: data.font_arabic,
                });
            })
            .catch(() => applySiteIcon());
        return () => {
            cancelled = true;
        };
    }, []);
    return null;
}

// Sitewide SEO fallbacks sourced from the Admin SEO panel (`cms.seo`).
//
// IMPORTANT: this intentionally does NOT override any page's own literal
// <title>/<meta name="description"> — those must stay literal strings on
// each page component because the llms.txt build step reads them straight
// out of page source (see components/Seo.jsx's own comment). react-helmet
// merges every mounted <Helmet> by render-tree order and keeps the LAST one
// for singular tags like <title>/<meta name="description">; this component
// is mounted once at the very root (before <Routes>), so any page-level
// <Seo>/<Helmet> mounted deeper always wins and this is only ever seen on a
// page that sets no title/description of its own. og:image fallback is
// applied separately inside <Seo> itself via resolveSocialImage (see
// lib/siteLogo.js), which now also checks the Admin-configured og_image_url.
function GlobalSeoMeta() {
    const [seo, setSeo] = React.useState(null);

    useEffect(() => {
        let cancelled = false;
        fetchPublicSeoBundle().then((bundle) => {
            if (!cancelled && bundle?.seo) setSeo(bundle.seo);
        });
        const onCms = () => {
            fetchPublicSeoBundle().then((bundle) => {
                if (!cancelled && bundle?.seo) setSeo(bundle.seo);
            });
        };
        window.addEventListener('estatefollow-cms-updated', onCms);
        return () => {
            cancelled = true;
            window.removeEventListener('estatefollow-cms-updated', onCms);
        };
    }, []);

    if (!seo) return null;
    const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
    const defaultTitle = (lang === 'ar' ? seo.meta_title_ar : seo.meta_title_en) || undefined;
    const defaultDescription =
        (lang === 'ar' ? seo.meta_description_ar : seo.meta_description_en) || undefined;

    return (
        <Helmet>
            {defaultTitle && <title>{defaultTitle}</title>}
            {defaultDescription && <meta name="description" content={defaultDescription} />}
        </Helmet>
    );
}

// Defense-in-depth for the production host while the platform-level 301 is
// applied: www never renders a second copy of the app. The path, query string,
// and hash are retained, and the apex target cannot redirect back to www.
function CanonicalHostRedirect() {
    useEffect(() => {
        if (window.location.hostname.toLowerCase() !== 'www.estatefollow.com') return;
        const target = `https://estatefollow.com${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(target);
    }, []);
    return null;
}

// Global pointer-events safety net.
//
// Radix Dialog / Sheet set `document.body.style.pointerEvents = 'none' while a
// modal is open (correct — it blocks interaction with the page behind it) and
// restore it to '' on close. In rare cases (fast toggle, unmount mid-animation,
// nested dialogs) the restore step is skipped and body stays
// pointer-events:none, which silently blocks EVERY click/tap on the page —
// buttons, links, inputs, all dead. AppLayout has a scoped net for the
// dashboard sidebar; this global net covers every other surface (login,
// signup, admin, insights, editor) so no page can ever get stuck.
//
// It only ever RESTORES pointer-events (never fights an actually-open modal:
// if a [data-state="open"] dialog/sheet exists, body:none is correct and we
// leave it alone).
function PointerEventsGuard() {
    useEffect(() => {
        const unlockIfStuck = () => {
            try {
                if (document.body.style.pointerEvents !== 'none') return;
                // A stale/orphaned node can keep a data-state="open" attribute
                // after Radix's own close animation was interrupted (e.g. the
                // whole dialog subtree was unmounted mid-open instead of being
                // told open=false — see PropertyReviewModal/UserProfileModal/
                // StaffProfileModal) without ever being removed from the DOM.
                // Such a node isn't actually visible, so checking for its mere
                // presence (as this guard used to) made the lock permanent
                // instead of self-healing. Only a candidate that is connected
                // AND actually has layout size counts as "genuinely open".
                const candidates = document.querySelectorAll(
                    '[role="dialog"][data-state="open"], [data-state="open"].fixed',
                );
                const genuinelyOpen = Array.from(candidates).some((el) => {
                    if (!el.isConnected) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                });
                if (genuinelyOpen) return; // a modal is genuinely open and visible — body lock is correct
                document.body.style.pointerEvents = '';
                document.body.removeAttribute('data-scroll-locked');
            } catch {
                /* ignore */
            }
        };
        unlockIfStuck();
        const id = window.setInterval(unlockIfStuck, 1200);
        return () => window.clearInterval(id);
    }, []);
    return null;
}

// Task #23 — Site Issues: reports real, uncaught frontend errors (a JS
// exception or an unhandled promise rejection an actual visitor hit) to the
// Site Issues admin panel, via the Express endpoint that owns rate-limiting
// for this (POST /site-issues/report — see that route's file header for why
// this never writes to PocketBase directly). Capped at a handful of reports
// per page load so an error loop can't flood the endpoint from one tab.
const SITE_ISSUES_REPORT_URL = '/hcgi/api/site-issues/report';
const MAX_REPORTS_PER_LOAD = 5;
let siteIssueReportCount = 0;

function reportSiteIssue(source, title, message, stack) {
    if (siteIssueReportCount >= MAX_REPORTS_PER_LOAD) return;
    siteIssueReportCount += 1;
    try {
        const body = JSON.stringify({
            source,
            title: String(title || '').slice(0, 300),
            message: String(message || '').slice(0, 2000),
            stack: String(stack || '').slice(0, 8000),
            url: window.location.href,
            lang: document.documentElement.lang || '',
        });
        if (navigator.sendBeacon) {
            navigator.sendBeacon(SITE_ISSUES_REPORT_URL, new Blob([body], { type: 'application/json' }));
        } else {
            fetch(SITE_ISSUES_REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
        }
    } catch {
        /* never let error reporting itself throw */
    }
}

function SiteIssuesReporter() {
    useEffect(() => {
        const onError = (event) => {
            reportSiteIssue('js_error', event.message, event.message, event.error?.stack);
        };
        const onRejection = (event) => {
            const reason = event.reason;
            const message = reason?.message || String(reason || 'Unhandled promise rejection');
            reportSiteIssue('js_error', message, message, reason?.stack);
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);
    return null;
}

// Convert a hex color (#22C55E) to { h, s, l } numbers (0-360 / 0-100 / 0-100).
// Returns null for invalid input.
function hexToHslParts(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hue = 0;
    let sat = 0;
    const light = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        sat = light > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) hue = (b - r) / d + 2;
        else hue = (r - g) / d + 4;
        hue /= 6;
    }
    return { h: Math.round(hue * 360), s: Math.round(sat * 100), l: Math.round(light * 100) };
}

// Convert a hex color (#22C55E) to the "H S% L%" string used by the theme
// CSS variables. Returns null for invalid input.
function hexToHsl(hex) {
    const parts = hexToHslParts(hex);
    if (!parts) return null;
    return `${parts.h} ${parts.s}% ${parts.l}%`;
}

// Loads platform branding settings and applies the brand colors + the
// document title. Runs for any signed-in user (settings are readable by all).
//
// IMPORTANT (color stability): only the brand PRIMARY color drives chrome.
// --primary, --ring, --gold, --sidebar-primary and --sidebar-ring all follow
// primary_color so every selected / active / hover / focus / dropdown-selected
// / button / tab / toggle-active state stays on the approved brand green and
// the old turquoise accent can never reappear after refresh, login/logout,
// language change, or code update. --accent / --accent-foreground are left to
// the design tokens in index.css (already brand-green tints) so hover
// backgrounds keep correct contrast in both light and dark mode.
function applyPlatformSettings(s) {
    if (!s) return;
    // Prefer the Super Admin site icon URL (single source of truth), then any
    // uploaded favicon file, then the official default green icon.
    const favicon =
        s.site_icon_url ||
        (s.favicon_file && pb.files.getURL(s, s.favicon_file)) ||
        DEFAULT_SITE_ICON_URL;
    applyBrandVisuals({
        primary_color: s.primary_color,
        brand_name: s.brand_name,
        iconUrl: favicon,
        iconVersion: s.site_icon_version || s.updated,
        font_family: s.font_family,
        font_arabic: s.font_arabic,
    });
    // Expose CMS blob for dashboards / slogans without full reload.
    try {
        window.__EF_CMS__ = s.cms && typeof s.cms === 'object' ? s.cms : null;
        window.__EF_PLATFORM__ = s;
        window.dispatchEvent(new CustomEvent('estatefollow-cms-updated', { detail: { cms: s.cms, brand: s } }));
    } catch {
        /* ignore */
    }
}

const BrandLoader = () => {
    const { isAuthed, user } = useAuth();
    const [maintenance, setMaintenance] = React.useState(null);

    useEffect(() => {
        if (!isAuthed) return undefined;
        let cancelled = false;
        const load = () => {
            pb.collection('platform_settings')
                .getFullList({ sort: 'created' })
                .then((rows) => {
                    if (cancelled || !rows.length) return;
                    const s = rows[0];
                    applyPlatformSettings(s);
                    const m = s.cms?.maintenance;
                    if (m && typeof m === 'object') setMaintenance(m);
                    else setMaintenance(null);
                })
                .catch(() => {});
        };
        load();
        const onCms = (e) => {
            const m = e?.detail?.cms?.maintenance;
            if (m && typeof m === 'object') setMaintenance(m);
        };
        window.addEventListener('estatefollow-cms-updated', onCms);
        return () => {
            cancelled = true;
            window.removeEventListener('estatefollow-cms-updated', onCms);
        };
    }, [isAuthed]);

    const isStaff =
        !!user?.is_super_admin ||
        ['admin', 'editor', 'support', 'custom'].includes(user?.role);

    if (maintenance?.enabled && isAuthed && !isStaff) {
        const msg =
            (document.documentElement.lang === 'ar'
                ? maintenance.message_ar
                : maintenance.message_en) ||
            maintenance.message_en ||
            maintenance.message_ar ||
            '';
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 p-6">
                <div className="max-w-md rounded-2xl border bg-card p-6 text-center shadow-lg space-y-3">
                    <p className="text-lg font-bold">
                        {document.documentElement.lang === 'ar' ? 'صيانة' : 'Maintenance'}
                    </p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{msg}</p>
                </div>
            </div>
        );
    }
    return null;
};

/** Resolve product surface from the authenticated user record. */
function resolveAccountSurface(user) {
    if (!user) return 'owner';
    // Staff / Super Admin always use the admin console (not owner/broker UI).
    const staff =
        !!user.is_super_admin ||
        ['admin', 'editor', 'support', 'custom'].includes(user.role);
    if (staff) return 'staff';
    const at = String(user.account_type || '').toLowerCase();
    return 'owner';
}

// After login every account type lands on its natural home page — the
// sidebar reorder feature only reorders menu items, it never changes the
// post-login landing page.
const DashboardHomeRedirect = () => {
    const { user } = useAuth();
    const surface = resolveAccountSurface(user);
    if (surface === 'staff') {
        return <Navigate to="/dashboard/overview" replace />;
    }
    return <Navigate to="/dashboard/home" replace />;
};

const DashboardRouter = () => {
    const { user } = useAuth();
    const surface = resolveAccountSurface(user);
    // Strict role routing — staff use the admin console, everyone else the owner dashboard.
    if (surface === 'staff') return <AdminDashboard />;
    return <OwnerDashboard />;
};

function App() {
    return (
        <LanguageProvider>
            <AuthProvider>
                <Router>
                    <ScrollToTop />
                    <PointerEventsGuard />
                    <SiteIssuesReporter />
                    {/* Unified Toast/Banner surface — every notify.* call renders
                        here, top-center, auto-dismiss + manual close. */}
                    <Toaster />
                    <BrandStructuredData />
                    <GuestBrandLoader />
                    <GlobalSeoMeta />
                    <CanonicalHostRedirect />
                    <BrandLoader />
                    <AnalyticsTracker />
                    <Suspense fallback={<RouteLoadingFallback />}>
                    <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                        <Route path="/signup" element={<SignupPage />} />

                        {/* Public CRM lead page (no login required) */}
                        <Route path="/connect/:slug" element={<CrmLeadPage />} />

                        {/* Task #17 — Secure Sharing: public share-link viewer (no login) */}
                        <Route path="/share/:token" element={<SharedDocumentPage />} />

                        {/* ---- Central Brand Identity public pages ---- */}
                        <Route element={<PublicBrandLayout />}>
                            <Route path="/about" element={<AboutPage />} />
                            <Route path="/what-is-estate-follow" element={<WhatIsEstateFollowPage />} />
                            {/* Task #22 — Site Editor: any custom page created in the admin panel */}
                            <Route path="/page/:slug" element={<SitePageView />} />
                        </Route>

                        {/* ---- Estate Follow Insights (public content portal) ---- */}
                        <Route path="/insights" element={<InsightsLayout />}>
                            <Route index element={<InsightsHome />} />
                            <Route path="articles" element={<InsightsArticles />} />
                            <Route path="article/:slug" element={<InsightsArticle />} />
                            <Route path="news" element={<InsightsNews />} />
                            <Route path="videos" element={<InsightsVideos />} />
                            <Route path="guides" element={<InsightsGuides />} />
                            <Route path="about" element={<InsightsAbout />} />
                            <Route path="contact" element={<InsightsContact />} />
                        </Route>

                        {/* ---- Editor Portal (isolated from client accounts) ---- */}
                        <Route
                            path="/editor/*"
                            element={
                                <EditorAuthProvider>
                                    <Routes>
                                        <Route path="/login" element={<EditorLoginPage />} />
                                        <Route path="/dashboard" element={<EditorRoute><EditorDashboard /></EditorRoute>} />
                                        <Route path="/dashboard/:section" element={<EditorRoute><EditorDashboard /></EditorRoute>} />
                                        <Route path="/dashboard/articles/:articleId" element={<EditorRoute><EditorDashboard /></EditorRoute>} />
                                        <Route path="*" element={<EditorLoginPage />} />
                                    </Routes>
                                </EditorAuthProvider>
                            }
                        />

                        {/* ---- Admin & Staff Portal (isolated) ---- */}
                        <Route path="/admin/login" element={<AdminLoginPage />} />
                        <Route
                          path="/admin/forgot-password"
                          element={<AdminForgotPasswordPage />}
                        />
                        {/* Public, indexable Admin Portal landing page. */}
                        <Route path="/admin" element={<AdminPortalLanding />} />
                        <Route
                          path="/admin/:section"
                          element={
                            <StaffRoute>
                              <AdminDashboard basePath="/admin" />
                            </StaffRoute>
                          }
                        />
                        <Route
                            path="/dashboard"
                            element={
                                <ProtectedRoute>
                                    <DashboardHomeRedirect />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/dashboard/property/:propertyId"
                            element={
                                <ProtectedRoute>
                                    <DashboardRouter />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/dashboard/:section"
                            element={
                                <ProtectedRoute>
                                    <DashboardRouter />
                                </ProtectedRoute>
                            }
                        />
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                    </Suspense>
                </Router>
            </AuthProvider>
        </LanguageProvider>
    );
}

export default App;
