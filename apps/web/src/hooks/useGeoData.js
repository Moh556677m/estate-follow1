import { useEffect, useState, useCallback } from 'react';
import pb from '@/lib/pocketbaseClient';
import { countries as STATIC_COUNTRIES } from '@/lib/countries';
import { dialCodes as STATIC_DIAL } from '@/lib/dialCodes';
import { COUNTRY_WORKING_CITIES } from '@/lib/brokerageConstants';

// Module-level cache shared across every component that uses geo data, so the
// PB fetch happens once per page load no matter how many Phone/Country/City
// fields are mounted. This is the single centralized source the whole site
// reads from — Super Admin edits in Control Center reflect everywhere.
let _cache = null; // { countries: [], citiesByIso: {}, ts: 0 }
let _inflight = null;

const STATIC_BY_ISO = STATIC_COUNTRIES.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {});

// Build the static fallback list (always available, even before PB loads).
function staticCountries() {
  return STATIC_COUNTRIES.map((c) => ({
    code: c.code,
    en: c.en,
    ar: c.ar,
    dial: STATIC_DIAL[c.code] || '',
    enabled: true,
  }));
}

function staticCitiesByIso() {
  const out = {};
  Object.keys(COUNTRY_WORKING_CITIES).forEach((iso) => {
    out[iso] = COUNTRY_WORKING_CITIES[iso].map((c) => ({ en: c.en, ar: c.ar, custom: false }));
  });
  return out;
}

async function loadGeo() {
  // Countries
  let pbCountries = [];
  try {
    pbCountries = await pb.collection('platform_countries').getFullList({
      sort: 'name_en',
      requestKey: 'geo-countries',
    });
  } catch {
    pbCountries = [];
  }

  // Cities (expand country to resolve ISO)
  let pbCities = [];
  try {
    pbCities = await pb.collection('platform_cities').getFullList({
      sort: 'name_en',
      expand: 'country',
      requestKey: 'geo-cities',
    });
  } catch {
    pbCities = [];
  }

  const citiesByIso = staticCitiesByIso(); // start from static fallback

  if (pbCountries.length > 0) {
    // PB is the source of truth for countries.
    const countries = pbCountries
      .filter((r) => r.enabled !== false)
      .map((r) => ({
        code: r.iso,
        en: r.name_en,
        ar: r.name_ar,
        dial: r.dial_code || STATIC_DIAL[r.iso] || '',
        enabled: r.enabled !== false,
      }));
    // Override static cities with PB cities per country (PB wins where present).
    const pbCitiesByIso = {};
    pbCities.forEach((r) => {
      const iso = r.expand?.country?.iso || '';
      if (!iso) return;
      if (r.enabled === false) return;
      if (!pbCitiesByIso[iso]) pbCitiesByIso[iso] = [];
      pbCitiesByIso[iso].push({ en: r.name_en, ar: r.name_ar, custom: !!r.is_custom });
    });
    Object.keys(pbCitiesByIso).forEach((iso) => {
      citiesByIso[iso] = pbCitiesByIso[iso];
    });
    _cache = { countries, citiesByIso, ts: Date.now() };
    return _cache;
  }

  // PB empty → static fallback, but still merge any PB cities (rare).
  const pbCitiesByIso = {};
  pbCities.forEach((r) => {
    const iso = r.expand?.country?.iso || '';
    if (!iso || r.enabled === false) return;
    if (!pbCitiesByIso[iso]) pbCitiesByIso[iso] = [];
    pbCitiesByIso[iso].push({ en: r.name_en, ar: r.name_ar, custom: !!r.is_custom });
  });
  Object.keys(pbCitiesByIso).forEach((iso) => {
    citiesByIso[iso] = pbCitiesByIso[iso];
  });
  _cache = { countries: staticCountries(), citiesByIso, ts: Date.now() };
  return _cache;
}

function getSnapshot() {
  if (_cache) return _cache;
  return { countries: staticCountries(), citiesByIso: staticCitiesByIso(), ts: 0 };
}

// React hook — returns { countries, citiesByIso, countryName, dialForIso,
// citiesForCountry, loading, reload }.
export function useGeoData() {
  const [snap, setSnap] = useState(() => getSnapshot());
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let cancelled = false;
    if (_cache) {
      setSnap(_cache);
      setLoading(false);
      return undefined;
    }
    if (!_inflight) _inflight = loadGeo();
    _inflight
      .then((s) => {
        if (cancelled) return;
        setSnap(s);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSnap(getSnapshot());
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live updates when Super Admin edits geo data in Control Center.
  useEffect(() => {
    const handler = () => {
      _cache = null;
      _inflight = null;
      loadGeo().then((s) => setSnap(s)).catch(() => {});
    };
    const cols = ['platform_countries', 'platform_cities'];
    cols.forEach((c) => {
      void pb.collection(c).subscribe('*', handler).catch(() => {});
    });
    return () => {
      cols.forEach((c) => {
        void pb.collection(c).unsubscribe('*').catch(() => {});
      });
    };
  }, []);

  const countryName = useCallback(
    (iso, lang) => {
      if (!iso) return '';
      const c = snap.countries.find((x) => x.code === iso) || STATIC_BY_ISO[iso];
      if (!c) return iso;
      return lang === 'ar' ? c.ar : c.en;
    },
    [snap],
  );

  const dialForIso = useCallback(
    (iso) => {
      if (!iso) return '';
      const c = snap.countries.find((x) => x.code === iso);
      return (c && c.dial) || STATIC_DIAL[iso] || '';
    },
    [snap],
  );

  const citiesForCountry = useCallback(
    (iso) => snap.citiesByIso[String(iso || '').toUpperCase()] || [],
    [snap],
  );

  const reload = useCallback(() => {
    _cache = null;
    _inflight = null;
    setLoading(true);
    loadGeo().then((s) => setSnap(s)).catch(() => setLoading(false));
  }, []);

  return {
    countries: snap.countries,
    citiesByIso: snap.citiesByIso,
    countryName,
    dialForIso,
    citiesForCountry,
    loading,
    reload,
  };
}

export default useGeoData;
