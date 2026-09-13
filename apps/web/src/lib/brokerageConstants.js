export const BROKER_SPECIALIZATIONS_DEFAULT = [
  { id: 'resale', en: 'Resale', ar: 'إعادة بيع' },
  { id: 'rental', en: 'Rental', ar: 'تأجير' },
  { id: 'off_plan', en: 'Off-plan', ar: 'على الخارطة' },
  { id: 'land_sales', en: 'Land Sales', ar: 'بيع الأراضي' },
  { id: 'building_sales', en: 'Building Sales', ar: 'بيع البنايات' },
];

/** Live list — prefers CMS Control Center overrides when present. */
export const BROKER_SPECIALIZATIONS = BROKER_SPECIALIZATIONS_DEFAULT;

export function getBrokerSpecializations() {
  try {
    const cms = typeof window !== 'undefined' ? window.__EF_CMS__ : null;
    const list = cms?.specializations;
    if (Array.isArray(list) && list.length) {
      return list.map((s) => ({
        id: s.id,
        en: s.en || s.name_en || s.id,
        ar: s.ar || s.name_ar || s.id,
      }));
    }
  } catch {
    /* ignore */
  }
  return BROKER_SPECIALIZATIONS_DEFAULT;
}

// ---- Canonical specialization normalization (Arabic == English) ----
// The interface language only controls the displayed LABEL; the backend value
// is always a single canonical ID. This makes "تأجير" and "Rental" match the
// same specialization everywhere (filter, search, ranking).

/** Fold a token to a normalized comparison key (lowercase, ASCII, Arabic
 *  diacritics stripped, common letter forms unified). */
export function foldToken(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, '') // Arabic harakat
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extra aliases beyond the canonical en/ar labels.
const SPEC_EXTRA_ALIASES = {
  [foldToken('rent')]: 'rental',
  [foldToken('تاجير')]: 'rental',
  [foldToken('ايجار')]: 'rental',
  [foldToken('إيجار')]: 'rental',
  [foldToken('عقارات تحت الإنشاء')]: 'off_plan',
  [foldToken('عقارات تحت الانشاء')]: 'off_plan',
  [foldToken('على الخارطه')]: 'off_plan',
  [foldToken('offplan')]: 'off_plan',
  [foldToken('off plan')]: 'off_plan',
  [foldToken('under construction')]: 'off_plan',
  [foldToken('اعادة بيع')]: 'resale',
  [foldToken('resale properties')]: 'resale',
  [foldToken('بيع الاراضي')]: 'land_sales',
  [foldToken('بيع البنايات')]: 'building_sales',
  [foldToken('land')]: 'land_sales',
  [foldToken('buildings')]: 'building_sales',
};

/** Build an alias -> canonical-id map from the live specialization list. */
function buildSpecAliasMap() {
  const list = getBrokerSpecializations();
  const map = { ...SPEC_EXTRA_ALIASES };
  list.forEach((s) => {
    const id = s.id;
    map[foldToken(id)] = id;
    map[foldToken(s.en)] = id;
    map[foldToken(s.ar)] = id;
  });
  return map;
}

let _specAliasMap = null;
function specAliasMap() {
  if (!_specAliasMap) _specAliasMap = buildSpecAliasMap();
  return _specAliasMap;
}

/** Convert any specialization token (id, en label, ar label, variant) to its
 *  canonical ID. Unknown tokens are folded and returned as-is (stable). */
export function specToId(value) {
  if (!value) return '';
  const key = foldToken(value);
  if (!key) return '';
  return specAliasMap()[key] || key;
}

/** Normalize a list of specialization tokens to canonical IDs (deduped). */
export function normalizeSpecList(values) {
  const out = [];
  const seen = new Set();
  parseList(values).forEach((v) => {
    const id = specToId(v);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  });
  return out;
}

/** All searchable text for a specialization list (canonical id + en + ar
 *  labels), lowercased — used by the general search box. */
export function specSearchHay(values) {
  const list = getBrokerSpecializations();
  const byId = {};
  list.forEach((s) => {
    byId[s.id] = s;
  });
  const parts = new Set();
  normalizeSpecList(values).forEach((id) => {
    parts.add(id);
    const s = byId[id];
    if (s) {
      parts.add(String(s.en).toLowerCase());
      parts.add(String(s.ar));
    }
  });
  return [...parts].filter(Boolean).join(' ');
}

export const COMMON_LANGUAGES = [
  { id: 'ar', en: 'Arabic', ar: 'العربية' },
  { id: 'en', en: 'English', ar: 'الإنجليزية' },
  { id: 'fr', en: 'French', ar: 'الفرنسية' },
  { id: 'ru', en: 'Russian', ar: 'الروسية' },
  { id: 'hi', en: 'Hindi', ar: 'الهندية' },
  { id: 'ur', en: 'Urdu', ar: 'الأردية' },
  { id: 'zh', en: 'Chinese', ar: 'الصينية' },
  { id: 'de', en: 'German', ar: 'الألمانية' },
  { id: 'es', en: 'Spanish', ar: 'الإسبانية' },
  { id: 'pt', en: 'Portuguese', ar: 'البرتغالية' },
  { id: 'tr', en: 'Turkish', ar: 'التركية' },
  { id: 'fa', en: 'Persian', ar: 'الفارسية' },
];

/** Popular working cities by ISO country code (AE, SA, …). */
export const COUNTRY_WORKING_CITIES = {
  AE: [
    { en: 'Dubai', ar: 'دبي' },
    { en: 'Abu Dhabi', ar: 'أبوظبي' },
    { en: 'Sharjah', ar: 'الشارقة' },
    { en: 'Ajman', ar: 'عجمان' },
    { en: 'Ras Al Khaimah', ar: 'رأس الخيمة' },
    { en: 'Fujairah', ar: 'الفجيرة' },
    { en: 'Umm Al Quwain', ar: 'أم القيوين' },
  ],
  SA: [
    { en: 'Riyadh', ar: 'الرياض' },
    { en: 'Jeddah', ar: 'جدة' },
    { en: 'Dammam', ar: 'الدمام' },
    { en: 'Khobar', ar: 'الخبر' },
    { en: 'Mecca', ar: 'مكة' },
    { en: 'Medina', ar: 'المدينة' },
    { en: 'Neom', ar: 'نيوم' },
  ],
  EG: [
    { en: 'Cairo', ar: 'القاهرة' },
    { en: 'Giza', ar: 'الجيزة' },
    { en: 'Alexandria', ar: 'الإسكندرية' },
    { en: 'New Administrative Capital', ar: 'العاصمة الإدارية' },
    { en: 'Hurghada', ar: 'الغردقة' },
    { en: 'Sharm El Sheikh', ar: 'شرم الشيخ' },
  ],
  QA: [
    { en: 'Doha', ar: 'الدوحة' },
    { en: 'Lusail', ar: 'لوسيل' },
    { en: 'Al Rayyan', ar: 'الريان' },
    { en: 'Al Wakrah', ar: 'الوكرة' },
  ],
  KW: [
    { en: 'Kuwait City', ar: 'مدينة الكويت' },
    { en: 'Hawalli', ar: 'حولي' },
    { en: 'Salmiya', ar: 'السالمية' },
  ],
  BH: [
    { en: 'Manama', ar: 'المنامة' },
    { en: 'Riffa', ar: 'الرفاع' },
    { en: 'Muharraq', ar: 'المحرق' },
  ],
  OM: [
    { en: 'Muscat', ar: 'مسقط' },
    { en: 'Salalah', ar: 'صلالة' },
    { en: 'Sohar', ar: 'صحار' },
  ],
  JO: [
    { en: 'Amman', ar: 'عمّان' },
    { en: 'Aqaba', ar: 'العقبة' },
    { en: 'Irbid', ar: 'إربد' },
  ],
  TR: [
    { en: 'Istanbul', ar: 'إسطنبول' },
    { en: 'Ankara', ar: 'أنقرة' },
    { en: 'Antalya', ar: 'أنطاليا' },
    { en: 'Izmir', ar: 'إزمير' },
  ],
  GB: [
    { en: 'London', ar: 'لندن' },
    { en: 'Manchester', ar: 'مانشستر' },
    { en: 'Birmingham', ar: 'برمنغهام' },
  ],
  US: [
    { en: 'New York', ar: 'نيويورك' },
    { en: 'Los Angeles', ar: 'لوس أنجلوس' },
    { en: 'Miami', ar: 'ميامي' },
    { en: 'Houston', ar: 'هيوستن' },
  ],
};

export function citiesForCountry(countryCode, lang = 'en') {
  const code = String(countryCode || '').toUpperCase();
  const list = COUNTRY_WORKING_CITIES[code] || [];
  return list.map((c) => (lang === 'ar' ? c.ar : c.en));
}

export function specLabel(id, lang) {
  const s = BROKER_SPECIALIZATIONS.find((x) => x.id === id);
  if (!s) return id;
  return lang === 'ar' ? s.ar : s.en;
}

export function langLabel(id, lang) {
  const s = COMMON_LANGUAGES.find((x) => x.id === id);
  if (!s) return id;
  return lang === 'ar' ? s.ar : s.en;
}

export function parseList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const j = JSON.parse(value);
      if (Array.isArray(j)) return j.filter(Boolean);
    } catch {
      /* csv */
    }
    return value
      .split(/[,،|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
