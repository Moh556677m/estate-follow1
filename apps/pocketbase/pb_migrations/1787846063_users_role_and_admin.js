/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (!users.fields.getByName("role")) {
      users.fields.add(
        new SelectField({
          name: "role",
          required: true,
          maxSelect: 1,
          values: ["owner", "admin"],
        }),
      );
    }
    if (!users.fields.getByName("phone")) {
      users.fields.add(new TextField({ name: "phone", max: 40 }));
    }
    if (!users.fields.getByName("suspended")) {
      users.fields.add(new BoolField({ name: "suspended" }));
    }

    // Open sign-up for property owners; the server hook forces role = "owner"
    // so nobody can self-register as admin.
    users.createRule = "";
    users.listRule = "id = @request.auth.id || @request.auth.role = 'admin'";
    users.viewRule = "id = @request.auth.id || @request.auth.role = 'admin'";
    users.updateRule = "id = @request.auth.id || @request.auth.role = 'admin'";
    users.deleteRule = "@request.auth.role = 'admin'";
    users.authRule = "suspended = false";

    const pw = users.fields.getByName("password");
    pw.min = Math.max(pw.min || 0, 10);
    app.save(users);

    // NOTE: this migration used to seed a hardcoded "platform admin" account
    // (admin@aqarplatform.com) with a plaintext password written in this
    // file. That has been removed for security — no default account is
    // created here anymore. The real admin account is created (only if you
    // choose to) by 1787871185_super_admin_and_settings.js, from the
    // APP_ADMIN_PASSWORD environment variable — see that migration's
    // comments.
  },
  (app) => {
    try {
      const admin = app.findAuthRecordByEmail("users", "admin@aqarplatform.com");
      app.delete(admin);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("role");
    users.fields.removeByName("phone");
    users.fields.removeByName("suspended");
    users.authRule = null;
    app.save(users);
  },
);
