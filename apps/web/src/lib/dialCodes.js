// Calling (dial) codes keyed by ISO country code.
// Used by the property form's split phone field.
export const dialCodes = {
  AF: '+93', AL: '+355', DZ: '+213', AD: '+376', AO: '+244', AR: '+54',
  AM: '+374', AU: '+61', AT: '+43', AZ: '+994', BH: '+973', BD: '+880',
  BB: '+1246', BY: '+375', BE: '+32', BZ: '+501', BJ: '+229', BT: '+975',
  BO: '+591', BA: '+387', BW: '+267', BR: '+55', BN: '+673', BG: '+359',
  BF: '+226', BI: '+257', KH: '+855', CM: '+237', CA: '+1', CV: '+238',
  CF: '+236', TD: '+235', CL: '+56', CN: '+86', CO: '+57', KM: '+269',
  CG: '+242', CD: '+243', CR: '+506', CI: '+225', HR: '+385', CU: '+53',
  CY: '+357', CZ: '+420', DK: '+45', DJ: '+253', DO: '+1809', EC: '+593',
  EG: '+20', SV: '+503', GQ: '+240', ER: '+291', EE: '+372', SZ: '+268',
  ET: '+251', FJ: '+679', FI: '+358', FR: '+33', GA: '+241', GM: '+220',
  GE: '+995', DE: '+49', GH: '+233', GR: '+30', GD: '+1473', GT: '+502',
  GN: '+224', GW: '+245', GY: '+592', HT: '+509', HN: '+504', HK: '+852',
  HU: '+36', IS: '+354', IN: '+91', ID: '+62', IR: '+98', IQ: '+964',
  IE: '+353', IL: '+972', IT: '+39', JM: '+1876', JP: '+81', JO: '+962',
  KZ: '+7', KE: '+254', KI: '+686', KP: '+850', KR: '+82', KW: '+965',
  KG: '+996', LA: '+856', LV: '+371', LB: '+961', LS: '+266', LR: '+231',
  LY: '+218', LI: '+423', LT: '+370', LU: '+352', MO: '+853', MG: '+261',
  MW: '+265', MY: '+60', MV: '+960', ML: '+223', MT: '+356', MR: '+222',
  MU: '+230', MX: '+52', MD: '+373', MC: '+377', MN: '+976', ME: '+382',
  MA: '+212', MZ: '+258', MM: '+95', NA: '+264', NP: '+977', NL: '+31',
  NZ: '+64', NI: '+505', NE: '+227', NG: '+234', MK: '+389', NO: '+47',
  OM: '+968', PK: '+92', PS: '+970', PA: '+507', PG: '+675', PY: '+595',
  PE: '+51', PH: '+63', PL: '+48', PT: '+351', QA: '+974', RO: '+40',
  RU: '+7', RW: '+250', SA: '+966', SN: '+221', RS: '+381', SC: '+248',
  SL: '+232', SG: '+65', SK: '+421', SI: '+386', SO: '+252', ZA: '+27',
  SS: '+211', ES: '+34', LK: '+94', SD: '+249', SR: '+597', SE: '+46',
  CH: '+41', SY: '+963', TW: '+886', TJ: '+992', TZ: '+255', TH: '+66',
  TL: '+670', TG: '+228', TT: '+1868', TN: '+216', TR: '+90', TM: '+993',
  UG: '+256', UA: '+380', AE: '+971', GB: '+44', US: '+1', UY: '+598',
  UZ: '+998', VU: '+678', VA: '+379', VE: '+58', VN: '+84', YE: '+967',
  ZM: '+260', ZW: '+263',
};

// Normalise a typed country code to a clean "+xxx" form: keep digits only,
// then ensure a single leading "+". So "+971", "971", "++971" and "+ 971"
// all become "+971". This guarantees the country-code field can never hold
// part of the local number or stray characters.
export const normalizeDial = (raw) => {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return `+${digits}`;
};

// Build the stored phone string: +[cc]-[number]
export const buildPhone = (cc, num) => {
  const c = normalizeDial(cc);
  const n = String(num || '').trim();
  if (!c && !n) return '';
  return [c, n].filter(Boolean).join('-');
};

// Reverse lookup: dial digits (no "+") → first ISO code that uses them.
const DIAL_TO_ISO = (() => {
  const map = {};
  Object.entries(dialCodes).forEach(([iso, d]) => {
    const key = d.replace(/^\+/, '');
    if (!map[key]) map[key] = iso;
  });
  return map;
})();

// All known dial digits, longest first, so prefix matching prefers the most
// specific code (e.g. +1246 Barbados before +1 US/Canada).
const DIAL_DIGITS_SORTED = (() =>
  [...new Set(Object.values(dialCodes).map((d) => d.replace(/^\+/, '')))].sort(
    (a, b) => b.length - a.length,
  ))();

// True when a normalized "+xxx" code exists in the international dial table.
export const isValidDial = (code) => {
  const digits = String(code || '').replace(/^\+/, '').replace(/\D/g, '');
  return !!DIAL_TO_ISO[digits];
};

// Return the first ISO code that uses the given dial code, or ''.
export const isoForDial = (code) => {
  const digits = String(code || '').replace(/^\+/, '').replace(/\D/g, '');
  return DIAL_TO_ISO[digits] || '';
};

// Parse a stored phone value into { cc, num }. Handles BOTH the frontend
// "+cc-number" (dashed) format and the backend unified "+ccnumber" form.
//
// CRITICAL: the country code is ONLY extracted when the value starts with
// "+". A bare local number (no "+") is returned whole as `num` with an
// empty `cc` — we never guess a code, so part of the local number can never
// leak into the country-code field (the "+5022913" bug).
export const parsePhone = (raw) => {
  if (!raw) return { cc: '', num: '' };
  const s = String(raw).trim();
  if (!s) return { cc: '', num: '' };

  // Dash-separated: "+cc-number" (frontend emit format).
  if (s.includes('-')) {
    const parts = s.replace(/^\+/, '').split('-');
    if (parts.length >= 2) {
      const cc = normalizeDial(parts[0]);
      const num = parts.slice(1).join('').replace(/\D/g, '');
      return { cc, num };
    }
  }

  // Unified backend form: "+ccnumber". Only split when "+" is present so a
  // local number is never misread as code + leftover.
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    if (!digits) return { cc: '', num: '' };
    for (const code of DIAL_DIGITS_SORTED) {
      if (digits.startsWith(code)) {
        return { cc: `+${code}`, num: digits.slice(code.length) };
      }
    }
    // "+" present but no known dial prefix matched — keep digits as local,
    // leave the country code empty rather than guess.
    return { cc: '', num: digits };
  }

  // No "+" prefix → treat the whole thing as a local number, no code guess.
  return { cc: '', num: s.replace(/\D/g, '') };
};
