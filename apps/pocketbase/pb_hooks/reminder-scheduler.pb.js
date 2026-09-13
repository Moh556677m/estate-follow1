/// <reference path="../pb_data/types.d.ts" />

// Real scheduled Reminder Engine (Task #14).
//
// Before this file, EVERY reminder in this codebase was pull-based: the
// alerts.pb.js sweep only ran when an owner opened the Alerts panel, and
// platform.pb.js's payments sweep only ran when the payments collection was
// listed (dashboard/admin views). Neither ran for an owner who simply never
// opened the app — so a due installment reminder could go unsent
// indefinitely. This registers the SECOND cronAdd() job in this codebase
// (the first is 'monthly-property-reports' in monthly-reports.pb.js — job
// names must stay unique; confirmed no collision) so reminders fire on a
// real schedule regardless of whether anyone is using the app.
//
// Every 30 minutes is frequent enough that a same-day reminder is never
// more than 30 minutes late, without hammering the mailer/DB. It calls the
// exact same processOwnerAlerts() used by the owner-triggered
// POST /api/alerts/process route (see lib-alerts-engine.js) — one engine,
// two triggers — so there is only ever one place idempotency/dedup logic
// can go wrong, not two.
cronAdd("reminder-engine-sweep", "*/30 * * * *", () => {
  const { processOwnerAlerts, listReminderableOwnerIds } = require(`${__hooks}/lib-alerts-engine.js`);
  const ownerIds = listReminderableOwnerIds($app);
  let sent = 0, attempted = 0, errors = 0;
  ownerIds.forEach((ownerId) => {
    try {
      let email = "";
      let phone = "";
      try {
        const owner = $app.findRecordById("users", ownerId);
        email = owner.get("email") || "";
        phone = owner.get("phone") || "";
      } catch (_) { /* owner record gone — still process in-app */ }
      const r = processOwnerAlerts($app, ownerId, email, phone);
      sent += r.sent || 0;
      attempted += r.attempted || 0;
    } catch (e) {
      errors++;
      $app.logger().error("reminder sweep failed for owner", "owner", ownerId, "err", String(e));
    }
  });
  $app.logger().info("reminder engine cron run", "owners", ownerIds.length, "sent", sent, "attempted", attempted, "errors", errors);
});

// ---------------------------------------------------------------------------
// POST /ef/reminders/run-now — super admin only. Manually triggers the sweep
// immediately (all owners, or one via body.ownerId) — used for the "Run
// reminder sweep now" button in NotificationManagementPanel and for testing.
// Safe to call repeatedly: identical idempotency guarantees as the cron job.
// ---------------------------------------------------------------------------
routerAdd(
  "POST",
  "/ef/reminders/run-now",
  (e) => {
    const info = e.requestInfo();
    const auth = info.auth;
    if (!auth || !auth.getBool("is_super_admin")) {
      return e.json(403, { error: "Super Admin only" });
    }
    const { processOwnerAlerts, listReminderableOwnerIds } = require(`${__hooks}/lib-alerts-engine.js`);
    const body = info.body || {};
    const ownerId = String(body.ownerId || "").trim();

    if (ownerId) {
      let email = "";
      let phone = "";
      try {
        const owner = $app.findRecordById("users", ownerId);
        email = owner.get("email") || "";
        phone = owner.get("phone") || "";
      } catch (_) {}
      const r = processOwnerAlerts($app, ownerId, email, phone);
      return e.json(200, { owners: 1, ...r });
    }

    const ownerIds = listReminderableOwnerIds($app);
    let sent = 0, attempted = 0, events = 0;
    ownerIds.forEach((id) => {
      let email = "";
      let phone = "";
      try {
        const owner = $app.findRecordById("users", id);
        email = owner.get("email") || "";
        phone = owner.get("phone") || "";
      } catch (_) {}
      const r = processOwnerAlerts($app, id, email, phone);
      sent += r.sent || 0;
      attempted += r.attempted || 0;
      events += r.events || 0;
    });
    return e.json(200, { owners: ownerIds.length, sent, attempted, events });
  },
  $apis.requireAuth(),
);
