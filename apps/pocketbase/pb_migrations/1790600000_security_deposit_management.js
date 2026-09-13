/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #3: Security Deposit Management.
// Anti-duplication: `tenancies.security_deposit` already exists (the amount
// collected at lease signing) — this migration adds only the FOUR fields
// needed to track what happens to it afterwards (status/returned amount/
// return date/deduction notes) directly on the same row, instead of a new
// collection. Existing tenancies with a recorded deposit are backfilled to
// deposit_status='held' (the honest default — nothing has been returned
// yet) so the new feature has consistent data to show immediately once an
// Admin enables it; deposits of 0/empty are left untouched (not applicable).

migrate(
  (app) => {
    const tenancies = app.findCollectionByNameOrId("tenancies");

    if (!tenancies.fields.getByName("deposit_status")) {
      tenancies.fields.add(new SelectField({
        name: "deposit_status",
        maxSelect: 1,
        values: ["held", "partially_returned", "returned", "forfeited"],
      }));
    }
    if (!tenancies.fields.getByName("deposit_returned_amount")) {
      tenancies.fields.add(new NumberField({ name: "deposit_returned_amount", min: 0 }));
    }
    if (!tenancies.fields.getByName("deposit_return_date")) {
      tenancies.fields.add(new DateField({ name: "deposit_return_date" }));
    }
    if (!tenancies.fields.getByName("deposit_deduction_notes")) {
      tenancies.fields.add(new TextField({ name: "deposit_deduction_notes", max: 1000 }));
    }
    app.save(tenancies);

    // Backfill: any tenancy with a real deposit amount and no status yet
    // starts at "held" (nothing returned/forfeited yet — the honest default).
    let rows = [];
    try {
      rows = app.findRecordsByFilter("tenancies", "security_deposit > 0", "", 5000, 0);
    } catch (_) {}
    rows.forEach((r) => {
      if (!r.get("deposit_status")) {
        r.set("deposit_status", "held");
        app.save(r);
      }
    });

    const features = app.findCollectionByNameOrId("feature_entitlements");
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'security_deposit_management'");
    } catch (_) {}
    if (!existing) {
      const rec = new Record(features);
      rec.set("feature_key", "security_deposit_management");
      rec.set("name", "Security Deposit Management");
      rec.set("name_ar", "إدارة التأمين (الوديعة)");
      rec.set("enabled", false);
      rec.set("visible", true);
      rec.set("route", "/dashboard/security-deposits");
      rec.set("icon", "Wallet");
      rec.set("sort_order", 47);
      rec.set("description", "Track every tenancy's security deposit — held, returned or forfeited — with return date and deduction notes.");
      rec.set("description_ar", "متابعة التأمين (الوديعة) لكل عقد إيجار — محتجز، مُسترد، أو مصادَر — مع تاريخ الاسترداد وملاحظات الخصومات.");
      rec.set("min_property_count", 0);
      rec.set("allowed_account_types", []);
      rec.set("allowed_plans", []);
      rec.set("limit_by_plan", {});
      rec.set("pricing_mode", "included");
      rec.set("price", 0);
      rec.set("discount_price", 0);
      rec.set("currency", "USD");
      rec.set("billing_period", "monthly");
      rec.set("custom_billing_days", 0);
      rec.set("grace_period_days", 0);
      app.save(rec);
    }
  },
  (app) => {
    try {
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'security_deposit_management'");
      if (rec) app.delete(rec);
    } catch (_) {}
    try {
      const tenancies = app.findCollectionByNameOrId("tenancies");
      ["deposit_status", "deposit_returned_amount", "deposit_return_date", "deposit_deduction_notes"].forEach((n) => {
        try { tenancies.fields.removeByName(n); } catch (_) {}
      });
      app.save(tenancies);
    } catch (_) {}
  },
);
