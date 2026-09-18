/// <reference path="../pb_data/types.d.ts" />

// Regular-user session persistence — the `users` auth collection's token
// duration had NEVER been explicitly set anywhere in this codebase, so it
// ran on PocketBase's factory default. That default is short enough that a
// user who closes the site/app for a while (longer than the default, but
// well within normal "I use this app every few days" behavior) comes back
// to a token PocketBase itself rejects outright — authRefresh() then fails
// with a genuine 401 (see apps/web/src/lib/authRefresh.js), which is
// reported to the user as "session expired, please log in again" even
// though nothing suspicious happened. AuthContext.jsx's 4-minute heartbeat
// already keeps a token alive indefinitely while a tab stays open, but it
// can't do anything for an app/tab that was fully closed.
//
// Only the `users` collection is touched — admin (`_superusers`) auth is a
// separate system and was not reported to have this problem.
migrate(
  (app) => {
    const usersCollection = app.findCollectionByNameOrId("users");

    // 30 days, in seconds. Generous enough that normal usage patterns
    // (closing the site/app for days at a time) never force a re-login,
    // without being unbounded.
    usersCollection.authToken = {
      duration: 30 * 24 * 60 * 60,
    };

    app.save(usersCollection);
  },
  (app) => {
    const usersCollection = app.findCollectionByNameOrId("users");
    // PocketBase's own factory default.
    usersCollection.authToken = {
      duration: 7 * 24 * 60 * 60,
    };
    app.save(usersCollection);
  },
);
