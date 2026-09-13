/**
 * Client-side natural-language extraction for section AI.
 * Complements the LLM: when the model answers in prose or misses fields,
 * we still map common AR/EN phrases into section field objects.
 */
import { normalizeMoneyValue, parseNaturalMoney } from '@/lib/money';

const CITY_COUNTRY_HINTS = [
  { re: /\b(دبي|dubai|أبوظبي|ابوظبي|abu\s*dhabi|الشارقة|sharjah|عجمان|ajman)\b/i, country: 'AE' },
  { re: /\b(القاهرة|cairo|الجيزة|giza|الإسكندرية|alexandr)/i, country: 'EG' },
  { re: /\b(الرياض|riyadh|جدة|jeddah|الدمام|dammam|مكة|mecca|المدينة\s*المنورة)\b/i, country: 'SA' },
  { re: /\b(الدوحة|doha)\b/i, country: 'QA' },
  { re: /\b(الكويت|kuwait\s*city)\b/i, country: 'KW' },
  { re: /\b(المنامة|manama)\b/i, country: 'BH' },
  { re: /\b(مسقط|muscat)\b/i, country: 'OM' },
  { re: /\b(عمّان|عمان\s*الأردن|amman)\b/i, country: 'JO' },
  { re: /\b(بيروت|beirut)\b/i, country: 'LB' },
  { re: /\b(بغداد|baghdad)\b/i, country: 'IQ' },
  { re: /\b(لندن|london)\b/i, country: 'GB' },
  { re: /\b(باريس|paris)\b/i, country: 'FR' },
  { re: /\b(برلين|berlin|ميونخ|munich)\b/i, country: 'DE' },
  { re: /\b(إسطنبول|اسطنبول|istanbul|أنقرة|ankara)\b/i, country: 'TR' },
  { re: /\b(تبليسي|tbilisi)\b/i, country: 'GE' },
];

const COUNTRY_NAME_HINTS = [
  { re: /\b(الإمارات|الامارات|UAE|United\s+Arab\s+Emirates)\b/i, code: 'AE' },
  { re: /\b(مصر|Egypt)\b/i, code: 'EG' },
  { re: /\b(السعودية|Saudi\s+Arabia|KSA)\b/i, code: 'SA' },
  { re: /\b(قطر|Qatar)\b/i, code: 'QA' },
  { re: /\b(الكويت|Kuwait)\b/i, code: 'KW' },
  { re: /\b(البحرين|Bahrain)\b/i, code: 'BH' },
  { re: /\b(عُمان|سلطنة\s*عمان|Oman)\b/i, code: 'OM' },
  { re: /\b(الأردن|الاردن|Jordan)\b/i, code: 'JO' },
  { re: /\b(لبنان|Lebanon)\b/i, code: 'LB' },
  { re: /\b(العراق|Iraq)\b/i, code: 'IQ' },
  { re: /\b(المغرب|Morocco)\b/i, code: 'MA' },
  { re: /\b(تونس|Tunisia)\b/i, code: 'TN' },
  { re: /\b(الجزائر|Algeria)\b/i, code: 'DZ' },
  { re: /\b(تركيا|Turkey|Türkiye)\b/i, code: 'TR' },
  { re: /\b(جورجيا|Georgia)\b/i, code: 'GE' },
  { re: /\b(ألمانيا|المانيا|Germany)\b/i, code: 'DE' },
  { re: /\b(بريطانيا|المملكة\s*المتحدة|United\s+Kingdom|UK)\b/i, code: 'GB' },
  { re: /\b(فرنسا|France)\b/i, code: 'FR' },
  { re: /\b(أمريكا|الولايات\s*المتحدة|United\s+States|USA)\b/i, code: 'US' },
];

function moneyNear(text, labelRes) {
  for (const re of labelRes) {
    const m = text.match(re);
    if (!m) continue;
    // Prefer capture group with amount phrase
    const phrase = (m[1] || m[0] || '').trim();
    const n = parseNaturalMoney(phrase);
    if (n) return n;
    // Try window after match
    const idx = m.index + m[0].length;
    const window = text.slice(Math.max(0, m.index), idx + 40);
    const n2 = parseNaturalMoney(window);
    if (n2) return n2;
  }
  return null;
}

function extractPropertyInfo(text) {
  const fields = {};
  const t = text;

  for (const h of COUNTRY_NAME_HINTS) {
    if (h.re.test(t)) {
      fields.country = h.code;
      break;
    }
  }
  if (!fields.country) {
    for (const h of CITY_COUNTRY_HINTS) {
      if (h.re.test(t)) {
        fields.country = h.country;
        break;
      }
    }
  }

  const city =
    t.match(
      /(?:مدينة|المنطقة|المنطقه|المنطقة\s*\/\s*المدينة|city|area|in)\s*[:\-]?\s*([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s]{1,40})/i,
    ) ||
    t.match(/\b(القاهرة|دبي|الرياض|جدة|أبوظبي|ابوظبي|الشارقة|الجيزة|الإسكندرية|الدوحة|الكويت|بيروت|عمّان|لندن|باريس|إسطنبول|اسطنبول|تبليسي|cairo|dubai|riyadh|jeddah|sharjah|giza|doha|london|paris|istanbul|tbilisi)\b/i);
  if (city) fields.area = String(city[1] || city[0]).trim();

  const building =
    t.match(
      /(?:برج|بناية|البناية|المبنى|المبني|tower|building|project)\s*[:\-]?\s*([A-Za-z0-9\u0600-\u06FF][A-Za-z0-9\u0600-\u06FF\s\-_.]{1,50})/i,
    ) || t.match(/\b((?:Marina|Nile|Burj|DAMAC|Emaar)\s+[A-Za-z0-9\s\-]+)/i);
  if (building) {
    fields.building = String(building[1] || building[0])
      .replace(/\s*(رقم|unit|#).*$/i, '')
      .trim();
  }

  const unit = t.match(
    /(?:رقم\s*الوحدة|رقم\s*الشقة|الوحدة|الشقة|unit(?:\s*number)?|apt\.?|apartment)\s*[:\-#]?\s*([A-Za-z0-9\-\/]+)/i,
  ) || t.match(/\b(?:unit|apt)\s*#?\s*([A-Za-z0-9\-\/]+)/i);
  if (unit) fields.unit_number = String(unit[1]).trim();

  const sizeM = t.match(
    /(?:مساحت(?:ها|ه)?|المساحة|size|area)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(م(?:²|2)?|متر(?:\s*مربع)?|sqm|m²|m2|قدم(?:\s*مربع)?|sqft|ft²|ft2)?/i,
  ) || t.match(/(\d+(?:[.,]\d+)?)\s*(م(?:²|2)|متر(?:\s*مربع)?|sqm|m²|m2|قدم|sqft|ft²|ft2)\b/i);
  if (sizeM) {
    fields.property_size = String(sizeM[1]).replace(',', '.');
    const u = (sizeM[2] || '').toLowerCase();
    if (/ft|قدم|sqft/.test(u)) fields.property_size_unit = 'sqft';
    else if (/m|متر|sqm/.test(u)) fields.property_size_unit = 'sqm';
    else if (/متر|م/.test(t) && !/قدم|ft/.test(t)) fields.property_size_unit = 'sqm';
  }

  const dev = t.match(
    /(?:المطور|الشركة|شركة|developer|company|by)\s*[:\-]?\s*([A-Za-z0-9\u0600-\u06FF][A-Za-z0-9\u0600-\u06FF\s.&]{1,40})/i,
  );
  if (dev) fields.developer = String(dev[1]).replace(/[.,;].*$/, '').trim();

  const pdate = t.match(
    /(?:تاريخ\s*الشراء|purchase\s*date)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  );
  if (pdate) fields.purchase_date = pdate[1];

  return fields;
}

function extractPurchaseDetails(text) {
  const fields = {};
  const price = moneyNear(text, [
    /(?:السعر\s*الإجمالي|السعر\s*الاجمالي|السعر|الثمن|price|total\s*price|purchase\s*price|العقار\s*ب|بـ)\s*[:\-]?\s*([^\n,.]{2,40})/i,
    /(?:سعر(?:ه|ها)?)\s*[:\-]?\s*([^\n,.]{2,40})/i,
    /(\d[\d.,]*\s*(?:ألف|الف|الاف|آلاف|مليون|k|m|million|thousand)?)/i,
  ]);
  if (price) fields.total_price = price;

  // If whole message is just a money phrase
  if (!fields.total_price) {
    const only = parseNaturalMoney(text);
    if (only && /سعر|price|ألف|مليون|k\b|m\b|\d/i.test(text)) {
      fields.total_price = only;
    }
  }

  const feeAmt = moneyNear(text, [
    /(?:رسوم\s*التسجيل|رسوم\s*الشراء|registration\s*fee|purchase\s*fee|fee)\s*[:\-]?\s*([^\n,.]{2,40})/i,
  ]);
  if (feeAmt) {
    const feeName = /تسجيل|registration/i.test(text)
      ? 'رسوم التسجيل'
      : 'رسوم الشراء';
    fields.purchase_fees = [{ name: feeName, amount: feeAmt, type: 'fixed' }];
  }

  if (/كاش|نقد|full\s*payment|cash\b|دفعة\s*واحدة|سداد\s*كامل/i.test(text)) {
    fields.payment_method = 'full';
  } else if (/بنك|bank\s*install|mortgage|تمويل\s*بنكي/i.test(text)) {
    fields.payment_method = 'bank_installments';
  } else if (/أقساط\s*مع\s*المطور|اقساط\s*مع\s*المطور|company\s*install|developer\s*plan|تقسيط\s*المطور/i.test(text)) {
    fields.payment_method = 'company_installments';
  } else if (/أقساط|اقساط|installment/i.test(text)) {
    fields.payment_method = 'company_installments';
  }

  const years = text.match(/(\d+)\s*(?:سنة|سنوات|year|years)/i);
  const months = text.match(/(\d+)\s*(?:شهر|أشهر|اشهر|month|months)/i);
  if (years) fields.payment_duration_years = years[1];
  if (months) fields.payment_duration_months = months[1];

  return fields;
}

function extractPaymentPlan(text) {
  const fields = {};
  const down = text.match(/(?:دفعة\s*أولى|دفعة\s*اولى|down\s*payment)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (down) fields.plan_down_pct = down[1];
  const cons = text.match(/(?:أثناء\s*الإنشاء|اثناء\s*الانشاء|construction)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (cons) fields.plan_construction_pct = cons[1];
  const hand = text.match(/(?:عند\s*الاستلام|handover)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (hand) fields.plan_handover_pct = hand[1];
  const post = text.match(/(?:بعد\s*الاستلام|post[-\s]?handover)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (post) fields.plan_post_pct = post[1];

  const years = text.match(
    /(?:بعد\s*الاستلام|post[-\s]?handover)[^\n]{0,40}?(\d+)\s*(?:سنة|سنوات|year|years)/i,
  );
  const months = text.match(
    /(?:بعد\s*الاستلام|post[-\s]?handover)[^\n]{0,40}?(\d+)\s*(?:شهر|أشهر|اشهر|month|months)/i,
  );
  if (years) fields.post_handover_years = years[1];
  if (months) fields.post_handover_months = months[1];

  // Named custom stages: "حجز 10%" / "Booking 10%"
  const stages = [];
  const stageRe =
    /([A-Za-z\u0600-\u06FF][A-Za-z0-9\u0600-\u06FF\s\-_/]{1,40}?)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/g;
  let sm;
  while ((sm = stageRe.exec(text)) !== null) {
    const name = String(sm[1]).trim();
    if (/^(down|construction|handover|post|نسبة|percent|%)/i.test(name)) continue;
    stages.push({ name, percentage: sm[2], due_date: '' });
  }
  if (stages.length >= 2) fields.custom_stages = stages;

  // Infer plan_type from which buckets exist (never invent missing %).
  const hasD = fields.plan_down_pct != null;
  const hasC = fields.plan_construction_pct != null;
  const hasH = fields.plan_handover_pct != null;
  const hasP = fields.plan_post_pct != null;
  if (hasP) fields.plan_type = 'type2';
  else if (hasD && hasH && !hasC) fields.plan_type = 'type4';
  else if (hasD && hasC && hasH) fields.plan_type = 'type1';
  else if (stages.length >= 2 && !(hasD || hasC || hasH)) fields.plan_type = 'type5';
  else if (hasD || hasC || hasH) fields.plan_type = 'type3';

  const price = moneyNear(text, [
    /(?:السعر|total|price)\s*[:\-]?\s*([^\n,.]{2,40})/i,
  ]);
  if (price) fields.total_price = price;

  return fields;
}

function extractHandover(text) {
  const fields = {};
  if (/تم\s*الاستلام|جاهز|handover\s*completed|ready|delivered/i.test(text)) {
    fields.handover_status = 'handover_completed';
  } else if (/تحت\s*الإنشاء|تحت\s*الانشاء|under\s*construction|off[-\s]?plan/i.test(text)) {
    fields.handover_status = 'under_construction';
  }
  const exp = text.match(
    /(?:الاستلام\s*المتوقع|expected\s*handover|handover\s*date)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  );
  if (exp) fields.expected_handover_date = exp[1];
  const act = text.match(
    /(?:الاستلام\s*الفعلي|actual\s*handover)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  );
  if (act) fields.actual_handover_date = act[1];
  return fields;
}

function extractServiceFees(text) {
  const fields = {};
  const amt = moneyNear(text, [
    /(?:رسوم\s*(?:الصيانة|الخدمات)|service\s*charge|maintenance)\s*[:\-]?\s*([^\n,.]{2,40})/i,
    /(\d[\d.,]*\s*(?:ألف|الف|الاف|k|m)?)/i,
  ]);
  if (amt) fields.service_charge_amount = amt;
  if (/سنوي|yearly|annual/i.test(text)) fields.service_charge_frequency = 'yearly';
  else if (/شهري|monthly/i.test(text)) fields.service_charge_frequency = 'monthly';
  else if (/ربع|quarterly/i.test(text)) fields.service_charge_frequency = 'quarterly';
  else if (/مرة\s*واحدة|one[-\s]?time/i.test(text)) fields.service_charge_frequency = 'one_time';
  if (/مدفوع|paid/i.test(text) && !/غير\s*مدفوع|unpaid/i.test(text)) {
    fields.service_charge_paid_status = 'paid';
  } else if (/غير\s*مدفوع|unpaid/i.test(text)) {
    fields.service_charge_paid_status = 'unpaid';
  }
  return fields;
}

function extractAlerts(text) {
  const fields = {};
  if (/تفعيل|enable|شغّل|شغل/i.test(text)) fields.alerts_enabled = true;
  if (/إيقاف|disable|عطّل|عطل/i.test(text)) fields.alerts_enabled = false;
  const days = [];
  const dayMatches = text.matchAll(/(\d+)\s*(?:يوم|أيام|days?)/gi);
  for (const m of dayMatches) {
    const n = Number(m[1]);
    if ([0, 1, 3, 7, 14, 30].includes(n)) days.push(n);
  }
  if (days.length) fields.alerts_reminders = [...new Set(days)].sort((a, b) => b - a);
  const d = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (d) fields.alerts_custom_date = d[1];
  return fields;
}

const EXTRACTORS = {
  property_info: extractPropertyInfo,
  purchase_details: extractPurchaseDetails,
  payment_plan: extractPaymentPlan,
  handover: extractHandover,
  service_fees: extractServiceFees,
  alerts: extractAlerts,
};

/** Normalize money-like keys on an extracted fields object. */
export function normalizeExtractedFields(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const out = { ...fields };
  const moneyKeys = [
    'total_price',
    'service_charge_amount',
    'rent_amount',
    'security_deposit',
    'down_payment',
    'amount',
  ];
  moneyKeys.forEach((k) => {
    if (out[k] != null && out[k] !== '') {
      const n = normalizeMoneyValue(out[k]);
      if (n) out[k] = n;
    }
  });
  if (Array.isArray(out.purchase_fees)) {
    out.purchase_fees = out.purchase_fees.map((f) => ({
      ...f,
      amount: f?.amount != null ? normalizeMoneyValue(f.amount) || String(f.amount) : '',
    }));
  }
  if (Array.isArray(out.installments)) {
    out.installments = out.installments.map((r) => ({
      ...r,
      amount: r?.amount != null ? normalizeMoneyValue(r.amount) || String(r.amount) : r?.amount,
    }));
  }
  if (Array.isArray(out.service_fee_rows)) {
    out.service_fee_rows = out.service_fee_rows.map((r) => ({
      ...r,
      amount: r?.amount != null ? normalizeMoneyValue(r.amount) || String(r.amount) : r?.amount,
    }));
  }
  return out;
}

export function localExtractSection(section, userText) {
  const fn = EXTRACTORS[section];
  if (!fn || !userText || !String(userText).trim()) return {};
  try {
    return normalizeExtractedFields(fn(String(userText)));
  } catch {
    return {};
  }
}

export function mergeFields(primary, secondary) {
  const a = primary && typeof primary === 'object' ? { ...primary } : {};
  const b = secondary && typeof secondary === 'object' ? secondary : {};
  Object.entries(b).forEach(([k, v]) => {
    if (v == null || v === '') return;
    if (Array.isArray(v) && v.length === 0) return;
    if (a[k] == null || a[k] === '' || (Array.isArray(a[k]) && a[k].length === 0)) {
      a[k] = v;
    }
  });
  return normalizeExtractedFields(a);
}

export default {
  localExtractSection,
  normalizeExtractedFields,
  mergeFields,
};
