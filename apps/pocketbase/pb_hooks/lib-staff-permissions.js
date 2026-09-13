// Task #19 — shared staff-permission helper (server-side mirror of
// apps/web/src/lib/permissions.js's hasPermission()).
//
// Until this task, `users.permissions` (the granular per-staff JSON the
// Admin Portal's CreateStaffModal/StaffProfileModal UI edits) was only ever
// read by the FRONTEND to hide/show buttons. Every PocketBase collection
// rule instead only checked "is this account any staff role at all"
// (STAFF = role != ''), so a `support` staffer with zero permissions
// checked could still edit/delete users, properties, payments, etc via a
// raw API call — the granular flags were decorative. This file gives every
// new task19-*.pb.js hook the real, server-side version of that check so
// enforcement can never diverge from what the UI promises.
//
// PB JSVM scope note: every routerAdd/hook callback compiles in its own
// isolated VM in this build, so this file must be require()'d fresh inside
// every handler that needs it (same pattern as lib-feature-gate.js).

function isSuperAdmin(auth) {
  try {
    return !!auth && auth.getBool("is_super_admin");
  } catch (_) {
    return false;
  }
}

function staffRole(auth) {
  if (!auth) return "";
  try {
    return String(auth.get("role") || "");
  } catch (_) {
    return "";
  }
}

const STAFF_ROLES = ["admin", "editor", "support", "custom"];

function isStaff(auth) {
  if (isSuperAdmin(auth)) return true;
  return STAFF_ROLES.indexOf(staffRole(auth)) >= 0;
}

function staffPermissions(auth) {
  if (!auth) return {};
  try {
    const raw = auth.get("permissions");
    const parsed = JSON.parse(String(raw == null ? "{}" : raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

/**
 * hasStaffPermission(auth, key) -> bool
 * Mirrors apps/web/src/lib/permissions.js's hasPermission() exactly,
 * including the backward-compatibility fallback: a `role = admin` account
 * that has never had a permissions object explicitly saved (created before
 * this granular system existed) still gets full access; once a permissions
 * object is saved (even an empty one from an explicit "uncheck all"), the
 * granular flags are honoured.
 */
function hasStaffPermission(auth, key) {
  if (!auth) return false;
  if (isSuperAdmin(auth)) return true;
  const role = staffRole(auth);
  if (STAFF_ROLES.indexOf(role) < 0) return false;
  const perms = staffPermissions(auth);
  if (role === "admin" && Object.keys(perms).length === 0) return true;
  return !!perms[key];
}

// NOTE: this helper deliberately never throws (mirrors lib-feature-gate.js's
// requireFeature() convention) — BadRequestError is a PB JSVM global that is
// only guaranteed available in the hook file that require()'d this module,
// so every task19-*.pb.js hook does its own
// `if (!hasStaffPermission(...)) throw new BadRequestError(...)` instead of
// relying on this shared file to throw.

function isActorFromUsers(auth) {
  try {
    return !!auth && auth.collection().name === "users";
  } catch (_) {
    return false;
  }
}

module.exports = {
  isSuperAdmin,
  staffRole,
  isStaff,
  staffPermissions,
  hasStaffPermission,
  isActorFromUsers,
};
