/// <reference path="../pb_data/types.d.ts" />

// Notify Super Admin when a broker or company profile is submitted for review.
// Never grants brokers/companies access to owner properties.

function notifySuperAdmins(title, body) {
  try {
    const admins = $app.findRecordsByFilter(
      'users',
      "is_super_admin = true || email = 'admin@estatefollow.com'",
      '',
      20,
      0,
    );
    for (let i = 0; i < admins.length; i++) {
      const admin = admins[i];
      try {
        const col = $app.findCollectionByNameOrId('notifications');
        const n = new Record(col);
        n.set('user', admin.id);
        n.set('title', title);
        n.set('body', body);
        n.set('type', 'status');
        n.set('read', false);
        $app.save(n);
      } catch (err) {
        $app.logger().error('brokerage notif failed', 'err', String(err));
      }
      try {
        const email = admin.email ? admin.email() : admin.getString('email');
        if (email) {
          // Delegates to the centralized EmailService (lib-email.js).
          const { sendMail } = require(`${__hooks}/lib-email.js`);
          sendMail({
            to: email,
            subject: title,
            html: `<p>${body}</p><p>Estate Follow — Super Admin</p>`,
            logContext: 'brokerage-admin-notify',
          });
        }
      } catch (err) {
        $app.logger().error('brokerage email failed', 'err', String(err));
      }
    }
  } catch (err) {
    $app.logger().error('brokerage notify failed', 'err', String(err));
  }
}

function afterProfileSave(e, kind) {
  const status = e.record.getString('status');
  if (status !== 'pending') {
    e.next();
    return;
  }
  const name = e.record.getString('name') || e.record.getString('name_ar') || kind;
  const title =
    kind === 'broker'
      ? 'Broker profile pending review'
      : 'Brokerage company pending review';
  const body = `${name} submitted a ${kind} profile and is waiting for Super Admin approval.`;
  notifySuperAdmins(title, body);
  e.next();
}

onRecordAfterCreateSuccess((e) => afterProfileSave(e, 'company'), 'brokerage_companies');
onRecordAfterUpdateSuccess((e) => afterProfileSave(e, 'company'), 'brokerage_companies');
onRecordAfterCreateSuccess((e) => afterProfileSave(e, 'broker'), 'brokers');
onRecordAfterUpdateSuccess((e) => afterProfileSave(e, 'broker'), 'brokers');

// Owners of broker/company profiles cannot escalate status to approved themselves.
onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) {
    e.next();
    return;
  }
  if (auth.getBool('is_super_admin')) {
    e.next();
    return;
  }
  const newStatus = e.record.getString('status');
  let oldStatus = '';
  try {
    const prev = $app.findRecordById(e.record.collection().name, e.record.id);
    oldStatus = prev.getString('status');
  } catch (_) {}
  if (
    newStatus &&
    newStatus !== oldStatus &&
    (newStatus === 'approved' || newStatus === 'hidden' || newStatus === 'rejected')
  ) {
    // Revert status change by non-super
    e.record.set('status', oldStatus || 'pending');
  }
  // Resubmit after changes_requested → pending is OK
  if (oldStatus === 'changes_requested' && newStatus === 'pending') {
    e.record.set('status', 'pending');
  }
  e.next();
}, 'brokers');

onRecordUpdateRequest((e) => {
  const auth = e.requestInfo().auth;
  if (!auth) {
    e.next();
    return;
  }
  if (auth.getBool('is_super_admin')) {
    e.next();
    return;
  }
  const newStatus = e.record.getString('status');
  let oldStatus = '';
  try {
    const prev = $app.findRecordById(e.record.collection().name, e.record.id);
    oldStatus = prev.getString('status');
  } catch (_) {}
  if (
    newStatus &&
    newStatus !== oldStatus &&
    (newStatus === 'approved' || newStatus === 'hidden' || newStatus === 'rejected')
  ) {
    e.record.set('status', oldStatus || 'pending');
  }
  if (oldStatus === 'changes_requested' && newStatus === 'pending') {
    e.record.set('status', 'pending');
  }
  e.next();
}, 'brokerage_companies');
