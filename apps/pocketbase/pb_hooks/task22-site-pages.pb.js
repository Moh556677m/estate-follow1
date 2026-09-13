/// <reference path="../pb_data/types.d.ts" />

// Task #22 — Site Editor. The collection rule already restricts every write
// to the Super Admin (see the 1790100000 migration), so this hook is not a
// permission gate — it enforces the two invariants a static collection rule
// cannot express on its own:
//   1. `is_core` (and the two seeded core rows' `slug`/`route_override`) can
//      never be created or changed via the API — only the migration's own
//      two seeded rows may ever carry is_core=true, and they must keep
//      pointing at the real hardcoded route they override SEO for.
//   2. A core row can never be deleted (it would silently remove the SEO
//      override for a page that still exists and is still being served).
//
// PB JSVM scope note: every routerAdd/hook callback compiles in its own
// isolated VM in this build — nothing here relies on anything outside its
// own inline body.

onRecordCreateRequest((e) => {
  // is_core is seed-only; force false regardless of what the request sent.
  e.record.set('is_core', false);
  e.next();
}, 'site_pages');

onRecordUpdateRequest((e) => {
  const orig = e.record.original();
  if (orig) {
    const wasCore = !!orig.get('is_core');
    // is_core itself is immutable in both directions once a row exists.
    e.record.set('is_core', wasCore);
    if (wasCore) {
      // A core row's identity (which hardcoded page it overrides) can't move.
      e.record.set('slug', orig.get('slug'));
      e.record.set('route_override', orig.get('route_override'));
    }
  }
  e.next();
}, 'site_pages');

onRecordDeleteRequest((e) => {
  if (e.record.get('is_core')) {
    throw new BadRequestError('core_page_cannot_be_deleted');
  }
  e.next();
}, 'site_pages');
