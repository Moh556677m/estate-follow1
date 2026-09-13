// Task #22 — Site Editor client. Talks directly to the `site_pages`
// PocketBase collection (no secrets involved, so no Express proxy layer is
// needed — same direct-pb.collection() pattern already used by
// lib/insights.js for the Insights CMS's public reads).
//
// Collection rule: published rows are public; drafts and all writes are
// Super-Admin-only (enforced at the DB rule level, see the 1790100000
// migration) — this client never needs to guess permissions client-side,
// a request it isn't allowed to make simply fails.
import pb from './pocketbaseClient';

const COLLECTION = 'site_pages';

/** Public: fetch one published custom page by slug, or null if not found/unpublished. */
export async function fetchPublicPageBySlug(slug) {
  try {
    return await pb.collection(COLLECTION).getFirstListItem(
      `slug = "${String(slug).replace(/"/g, '\\"')}" && status = "published"`,
    );
  } catch (_) {
    return null;
  }
}

/**
 * Public: fetch a core page's SEO-override row by its hardcoded route
 * (e.g. "/about"). Used by AboutPage.jsx / WhatIsEstateFollowPage.jsx to
 * feed optional social-preview overrides into their existing <Seo> —
 * never their literal <title>/<meta name="description">.
 */
export async function fetchCorePageSeoByRoute(route) {
  try {
    return await pb.collection(COLLECTION).getFirstListItem(
      `route_override = "${String(route).replace(/"/g, '\\"')}" && is_core = true`,
    );
  } catch (_) {
    return null;
  }
}

/** Admin (Super Admin only — enforced server-side): full list, drafts included. */
export async function listAllPages() {
  return pb.collection(COLLECTION).getFullList({ sort: '-is_core,slug' });
}

export async function createPage(payload) {
  return pb.collection(COLLECTION).create(payload);
}

export async function updatePage(id, patch) {
  return pb.collection(COLLECTION).update(id, patch);
}

export async function deletePage(id) {
  return pb.collection(COLLECTION).delete(id);
}
