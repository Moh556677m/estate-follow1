// Task #19 — shared CMS editor-permission helper (server-side mirror of the
// `EDITOR_PERMS` checkbox list in ContentManagementPanel.jsx and of the
// `isPrimary` bypass already used client-side in EditorDashboard.jsx).
//
// Until this task, `editors.permissions` was stored and edited in the CMS
// "Content Team" tab but never actually enforced: every insights_* collection
// rule only checked "is this actor any editor at all, or any users-collection
// staff at all" (role != ''), so a plain `editor` with every checkbox
// unticked could still create/publish/delete articles, manage ads, manage
// other editors, etc via a raw API call. This file gives every task19-*.pb.js
// hook the real, server-side version of that check.
//
// PB JSVM scope note: require() fresh inside every handler (isolated VM
// per callback in this build).

function isPrimaryEditor(auth) {
  if (!auth) return false;
  try {
    if (auth.getBool("is_primary")) return true;
  } catch (_) {}
  const role = (function () {
    try {
      return String(auth.get("role") || "");
    } catch (_) {
      return "";
    }
  })();
  // Mirrors EditorDashboard.jsx: senior_editor / content_manager always
  // bypass the granular checklist, same as the Primary Content Admin.
  return role === "content_manager" || role === "senior_editor";
}

function editorPermissions(auth) {
  if (!auth) return {};
  try {
    const raw = auth.get("permissions");
    const parsed = JSON.parse(String(raw == null ? "{}" : raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function isEditorActor(auth) {
  try {
    return !!auth && auth.collection().name === "editors";
  } catch (_) {
    return false;
  }
}

/**
 * hasEditorPermission(auth, key) -> bool
 * `auth` must be an `editors`-collection record. Keys match EDITOR_PERMS in
 * ContentManagementPanel.jsx: create, edit, delete, publish, unpublish,
 * schedule, manage_news, manage_pages, manage_media, manage_comments,
 * manage_categories, seo_edit, manage_ads, view_analytics, manage_editors.
 */
function hasEditorPermission(auth, key) {
  if (!isEditorActor(auth)) return false;
  if (isPrimaryEditor(auth)) return true;
  const perms = editorPermissions(auth);
  return !!perms[key];
}

/**
 * diffFields(orig, next, skipKeys) -> bool
 * True when any stored field differs between the pre-update and post-update
 * record, ignoring the keys listed in skipKeys. Used to tell "just a status
 * transition" apart from "actual content was also changed" without naming
 * every content field one by one.
 */
function diffFields(orig, next, skipKeys) {
  try {
    const before = JSON.parse(JSON.stringify(orig.fieldsData()));
    const after = JSON.parse(JSON.stringify(next.fieldsData()));
    (skipKeys || []).forEach((k) => { delete before[k]; delete after[k]; });
    return JSON.stringify(before) !== JSON.stringify(after);
  } catch (_) {
    return true;
  }
}

module.exports = {
  isPrimaryEditor,
  editorPermissions,
  isEditorActor,
  hasEditorPermission,
  diffFields,
};
