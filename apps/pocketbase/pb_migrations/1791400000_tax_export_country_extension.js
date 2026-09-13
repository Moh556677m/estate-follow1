/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #14: "Tax / Country Accounting
// Center". Per Mohamed's explicit confirmation, this EXTENDS the existing
// "Tax & Accounting Export" feature (tax_accounting_export, from Task #18)
// rather than creating a separate feature — no new feature_entitlements
// row, no new collection. Only the description text is updated here to
// reflect the new per-country breakdown (see task18-features.pb.js's new
// GET /ef/features/tax-summary route and the extended tax-export CSV).
// `enabled`/pricing/plan fields are left untouched so an Admin's existing
// configuration for this feature is preserved exactly.

migrate(
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'tax_accounting_export'");
      if (rec) {
        rec.set(
          "description",
          "Real income/expense export for a chosen year, as CSV, with a per-country accounting breakdown (income, expenses, net) for owners with properties in more than one country.",
        );
        rec.set(
          "description_ar",
          "تصدير حقيقي للدخل والمصاريف لسنة محددة كملف CSV، مع تفصيل محاسبي حسب الدولة (دخل، مصاريف، صافي) للملاك الذين لديهم عقارات في أكثر من دولة.",
        );
        app.save(rec);
      }
    } catch (_) {}
  },
  (_app) => {
    // Intentional no-op: reverting free-text descriptions is not worth the
    // risk of clobbering an Admin's own edits made after this migration ran.
  },
);
