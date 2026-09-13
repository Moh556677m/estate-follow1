import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Detect device type, browser and operating system from the user agent.
 * Returns { os, browser, deviceType }. Used by the analytics visit recorder
 * and by the User Analytics dashboard.
 */
export function detectDeviceInfo() {
  if (typeof navigator === 'undefined') {
    return { os: 'Unknown', browser: 'Unknown', deviceType: 'Desktop' };
  }
  const ua = navigator.userAgent || '';

  let os = 'Unknown';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone/i.test(ua)) os = 'iOS';
  else if (/iPad/i.test(ua)) os = 'iPadOS';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  let deviceType = 'Desktop';
  if (/iPad|Tablet|Silk|Android(?!.*Mobile)/i.test(ua)) deviceType = 'Tablet';
  else if (/Mobi|iPhone|Android.*Mobile|Windows Phone/i.test(ua)) deviceType = 'Mobile';

  return { os, browser, deviceType };
}

/**
 * Records a page visit to the analytics_visits collection on every route
 * change for signed-in users. Best-effort: failures never break navigation.
 * Auto-recording starts from the moment this component is mounted.
 */
const AnalyticsTracker = () => {
  const location = useLocation();
  const { user, isAuthed } = useAuth();
  const lastPath = useRef('');

  // Google Analytics (gtag.js) — send a page_view on every SPA route change.
  // The gtag script + initial config live in index.html (loaded once globally),
  // so this only pushes events and never re-initializes the tracker.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    const path = location.pathname + location.search + location.hash;
    window.gtag('event', 'page_view', { page_path: path });
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!isAuthed || !user?.id) return;
    const path = location.pathname;
    if (!path || path === lastPath.current) return;
    lastPath.current = path;

    const { os, browser, deviceType } = detectDeviceInfo();
    let section = '';
    const m = path.match(/^\/dashboard\/([^/]+)/);
    if (m) section = m[1];

    pb
      .collection('analytics_visits')
      .create(
        {
          user: user.id,
          page: path,
          section,
          device_type: deviceType,
          browser,
          os,
        },
        { requestKey: `visit-${user.id}-${Date.now()}` },
      )
      .catch(() => {});
  }, [location.pathname, isAuthed, user]);

  return null;
};

export default AnalyticsTracker;
