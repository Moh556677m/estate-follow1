/// <reference path="../pb_data/types.d.ts" />

// ============================================================================
// Portal login separation — enforced server-side, not just in the browser.
//
// Two completely separate login pages authenticate against the exact same
// PocketBase "users" collection endpoint (auth-with-password):
//   - /admin/login   → apps/web/src/pages/AdminLoginPage.jsx  (staff/admin only)
//   - /login         → apps/web/src/pages/LoginPage.jsx       (owners only)
//
// Each page's AuthContext.login() call tags its request with a custom
// "X-Portal" header ("admin" or "user" — see apps/web/src/contexts/
// AuthContext.jsx). Both pages ALSO reject the wrong account type client-side
// after a successful auth, but that alone is not real separation: anyone
// calling the auth-with-password endpoint directly (bypassing the React app
// entirely) would still authenticate successfully as either kind of account
// from either "side". This hook is the actual enforcement point — it runs
// inside PocketBase itself, so it applies no matter what called it.
//
// Self-contained handler: PocketBase recompiles each hook callback in an
// isolated JSVM scope, so no outer-scope variables are used.
// ============================================================================

onRecordAuthWithPasswordRequest((e) => {
  // 1) Password / identity first — wrong credentials must never look like a
  // portal mismatch (mirrors the account-status hook in platform.pb.js).
  e.next();

  if (!e.record) return;

  let isSuper = false;
  try {
    isSuper = e.record.getBool("is_super_admin");
  } catch (_) {
    isSuper = false;
  }
  let role = "";
  try {
    role = String(e.record.getString("role") || e.record.get("role") || "");
  } catch (_) {
    role = "";
  }
  const isStaffAccount =
    isSuper || role === "admin" || role === "editor" || role === "support" || role === "custom";

  // Read the X-Portal header. PocketBase's JSVM RequestInfo headers map is
  // lowercase-keyed, but a couple of casings are checked too rather than
  // depending on that being exactly right. If the headers map itself can't
  // be read at all (an unexpected API shape, not just a missing header),
  // fail OPEN — i.e. skip enforcement rather than lock out every staff
  // login — since a wrong assumption here must never be able to lock every
  // admin/staff account out of the platform. A request that reads fine but
  // simply carries no X-Portal value (portal === "") is still enforced
  // normally: that legitimately isn't a request from either login page.
  let headers = null;
  try {
    headers = (e.requestInfo && e.requestInfo().headers) || {};
  } catch (_) {
    headers = null;
  }
  if (!headers) return;

  const portal = String(headers["x-portal"] || headers["X-Portal"] || headers["X-PORTAL"] || "")
    .trim()
    .toLowerCase();

  if (isStaffAccount && portal !== "admin") {
    // A staff/admin/super-admin account authenticating from anywhere other
    // than the admin portal (including no X-Portal header at all, e.g. a
    // direct API call) is rejected.
    throw new BadRequestError("STAFF_PORTAL_ONLY");
  }
  if (!isStaffAccount && portal === "admin") {
    // A regular owner account trying to use the admin portal.
    throw new BadRequestError("OWNER_PORTAL_ONLY");
  }
}, "users");
