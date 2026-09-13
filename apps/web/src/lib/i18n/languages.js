/**
 * Supported UI languages for Estate Follow.
 * `nativeName` is shown in the language picker (endonym).
 * `dir` drives document direction (rtl | ltr).
 * Full string catalogs: `ar` + `en` in LanguageContext; other codes fall back to English via t().
 */

export const RTL_LANGS = new Set([
  'ar',
  'he',
  'fa',
  'ur',
  'ps',
  'sd',
  'yi',
  'dv',
  'ckb',
  'ku', // Sorani often RTL; Kurmanji may be LTR — treat ku as RTL for UI safety when script is Arabic
  'ug',
  'arc',
  'azb',
]);

/** @type {{ code: string, nativeName: string, englishName: string, search: string }[]} */
export const LANGUAGES = [
  { code: 'af', nativeName: 'Afrikaans', englishName: 'Afrikaans' },
  { code: 'sq', nativeName: 'Shqip', englishName: 'Albanian' },
  { code: 'am', nativeName: 'አማርኛ', englishName: 'Amharic' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic' },
  { code: 'hy', nativeName: 'Հայերեն', englishName: 'Armenian' },
  { code: 'az', nativeName: 'Azərbaycan', englishName: 'Azerbaijani' },
  { code: 'eu', nativeName: 'Euskara', englishName: 'Basque' },
  { code: 'be', nativeName: 'Беларуская', englishName: 'Belarusian' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali' },
  { code: 'bs', nativeName: 'Bosanski', englishName: 'Bosnian' },
  { code: 'bg', nativeName: 'Български', englishName: 'Bulgarian' },
  { code: 'my', nativeName: 'မြန်မာ', englishName: 'Burmese' },
  { code: 'ca', nativeName: 'Català', englishName: 'Catalan' },
  { code: 'zh', nativeName: '中文', englishName: 'Chinese' },
  { code: 'zh-TW', nativeName: '中文（繁體）', englishName: 'Chinese (Traditional)' },
  { code: 'hr', nativeName: 'Hrvatski', englishName: 'Croatian' },
  { code: 'cs', nativeName: 'Čeština', englishName: 'Czech' },
  { code: 'da', nativeName: 'Dansk', englishName: 'Danish' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch' },
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'et', nativeName: 'Eesti', englishName: 'Estonian' },
  { code: 'fi', nativeName: 'Suomi', englishName: 'Finnish' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'gl', nativeName: 'Galego', englishName: 'Galician' },
  { code: 'ka', nativeName: 'ქართული', englishName: 'Georgian' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'el', nativeName: 'Ελληνικά', englishName: 'Greek' },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati' },
  { code: 'he', nativeName: 'עברית', englishName: 'Hebrew' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'hu', nativeName: 'Magyar', englishName: 'Hungarian' },
  { code: 'is', nativeName: 'Íslenska', englishName: 'Icelandic' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { code: 'ga', nativeName: 'Gaeilge', englishName: 'Irish' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { code: 'kk', nativeName: 'Қазақ', englishName: 'Kazakh' },
  { code: 'km', nativeName: 'ខ្មែរ', englishName: 'Khmer' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean' },
  { code: 'ku', nativeName: 'Kurdî', englishName: 'Kurdish' },
  { code: 'ky', nativeName: 'Кыргызча', englishName: 'Kyrgyz' },
  { code: 'lo', nativeName: 'ລາວ', englishName: 'Lao' },
  { code: 'lv', nativeName: 'Latviešu', englishName: 'Latvian' },
  { code: 'lt', nativeName: 'Lietuvių', englishName: 'Lithuanian' },
  { code: 'mk', nativeName: 'Македонски', englishName: 'Macedonian' },
  { code: 'ms', nativeName: 'Bahasa Melayu', englishName: 'Malay' },
  { code: 'ml', nativeName: 'മലയാളം', englishName: 'Malayalam' },
  { code: 'mt', nativeName: 'Malti', englishName: 'Maltese' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi' },
  { code: 'mn', nativeName: 'Монгол', englishName: 'Mongolian' },
  { code: 'ne', nativeName: 'नेपाली', englishName: 'Nepali' },
  { code: 'no', nativeName: 'Norsk', englishName: 'Norwegian' },
  { code: 'fa', nativeName: 'فارسی', englishName: 'Persian' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)' },
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi' },
  { code: 'ro', nativeName: 'Română', englishName: 'Romanian' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'sr', nativeName: 'Српски', englishName: 'Serbian' },
  { code: 'si', nativeName: 'සිංහල', englishName: 'Sinhala' },
  { code: 'sk', nativeName: 'Slovenčina', englishName: 'Slovak' },
  { code: 'sl', nativeName: 'Slovenščina', englishName: 'Slovenian' },
  { code: 'so', nativeName: 'Soomaali', englishName: 'Somali' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'sw', nativeName: 'Kiswahili', englishName: 'Swahili' },
  { code: 'sv', nativeName: 'Svenska', englishName: 'Swedish' },
  { code: 'tl', nativeName: 'Tagalog', englishName: 'Tagalog' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu' },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian' },
  { code: 'ur', nativeName: 'اردو', englishName: 'Urdu' },
  { code: 'uz', nativeName: 'Oʻzbek', englishName: 'Uzbek' },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese' },
  { code: 'cy', nativeName: 'Cymraeg', englishName: 'Welsh' },
  { code: 'yo', nativeName: 'Yorùbá', englishName: 'Yoruba' },
  { code: 'zu', nativeName: 'isiZulu', englishName: 'Zulu' },
].map((l) => ({
  ...l,
  search: `${l.nativeName} ${l.englishName} ${l.code}`.toLowerCase(),
}));

export const LANGUAGE_BY_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));

export const SUPPORTED_CODES = new Set(LANGUAGES.map((l) => l.code));

export function isRtlLang(code) {
  if (!code) return false;
  const base = String(code).toLowerCase().split('-')[0];
  return RTL_LANGS.has(base) || RTL_LANGS.has(String(code));
}

export function normalizeLangCode(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/_/g, '-');
  if (!trimmed) return null;
  // Exact match (e.g. zh-TW, pt-BR)
  if (SUPPORTED_CODES.has(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const code of SUPPORTED_CODES) {
    if (code.toLowerCase() === lower) return code;
  }
  const base = lower.split('-')[0];
  // zh-CN / zh-Hans → zh ; zh-HK / zh-Hant → zh-TW
  if (base === 'zh') {
    if (/hant|tw|hk|mo/.test(lower)) return 'zh-TW';
    return 'zh';
  }
  if (base === 'pt') {
    if (/br|pt-br/.test(lower) || lower === 'pt-br') return 'pt-BR';
    return 'pt';
  }
  if (SUPPORTED_CODES.has(base)) return base;
  // Match case-insensitive base
  for (const code of SUPPORTED_CODES) {
    if (code.toLowerCase() === base) return code;
  }
  return null;
}

/**
 * Resolve UI language from browser preferences (device language only).
 * Priority: navigator.languages → navigator.language → null
 */
export function detectDeviceLanguage() {
  try {
    const list = [];
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages)) list.push(...navigator.languages);
      if (navigator.language) list.push(navigator.language);
      if (navigator.userLanguage) list.push(navigator.userLanguage);
    }
    for (const tag of list) {
      const n = normalizeLangCode(tag);
      if (n) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const STORAGE_LANG = 'aqar_lang';
export const STORAGE_LANG_MANUAL = 'aqar_lang_manual';
export const FALLBACK_LANG = 'en';

/**
 * Initial language:
 * 1) saved manual (or legacy saved) preference
 * 2) device language
 * 3) English
 */
export function resolveInitialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_LANG);
    const manual = localStorage.getItem(STORAGE_LANG_MANUAL);
    const savedNorm = normalizeLangCode(saved);
    // Explicit user choice always wins
    if (manual === '1' && savedNorm) return savedNorm;
    // Legacy: previous sessions stored aqar_lang without the manual flag — keep it
    if (manual !== '0' && savedNorm && manual === null) return savedNorm;
    // First visit or manual cleared → device
    const device = detectDeviceLanguage();
    if (device) return device;
    if (savedNorm) return savedNorm;
  } catch {
    /* ignore */
  }
  return FALLBACK_LANG;
}

export function getLanguageMeta(code) {
  const n = normalizeLangCode(code) || FALLBACK_LANG;
  return LANGUAGE_BY_CODE[n] || LANGUAGE_BY_CODE.en;
}

export function filterLanguages(query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  // Always present the list sorted alphabetically by English name (A→Z),
  // stable and predictable regardless of the source array order.
  const sorted = [...LANGUAGES].sort((a, b) =>
    String(a.englishName).localeCompare(String(b.englishName), 'en'),
  );
  if (!q) return sorted;
  return sorted.filter((l) => l.search.includes(q) || l.nativeName.includes(query.trim()));
}
