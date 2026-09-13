/// <reference path="../pb_data/types.d.ts" />

// Signup flow: add nationality + gender profile fields and a pending_signup
// flag to users, and enable email OTP so registration can verify the email
// before the account is activated.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (!users.fields.getByName("nationality")) {
      users.fields.add(
        new TextField({ name: "nationality", required: true, max: 120 }),
      );
    }
    if (!users.fields.getByName("gender")) {
      users.fields.add(
        new SelectField({
          name: "gender",
          required: true,
          maxSelect: 1,
          values: ["male", "female"],
        }),
      );
    }
    if (!users.fields.getByName("pending_signup")) {
      users.fields.add(new BoolField({ name: "pending_signup" }));
    }

    // Email OTP — 6-digit code valid for 5 minutes.
    users.otp.enabled = true;
    users.otp.duration = 300;
    users.otp.length = 6;

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    if (users.fields.getByName("nationality")) {
      users.fields.removeByName("nationality");
    }
    if (users.fields.getByName("gender")) {
      users.fields.removeByName("gender");
    }
    if (users.fields.getByName("pending_signup")) {
      users.fields.removeByName("pending_signup");
    }
    users.otp.enabled = false;
    app.save(users);
  },
);
