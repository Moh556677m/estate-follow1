/// <reference path="../pb_data/types.d.ts" />

// Allow Super Admin to create branches and permits on behalf of any owner
// (so the Super Admin can fully manage a brokerage company's branches and
// additional permits from the user profile panel).
migrate(
  (app) => {
    const branches = app.findCollectionByNameOrId("brokerage_branches");
    branches.createRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = @request.body.owner)";
    app.save(branches);

    const permits = app.findCollectionByNameOrId("brokerage_permits");
    permits.createRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = @request.body.owner)";
    app.save(permits);
  },
  (app) => {
    const branches = app.findCollectionByNameOrId("brokerage_branches");
    branches.createRule =
      "@request.auth.id != '' && @request.auth.id = @request.body.owner";
    app.save(branches);

    const permits = app.findCollectionByNameOrId("brokerage_permits");
    permits.createRule =
      "@request.auth.id != '' && @request.auth.id = @request.body.owner";
    app.save(permits);
  },
);
