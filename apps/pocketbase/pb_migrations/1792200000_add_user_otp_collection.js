/// <reference path="../pb_data/types.d.ts" />

// Private backing store for the regular-user Signup/Forgot-Password OTP
// system (apps/api/src/utils/userOtp.js) — Resend sends the email,
// PocketBase's own users collection owns the resulting identity/session,
// and this collection is only ever a short-lived challenge record in
// between: {email, purpose, otp hash+salt, expiry, attempt count} while a
// code is pending. It is NEVER
// exposed through PocketBase's public REST API in any direction — every
// rule below is left unset (null), which PocketBase treats as
// "superuser only". Only apps/api's already-superuser-authenticated
// pocketbaseClient (see utils/pocketbaseClient.js) ever reads or writes it.
//
// The OTP code itself is never stored in plaintext — only otp_hash (a
// salted SHA-256 digest) — so a read of this table (e.g. a PocketBase admin
// panel user browsing collections) still cannot recover a live code.
migrate(
  (app) => {
    let existing;
    try {
      existing = app.findCollectionByNameOrId("auth_otps");
    } catch (_) {
      existing = null;
    }
    if (existing) return;

    const collection = new Collection({
      type: "base",
      name: "auth_otps",
      fields: [
        { name: "email", type: "text", required: true, max: 190 },
        { name: "purpose", type: "select", required: true, maxSelect: 1, values: ["signup", "reset"] },
        { name: "otp_hash", type: "text", required: true, max: 128 },
        { name: "otp_salt", type: "text", required: true, max: 64 },
        { name: "expires_at", type: "date", required: true },
        { name: "attempts", type: "number", required: false, min: 0 },
        { name: "consumed", type: "bool" },
        { name: "last_sent_at", type: "date", required: true },
        // Issued once a "reset" purpose OTP is successfully verified — lets
        // the frontend's second step (choosing a new password) prove it
        // followed a real verification without resubmitting the single-use
        // code (which is already marked consumed at that point). Cleared
        // immediately once used. See apps/api/src/utils/userOtp.js.
        { name: "reset_ticket", type: "text", required: false, max: 128 },
        { name: "ticket_expires_at", type: "date", required: false },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_auth_otps_email_purpose ON auth_otps (email, purpose)",
      ],
      // Intentionally no listRule/viewRule/createRule/updateRule/deleteRule
      // — null on every one of them locks this collection to superuser-only
      // access, exactly like PocketBase's own internal `_otps` table.
    });
    app.save(collection);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("auth_otps"));
    } catch (_) {}
  },
);
