/**
 * Unified money formatting for Estate Follow.
 * Display uses Western digits + comma thousands separators (1,000 / 300,000).
 * Storage / form state stay numeric strings without commas.
 */

const MONEY_FIELD_HINT =
  /(?:^|_)(amount|price|fee|rent|deposit|cost|revenue|paid|balance|salary|income|expense|total_price|down_payment|security_deposit|service_charge)(?:$|_)/i;

/** Strip grouping chars and keep digits + optional single decimal. */
export function parseMoney(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  let s = String(value).trim();
  if (!s) return '';
  // Arabic-Indic digits → Western
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  s = s.replace(/,/g, '').replace(/\s/g, '').replace(/[^\d.-]/g, '');
  if (!s || s === '-' || s === '.' || s === '-.') return '';
  // Keep only first decimal point
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const parts = s.split('.');
  if (parts.length > 2) s = `${parts[0]}.${parts.slice(1).join('')}`;
  if (neg && s) s = `-${s}`;
  return s;
}

/** Numeric value for math / DB (NaN-safe). */
export function moneyNumber(value) {
  const raw = parseMoney(value);
  if (raw === '' || raw === '-') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format for display: 300000 → "300,000".
 * No forced decimals; only show fraction digits that exist on the value.
 */
export function formatMoneyDisplay(value, _lang) {
  if (value == null || value === '') return '—';
  const raw = parseMoney(value);
  if (raw === '' || raw === '-') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '—';
  const hasFraction = Math.abs(n % 1) > 1e-9;
  // Always en-US grouping so AR/EN both show 1,000 style commas + Western digits.
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: hasFraction ? 2 : 0,
    minimumFractionDigits: 0,
  }).format(n);
}

/**
 * Live input display while typing (empty stays empty, not "—").
 * Preserves trailing "." while user types decimals.
 */
export function formatMoneyTyping(value) {
  if (value == null || value === '') return '';
  const original = String(value);
  const stripped = original.replace(/,/g, '').replace(/\s/g, '');
  const trailingDot = /\.$/.test(stripped);
  const raw = parseMoney(value);
  if (raw === '' || raw === '-') return raw === '-' ? '-' : '';
  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  const [intPart, decPart] = body.split('.');
  const intFormatted = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let out = neg ? `-${intFormatted}` : intFormatted;
  if (decPart !== undefined) out += `.${decPart}`;
  else if (trailingDot) out += '.';
  return out;
}

export function isLikelyMoneyField(name) {
  return MONEY_FIELD_HINT.test(String(name || ''));
}

/**
 * Parse natural-language money phrases (AR/EN) into a plain numeric string.
 * Examples: "300 ألف" → "300000", "1.5m" → "1500000", "مليون ونص" → "1500000"
 */
export function parseNaturalMoney(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  let s = String(value).trim();
  if (!s) return '';

  // Arabic-Indic → Western
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  s = s.replace(/,/g, '').replace(/\u00a0/g, ' ');

  // Already plain number
  const plain = parseMoney(s);
  if (plain && /^-?\d+(\.\d+)?$/.test(plain) && !/[a-zA-Z\u0600-\u06FF]/.test(s.replace(/[\d.\s+-]/g, ''))) {
    // If original had only digits/separators, keep parseMoney result
    if (!/(ألف|الف|الاف|آلاف|مليون|ملايين|ألفان|الفين|ألفان|ألفَ|k\b|m\b|million|thousand|الف)/i.test(s)) {
      return plain;
    }
  }

  const lower = s.toLowerCase();

  // Normalize common Arabic fractions / connectors
  let text = lower
    .replace(/ونص\b|و\s*نصف\b|ونصف\b/g, ' and half')
    .replace(/\bنصف\b/g, '0.5')
    .replace(/\bربع\b/g, '0.25')
    .replace(/\bثلث\b/g, '0.33')
    .replace(/\bواحد\s*و\s*نصف\b/g, '1.5')
    .replace(/\bواحد\b/g, '1')
    .replace(/\bاثنين\b|\bاتنين\b|\bاثنان\b/g, '2')
    .replace(/\bثلاثة\b|\bثلاث\b/g, '3')
    .replace(/\bأربعة\b|\bاربعة\b|\bأربع\b/g, '4')
    .replace(/\bخمسة\b|\bخمس\b/g, '5')
    .replace(/\bستة\b|\bست\b/g, '6')
    .replace(/\bسبعة\b|\bسبع\b/g, '7')
    .replace(/\bثمانية\b|\bثمان\b/g, '8')
    .replace(/\bتسعة\b|\bتسع\b/g, '9')
    .replace(/\bعشرة\b|\bعشر\b/g, '10');

  // "مليون ونص" / "مليون ونصف" without leading number
  if (/(^|\s)(مليون|million)(\s+and\s+half|\s+و\s*نص|\s+ونص)?/i.test(text) && !/\d/.test(text.split(/مليون|million/i)[0] || '')) {
    if (/and half|نصف|ونص/i.test(text)) return '1500000';
    if (/^[\s]*مليون|^[\s]*million/i.test(text.trim())) {
      // bare million may still have more — fall through with 1 million base
      text = `1 ${text}`;
    }
  }

  // Extract patterns: N million + optional N thousand, N k, N m
  // Multipliers
  const mulWord = (word) => {
    if (/مليون|ملايين|million|\bm\b/i.test(word)) return 1_000_000;
    if (/ألف|الف|الاف|آلاف|thousand|\bk\b/i.test(word)) return 1_000;
    return 1;
  };

  // 1.5m / 450k / 1.2M
  const enShort = text.match(/(\d+(?:\.\d+)?)\s*([km])\b/i);
  if (enShort) {
    const n = Number(enShort[1]);
    const m = enShort[2].toLowerCase() === 'm' ? 1_000_000 : 1_000;
    if (Number.isFinite(n)) return String(Math.round(n * m * 100) / 100);
  }

  // "2 million and 250 thousand" / "2 مليون و250 ألف"
  let total = 0;
  let matched = false;
  const chunkRe =
    /(\d+(?:\.\d+)?)\s*(مليون|ملايين|million|ألف|الف|الاف|آلاف|thousand|k\b|m\b)/gi;
  let m;
  const used = new Set();
  while ((m = chunkRe.exec(text)) !== null) {
    matched = true;
    const n = Number(m[1]);
    const mult = mulWord(m[2]);
    if (Number.isFinite(n)) {
      total += n * mult;
      used.add(m.index);
    }
  }

  // "and half" after a million/thousand chunk → +0.5 * last multiplier
  if (matched && /and half/i.test(text)) {
    // If we already counted e.g. 1 million, add half million if "مليون ونص"
    if (/مليون|million/i.test(text) && total >= 1_000_000 && total % 1_000_000 === 0) {
      // "1 million and half" often parsed as only 1e6 — add 0.5e6
      if (!/(\d+(?:\.\d+)?)\s*(مليون|million)/i.test(text.replace(/and half/i, ''))) {
        /* keep */
      }
      // Check if half wasn't included via 1.5
      const onlyWholeMillion = total === 1_000_000 || (total % 1_000_000 === 0 && !/\d+\.\d+/.test(text));
      if (onlyWholeMillion && /مليون.*half|million.*half|مليون.*نص/i.test(text)) {
        total += 500_000;
      }
    }
  }

  // Special: "مليون ونص" → already handled; "300 الف" handled by chunkRe

  // Bare "ألف" with number before without unit already in chunkRe

  // Fallback: first number * inferred unit from remaining words
  if (!matched) {
    const numMatch = text.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
      const n = Number(numMatch[1]);
      if (Number.isFinite(n)) {
        if (/مليون|million/i.test(text)) {
          matched = true;
          total = n * 1_000_000;
          if (/and half|نصف|ونص/i.test(text)) total += 500_000;
        } else if (/ألف|الف|الاف|آلاف|thousand|\bk\b/i.test(text)) {
          matched = true;
          total = n * 1_000;
        } else {
          return parseMoney(String(n));
        }
      }
    }
  }

  if (!matched) {
    // Last resort: strip non-numeric
    return parseMoney(s);
  }

  // Clean float noise
  const rounded = Math.round(total * 100) / 100;
  if (!Number.isFinite(rounded)) return '';
  return String(rounded);
}

/** Coerce any money-like AI/form value to a storage-safe numeric string. */
export function normalizeMoneyValue(value) {
  if (value == null || value === '') return '';
  const natural = parseNaturalMoney(value);
  if (natural !== '' && natural !== '-') return natural;
  return parseMoney(value);
}

export default {
  parseMoney,
  moneyNumber,
  formatMoneyDisplay,
  formatMoneyTyping,
  isLikelyMoneyField,
  parseNaturalMoney,
  normalizeMoneyValue,
};
