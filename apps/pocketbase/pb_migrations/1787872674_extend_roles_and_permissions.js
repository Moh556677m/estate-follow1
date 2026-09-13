/// <reference path="../pb_data/types.d.ts" />

// Extend the users collection with granular staff roles + permissions, and
// broaden access rules so staff roles (admin/editor/support/custom) can act
// on behalf of the platform. The Super Admin (is_super_admin) always has full
// access; granular per-staff permission enforcement is handled in the frontend
// via the `permissions` json field.
migrate(
  (app) => {
    const STAFF =
      "@request.auth.is_super_admin = true || @request.auth.role = 'admin' || " +
      "@request.auth.role = 'editor' || @request.auth.role = 'support' || " +
      "@request.auth.role = 'custom'";

    // ---- users: extend role select + add permissions/staff_label ----
    const users = app.findCollectionByNameOrId("users");

    const roleField = users.fields.getByName("role");
    if (roleField) {
      roleField.values = ["owner", "admin", "editor", "support", "custom"];
    }

    if (!users.fields.getByName("permissions")) {
      users.fields.add(new JSONField({ name: "permissions" }));
    }
    if (!users.fields.getByName("staff_label")) {
      users.fields.add(new TextField({ name: "staff_label", max: 60 }));
    }

    // Broaden staff management access. Self-access preserved.
    users.listRule = "id = @request.auth.id || " + STAFF;
    users.viewRule = "id = @request.auth.id || " + STAFF;
    // create stays open (public signup); the platform hook forces role=owner
    // for non-super-admin creators, so anonymous sign-ups can never become staff.
    users.updateRule = "id = @request.auth.id || " + STAFF;
    users.deleteRule = STAFF;
    app.save(users);

    // ---- properties: broaden admin side to staff ----
    const properties = app.findCollectionByNameOrId("properties");
    properties.listRule = "@request.auth.id = owner || " + STAFF;
    properties.viewRule = "@request.auth.id = owner || " + STAFF;
    properties.updateRule =
      "(@request.auth.id = owner || " + STAFF + ") && " +
      "(@request.body.status:isset = false || " + STAFF + ")";
    properties.deleteRule = STAFF;
    app.save(properties);

    // ---- payments ----
    const payments = app.findCollectionByNameOrId("payments");
    payments.listRule = "@request.auth.id = owner || " + STAFF;
    payments.viewRule = "@request.auth.id = owner || " + STAFF;
    payments.updateRule = "@request.auth.id = owner || " + STAFF;
    payments.deleteRule = "@request.auth.id = owner || " + STAFF;
    app.save(payments);

    // ---- activity_logs ----
    const logs = app.findCollectionByNameOrId("activity_logs");
    logs.listRule = STAFF + " || @request.auth.id = user";
    logs.viewRule = STAFF + " || @request.auth.id = user";
    app.save(logs);

    // ---- notifications: admins/staff can create for users ----
    const notifs = app.findCollectionByNameOrId("notifications");
    notifs.createRule = STAFF;
    notifs.deleteRule = "@request.auth.id = user || " + STAFF;
    app.save(notifs);

    // ---- user_sessions ----
    const sessions = app.findCollectionByNameOrId("user_sessions");
    sessions.listRule =
      "@request.auth.id != '' && (@request.auth.id = user || " + STAFF + ")";
    sessions.viewRule =
      "@request.auth.id != '' && (@request.auth.id = user || " + STAFF + ")";
    sessions.updateRule =
      "@request.auth.id != '' && (@request.auth.id = user || " + STAFF + ")";
    sessions.deleteRule =
      "@request.auth.id != '' && (@request.auth.id = user || " + STAFF + ")";
    app.save(sessions);

    // ---- support_messages ----
    const support = app.findCollectionByNameOrId("support_messages");
    support.listRule =
      "@request.auth.id != '' && (@request.auth.id = user || " + STAFF + ")";
    support.viewRule =
      "@request.auth.id != '' && (@request.auth.id = user || " + STAFF + ")";
    support.updateRule =
      "@request.auth.id != '' && (@request.auth.id = user || " + STAFF + ")";
    support.deleteRule = STAFF;
    app.save(support);

    // ---- platform_settings: staff with settings access can read; only staff write ----
    const settings = app.findCollectionByNameOrId("platform_settings");
    settings.createRule = STAFF;
    settings.updateRule = STAFF;
    settings.deleteRule = STAFF;
    app.save(settings);
  },
  (app) => {
    // Best-effort revert: restore admin-only rules and shrink role values.
    const ADMIN = "@request.auth.role = 'admin'";
    const users = app.findCollectionByNameOrId("users");
    const roleField = users.fields.getByName("role");
    if (roleField) roleField.values = ["owner", "admin"];
    users.listRule = "id = @request.auth.id || " + ADMIN;
    users.viewRule = "id = @request.auth.id || " + ADMIN;
    users.updateRule = "id = @request.auth.id || " + ADMIN;
    users.deleteRule = ADMIN;
    try { users.fields.removeByName("permissions"); } catch (_) {}
    try { users.fields.removeByName("staff_label"); } catch (_) {}
    app.save(users);

    const properties = app.findCollectionByNameOrId("properties");
    properties.listRule = "@request.auth.id = owner || " + ADMIN;
    properties.viewRule = "@request.auth.id = owner || " + ADMIN;
    properties.updateRule =
      "(@request.auth.id = owner || " + ADMIN + ") && " +
      "(@request.body.status:isset = false || " + ADMIN + ")";
    properties.deleteRule = ADMIN;
    app.save(properties);

    const payments = app.findCollectionByNameOrId("payments");
    payments.listRule = "@request.auth.id = owner || " + ADMIN;
    payments.viewRule = "@request.auth.id = owner || " + ADMIN;
    payments.updateRule = "@request.auth.id = owner || " + ADMIN;
    payments.deleteRule = "@request.auth.id = owner || " + ADMIN;
    app.save(payments);
  },
);
