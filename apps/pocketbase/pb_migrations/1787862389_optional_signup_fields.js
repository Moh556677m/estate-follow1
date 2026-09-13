/// <reference path="../pb_data/types.d.ts" />

// nationality and gender are enforced by the signup form, but must be optional
// at the collection level: the OTP placeholder record is created without them
// (they are filled in after verification), and pre-existing users (e.g. the
// seeded admin) do not have them set.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const nationality = users.fields.getByName("nationality");
    if (nationality) nationality.required = false;

    const gender = users.fields.getByName("gender");
    if (gender) gender.required = false;

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const nationality = users.fields.getByName("nationality");
    if (nationality) nationality.required = true;
    const gender = users.fields.getByName("gender");
    if (gender) gender.required = true;
    app.save(users);
  },
);
