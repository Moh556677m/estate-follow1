/// <reference path="../pb_data/types.d.ts" />

// Task #19 — real server-side enforcement of the Admin Portal's granular
// staff `permissions` (view_users/edit_users/approve_properties/
// edit_properties/manage_payments/manage_subscriptions/manage_support/
// manage_settings/manage_cms/view_revenue — apps/web/src/lib/permissions.js).
//
// Before this file, every collection's PB rule only checked "is this account
// ANY staff role at all" (role != ''); the granular checkboxes the Admin
// Portal's CreateStaffModal/StaffProfileModal UI already exposed were read
// by the frontend only, to hide/show buttons — never enforced server-side.
// A `support` staffer with every checkbox unticked could still edit/delete
// any user, approve/edit any property, or delete any payment via a raw API
// call. These hooks close that gap without touching the existing collection
// rules (which already act as the correct, broader baseline — self-access
// for owners, any-staff-role for the rest); every hook here only NARROWS
// that baseline down to the actor's real granted permission.
//
// PB JSVM scope note: lib-staff-permissions.js is require()'d fresh inside
// every handler (isolated VM per callback in this build).

// ---------------------------------------------------------------------------
// users — self-updates (name/password/etc) stay untouched. Editing ANOTHER
// user's record needs edit_users; changing role/permissions/staff_label was
// already Super-Admin-only for role/is_super_admin (platform.pb.js) — this
// extends that same protection to `permissions`/`staff_label`, which the
// existing hook's own comment already promised but never actually checked.
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }

  const { isSuperAdmin, isStaff, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }

  const orig = e.record.original();
  if (orig) {
    const permsChanged =
      JSON.stringify(orig.get("permissions") || {}) !== JSON.stringify(e.record.get("permissions") || {});
    const labelChanged = String(orig.get("staff_label") || "") !== String(e.record.get("staff_label") || "");
    if (permsChanged || labelChanged) {
      // Only the real Super Admin may grant/revoke permissions or rename a
      // custom staff label — never the staffer themselves, never another
      // staff member acting on their behalf.
      throw new BadRequestError("permission_denied:manage_permissions");
    }
  }

  const isSelf = e.record.id === auth.id;
  if (isSelf) { e.next(); return; }

  if (isStaff(auth) && !hasStaffPermission(auth, "edit_users")) {
    throw new BadRequestError("permission_denied:edit_users");
  }
  e.next();
}, "users");

onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (!hasStaffPermission(auth, "edit_users")) {
    throw new BadRequestError("permission_denied:edit_users");
  }
  e.next();
}, "users");

// Staff without `view_users` can still see/update their own row (handled by
// the collection rule + the isSelf branch above); they simply cannot browse
// or open OTHER accounts. Super Admin and any account with view_users pass
// straight through.
onRecordsListRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, isStaff, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth) || !isStaff(auth)) { e.next(); return; }
  if (!hasStaffPermission(auth, "view_users")) {
    throw new BadRequestError("permission_denied:view_users");
  }
  e.next();
}, "users");

onRecordViewRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  if (e.record.id === auth.id) { e.next(); return; }
  const { isSuperAdmin, isStaff, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth) || !isStaff(auth)) { e.next(); return; }
  if (!hasStaffPermission(auth, "view_users")) {
    throw new BadRequestError("permission_denied:view_users");
  }
  e.next();
}, "users");

// ---------------------------------------------------------------------------
// properties — the owner editing their own listing is untouched. Staff
// acting on SOMEONE ELSE'S property needs approve_properties for a status
// transition (the review workflow) and/or edit_properties for any other
// field change.
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, isStaff, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (e.record.get("owner") === auth.id) { e.next(); return; }
  if (!isStaff(auth)) { e.next(); return; } // collection rule already blocks this case

  const orig = e.record.original();
  const statusChanged = orig ? orig.get("status") !== e.record.get("status") : false;
  if (statusChanged && !hasStaffPermission(auth, "approve_properties")) {
    throw new BadRequestError("permission_denied:approve_properties");
  }

  // Any field besides status/updated counts as a content edit — diff the
  // full field map (fieldsData() returns every stored field as a plain
  // dict) rather than name individual property fields one by one.
  let otherChanged = false;
  if (orig) {
    try {
      const before = JSON.parse(JSON.stringify(orig.fieldsData()));
      const after = JSON.parse(JSON.stringify(e.record.fieldsData()));
      delete before.status;
      delete after.status;
      delete before.updated;
      delete after.updated;
      otherChanged = JSON.stringify(before) !== JSON.stringify(after);
    } catch (_) {
      otherChanged = true;
    }
  }
  if (otherChanged && !hasStaffPermission(auth, "edit_properties")) {
    throw new BadRequestError("permission_denied:edit_properties");
  }
  e.next();
}, "properties");

onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, isStaff, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (isStaff(auth) && !hasStaffPermission(auth, "edit_properties")) {
    throw new BadRequestError("permission_denied:edit_properties");
  }
  e.next();
}, "properties");

// ---------------------------------------------------------------------------
// payments — the payer editing their own row (e.g. attaching a receipt) is
// untouched. Staff acting on someone else's payment needs manage_payments.
// ---------------------------------------------------------------------------
// NOTE: each registration below is a fully inline arrow function (never a
// shared named function passed by reference) — a real runtime bug this same
// session already showed that a plain top-level function declared in a
// .pb.js file is invisible inside a routerAdd/hook callback defined later
// in that same file (each compiles in its own isolated VM), so nothing here
// is trusted to survive outside require()'d module state or its own body.
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, isStaff, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (e.record.get("owner") === auth.id) { e.next(); return; }
  if (isStaff(auth) && !hasStaffPermission(auth, "manage_payments")) {
    throw new BadRequestError("permission_denied:manage_payments");
  }
  e.next();
}, "payments");
onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, isStaff, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (e.record.get("owner") === auth.id) { e.next(); return; }
  if (isStaff(auth) && !hasStaffPermission(auth, "manage_payments")) {
    throw new BadRequestError("permission_denied:manage_payments");
  }
  e.next();
}, "payments");

// ---------------------------------------------------------------------------
// support_messages — the sender updating their own message is untouched.
// Staff moderating/closing someone else's ticket needs manage_support.
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, isStaff, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (e.record.get("user") === auth.id) { e.next(); return; }
  if (isStaff(auth) && !hasStaffPermission(auth, "manage_support")) {
    throw new BadRequestError("permission_denied:manage_support");
  }
  e.next();
}, "support_messages");

onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (!hasStaffPermission(auth, "manage_support")) {
    throw new BadRequestError("permission_denied:manage_support");
  }
  e.next();
}, "support_messages");

// ---------------------------------------------------------------------------
// platform_settings — staff without manage_settings can no longer create,
// change, or delete platform-wide configuration even though the collection
// rule structurally allows any staff role through.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (!hasStaffPermission(auth, "manage_settings")) {
    throw new BadRequestError("permission_denied:manage_settings");
  }
  e.next();
}, "platform_settings");
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (!hasStaffPermission(auth, "manage_settings")) {
    throw new BadRequestError("permission_denied:manage_settings");
  }
  e.next();
}, "platform_settings");
onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) { e.next(); return; }
  const { isSuperAdmin, hasStaffPermission } = require(`${__hooks}/lib-staff-permissions.js`);
  if (isSuperAdmin(auth)) { e.next(); return; }
  if (!hasStaffPermission(auth, "manage_settings")) {
    throw new BadRequestError("permission_denied:manage_settings");
  }
  e.next();
}, "platform_settings");
