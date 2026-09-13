/// <reference path="../pb_data/types.d.ts" />

// Feature Management batch — feature #12: Owner Marketplace. Per Mohamed's
// explicit clarification (no original spec survived for this one): a
// peer-to-peer buy/sell/rent marketplace BETWEEN owners on the platform —
// not a broker directory (the codebase's existing brokers/brokerage_
// companies collections were deliberately phased out of the owner-facing
// product, see 1774934500_remove_broker_company_accounts.js and
// 1788878000_remove_brokerage_from_brand_content.js — reviving them here
// would contradict that decision).
//
// ONE new collection (`marketplace_listings`) — genuinely new data (an
// owner explicitly offering one of THEIR OWN properties to other owners).
// It reuses the existing `properties` record for all property details
// (building/unit/country/usage type) instead of duplicating them — only
// listing-specific fields live here.
//
// Unlike every other feature in this batch, listings are meant to be READ
// by owners OTHER than the one who created them — that is the entire
// point of a marketplace. See task-marketplace-hooks.pb.js for how reads
// are still fail-closed while the feature is disabled.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const properties = app.findCollectionByNameOrId("properties");

    let listings;
    try {
      listings = app.findCollectionByNameOrId("marketplace_listings");
    } catch (_) {
      listings = new Collection({
        type: "base",
        name: "marketplace_listings",
        listRule: "@request.auth.id != '' && (status = 'active' || owner = @request.auth.id || @request.auth.is_super_admin = true)",
        viewRule: "@request.auth.id != '' && (status = 'active' || owner = @request.auth.id || @request.auth.is_super_admin = true)",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        deleteRule: "@request.auth.id = owner || @request.auth.is_super_admin = true",
        fields: [
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "property", type: "relation", required: true, maxSelect: 1, collectionId: properties.id },
          {
            name: "listing_type",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["for_sale", "for_rent"],
          },
          { name: "asking_price", type: "number", required: true, min: 0 },
          { name: "currency", type: "text", max: 10 },
          { name: "notes", type: "text", max: 2000 },
          { name: "contact_name", type: "text", max: 200 },
          { name: "contact_phone", type: "text", max: 50 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["active", "paused", "sold", "rented", "removed"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_marketplace_listings_owner ON marketplace_listings (owner)",
          "CREATE INDEX idx_marketplace_listings_status ON marketplace_listings (status)",
        ],
      });
      app.save(listings);
    }

    const features = app.findCollectionByNameOrId("feature_entitlements");
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'owner_marketplace'");
    } catch (_) {}
    if (!existing) {
      const rec = new Record(features);
      rec.set("feature_key", "owner_marketplace");
      rec.set("name", "Owner Marketplace");
      rec.set("name_ar", "سوق الملاك");
      rec.set("enabled", false);
      rec.set("visible", true);
      rec.set("route", "/dashboard/marketplace");
      rec.set("icon", "Store");
      rec.set("sort_order", 55);
      rec.set("description", "A peer-to-peer marketplace where owners can list their own properties for sale or rent to other owners on the platform, and browse listings from others.");
      rec.set("description_ar", "سوق بين الملاك يتيح لكل مالك عرض عقاراته للبيع أو الإيجار لملاك آخرين على المنصة، وتصفح إعلانات الآخرين.");
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
      const rec = app.findFirstRecordByFilter("feature_entitlements", "feature_key = 'owner_marketplace'");
      if (rec) app.delete(rec);
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("marketplace_listings"));
    } catch (_) {}
  },
);
