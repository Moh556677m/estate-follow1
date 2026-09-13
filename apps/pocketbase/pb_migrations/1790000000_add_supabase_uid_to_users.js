/// <reference path="../pb_data/types.d.ts" />

// Supabase Auth bridge: lets the API look up (or provision) the PocketBase
// "users" record that corresponds to a given Supabase Auth user, without
// ever using the Supabase UUID as the PocketBase record's own `id` (that
// field's default validation rejects a 36-character UUID). See
// apps/api/src/routes/supabase-auth-bridge.js for how this is used.
//
// Not required and not unique-enforced at the DB level by a "required"
// flag — existing PocketBase-only accounts (created before this bridge
// existed) simply have it empty, and stay perfectly usable exactly as
// before. A unique INDEX (not a required field) is what actually prevents
// two PocketBase users from ever being linked to the same Supabase account.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (!users.fields.getByName("supabase_uid")) {
      users.fields.add(new TextField({ name: "supabase_uid", max: 64 }));
    }

    const indexName = "idx_users_supabase_uid";
    if (!users.indexes.some((idx) => idx.includes(indexName))) {
      users.indexes.push(
        `CREATE UNIQUE INDEX ${indexName} ON users (supabase_uid) WHERE supabase_uid != ''`,
      );
    }

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.indexes = users.indexes.filter((idx) => !idx.includes("idx_users_supabase_uid"));
    if (users.fields.getByName("supabase_uid")) {
      users.fields.removeByName("supabase_uid");
    }
    app.save(users);
  },
);
