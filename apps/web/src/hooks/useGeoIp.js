import { useEffect, useState } from 'react';

// IP-based country detection for the global PhoneField default calling code.
//
// Design goals (per the global phone-system spec):
//  - NEVER block the page: forms open instantly; detection resolves in the
//    background and only pre-selects a country code if the user hasn't
//    interacted yet.
//  - DEFAULT only, never enforced: the user can always change the code.
//  - No fake number is ever inserted — only the calling code is pre-selected.
//  - On any failure / timeout / VPN, we silently give up (return '') and the
//    field shows the "select code" placeholder.
//  - Cached for 24h in localStorage so it doesn't refetch on every form open.
//  - Shared across every PhoneField on the page via a module-level inflight
//    promise (one network lookup per page load, no matter how many fields).

let _cached = null; // { iso: 'AE', ts: 0 }
let _inflight = null;

const CACHE_KEY = 'ef_geoip_iso';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const TIMEOUT_MS = 4000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.iso !== undefined && Date.now() - (parsed.ts || 0) < CACHE_TTL) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(iso) {
  _cached = { iso, ts: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(_cached));
  } catch {
    /* ignore */
  }
}

// Resolve the visitor's ISO country code from IP. Returns '' on any failure.
// Never throws. Safe to call from many components — the inflight promise is
// shared, so only the first caller triggers a network request.
export function detectCountry() {
  if (_cached) return Promise.resolve(_cached.iso);
  const cached = readCache();
  if (cached) {
    _cached = cached;
    return Promise.resolve(cached.iso);
  }
  if (_inflight) return _inflight;

  _inflight = new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    fetch('https://ipwho.is/?fields=country_code', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        clearTimeout(timer);
        const iso = String(data?.country_code || '').toUpperCase();
        if (iso && iso.length === 2) {
          writeCache(iso);
          resolve(iso);
        } else {
          writeCache('');
          resolve('');
        }
      })
      .catch(() => {
        clearTimeout(timer);
        writeCache('');
        resolve('');
      });
  });
  return _inflight;
}

// React hook: returns the detected ISO code (or '' until resolved / on fail).
// Resolves in the background; the caller decides whether to apply it.
export function useGeoIp() {
  const [iso, setIso] = useState(
    () => _cached?.iso ?? readCache()?.iso ?? '',
  );
  useEffect(() => {
    let cancelled = false;
    detectCountry().then((code) => {
      if (!cancelled) setIso(code);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return iso;
}

export default useGeoIp;
