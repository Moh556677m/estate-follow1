/// <reference path="../pb_data/types.d.ts" />

// Super Admin + Platform Settings
//   - add `is_super_admin` bool to users
//   - convert the platform admin account to admin@estatefollow.com and mark
//     it as the permanent Super Admin (is_super_admin = true)
//   - open user_sessions read/write/delete to admins so the Super Admin can
//     view and revoke any user's devices
//   - create a `platform_settings` collection (single record) for branding,
//     colors, fonts, languages, plan access and security limits
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // 1. is_super_admin flag
    if (!users.fields.getByName("is_super_admin")) {
      users.fields.add(new BoolField({ name: "is_super_admin" }));
      app.save(users);
    }

    // 2. Convert / create the permanent Super Admin account.
    //
    // SECURITY: this account is no longer created with a hardcoded password.
    // It is only created (or converted from an existing "admin@aqarplatform.com"
    // legacy account, if one exists) when the APP_ADMIN_PASSWORD environment
    // variable is set at migration time. If APP_ADMIN_PASSWORD is not set,
    // this step is skipped entirely and no app-level admin account is
    // created — the deployment still has the PocketBase superuser account
    // created separately (see 1764579159_create_superuser.js) for
    // dashboard/API administration.
    //
    // The email is intentionally kept as "admin@estatefollow.com" — several
    // other parts of this codebase (e.g. pb_hooks/super-admin-security.pb.js)
    // enforce authorization checks against this exact literal email address,
    // so if you do set APP_ADMIN_PASSWORD, that account will be the one
    // recognized by those checks.
    const appAdminPassword = $os.getenv("APP_ADMIN_PASSWORD");
    if (appAdminPassword) {
      let admin = null;
      try {
        admin = app.findAuthRecordByEmail("users", "admin@aqarplatform.com");
      } catch (_) {
        try {
          admin = app.findAuthRecordByEmail("users", "admin@estatefollow.com");
        } catch (_) {
          admin = null;
        }
      }
      if (admin) {
        admin.setEmail("admin@estatefollow.com");
        admin.set("role", "admin");
        admin.set("is_super_admin", true);
        admin.set("verified", true);
        admin.set("suspended", false);
        admin.set("name", "Platform Super Admin");
        admin.setPassword(appAdminPassword);
        app.save(admin);
      } else {
        admin = new Record(users);
        admin.setEmail("admin@estatefollow.com");
        admin.setPassword(appAdminPassword);
        admin.set("name", "Platform Super Admin");
        admin.set("role", "admin");
        admin.set("is_super_admin", true);
        admin.set("verified", true);
        app.save(admin);
      }
    }

    // 3. Let admins manage any user's devices / sessions.
    const sessions = app.findCollectionByNameOrId("user_sessions");
    sessions.listRule =
      "@request.auth.id != '' && (@request.auth.id = user || @request.auth.role = 'admin')";
    sessions.viewRule =
      "@request.auth.id != '' && (@request.auth.id = user || @request.auth.role = 'admin')";
    sessions.updateRule =
      "@request.auth.id != '' && (@request.auth.id = user || @request.auth.role = 'admin')";
    sessions.deleteRule =
      "@request.auth.id != '' && (@request.auth.id = user || @request.auth.role = 'admin')";
    app.save(sessions);

    // 4. Platform settings collection (single shared record).
    let settings;
    try {
      settings = app.findCollectionByNameOrId("platform_settings");
    } catch (_) {
      settings = new Collection({
        type: "base",
        name: "platform_settings",
        // Any signed-in user can read branding; only admins can write.
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.role = 'admin'",
        updateRule: "@request.auth.role = 'admin'",
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
          { name: "brand_name", type: "text", max: 80 },
          { name: "brand_name_ar", type: "text", max: 80 },
          { name: "tagline", type: "text", max: 120 },
          { name: "tagline_ar", type: "text", max: 120 },
          { name: "primary_color", type: "text", max: 20 },
          { name: "accent_color", type: "text", max: 20 },
          { name: "logo_url", type: "text", max: 500 },
          { name: "default_language", type: "text", max: 5 },
          { name: "free_plan_enabled", type: "bool" },
          { name: "paid_plan_enabled", type: "bool" },
          { name: "max_devices", type: "number", min: 1 },
          { name: "email_header_color", type: "text", max: 20 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(settings);
    }

    // Seed the single settings row if it does not exist yet.
    let row;
    try {
      row = app.findRecordsByFilter("platform_settings", "id != ''", "created", 1, 0)[0];
    } catch (_) {
      row = null;
    }
    if (!row) {
      row = new Record(settings);
      row.set("brand_name", "Estate Follow");
      row.set("brand_name_ar", "إستيت فولو");
      row.set("tagline", "Your Properties. Always Followed.");
      row.set("tagline_ar", "عقاراتك تحت المتابعة، دائما.");
      row.set("primary_color", "#22C55E");
      row.set("accent_color", "#0F766E");
      row.set("logo_url", "");
      row.set("default_language", "ar");
      row.set("free_plan_enabled", true);
      row.set("paid_plan_enabled", false);
      row.set("max_devices", 5);
      row.set("email_header_color", "#0F766E");
      app.save(row);
    }
  },
  (app) => {
    // Best-effort revert: drop settings collection and the flag.
    try {
      const settings = app.findCollectionByNameOrId("platform_settings");
      app.delete(settings);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      const users = app.findCollectionByNameOrId("users");
      users.fields.removeByName("is_super_admin");
      app.save(users);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
