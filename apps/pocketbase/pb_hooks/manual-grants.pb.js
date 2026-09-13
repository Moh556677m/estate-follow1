/// <reference path="../pb_data/types.d.ts" />

// Audit logging for manual property grants.
//
// Manual grants are a SEPARATE admin system (demo / VIP / gift allowances)
// independent of paid subscriptions. Every create / update / delete is
// recorded in activity_logs so there is a basic audit trail of who granted
// what to whom and when. The grant record itself also stores `granted_by`
// and timestamps; this hook adds the searchable activity-log entry.
//
// Runs server-side ($app.save bypasses collection rules), so it works even
// though activity_logs.createRule is null for REST.

function efGrantLog(app, action, grantRec, authEmail) {
  try {
    var col = app.findCollectionByNameOrId('activity_logs');
    var rec = new Record(col);
    var userId = '';
    try {
      var u = grantRec.get('user');
      if (u && typeof u === 'object') userId = String(u.id || '');
      else userId = String(u || '');
    } catch (_) {}
    if (userId) rec.set('user', userId);
    rec.set('action', action);
    rec.set('entity', 'manual_property_grants');
    rec.set('entity_id', grantRec.id || '');
    var type = String(grantRec.get('grant_type') || 'limited');
    var limit = grantRec.get('property_limit');
    var details =
      'grant_type=' + type +
      (type === 'limited' ? ' limit=' + (limit == null ? '?' : limit) : '') +
      ' active=' + String(grantRec.get('active'));
    if (grantRec.get('note')) details += ' note="' + String(grantRec.get('note')) + '"';
    rec.set('details', details);
    rec.set('admin', authEmail || 'admin@estatefollow.com');
    app.save(rec);
  } catch (err) {
    app.logger().error('manual grant audit log failed', 'err', String(err));
  }
}

function efGrantAuthEmail(e) {
  try {
    var auth = e.requestInfo().auth;
    if (!auth) return '';
    return String(auth.get('email') || auth.get('name') || '');
  } catch (_) {
    return '';
  }
}

onRecordAfterCreateSuccess((e) => {
  efGrantLog($app, 'manual_grant_created', e.record, efGrantAuthEmail(e));
  e.next();
}, 'manual_property_grants');

onRecordAfterUpdateSuccess((e) => {
  efGrantLog($app, 'manual_grant_updated', e.record, efGrantAuthEmail(e));
  e.next();
}, 'manual_property_grants');

onRecordAfterDeleteSuccess((e) => {
  efGrantLog($app, 'manual_grant_removed', e.record, efGrantAuthEmail(e));
  e.next();
}, 'manual_property_grants');
