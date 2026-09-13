/// <reference path="../pb_data/types.d.ts" />

// Real Plan / Entitlement system — replaces the old hardcoded 4-section
// `subscription_settings` singleton as the SOLE source of truth for plan
// configuration, and gives every user a real per-user Subscription record
// instead of just a handful of loose fields on `users`.
//
// Backward compatibility (deliberate, not an oversight):
//   - `users.subscription_package` / `trial_start` / `trial_end` /
//     `subscription_end` / `extra_properties_purchased` are NOT removed and
//     NOT stopped being written — Stripe activation (stripeActivation.js),
//     RevenuePanel.jsx, SpecialAccessPanel.jsx, subscriptionUtils.js and
//     SubscriptionPanel.jsx all read them today and must keep working
//     unmodified. The hooks now write BOTH the legacy `users` fields AND the
//     new `user_subscriptions` row in the same operation (see
//     subscription-enforcement.pb.js / trial-auto-assign.pb.js /
//     finalize-signup.pb.js, updated alongside this migration) — one
//     decision, two places kept in sync, never two competing sources of
//     truth for the same fact.
//   - The 3 original paid plan keys ('annual','premium','unlimited') are
//     preserved exactly so `apps/api/src/routes/payment-gateways.js` Stripe
//     checkout keeps validating and working unchanged. New admin-created
//     plans get NEW keys and become purchasable once payment-gateways.js is
//     updated to check `plans.active` instead of a hardcoded array (done in
//     the same change set).
//   - `plans` is the live config every enforcement check reads on every
//     request (never cached/duplicated), so an Admin edit to `property_limit`
//     etc. propagates to every current subscriber on that plan immediately —
//     no code change, no redeploy, matches requirement #2/#6.
//   - Trial LENGTH (trial_value/trial_unit) is only consumed at the moment a
//     NEW trial is computed (signup / login-repair) — an edit to a plan's
//     trial length never recomputes an already-running trial's `trial_end`
//     unless the Admin explicitly asks for that via the
//     `/ef/admin/plans/:id/apply-trial-change` route — matches requirement
//     #1/#7 (`apply_to_new_only` vs `apply_to_existing_subscribers`).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // ---- plans ----
    let plans;
    try {
      plans = app.findCollectionByNameOrId("plans");
    } catch (_) {
      plans = new Collection({
        type: "base",
        name: "plans",
        // Any logged-in user can read (they need to see plan prices/limits —
        // same rule the old subscription_settings singleton used).
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        // A migrated/original plan (is_system) can be edited and disabled,
        // but never deleted — mirrors the Integration Registry pattern.
        deleteRule: "@request.auth.is_super_admin = true && is_system = false",
        fields: [
          { name: "key", type: "text", required: true, max: 60 },
          { name: "name", type: "text", max: 200 },
          { name: "name_ar", type: "text", max: 200 },
          { name: "active", type: "bool" },
          { name: "is_system", type: "bool" },
          { name: "sort_order", type: "number" },
          { name: "price", type: "number", min: 0 },
          { name: "discount_price", type: "number", min: 0 },
          { name: "currency", type: "text", max: 10 },
          {
            name: "duration_value",
            type: "number",
            onlyInt: true,
            min: 0,
          },
          {
            name: "duration_unit",
            type: "select",
            maxSelect: 1,
            values: ["days", "weeks", "months", "years"],
          },
          { name: "trial_value", type: "number", onlyInt: true, min: 0 },
          {
            name: "trial_unit",
            type: "select",
            maxSelect: 1,
            values: ["days", "weeks", "months", "years"],
          },
          // -1 means unlimited on every *_limit field below.
          { name: "property_limit", type: "number", onlyInt: true },
          { name: "featured_property_limit", type: "number", onlyInt: true },
          { name: "document_limit", type: "number", onlyInt: true },
          { name: "ai_usage_limit", type: "number", onlyInt: true },
          { name: "extra_property_enabled", type: "bool" },
          {
            name: "extra_property_type",
            type: "select",
            maxSelect: 1,
            values: ["percent", "fixed"],
          },
          { name: "extra_property_value", type: "number", min: 0 },
          // Free-form bag for simple per-plan feature toggles that don't need
          // their own dedicated cross-plan config (see feature_entitlements
          // below for features like portfolio_manager that DO need one).
          { name: "features", type: "json", maxSize: 4000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_plans_key ON plans (key)"],
      });
      app.save(plans);
    }

    // ---- user_subscriptions ----
    let subs;
    try {
      subs = app.findCollectionByNameOrId("user_subscriptions");
    } catch (_) {
      subs = new Collection({
        type: "base",
        name: "user_subscriptions",
        listRule: "@request.auth.id != '' && (user = @request.auth.id || @request.auth.is_super_admin = true)",
        viewRule: "@request.auth.id != '' && (user = @request.auth.id || @request.auth.is_super_admin = true)",
        // Written by server-side hooks (which run with full privilege) — no
        // direct client create/update needed, but keep an explicit super
        // admin escape hatch for manual admin fixes.
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          {
            name: "user",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "plan",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: plans.id,
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["trial", "active", "expired", "cancelled", "none"],
          },
          { name: "trial_start", type: "date" },
          { name: "trial_end", type: "date" },
          { name: "subscription_start", type: "date" },
          { name: "subscription_end", type: "date" },
          { name: "auto_renew", type: "bool" },
          { name: "extra_properties_purchased", type: "number", onlyInt: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_user_subscriptions_user ON user_subscriptions (user)",
        ],
      });
      app.save(subs);
    }

    // ---- feature_entitlements ----
    // Global per-feature-key config (not per-plan) — the concrete first
    // consumer is `portfolio_manager` (see requirements 12-18), but the shape
    // is generic so any future gated feature (Estate AI usage, exports,
    // alerts...) can reuse the same row shape instead of a bespoke condition
    // hardcoded inside a page.
    let features;
    try {
      features = app.findCollectionByNameOrId("feature_entitlements");
    } catch (_) {
      features = new Collection({
        type: "base",
        name: "feature_entitlements",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "feature_key", type: "text", required: true, max: 60 },
          { name: "name", type: "text", max: 200 },
          { name: "name_ar", type: "text", max: 200 },
          { name: "enabled", type: "bool" },
          { name: "min_property_count", type: "number", onlyInt: true, min: 0 },
          // JSON array of account_type values ('owner'/'broker'/'company').
          // Empty array = all account types allowed.
          { name: "allowed_account_types", type: "json", maxSize: 2000 },
          // JSON array of plan `key`s. Empty array = all plans allowed.
          { name: "allowed_plans", type: "json", maxSize: 2000 },
          // JSON object { [plan_key]: number }. -1 = unlimited for that plan,
          // 0 = not included for that plan. A "default" key covers any plan
          // not explicitly listed.
          { name: "limit_by_plan", type: "json", maxSize: 4000 },
          {
            name: "pricing_mode",
            type: "select",
            maxSelect: 1,
            values: ["included", "free", "paid_addon"],
          },
          { name: "price", type: "number", min: 0 },
          { name: "discount_price", type: "number", min: 0 },
          { name: "currency", type: "text", max: 10 },
          {
            name: "billing_period",
            type: "select",
            maxSelect: 1,
            values: ["monthly", "quarterly", "semiannual", "annual", "custom"],
          },
          { name: "custom_billing_days", type: "number", onlyInt: true, min: 0 },
          { name: "grace_period_days", type: "number", onlyInt: true, min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_feature_entitlements_key ON feature_entitlements (feature_key)",
        ],
      });
      app.save(features);
    }

    // ---- Seed the 4 existing plans from current subscription_settings (if
    // any) so behavior is IDENTICAL on day one — this is a data-source swap,
    // not a policy change. ----
    let existingPlans = [];
    try {
      existingPlans = app.findRecordsByFilter("plans", "id != ''", "", 200, 0);
    } catch (_) {}
    if (!existingPlans || existingPlans.length === 0) {
      let s = null;
      try {
        const rows = app.findRecordsByFilter("subscription_settings", "id != ''", "", 1, 0);
        if (rows && rows.length > 0) s = rows[0];
      } catch (_) {}

      function num(v, fb) {
        const n = Number(v);
        return isFinite(n) ? n : fb;
      }
      function bool(v, fb) {
        if (v === true || v === false) return v;
        if (v === 0 || v === 1) return !!v;
        return fb;
      }

      const seedDefs = [
        {
          key: "trial",
          name: "Free Trial",
          name_ar: "الفترة التجريبية",
          active: s ? bool(s.get("trial_enabled"), true) : true,
          sort_order: 0,
          price: 0,
          discount_price: 0,
          trial_value: s ? Math.max(1, num(s.get("trial_days"), 10)) : 10,
          trial_unit: s ? (String(s.get("trial_unit") || "days") === "months" ? "months" : "days") : "days",
          duration_value: 0,
          duration_unit: "days",
          property_limit: s ? Math.max(1, num(s.get("trial_properties"), 3)) : 3,
        },
        {
          key: "annual",
          name: "Annual",
          name_ar: "سنوي",
          active: s ? bool(s.get("annual_enabled"), true) : true,
          sort_order: 1,
          price: s ? num(s.get("annual_price"), 100) : 100,
          discount_price: s ? num(s.get("annual_discount_amount"), 0) : 0,
          trial_value: 0,
          trial_unit: "days",
          duration_value: 1,
          duration_unit: "years",
          property_limit: s ? num(s.get("annual_free_properties"), 2) : 2,
          extra_property_enabled: s ? bool(s.get("annual_extra_enabled"), true) : true,
          extra_property_type: s ? String(s.get("annual_extra_type") || "percent") : "percent",
          extra_property_value: s ? num(s.get("annual_extra_value"), 10) : 10,
        },
        {
          key: "premium",
          name: "Premium",
          name_ar: "بريميوم",
          active: s ? bool(s.get("premium_enabled"), true) : true,
          sort_order: 2,
          price: s ? num(s.get("premium_price"), 200) : 200,
          discount_price: s ? num(s.get("premium_discount_amount"), 0) : 0,
          trial_value: 0,
          trial_unit: "days",
          duration_value: 1,
          duration_unit: "years",
          property_limit: s ? num(s.get("premium_properties"), 15) : 15,
        },
        {
          key: "unlimited",
          name: "Unlimited",
          name_ar: "غير محدود",
          active: s ? bool(s.get("unlimited_enabled"), true) : true,
          sort_order: 3,
          price: s ? num(s.get("unlimited_price"), 300) : 300,
          discount_price: s ? num(s.get("unlimited_discount_amount"), 0) : 0,
          trial_value: 0,
          trial_unit: "days",
          duration_value: 1,
          duration_unit: "years",
          property_limit: -1,
        },
      ];

      const currency = s ? String(s.get("currency") || "USD") : "USD";

      seedDefs.forEach((def) => {
        const rec = new Record(plans);
        rec.set("key", def.key);
        rec.set("name", def.name);
        rec.set("name_ar", def.name_ar);
        rec.set("active", !!def.active);
        rec.set("is_system", true);
        rec.set("sort_order", def.sort_order);
        rec.set("price", def.price);
        rec.set("discount_price", def.discount_price || 0);
        rec.set("currency", currency);
        rec.set("duration_value", def.duration_value);
        rec.set("duration_unit", def.duration_unit);
        rec.set("trial_value", def.trial_value);
        rec.set("trial_unit", def.trial_unit);
        rec.set("property_limit", def.property_limit);
        rec.set("featured_property_limit", -1);
        rec.set("document_limit", -1);
        rec.set("ai_usage_limit", -1);
        rec.set("extra_property_enabled", !!def.extra_property_enabled);
        rec.set("extra_property_type", def.extra_property_type || "percent");
        rec.set("extra_property_value", def.extra_property_value || 0);
        rec.set("features", {});
        app.save(rec);
      });
    }

    // ---- Seed the portfolio_manager feature entitlement (disabled by
    // default — a brand-new feature must never silently switch on for
    // everyone; the Admin explicitly turns it on and configures it). ----
    let existingFeatures = [];
    try {
      existingFeatures = app.findRecordsByFilter("feature_entitlements", "id != ''", "", 200, 0);
    } catch (_) {}
    const hasPortfolioManager = existingFeatures.some((r) => r.get("feature_key") === "portfolio_manager");
    if (!hasPortfolioManager) {
      const rec = new Record(features);
      rec.set("feature_key", "portfolio_manager");
      rec.set("name", "Portfolio Manager");
      rec.set("name_ar", "مدير محفظة");
      rec.set("enabled", false);
      rec.set("min_property_count", 5);
      rec.set("allowed_account_types", []);
      rec.set("allowed_plans", []);
      rec.set("limit_by_plan", { trial: 0, annual: 0, premium: 1, unlimited: -1, default: 0 });
      rec.set("pricing_mode", "included");
      rec.set("price", 0);
      rec.set("discount_price", 0);
      rec.set("currency", "USD");
      rec.set("billing_period", "monthly");
      rec.set("custom_billing_days", 0);
      rec.set("grace_period_days", 0);
      app.save(rec);
    }

    // ---- Backfill a real user_subscriptions row for every existing user
    // from their current (legacy) users.* fields — requirement #4. ----
    try {
      const allPlans = app.findAllRecords("plans");
      const planByKey = {};
      allPlans.forEach((p) => { planByKey[p.get("key")] = p; });

      const allUsers = app.findAllRecords("users");
      allUsers.forEach((u) => {
        let already = null;
        try {
          const rows = app.findRecordsByFilter("user_subscriptions", "user = {:uid}", "", 1, 0, { uid: u.id });
          if (rows && rows.length > 0) already = rows[0];
        } catch (_) {}
        if (already) return;

        let pkg = String(u.get("subscription_package") || "none").trim().toLowerCase();
        if (!["trial", "annual", "premium", "unlimited"].includes(pkg)) pkg = "trial";
        const plan = planByKey[pkg] || planByKey["trial"];
        if (!plan) return;

        const rec = new Record(subs);
        rec.set("user", u.id);
        rec.set("plan", plan.id);
        const trialEnd = u.get("trial_end");
        const subEnd = u.get("subscription_end");
        let status = "none";
        if (pkg === "trial") {
          status = trialEnd && new Date(String(trialEnd)).getTime() < Date.now() ? "expired" : "trial";
        } else {
          status = subEnd && new Date(String(subEnd)).getTime() < Date.now() ? "expired" : "active";
        }
        rec.set("status", status);
        rec.set("trial_start", u.get("trial_start") || null);
        rec.set("trial_end", u.get("trial_end") || null);
        rec.set("subscription_start", u.get("subscription_start") || null);
        rec.set("subscription_end", u.get("subscription_end") || null);
        rec.set("auto_renew", false);
        rec.set("extra_properties_purchased", Number(u.get("extra_properties_purchased")) || 0);
        try {
          app.save(rec);
        } catch (e) {
          console.log("user_subscriptions backfill failed for user", u.id, e);
        }
      });
    } catch (e) {
      console.log("user_subscriptions backfill:", e);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("user_subscriptions"));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("feature_entitlements"));
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId("plans"));
    } catch (_) {}
  },
);
