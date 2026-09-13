/// <reference path="../pb_data/types.d.ts" />

// Task #19 — real server-side enforcement of the CMS "Content Team"
// permission checklist (EDITOR_PERMS in ContentManagementPanel.jsx) and of
// the platform-staff side of the same gap for Insights content.
//
// Before this file, every insights_* collection rule only checked "is this
// actor ANY editor at all, OR any users-collection staff role at all"
// (`@request.auth.is_super_admin = true || @request.auth.role != ''` — true
// for every editors-collection record, since its own `role` field is always
// a non-empty string: editor/senior_editor/content_manager). The granular
// `permissions` JSON the Content Team tab edits (create/edit/delete/publish/
// unpublish/schedule/manage_news/manage_pages/manage_media/manage_comments/
// manage_categories/seo_edit/manage_ads/manage_editors) was stored but never
// checked — a plain "editor" with every box unticked could still publish,
// delete, or manage other editors via a raw API call. These hooks add that
// missing check on top of the existing (correct, broader) collection rules.
//
// A platform `users`-collection staffer (admin/support/custom role) reaching
// these routes structurally via the same broad rule now additionally needs
// the new `manage_cms` staff permission (apps/web/src/lib/permissions.js) —
// `role != ''` alone used to be enough for a `support` staffer to fully
// manage site content, which was never the intent.
//
// PB JSVM scope note: both lib-staff-permissions.js and
// lib-editor-permissions.js are require()'d fresh inside every handler
// (isolated VM per callback in this build).

// NOTE: diffFields() lives in lib-editor-permissions.js (require()'d fresh
// below) rather than as a top-level helper in this file — a real runtime
// bug this same session already showed that a plain top-level function
// declared in a .pb.js file is invisible inside a routerAdd/hook callback
// defined later in that same file (each compiles in its own isolated VM).

// ---------------------------------------------------------------------------
// insights_articles — create/edit/delete + the publish/unpublish/schedule
// status workflow + the manage_news sub-gate for content_type = 'news'.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);

  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }

  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "create")) {
      throw new BadRequestError("permission_denied:create");
    }
    if (String(e.record.get("content_type") || "") === "news" && !editorLib.hasEditorPermission(auth, "manage_news")) {
      throw new BadRequestError("permission_denied:manage_news");
    }
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) {
      throw new BadRequestError("permission_denied:manage_cms");
    }
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_articles");

onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);

  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }

  if (staffLib.isStaff(auth) && !editorLib.isEditorActor(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) {
      throw new BadRequestError("permission_denied:manage_cms");
    }
    e.next();
    return;
  }

  if (!editorLib.isEditorActor(auth)) throw new BadRequestError("unauthorized");

  const orig = e.record.original();
  const prevStatus = orig ? String(orig.get("status") || "") : "";
  const nextStatus = String(e.record.get("status") || "");
  if (orig && prevStatus !== nextStatus) {
    if (nextStatus === "published" && !editorLib.hasEditorPermission(auth, "publish")) {
      throw new BadRequestError("permission_denied:publish");
    }
    if (nextStatus === "scheduled" && !editorLib.hasEditorPermission(auth, "schedule")) {
      throw new BadRequestError("permission_denied:schedule");
    }
    if (prevStatus === "published" && nextStatus !== "published" && !editorLib.hasEditorPermission(auth, "unpublish")) {
      throw new BadRequestError("permission_denied:unpublish");
    }
  }

  if (String(e.record.get("content_type") || "") === "news" && !editorLib.hasEditorPermission(auth, "manage_news")) {
    throw new BadRequestError("permission_denied:manage_news");
  }

  const seoKeys = ["seo_title_ar", "seo_title_en", "meta_description_ar", "meta_description_en", "canonical", "og_image", "indexable"];
  const seoChanged = orig ? seoKeys.some((k) => JSON.stringify(orig.get(k) || null) !== JSON.stringify(e.record.get(k) || null)) : false;
  if (seoChanged && !editorLib.hasEditorPermission(auth, "seo_edit")) {
    throw new BadRequestError("permission_denied:seo_edit");
  }

  const contentChanged = orig ? editorLib.diffFields(orig, e.record, ["status", "updated", "views"].concat(seoKeys)) : false;
  if (contentChanged && !editorLib.hasEditorPermission(auth, "edit")) {
    throw new BadRequestError("permission_denied:edit");
  }
  e.next();
}, "insights_articles");

onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "delete")) throw new BadRequestError("permission_denied:delete");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_articles");

// ---------------------------------------------------------------------------
// A small generic gate for the collections whose EDITOR_PERMS key is a
// single flat switch (no publish/unpublish workflow, no sub-type gate):
// insights_pages/manage_pages, insights_categories+insights_tags+
// insights_authors/manage_categories, insights_comments/manage_comments,
// insights_media/manage_media, insights_banners+insights_banner_events/
// manage_ads, insights_menu_items/manage_pages. Registered per-collection
// below (each onRecord*Request call still runs in its own isolated VM, so
// the require() + the tiny closure are repeated per registration rather
// than shared as a top-level function).
// ---------------------------------------------------------------------------

// insights_pages — manage_pages, plus is_core pages can never be deleted
// regardless of permission (mirrors the editors.is_primary protection).
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_pages")) throw new BadRequestError("permission_denied:manage_pages");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_pages");

onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_pages")) throw new BadRequestError("permission_denied:manage_pages");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_pages");

onRecordDeleteRequest((e) => {
  if (e.record.getBool("is_core")) throw new BadRequestError("core_page_protected");
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_pages")) throw new BadRequestError("permission_denied:manage_pages");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_pages");

// insights_categories / insights_tags / insights_authors — manage_categories
// (each onRecord*Request call below is written out literally per collection,
// never inside a shared loop/closure — this build's isolated-VM-per-callback
// constraint bit us once already this session on a shared top-level helper
// function, so the same caution extends to any closured loop variable too;
// only require()'d module state is trusted to survive into a callback body).
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_categories")) throw new BadRequestError("permission_denied:manage_categories");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_categories");
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_categories")) throw new BadRequestError("permission_denied:manage_categories");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_categories");
onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_categories")) throw new BadRequestError("permission_denied:manage_categories");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_categories");

onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_categories")) throw new BadRequestError("permission_denied:manage_categories");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_tags");
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_categories")) throw new BadRequestError("permission_denied:manage_categories");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_tags");
onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_categories")) throw new BadRequestError("permission_denied:manage_categories");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_tags");

onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_categories")) throw new BadRequestError("permission_denied:manage_categories");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_authors");
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_categories")) throw new BadRequestError("permission_denied:manage_categories");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_authors");
onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_categories")) throw new BadRequestError("permission_denied:manage_categories");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_authors");

// insights_comments — moderation only (create stays public/open, unchanged)
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_comments")) throw new BadRequestError("permission_denied:manage_comments");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_comments");

onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_comments")) throw new BadRequestError("permission_denied:manage_comments");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_comments");

// insights_media — manage_media
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_media")) throw new BadRequestError("permission_denied:manage_media");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_media");
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_media")) throw new BadRequestError("permission_denied:manage_media");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_media");
onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_media")) throw new BadRequestError("permission_denied:manage_media");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_media");

// insights_banners — manage_ads
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_ads")) throw new BadRequestError("permission_denied:manage_ads");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_banners");
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_ads")) throw new BadRequestError("permission_denied:manage_ads");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_banners");
onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_ads")) throw new BadRequestError("permission_denied:manage_ads");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_banners");

// insights_banner_events — createRule stays public ("") for real impression/
// click logging; only update/delete (rare admin cleanup) need manage_ads.
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_ads")) throw new BadRequestError("permission_denied:manage_ads");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_banner_events");
onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_ads")) throw new BadRequestError("permission_denied:manage_ads");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_banner_events");

// insights_menu_items — manage_pages (site navigation is part of structure)
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_pages")) throw new BadRequestError("permission_denied:manage_pages");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_menu_items");
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_pages")) throw new BadRequestError("permission_denied:manage_pages");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_menu_items");
onRecordDeleteRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_pages")) throw new BadRequestError("permission_denied:manage_pages");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_menu_items");

// insights_settings — site-wide config: only the Primary/senior tier of
// editors (no single EDITOR_PERMS checkbox exists for "settings"), or a
// users-collection staffer with BOTH manage_cms and manage_settings.
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.isPrimaryEditor(auth)) throw new BadRequestError("permission_denied:settings_primary_only");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms") || !staffLib.hasStaffPermission(auth, "manage_settings")) {
      throw new BadRequestError("permission_denied:manage_settings");
    }
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "insights_settings");

// ---------------------------------------------------------------------------
// editors — Content Team management. manage_editors required (or Primary/
// senior tier, or the platform's real Super Admin with manage_cms). Every
// create forces is_primary=false server-side; every update strips any
// attempt to flip is_primary in either direction and blocks any actor
// (including the account itself) from changing role/permissions without
// manage_editors, with least-privilege enforced for non-primary creators.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);

  // is_primary is seed-only — never settable through the API by anyone.
  e.record.set("is_primary", false);

  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }

  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_editors")) {
      throw new BadRequestError("permission_denied:manage_editors");
    }
    if (!editorLib.isPrimaryEditor(auth)) {
      // A plain editor explicitly granted manage_editors can only create
      // more plain editors, and can never grant a permission they don't
      // themselves hold (least privilege).
      const newRole = String(e.record.get("role") || "editor");
      if (newRole === "content_manager" || newRole === "senior_editor") {
        throw new BadRequestError("permission_denied:manage_editors_elevated_role");
      }
      const creatorPerms = editorLib.editorPermissions(auth);
      let newPerms = {};
      try { newPerms = JSON.parse(String(e.record.get("permissions") || "{}")) || {}; } catch (_) { newPerms = {}; }
      const overreach = Object.keys(newPerms).some((k) => newPerms[k] && !creatorPerms[k]);
      if (overreach) throw new BadRequestError("permission_denied:manage_editors_privilege_escalation");
    }
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) {
      throw new BadRequestError("permission_denied:manage_cms");
    }
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "editors");

onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);

  const orig = e.record.original();
  // is_primary is immutable through the API in both directions.
  if (orig) e.record.set("is_primary", orig.getBool("is_primary"));

  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }

  const isSelf = e.record.id === auth.id;
  const roleChanged = orig ? String(orig.get("role") || "") !== String(e.record.get("role") || "") : false;
  const permsChanged = orig
    ? JSON.stringify(orig.get("permissions") || {}) !== JSON.stringify(e.record.get("permissions") || {})
    : false;

  if (roleChanged || permsChanged) {
    // Changing role or granular permissions — self or someone else's — is
    // always a manage_editors action, never something a plain editor can
    // do to their own record either.
    if (!editorLib.isEditorActor(auth) || !editorLib.hasEditorPermission(auth, "manage_editors")) {
      throw new BadRequestError("permission_denied:manage_editors");
    }
    if (!editorLib.isPrimaryEditor(auth)) {
      const newRole = String(e.record.get("role") || "editor");
      if (newRole === "content_manager" || newRole === "senior_editor") {
        throw new BadRequestError("permission_denied:manage_editors_elevated_role");
      }
      const actorPerms = editorLib.editorPermissions(auth);
      let newPerms = {};
      try { newPerms = JSON.parse(String(e.record.get("permissions") || "{}")) || {}; } catch (_) { newPerms = {}; }
      const overreach = Object.keys(newPerms).some((k) => newPerms[k] && !actorPerms[k]);
      if (overreach) throw new BadRequestError("permission_denied:manage_editors_privilege_escalation");
    }
    e.next();
    return;
  }

  if (isSelf) { e.next(); return; } // password/name/force_password_change on one's own record

  // Acting on ANOTHER editor's record (suspend/reactivate/reset password).
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_editors")) {
      throw new BadRequestError("permission_denied:manage_editors");
    }
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) {
      throw new BadRequestError("permission_denied:manage_cms");
    }
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "editors");

onRecordDeleteRequest((e) => {
  // is_primary != true is already a hard DB-rule backstop.
  const auth = e.requestInfo().auth;
  if (!auth) throw new BadRequestError("unauthorized");
  const staffLib = require(`${__hooks}/lib-staff-permissions.js`);
  const editorLib = require(`${__hooks}/lib-editor-permissions.js`);
  if (staffLib.isSuperAdmin(auth)) { e.next(); return; }
  if (editorLib.isEditorActor(auth)) {
    if (!editorLib.hasEditorPermission(auth, "manage_editors")) throw new BadRequestError("permission_denied:manage_editors");
  } else if (staffLib.isStaff(auth)) {
    if (!staffLib.hasStaffPermission(auth, "manage_cms")) throw new BadRequestError("permission_denied:manage_cms");
  } else {
    throw new BadRequestError("unauthorized");
  }
  e.next();
}, "editors");
