// Client-side browser-profile identity + metadata.
// One id per browser profile / storage partition (not physical hardware),
// so Chrome + Firefox + a phone browser = three independent sessions.

const DEVICE_KEY = 'ef_device_id';
const SESSION_KEY = 'ef_session_token';
const ACCESS_KEY = 'ef_access_token';
const REFRESH_KEY = 'ef_refresh_token';

function randomId(prefix) {
  const a = Math.random().toString(36).slice(2, 12);
  const b = Math.random().toString(36).slice(2, 12);
  const c = Date.now().toString(36);
  return `${prefix}_${a}${b}${c}`;
}

function safeGet(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage */
  }
}

// Session-scoped (per-tab) helpers. The opaque session/access/refresh tokens
// below are per login, so they live in sessionStorage — each browser tab keeps
// its own copy and a login/logout in one tab never touches another tab's
// tokens. The device id stays in localStorage (shared) because it identifies
// the physical browser profile, not a single tab.
function tabGet(key) {
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function tabSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage */
  }
}

function tabRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getDeviceId() {
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    id = randomId('dev');
    safeSet(DEVICE_KEY, id);
  }
  return id;
}

/** Stable opaque session id for this browser profile (created once, rotated on login). */
export function getSessionToken() {
  let tok = tabGet(SESSION_KEY);
  if (!tok) {
    tok = randomId('sess');
    tabSet(SESSION_KEY, tok);
  }
  return tok;
}

export function rotateSessionTokens() {
  const session_token = randomId('sess');
  const access_token = randomId('atk');
  const refresh_token = randomId('rtk');
  tabSet(SESSION_KEY, session_token);
  tabSet(ACCESS_KEY, access_token);
  tabSet(REFRESH_KEY, refresh_token);
  return { session_token, access_token, refresh_token };
}

export function readStoredTokens() {
  return {
    session_token: tabGet(SESSION_KEY) || getSessionToken(),
    access_token: tabGet(ACCESS_KEY) || '',
    refresh_token: tabGet(REFRESH_KEY) || '',
  };
}

export function clearStoredTokens() {
  tabRemove(SESSION_KEY);
  tabRemove(ACCESS_KEY);
  tabRemove(REFRESH_KEY);
}

function detectBrowser(ua) {
  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  return 'Browser';
}

function detectOs(ua) {
  if (/Windows NT 10/i.test(ua)) return 'Windows';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Device';
}

function detectType(ua) {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function getDeviceInfo() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  const deviceType = detectType(ua);
  return {
    device_id: getDeviceId(),
    device_name: `${browser} · ${os}`,
    device_type: deviceType,
    browser,
  };
}
