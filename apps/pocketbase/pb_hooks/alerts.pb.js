/// <reference path="../pb_data/types.d.ts" />

// Alerts & Follow-up processor (التنبيهات والمتابعة).
// Custom route POST /api/alerts/process — kept as the OWNER-TRIGGERED,
// immediate refresh path (fires when the owner opens the Alerts panel /
// dashboard, so a just-created payment or property change reflects without
// waiting for the next scheduled sweep).
//
// Task #14: the actual event-derivation + send logic used to live entirely
// inline in this file. It has been extracted to lib-alerts-engine.js so the
// SAME code also runs on a real schedule regardless of whether the owner
// ever opens the app — see reminder-scheduler.pb.js's cronAdd('reminder-
// engine-sweep', ...), which calls processOwnerAlerts() for every owner.
// This file is now just the HTTP entry point for the on-demand case.
routerAdd("POST", "/api/alerts/process", (e) => {
  const auth = e.requestInfo.auth;
  if (!auth || !auth.id) {
    return e.json(401, { error: "Authentication required" });
  }
  const { processOwnerAlerts } = require(`${__hooks}/lib-alerts-engine.js`);
  const result = processOwnerAlerts($app, auth.id, auth.get("email") || "", auth.get("phone") || "");
  return e.json(200, {
    processed: result.processed,
    notifications: result.sent,
    emails: result.sent,
    overdue: result.overdue,
    events: result.events,
  });
});
