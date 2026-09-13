/// <reference path="../pb_data/types.d.ts" />

// Super Admin subscription revenue + owner access fields.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (!users.fields.getByName("access_plan")) {
      users.fields.add(
        new SelectField({
          name: "access_plan",
          values: ["free", "paid"],
          maxSelect: 1,
        }),
      );
    }
    if (!users.fields.getByName("subscription_status")) {
      users.fields.add(
        new SelectField({
          name: "subscription_status",
          values: ["none", "active", "expired", "cancelled"],
          maxSelect: 1,
        }),
      );
    }
    if (!users.fields.getByName("account_state")) {
      users.fields.add(
        new SelectField({
          name: "account_state",
          values: ["active", "inactive", "suspended"],
          maxSelect: 1,
        }),
      );
    }
    if (!users.fields.getByName("can_view_revenue")) {
      users.fields.add(new BoolField({ name: "can_view_revenue" }));
    }
    app.save(users);

    // Backfill account_state from suspended flag
    try {
      const all = app.findAllRecords("users");
      all.forEach((r) => {
        if (!r.get("account_state")) {
          r.set("account_state", r.getBool("suspended") ? "suspended" : "active");
        }
        if (!r.get("access_plan")) {
          r.set("access_plan", "free");
        }
        if (!r.get("subscription_status")) {
          r.set("subscription_status", "none");
        }
        app.save(r);
      });
    } catch (e) {
      console.log("backfill users access fields:", e);
    }

    const STAFF =
      "@request.auth.is_super_admin = true || @request.auth.role = 'admin' || " +
      "@request.auth.role = 'editor' || @request.auth.role = 'support' || " +
      "@request.auth.role = 'custom'";

    // Private revenue collection — only Super Admin by default
    let subPay;
    try {
      subPay = app.findCollectionByNameOrId("subscription_payments");
    } catch (_) {
      subPay = new Collection({
        type: "base",
        name: "subscription_payments",
        listRule:
          "@request.auth.is_super_admin = true || @request.auth.can_view_revenue = true",
        viewRule:
          "@request.auth.is_super_admin = true || @request.auth.can_view_revenue = true",
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
          { name: "amount", type: "number", required: true, min: 0 },
          { name: "currency", type: "text", max: 10 },
          {
            name: "plan",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["free", "monthly", "yearly", "lifetime"],
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["paid", "unpaid", "refunded"],
          },
          { name: "paid_at", type: "date" },
          { name: "note", type: "text", max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_sub_pay_user ON subscription_payments (user)",
          "CREATE INDEX idx_sub_pay_paid ON subscription_payments (paid_at, status)",
        ],
      });
      app.save(subPay);
    }

    // platform_settings: who may view revenue (json list of user ids) — optional grant
    const settings = app.findCollectionByNameOrId("platform_settings");
    if (!settings.fields.getByName("revenue_viewers")) {
      settings.fields.add(new JSONField({ name: "revenue_viewers" }));
    }
    app.save(settings);
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("subscription_payments");
      app.delete(col);
    } catch (_) {}
    try {
      const users = app.findCollectionByNameOrId("users");
      try {
        users.fields.removeByName("access_plan");
      } catch (_) {}
      try {
        users.fields.removeByName("subscription_status");
      } catch (_) {}
      try {
        users.fields.removeByName("account_state");
      } catch (_) {}
      app.save(users);
    } catch (_) {}
    try {
      const settings = app.findCollectionByNameOrId("platform_settings");
      try {
        settings.fields.removeByName("revenue_viewers");
      } catch (_) {}
      app.save(settings);
    } catch (_) {}
  },
);
