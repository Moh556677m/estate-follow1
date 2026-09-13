/// <reference path="../pb_data/types.d.ts" />

// Account reset:
//   - delete every user_sessions row (saved device sessions, login tokens)
//   - delete every user account EXCEPT the main Admin account
//   - related properties / payments / notifications / activity_logs cascade
//     with their relation fields (cascadeDelete: true)
// After this runs, new users can register normally again.
migrate(
  (app) => {
    const ADMIN_EMAIL = "admin@aqarplatform.com";

    // 1. Wipe all device/session records.
    let sessions;
    try {
      sessions = app.findRecordsByFilter("user_sessions", "id != ''");
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
      sessions = [];
    }
    for (const s of sessions) {
      app.delete(s);
    }

    // 2. Delete every user except the main Admin account.
    let users;
    try {
      users = app.findRecordsByFilter(
        "users",
        "email != {:email}",
        "created",
        1000,
        0,
        { email: ADMIN_EMAIL },
      );
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
      users = [];
    }
    for (const u of users) {
      app.delete(u);
    }
  },
  (app) => {
    // Deleted accounts and sessions cannot be restored.
  },
);
