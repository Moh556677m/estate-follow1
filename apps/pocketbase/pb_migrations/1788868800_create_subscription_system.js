/// <reference path="../pb_data/types.d.ts" />

// Complete subscription & packages system.
//
// - subscription_settings: single-record collection holding all package
//   configuration (trial, annual, premium, unlimited) — prices, discounts,
//   property limits, extra-purchase settings. Readable by any authed user
//   (they need to see prices), writable by Super Admin only.
// - subscription_orders: upgrade / extra-property purchase requests. Users
//   create their own; Super Admin approves/rejects.
// - users: new fields for package tracking (subscription_package, trial_start,
//   trial_end, subscription_end, extra_properties_purchased).
//
// Enforcement (property limit per package) lives in the
// subscription-enforcement.pb.js hook — server-side, before every property
// create, regardless of which UI button triggered it.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // ---- Add subscription tracking fields to users ----
    if (!users.fields.getByName("subscription_package")) {
      users.fields.add(
        new SelectField({
          name: "subscription_package",
          values: ["none", "trial", "annual", "premium", "unlimited"],
          maxSelect: 1,
        }),
      );
    }
    if (!users.fields.getByName("trial_start")) {
      users.fields.add(new DateField({ name: "trial_start" }));
    }
    if (!users.fields.getByName("trial_end")) {
      users.fields.add(new DateField({ name: "trial_end" }));
    }
    if (!users.fields.getByName("subscription_end")) {
      users.fields.add(new DateField({ name: "subscription_end" }));
    }
    if (!users.fields.getByName("extra_properties_purchased")) {
      users.fields.add(new NumberField({ name: "extra_properties_purchased" }));
    }
    app.save(users);

    // ---- subscription_settings collection ----
    let settings;
    try {
      settings = app.findCollectionByNameOrId("subscription_settings");
    } catch (_) {
      settings = new Collection({
        type: "base",
        name: "subscription_settings",
        // Any logged-in user can read (they need to see package prices/limits).
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          // Trial
          { name: "trial_enabled", type: "bool" },
          { name: "trial_days", type: "number", onlyInt: true },
          { name: "trial_properties", type: "number", onlyInt: true },
          // Annual
          { name: "annual_enabled", type: "bool" },
          { name: "annual_price", type: "number", min: 0 },
          { name: "annual_discount_percent", type: "number", min: 0, max: 100 },
          { name: "annual_free_properties", type: "number", onlyInt: true },
          { name: "annual_extra_enabled", type: "bool" },
          {
            name: "annual_extra_type",
            type: "select",
            maxSelect: 1,
            values: ["percent", "fixed"],
          },
          { name: "annual_extra_value", type: "number", min: 0 },
          // Premium
          { name: "premium_enabled", type: "bool" },
          { name: "premium_price", type: "number", min: 0 },
          { name: "premium_discount_percent", type: "number", min: 0, max: 100 },
          { name: "premium_properties", type: "number", onlyInt: true },
          // Unlimited
          { name: "unlimited_enabled", type: "bool" },
          { name: "unlimited_price", type: "number", min: 0 },
          { name: "unlimited_discount_percent", type: "number", min: 0, max: 100 },
          // General
          { name: "currency", type: "text", max: 10 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(settings);
    }

    // ---- subscription_orders collection ----
    let orders;
    try {
      orders = app.findCollectionByNameOrId("subscription_orders");
    } catch (_) {
      orders = new Collection({
        type: "base",
        name: "subscription_orders",
        // User can see their own orders; Super Admin sees all.
        listRule:
          "@request.auth.id != '' && (user = @request.auth.id || @request.auth.is_super_admin = true)",
        viewRule:
          "@request.auth.id != '' && (user = @request.auth.id || @request.auth.is_super_admin = true)",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.user",
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
            name: "package",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["annual", "premium", "unlimited", "extra_property"],
          },
          { name: "amount", type: "number", required: true, min: 0 },
          { name: "currency", type: "text", max: 10 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pending", "approved", "rejected", "cancelled"],
          },
          { name: "requested_at", type: "date" },
          { name: "processed_at", type: "date" },
          { name: "note", type: "text", max: 1000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_sub_orders_user ON subscription_orders (user)",
          "CREATE INDEX idx_sub_orders_status ON subscription_orders (status)",
        ],
      });
      app.save(orders);
    }

    // ---- Seed default settings (single record) ----
    let existingSettings;
    try {
      existingSettings = app.findRecordsByFilter("subscription_settings", "id != ''");
    } catch (_) {
      existingSettings = [];
    }
    if (!existingSettings || existingSettings.length === 0) {
      const s = new Record(settings);
      s.set("trial_enabled", true);
      s.set("trial_days", 10);
      s.set("trial_properties", 3);
      s.set("annual_enabled", true);
      s.set("annual_price", 100);
      s.set("annual_discount_percent", 0);
      s.set("annual_free_properties", 2);
      s.set("annual_extra_enabled", true);
      s.set("annual_extra_type", "percent");
      s.set("annual_extra_value", 10);
      s.set("premium_enabled", true);
      s.set("premium_price", 200);
      s.set("premium_discount_percent", 0);
      s.set("premium_properties", 15);
      s.set("unlimited_enabled", true);
      s.set("unlimited_price", 300);
      s.set("unlimited_discount_percent", 0);
      s.set("currency", "USD");
      app.save(s);
    }

    // ---- Backfill existing users ----
    // Super Admin → unlimited (bypasses all limits). Other users → trial with
    // dates derived from their creation date so the enforcement hook has real
    // values to check. Existing properties remain visible; only NEW adds are
    // gated by the limit.
    try {
      const all = app.findAllRecords("users");
      const now = new Date();
      all.forEach((r) => {
        const isSuper =
          r.getBool("is_super_admin") ||
          String(r.get("role") || "") === "admin" ||
          ["admin", "editor", "support", "custom"].includes(
            String(r.get("role") || ""),
          );
        if (isSuper) {
          if (!r.get("subscription_package")) r.set("subscription_package", "unlimited");
        } else {
          if (!r.get("subscription_package")) r.set("subscription_package", "trial");
          if (!r.get("trial_start")) {
            let created = r.get("created");
            let start;
            try {
              start = created ? new Date(String(created)) : now;
            } catch (_) {
              start = now;
            }
            if (isNaN(start.getTime())) start = now;
            r.set("trial_start", start.toISOString());
            const days = 10;
            const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
            r.set("trial_end", end.toISOString());
          }
        }
        if (r.get("extra_properties_purchased") == null) {
          r.set("extra_properties_purchased", 0);
        }
        app.save(r);
      });
    } catch (e) {
      console.log("backfill subscription fields:", e);
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("subscription_settings");
      app.delete(col);
    } catch (_) {}
    try {
      const col = app.findCollectionByNameOrId("subscription_orders");
      app.delete(col);
    } catch (_) {}
    try {
      const users = app.findCollectionByNameOrId("users");
      ["subscription_package", "trial_start", "trial_end", "subscription_end", "extra_properties_purchased"].forEach(
        (n) => {
          try {
            users.fields.removeByName(n);
          } catch (_) {}
        },
      );
      app.save(users);
    } catch (_) {}
  },
);
