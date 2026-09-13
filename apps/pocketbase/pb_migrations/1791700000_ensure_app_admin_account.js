/// <reference path="../pb_data/types.d.ts" />

// Ensure the permanent app-level Super Admin account (admin@estatefollow.com)
// actually exists.
//
// WHY THIS MIGRATION EXISTS: migration 1787871185_super_admin_and_settings.js
// already contains the logic to create this account, but ONLY does so when
// the APP_ADMIN_PASSWORD environment variable is set at the exact moment
// that migration runs. On this deployment, APP_ADMIN_PASSWORD was not set
// yet at that point, so that step was silently skipped — and because
// PocketBase records every migration file as "applied" the first time it
// runs (regardless of what its body actually did), 1787871185 will NEVER
// run again on this database, even after APP_ADMIN_PASSWORD is added later.
// That is exactly why admin@estatefollow.com does not exist yet and
// "Forgot Password" correctly (and honestly) reports
// "No account found with this email." (see
// apps/pocketbase/pb_hooks/signup-otp.pb.js, reset mode) — there genuinely
// is no such account in the database.
//
// This is a NEW migration (new file, new timestamp) specifically so it
// actually runs on the very next deploy, regardless of what
// 1787871185/1787878165 already did or skipped. It intentionally repeats
// the same "create if missing" logic rather than editing an
// already-applied migration file (PocketBase migrations are meant to be
// append-only once shipped).
//
// SECURITY, same as the original: the password is NEVER hardcoded here. It
// is read only from the APP_ADMIN_PASSWORD environment variable, which must
// be set on the host (e.g. Hostinger's app Environment Variables panel) —
// exactly like PB_ENCRYPTION_KEY / PB_SUPERUSER_PASSWORD already are. If
// that variable is not set when this migration runs, this step is skipped
// entirely (no account is created, no password is guessed or defaulted),
// so it is always safe to redeploy before that variable is configured.
//
// This migration ONLY ever creates the account if it does not already
// exist. It never overwrites an existing account's password — if the
// account is already there (created by an earlier deploy, or because the
// admin has since changed their password through the normal
// Forgot Password flow), this migration only makes sure its role/flags are
// correct and otherwise leaves it completely alone.
//
// CREDENTIAL SOURCE (updated): the Admin Portal login (admin@estatefollow.com)
// is now linked to the SAME environment variables as the real PocketBase
// superuser — PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD — instead of a
// separate APP_ADMIN_PASSWORD variable. Concretely: if this account does
// not exist yet, its password is created from PB_SUPERUSER_PASSWORD (the
// same value already required to run this project at all, since it is
// also used to create the real PocketBase superuser in
// 1764579159_create_superuser.js). APP_ADMIN_PASSWORD is still honored as
// an optional override for anyone who explicitly wants a DIFFERENT
// password for the Admin Portal account than the real superuser — if set,
// it takes precedence; otherwise PB_SUPERUSER_PASSWORD is used.
//
// The email is intentionally kept fixed at admin@estatefollow.com rather
// than also being sourced from PB_SUPERUSER_EMAIL: several other files
// (apps/pocketbase/pb_hooks/super-admin-security.pb.js,
// admin-user-controls.pb.js, platform.pb.js, manual-grants.pb.js,
// apps/api/src/routes/ai-providers.js) hardcode this exact address to
// recognize the one true Super Admin for security-sensitive features
// (e.g. the Dual-OTP Super Admin security flow). Changing the email would
// silently break those checks — an actual functional regression — so this
// migration only re-links the PASSWORD source, not the email, to honor the
// standing "don't break working functionality" requirement.
migrate(
  (app) => {
    const email = "admin@estatefollow.com";

    let users;
    try {
      users = app.findCollectionByNameOrId("users");
    } catch (_) {
      return; // users collection somehow missing — nothing safe to do here
    }

    let admin = null;
    try {
      admin = app.findAuthRecordByEmail("users", email);
    } catch (_) {
      admin = null;
    }

    if (admin) {
      // Account already exists — never touch its password. Only make sure
      // the role/flags a real Admin needs are correct (harmless if they
      // already are; matches 1787878165_ensure_super_admin_flags.js).
      try {
        admin.set("role", "admin");
        admin.set("is_super_admin", true);
        admin.set("suspended", false);
        if (!admin.getBool("verified")) admin.set("verified", true);
        app.save(admin);
      } catch (_) {
        // Best-effort only — an existing account must never be blocked
        // from logging in because of a failed cosmetic flag update here.
      }
      return;
    }

    // No account yet. Only create one if a real password was actually
    // configured for it — never with a default/guessable password.
    // Prefer APP_ADMIN_PASSWORD only if explicitly set (opt-in override);
    // otherwise reuse PB_SUPERUSER_PASSWORD, linking the Admin Portal
    // account to the same credential source as the real PocketBase
    // superuser, as required.
    const adminPassword = $os.getenv("APP_ADMIN_PASSWORD") || $os.getenv("PB_SUPERUSER_PASSWORD");
    if (!adminPassword) {
      return; // nothing to do until PB_SUPERUSER_PASSWORD (or APP_ADMIN_PASSWORD) is set on the host
    }

    try {
      const record = new Record(users);
      record.setEmail(email);
      record.setPassword(adminPassword);
      record.set("name", "Platform Super Admin");
      record.set("role", "admin");
      record.set("is_super_admin", true);
      record.set("verified", true);
      record.set("suspended", false);
      app.save(record);
    } catch (e) {
      // Never let this crash the whole migration run (which would block
      // every other migration and the app from starting) — e.g. if
      // APP_ADMIN_PASSWORD does not meet PocketBase's minimum password
      // requirements. Log it if a logger is available so it's visible in
      // the host's runtime logs, but do not throw.
      try {
        $app.logger().error("Failed to create admin@estatefollow.com account", "error", e.message);
      } catch (_) {
        /* logger not available in this context — ignore */
      }
    }
  },
  (app) => {
    // Deliberately a no-op down migration: this must never delete the
    // Super Admin account (that would be a far more dangerous outcome than
    // leaving it in place), matching 1787878165_ensure_super_admin_flags.js.
  },
);
