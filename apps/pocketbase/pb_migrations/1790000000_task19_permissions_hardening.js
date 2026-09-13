/// <reference path="../pb_data/types.d.ts" />

// Task #19 — Staff/Permissions + CMS rebuild, part 1 (rules).
//
// Every insights_* collection already structurally allows any `editors`
// actor through (their `role` field is always a non-empty string —
// editor/senior_editor/content_manager — so `@request.auth.role != ''`
// already passes), so no rule change is needed there: the real fix is the
// new task19-cms-permissions.pb.js hooks, which check the actor's stored
// `permissions` JSON on top of that existing structural gate.
//
// The one collection whose RULE itself is too narrow is `editors`: its
// create/delete rules check `@request.auth.is_super_admin = true`, a field
// that only exists on the `users` collection, so no editors-collection
// actor (not even the Primary Content Admin / a content_manager with
// `manage_editors` checked) can ever satisfy it — meaning the CMS "Content
// Team" tab's add/suspend/delete/reset-password actions 403 for everyone
// except the platform's real Super Admin today. This migration broadens the
// rule to the same "any editor OR any platform staff" structural gate used
// by every other insights_* collection; task19-cms-permissions.pb.js's hook
// then does the real authorization (manage_editors permission required,
// least-privilege on the new record, is_primary always stripped).
migrate(
  (app) => {
    const editors = app.findCollectionByNameOrId("editors");
    const STAFF_OR_EDITOR = "@request.auth.is_super_admin = true || @request.auth.role != ''";
    editors.createRule = STAFF_OR_EDITOR;
    editors.updateRule = "id = @request.auth.id || " + STAFF_OR_EDITOR;
    // is_primary != true stays a hard DB-level backstop no hook can loosen.
    editors.deleteRule = "(" + STAFF_OR_EDITOR + ") && is_primary != true";
    app.save(editors);
  },
  (app) => {
    const editors = app.findCollectionByNameOrId("editors");
    editors.createRule = "@request.auth.is_super_admin = true";
    editors.updateRule = "id = @request.auth.id || @request.auth.is_super_admin = true";
    editors.deleteRule = "@request.auth.is_super_admin = true && is_primary != true";
    app.save(editors);
  },
);
