/// <reference path="../pb_data/types.d.ts" />

// Admin & Staff Portal — security fields on the users auth collection.
// Adds a secondary recovery email and a hashed security question/answer so the
// admin forgot-password flow can require dual-email codes + a security answer.
// These fields are server-side only (no rules expose them to the client).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    if (!users.fields.getByName('secondary_recovery_email')) {
      users.fields.add(
        new EmailField({
          name: 'secondary_recovery_email',
          required: false,
        }),
      );
    }

    if (!users.fields.getByName('security_question')) {
      users.fields.add(
        new TextField({
          name: 'security_question',
          required: false,
          max: 300,
        }),
      );
    }

    if (!users.fields.getByName('security_answer_hash')) {
      users.fields.add(
        new TextField({
          name: 'security_answer_hash',
          required: false,
          max: 300,
        }),
      );
    }

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    ['secondary_recovery_email', 'security_question', 'security_answer_hash'].forEach(
      (name) => {
        if (users.fields.getByName(name)) {
          users.fields.removeByName(name);
        }
      },
    );
    app.save(users);
  },
);
