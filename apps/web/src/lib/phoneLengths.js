// Expected number of digits AFTER the stored dial code, keyed by ISO country
// code. Values are [min, max] inclusive. Based on ITU-T E.164 national
// significant number lengths; for NANP entries whose dial code already
// includes the area code (e.g. +1246, +1809), the count is the subscriber
// digits that follow that prefix.
//
// Used by PhoneField to validate the local number length per country and to
// cap input at the maximum allowed digits.
export const phoneLengths = {
  AF: [9, 9], AL: [9, 9], DZ: [9, 9], AD: [6, 6], AO: [9, 9], AR: [10, 11],
  AM: [8, 8], AU: [9, 9], AT: [4, 13], AZ: [9, 9], BH: [8, 8], BD: [10, 10],
  BB: [7, 7], BY: [9, 9], BE: [9, 9], BZ: [7, 7], BJ: [8, 8], BT: [8, 8],
  BO: [8, 8], BA: [8, 8], BW: [8, 8], BR: [10, 11], BN: [7, 7], BG: [9, 9],
  BF: [8, 8], BI: [8, 8], KH: [9, 9], CM: [9, 9], CA: [10, 10], CV: [7, 7],
  CF: [8, 8], TD: [8, 8], CL: [9, 9], CN: [11, 11], CO: [10, 10], KM: [7, 7],
  CG: [9, 9], CD: [9, 9], CR: [8, 8], CI: [10, 10], HR: [9, 9], CU: [8, 8],
  CY: [8, 8], CZ: [9, 9], DK: [8, 8], DJ: [8, 8], DO: [7, 7], EC: [9, 9],
  EG: [10, 10], SV: [8, 8], GQ: [9, 9], ER: [7, 7], EE: [8, 8], SZ: [8, 8],
  ET: [9, 9], FJ: [7, 7], FI: [6, 10], FR: [9, 9], GA: [8, 8], GM: [7, 7],
  GE: [9, 9], DE: [4, 11], GH: [7, 9], GR: [10, 10], GD: [7, 7], GT: [8, 8],
  GN: [9, 9], GW: [7, 7], GY: [7, 7], HT: [8, 8], HN: [8, 8], HK: [8, 8],
  HU: [9, 9], IS: [7, 7], IN: [10, 10], ID: [9, 12], IR: [10, 10], IQ: [10, 10],
  IE: [9, 9], IL: [9, 9], IT: [9, 10], JM: [7, 7], JP: [10, 10], JO: [9, 9],
  KZ: [10, 10], KE: [9, 9], KI: [5, 5], KP: [8, 10], KR: [9, 10], KW: [8, 8],
  KG: [9, 9], LA: [8, 11], LV: [8, 8], LB: [7, 8], LS: [8, 8], LR: [7, 9],
  LY: [9, 9], LI: [7, 7], LT: [8, 8], LU: [4, 8], MO: [8, 8], MG: [9, 9],
  MW: [9, 9], MY: [9, 10], MV: [7, 7], ML: [8, 8], MT: [8, 8], MR: [8, 8],
  MU: [8, 8], MX: [10, 10], MD: [8, 8], MC: [6, 8], MN: [8, 8], ME: [8, 8],
  MA: [9, 9], MZ: [9, 9], MM: [8, 9], NA: [8, 9], NP: [10, 10], NL: [9, 9],
  NZ: [8, 10], NI: [8, 8], NE: [8, 8], NG: [10, 10], MK: [8, 8], NO: [8, 8],
  OM: [8, 8], PK: [10, 10], PS: [9, 9], PA: [8, 8], PG: [8, 8], PY: [9, 9],
  PE: [9, 9], PH: [10, 10], PL: [9, 9], PT: [9, 9], QA: [8, 8], RO: [9, 9],
  RU: [10, 10], RW: [9, 9], SA: [9, 9], SN: [9, 9], RS: [8, 9], SC: [7, 7],
  SL: [8, 8], SG: [8, 8], SK: [9, 9], SI: [8, 8], SO: [7, 8], ZA: [9, 9],
  SS: [9, 9], ES: [9, 9], LK: [9, 10], SD: [9, 9], SR: [6, 7], SE: [7, 10],
  CH: [9, 9], SY: [9, 9], TW: [9, 9], TJ: [9, 9], TZ: [9, 9], TH: [9, 9],
  TL: [7, 8], TG: [8, 8], TT: [7, 7], TN: [8, 8], TR: [10, 10], TM: [8, 8],
  UG: [9, 9], UA: [9, 9], AE: [9, 9], GB: [10, 10], US: [10, 10], UY: [8, 8],
  UZ: [9, 9], VU: [7, 7], VA: [6, 10], VE: [10, 10], VN: [9, 10], YE: [9, 9],
  ZM: [9, 9], ZW: [9, 9],
};

// Return [min, max] for an ISO code, or null when unknown (no strict check).
export const getLengthRange = (isoCode) => phoneLengths[isoCode] || null;

// Count only the digits in a string.
export const countDigits = (s) => (String(s || '').match(/\d/g) || []).length;

// Strip a single leading 0 from the local number (common trunk prefix in
// many countries, e.g. Egypt 010..., UAE 050...). Keeps the rest intact.
export const stripLeadingZero = (num) => {
  const s = String(num || '').trim();
  if (s.startsWith('0')) return s.slice(1);
  return s;
};

// Validate the local number for a given ISO country code.
// Returns one of: 'empty' | 'incomplete' | 'too_long' | 'valid' | 'unknown'
//   - 'empty':     no digits entered yet
//   - 'incomplete': fewer digits than the minimum
//   - 'too_long':  more digits than the maximum
//   - 'valid':     within the allowed range
//   - 'unknown':   country has no defined length rule (accept as-is)
export const validateLocalNumber = (isoCode, num) => {
  const digits = countDigits(num);
  if (digits === 0) return 'empty';
  const range = getLengthRange(isoCode);
  if (!range) return 'unknown';
  const [min, max] = range;
  if (digits < min) return 'incomplete';
  if (digits > max) return 'too_long';
  return 'valid';
};
