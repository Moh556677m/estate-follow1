/// <reference path="../pb_data/types.d.ts" />

// Owner profile: store the owner's passport and residence documents once on
// the `users` record so they are reused across every property. Property-level
// passport/residence uploads become optional — the forms default to the
// profile documents and only offer a "Replace / Update Document" override.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (!users.fields.getByName("passport_pdf")) {
      users.fields.add(
        new FileField({
          name: "passport_pdf",
          maxSelect: 1,
          maxSize: 10485760,
          protected: true,
        }),
      );
    }
    if (!users.fields.getByName("residence_pdf")) {
      users.fields.add(
        new FileField({
          name: "residence_pdf",
          maxSelect: 1,
          maxSize: 10485760,
          protected: true,
        }),
      );
    }
    app.save(users);

    // The property-level passport is no longer required — owners use the
    // profile document by default. residence_pdf is already optional.
    const properties = app.findCollectionByNameOrId("properties");
    const propPassport = properties.fields.getByName("passport_pdf");
    if (propPassport) {
      propPassport.required = false;
    }
    app.save(properties);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    if (users.fields.getByName("passport_pdf")) {
      users.fields.removeByName("passport_pdf");
    }
    if (users.fields.getByName("residence_pdf")) {
      users.fields.removeByName("residence_pdf");
    }
    app.save(users);

    const properties = app.findCollectionByNameOrId("properties");
    const propPassport = properties.fields.getByName("passport_pdf");
    if (propPassport) {
      propPassport.required = true;
    }
    app.save(properties);
  },
);
