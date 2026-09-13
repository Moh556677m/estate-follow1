/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #4: Claims Center. ONE new collection
// (`tenant_claims`) — a real, genuinely new record (a damage/unpaid-rent/
// deposit dispute claim against a tenant) that cannot be derived from any
// existing collection, unlike most of this batch. Same admin-control
// pattern as every other feature here (feature_entitlements row, disabled
// by default).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const properties = app.findCollectionByNameOrId("properties");
    const tenancies = app.findCollectionByNameOrId("tenancies");
    const tenants = app.findCollectionByNameOrId("tenants");

    let claims;
    try {
      claims = app.findCollectionByNameOrId("tenant_claims");
    } catch (_) {
      claims = new Collection({
        type: "base",
        name: "tenant_claims",
        listRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        viewRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        deleteRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        fields: [
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "property", type: "relation", maxSelect: 1, collectionId: properties.id },
          { name: "tenancy", type: "relation", maxSelect: 1, collectionId: tenancies.id },
          { name: "tenant", type: "relation", maxSelect: 1, collectionId: tenants.id },
          { name: "tenant_name", type: "text", max: 200 },
          {
            name: "claim_type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["damage", "unpaid_rent", "deposit_dispute", "other"],
          },
          { name: "amount", type: "number", required: true, min: 0 },
          { name: "description", type: "text", required: true, max: 2000 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["open", "under_review", "resolved", "rejected"],
          },
          { name: "resolution_notes", type: "text", max: 2000 },
          {
            name: "evidence",
            type: "file",
            maxSelect: 5,
            maxSize: 15 * 1024 * 1024,
            mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
            protected: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_tenant_claims_owner ON tenant_claims (owner)",
          "CREATE INDEX idx_tenant_claims_status ON tenant_claims (status)",
        ],
      });
      app.save(claims);
    }

    const features = app.findCollectionByNameOrId("feature_entitlements");
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'claims_center'");
    } catch (_) {}
    if (!existing) {
      const rec = new Record(features);
      rec.set("feature_key", "claims_center");
      rec.set("name", "Claims Center");
      rec.set("name_ar", "مركز المطالبات");
      rec.set("enabled", false);
      rec.set("visible", true);
      rec.set("route", "/dashboard/claims");
      rec.set("icon", "ShieldCheck");
      rec.set("sort_order", 48);
      rec.set("description", "Track damage, unpaid-rent and deposit-dispute claims against tenants, with status and resolution notes.");
      rec.set("description_ar", "متابعة مطالبات الأضرار والإيجار غير المسدد ونزاعات التأمين ضد المستأجرين، مع الحالة وملاحظات الحل.");
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
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'claims_center'");
      if (rec) app.delete(rec);
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("tenant_claims"));
    } catch (_) {}
  },
);
