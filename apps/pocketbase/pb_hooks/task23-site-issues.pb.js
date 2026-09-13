/// <reference path="../pb_data/types.d.ts" />

// Task #23 — Site Issues. The collection rule already restricts every write
// to the Super Admin (see the 1790200000 migration) — the only writer in
// practice is the Express API's already-authenticated superuser PocketBase
// client (apps/api/src/routes/site-issues.js), never a browser directly.
// This hook is defense-in-depth against a bug in that Express route, not a
// permission gate: it forces a few fields to sane values regardless of what
// was sent, and keeps stored payloads bounded.
//
// PB JSVM scope note: every routerAdd/hook callback compiles in its own
// isolated VM in this build — nothing here relies on anything outside its
// own inline body.

onRecordCreateRequest((e) => {
  // Every new issue starts open — a client can never create one pre-resolved.
  e.record.set('status', 'open');
  const title = String(e.record.get('title') == null ? '' : e.record.get('title'));
  e.record.set('title', title.length > 300 ? title.slice(0, 300) : title);
  const message = String(e.record.get('message') == null ? '' : e.record.get('message'));
  e.record.set('message', message.length > 2000 ? message.slice(0, 2000) : message);
  const fingerprint = String(e.record.get('fingerprint') == null ? '' : e.record.get('fingerprint'));
  e.record.set('fingerprint', fingerprint.length > 200 ? fingerprint.slice(0, 200) : fingerprint);
  e.next();
}, 'site_issues');

onRecordUpdateRequest((e) => {
  // Resolving/ignoring an issue is the only real update path; stamp
  // resolved_at automatically instead of trusting a client-supplied value.
  const orig = e.record.original();
  const wasStatus = orig ? orig.get('status') : null;
  const nextStatus = e.record.get('status');
  if (nextStatus !== wasStatus && (nextStatus === 'resolved' || nextStatus === 'ignored')) {
    e.record.set('resolved_at', new Date().toISOString());
  }
  if (nextStatus === 'open') {
    e.record.set('resolved_at', null);
    e.record.set('resolved_note', '');
  }
  e.next();
}, 'site_issues');
