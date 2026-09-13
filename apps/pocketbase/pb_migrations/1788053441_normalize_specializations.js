/// <reference path="../pb_data/types.d.ts" />

// Normalize existing specialization values (Arabic labels, English labels,
// variants) to canonical specialization IDs so Arabic and English are treated
// as the same specialization everywhere. Does NOT lose any existing profile
// data — only remaps the stored tokens to their canonical ID.
//
// Canonical IDs: resale, rental, off_plan, land_sales, building_sales
// (plus any CMS-defined specializations, matched by id / en / ar).

// Build an alias -> canonical-id map. Keys are lowercased, ASCII-folded,
// Arabic-diacritic-stripped tokens.
function buildAliasMap(cmsSpecs) {
  const map = {};

  // Canonical defaults.
  const defaults = [
    { id: 'resale', en: 'Resale', ar: 'إعادة بيع' },
    { id: 'rental', en: 'Rental', ar: 'تأجير' },
    { id: 'off_plan', en: 'Off-plan', ar: 'عقارات تحت الإنشاء' },
    { id: 'land_sales', en: 'Land Sales', ar: 'بيع الأراضي' },
    { id: 'building_sales', en: 'Building Sales', ar: 'بيع البنايات' },
  ];

  const fold = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u0652\u0670]/g, '') // Arabic diacritics
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const register = (id, en, ar) => {
    if (id) map[fold(id)] = id;
    if (en) map[fold(en)] = id;
    if (ar) map[fold(ar)] = id;
  };

  defaults.forEach((s) => register(s.id, s.en, s.ar));
  (cmsSpecs || []).forEach((s) => register(s.id, s.en || s.name_en, s.ar || s.name_ar));

  // Extra common aliases.
  map[fold('rent')] = 'rental';
  map[fold('تاجير')] = 'rental';
  map[fold('ايجار')] = 'rental';
  map[fold('إيجار')] = 'rental';
  map[fold('على الخارطة')] = 'off_plan';
  map[fold('على الخارطه')] = 'off_plan';
  map[fold('offplan')] = 'off_plan';
  map[fold('off plan')] = 'off_plan';
  map[fold('عقارات تحت الانشاء')] = 'off_plan';
  map[fold('under construction')] = 'off_plan';
  map[fold('إعادة بيع')] = 'resale';
  map[fold('اعادة بيع')] = 'resale';
  map[fold('resale properties')] = 'resale';
  map[fold('بيع الاراضي')] = 'land_sales';
  map[fold('بيع البنايات')] = 'building_sales';
  map[fold('land')] = 'land_sales';
  map[fold('buildings')] = 'building_sales';

  return { map, fold };
}

function parseSpecs(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.filter(Boolean);
    } catch (_) {}
    return raw
      .split(/[,،|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

migrate(
  (app) => {
    // Load CMS specializations from platform_settings (if present).
    let cmsSpecs = [];
    try {
      const rows = app.findRecordsByFilter('platform_settings', "id != ''");
      if (rows && rows.length) {
        const s = rows[0];
        const cms = s.get('cms');
        if (cms && typeof cms === 'object') {
          const sp = cms.specializations;
          if (Array.isArray(sp)) cmsSpecs = sp;
        }
      }
    } catch (_) {}

    const { map, fold } = buildAliasMap(cmsSpecs);

    const normalizeList = (values) => {
      const out = [];
      const seen = new Set();
      values.forEach((v) => {
        const id = map[fold(v)] || fold(v);
        if (id && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      });
      return out;
    };

    // brokers.specialization (text, CSV/JSON)
    try {
      const brokers = app.findRecordsByFilter('brokers', "id != ''");
      for (const b of brokers) {
        const raw = b.get('specialization');
        const parsed = parseSpecs(raw);
        const normalized = normalizeList(parsed);
        const next = JSON.stringify(normalized);
        // Only write when changed (avoid touching unchanged rows).
        if (next !== JSON.stringify(parsed)) {
          b.set('specialization', next);
          app.save(b);
        }
      }
    } catch (_) {}

    // brokerage_companies.specialization (text, CSV/JSON)
    try {
      const cos = app.findRecordsByFilter('brokerage_companies', "id != ''");
      for (const c of cos) {
        const raw = c.get('specialization');
        const parsed = parseSpecs(raw);
        const normalized = normalizeList(parsed);
        const next = JSON.stringify(normalized);
        if (next !== JSON.stringify(parsed)) {
          c.set('specialization', next);
          app.save(c);
        }
      }
    } catch (_) {}
  },
  (app) => {
    // One-way data normalization — rollback is manual (original tokens not stored).
  },
);
